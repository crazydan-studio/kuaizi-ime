#!/usr/bin/env python3
"""
SVG 路径形态归类 - 拉伸不变、旋转敏感的傅里叶描述子（带特征缓存）
特性：
- 拉伸不变（不同宽高比的矩形视为同类）
- 平移不变（自动移至原点）
- 旋转敏感（旋转后的形状分为不同类）
- 特征缓存：首次计算后存入 SQLite，后续直接读取
依赖: python-svgpathtools, pillow, numpy, opencv, scikit-learn, hdbscan
安装: sudo pacman -S python-svgpathtools python-pillow python-numpy python-opencv python-scikit-learn python-hdbscan
"""

import sqlite3
import numpy as np
import os
import argparse
import pickle
import hdbscan
from svgpathtools import parse_path
from PIL import Image, ImageDraw
from sklearn.cluster import DBSCAN
from multiprocessing import Pool, cpu_count
from numpy.fft import fft

# https://pypi.org/project/svgpathtools/
## path_alt = parse_path('M 300 100 C 100 100 200 200 200 300 L 250 350')

# ------------------- 采样 -------------------
def sample_path(path_obj, num_points=200):
    """等距采样路径上的点"""
    total_len = path_obj.length()
    if total_len == 0:
        return np.array([])

    points = []
    for i in range(num_points):
        t = i / (num_points - 1)
        point = path_obj.point(t)

        points.append((point.real, point.imag))

    return np.array(points)

# ------------------- 归一化（平移至原点+保持宽高比缩放） -------------------
def normalize_points_to_origin(points, canvas_size=500):
    """
    保持宽高比缩放，使图形外接矩形的长边等于 canvas_size，
    然后将图形平移到 (0,0) 处
    """
    if len(points) == 0:
        return points

    min_xy = points.min(axis=0)
    max_xy = points.max(axis=0)
    width = max_xy[0] - min_xy[0]
    height = max_xy[1] - min_xy[1]

    if width == 0 or height == 0:
        scale = 1.0
    else:
        scale = canvas_size / max(width, height)

    scaled = points * scale
    new_min = scaled.min(axis=0)
    normalized = scaled - new_min

    return normalized.astype(np.int32)

def normalize_points_stretch_invariant(points, canvas_size=500):
    """
    平移至原点 + 独立缩放 X 和 Y 到 [0, canvas_size]。
    效果：拉伸（各向异性缩放）被消除，但旋转信息保留。
    """
    if len(points) == 0:
        return points

    min_xy = points.min(axis=0)
    max_xy = points.max(axis=0)

    ranges = max_xy - min_xy
    # 防止除零（若某一维度退化为点）
    ranges = np.where(ranges == 0, 1, ranges)

    scale = canvas_size / ranges
    scaled = (points - min_xy) * scale

    return scaled.astype(np.int32)

# ------------------- 绘制图像（可选保存） -------------------
def draw_path_on_canvas(points, canvas_size=500, debug_dir=None, pid=None):
    """绘制二值填充图像"""
    img = Image.new('L', (canvas_size, canvas_size), 0)
    draw = ImageDraw.Draw(img)

    pts = [tuple(p) for p in points]
    if len(pts) > 2:
        draw.polygon(pts, outline=1, fill=1)

    if debug_dir and pid is not None:
        os.makedirs(debug_dir, exist_ok=True)

        out_img = Image.fromarray((np.array(img) * 255).astype(np.uint8))
        out_img.save(os.path.join(debug_dir, f"{pid}.png"))

    return np.array(img)

# ------------------- 傅里叶描述子 -------------------
def fourier_descriptor(points, n_coeffs=20):
    """
    计算归一化的傅里叶描述子
    points: N x 2 的轮廓点集（已排序）
    n_coeffs: 保留的低频系数个数（不包括直流分量）
    """
    if len(points) < 3:
        return np.zeros(n_coeffs)

    z = points[:, 0] + 1j * points[:, 1]
    f = fft(z)

    f = f[1:]                     # 舍弃直流分量（位置信息）
    if len(f) < n_coeffs:
        f = np.pad(f, (0, n_coeffs - len(f)), 'constant')
    else:
        f = f[:n_coeffs]

    fd = np.abs(f)                # 旋转不变性
    if fd[0] != 0:
        fd = fd / fd[0]           # 缩放不变性
    else:
        fd = fd / (fd[0] + 1e-10)

    return fd

def fourier_descriptor_rot_sensitive(points, n_coeffs=20):
    """
    计算旋转敏感的傅里叶描述子（保留相位信息）
    points: N x 2 的轮廓点集
    n_coeffs: 保留的低频系数个数（不包括直流分量）
    返回: 长度为 2*n_coeffs 的特征向量 [real1, imag1, real2, imag2, ...]
    """
    if len(points) < 3:
        return np.zeros(2 * n_coeffs)

    # 转换为复数序列
    z = points[:, 0] + 1j * points[:, 1]
    f = np.fft.fft(z)

    # 去除直流分量（平移不变性）
    f = f[1:]                     # 长度 N-1
    # 截取或补零到 n_coeffs
    if len(f) < n_coeffs:
        f = np.pad(f, (0, n_coeffs - len(f)), 'constant')
    else:
        f = f[:n_coeffs]

    # 缩放不变性：除以第一个非零系数的模（保持复数）
    mag0 = np.abs(f[0])
    if mag0 != 0:
        f = f / mag0
    else:
        f = f / (mag0 + 1e-10)

    # 不取模，保留实部和虚部，展平
    features = np.hstack([f.real, f.imag])

    return features

# ------------------- 处理单条路径（多进程） -------------------
def process_single_path(args):
    pid, path_str, canvas_size, sample_points, n_coeffs, debug_dir = args

    try:
        path_obj = parse_path(path_str)
        pts = sample_path(path_obj, sample_points)
        if len(pts) < 3:
            return None

        # norm_pts = normalize_points_stretch_invariant(pts, canvas_size)
        norm_pts = normalize_points_to_origin(pts, canvas_size)
        if debug_dir:
            draw_path_on_canvas(norm_pts, canvas_size, debug_dir, pid)

        # fd = fourier_descriptor(norm_pts, n_coeffs)
        fd = fourier_descriptor_rot_sensitive(norm_pts, n_coeffs)

        return (pid, fd)
    except Exception as e:
        print(f"Error processing stroke(id={pid}): {e}")
        return None

# ------------------- 批量处理（多进程） -------------------
def process_paths_parallel(paths_data, canvas_size=500, sample_points=200,
                           n_workers=None, debug_dir=None, n_coeffs=20):
    if n_workers is None:
        n_workers = cpu_count()

    with Pool(n_workers) as pool:
        args = [(pid, path_str, canvas_size, sample_points, debug_dir, n_coeffs)
                for pid, path_str in paths_data]
        results = pool.map(process_single_path, args)

    valid = [res for res in results if res is not None]
    if not valid:
        return np.array([]), []

    ids, features = zip(*valid)

    return np.array(features), list(ids)

# ------------------- 聚类 -------------------
# def cluster_paths(features, eps=0.15, min_samples=2):
#     clustering = DBSCAN(eps=eps, min_samples=min_samples, metric='euclidean')

#     labels = clustering.fit_predict(features)

#     return labels

def cluster_paths(features, eps=0.15, min_samples=2, metric='euclidean'):
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_samples,   # 最小簇大小，可调
        min_samples=2,                  # 噪声点敏感度
        metric=metric,
        cluster_selection_epsilon=eps,  # 可选，类似 DBSCAN 的 eps
        prediction_data=False           # 加速
    )
    labels = clusterer.fit_predict(features)
    return labels

# ------------------- 存储聚类结果到数据库 -------------------
def store_clusters_to_db(db_path, ids, labels):
    conn = sqlite3.connect(db_path)

    cursor = conn.cursor()

    cursor.execute('''
        create table if not exists meta_zi_stroke_path_cluster (
            id_ integer not null primary key,
            label_ integer not null
        )
    ''')
    for pid, label in zip(ids, labels):
        cursor.execute('''
            insert or replace into
                meta_zi_stroke_path_cluster
                    (id_, label_)
                values (?, ?)
        ''', (pid, int(label)))
    conn.commit()

    conn.close()

# ------------------- 批量处理并存入数据库 -------------------
def compute_and_store_features(db_path, canvas_size=500, sample_points=200,
                               n_coeffs=20, n_workers=None, debug_dir=None):
    """读取所有路径，计算特征，存入 features 表"""
    conn = sqlite3.connect(db_path)

    cursor = conn.cursor()

    # 创建特征表
    cursor.execute('''
        create table if not exists meta_zi_stroke_path_feature (
            id_ integer not null primary key,
            feature_ blob not null,
            n_coeffs_ integer,
            canvas_size_ integer,
            sample_points_ integer
        )
    ''')

    # 获取所有路径
    cursor.execute("select id_, path_ from meta_zi_stroke")

    all_paths = cursor.fetchall()
    print(f"已获取笔画路径 {len(all_paths)} 条")

    if n_workers is None:
        n_workers = cpu_count()

    print(f"并行计算笔画路径特征 ...")
    with Pool(n_workers) as pool:
        args = [(pid, path_str, canvas_size, sample_points, n_coeffs, debug_dir)
                for pid, path_str in all_paths]

        results = pool.map(process_single_path, args)

    # 存入数据库
    inserted = 0
    for res in results:
        if res is not None:
            pid, feat = res

            blob = pickle.dumps(feat)
            cursor.execute('''
                insert or replace into
                    meta_zi_stroke_path_feature
                        (id_, feature_, n_coeffs_, canvas_size_, sample_points_)
                values (?, ?, ?, ?, ?)
            ''',
                (pid, blob, n_coeffs, canvas_size, sample_points)
            )
            inserted += 1
    conn.commit()

    conn.close()

    print(f"已存储笔画路径特征 {inserted} 个")

def load_features_from_db(db_path, n_coeffs=None, canvas_size=None, sample_points=None):
    """从数据库加载特征，可选参数校验一致性"""
    conn = sqlite3.connect(db_path)

    cursor = conn.cursor()

    # 检查表是否存在
    cursor.execute("select name from sqlite_master where type='table' and name='meta_zi_stroke_path_feature'")
    if not cursor.fetchone():
        conn.close()
        return None, []

    # 读取所有特征
    cursor.execute("select id_, feature_ from meta_zi_stroke_path_feature")
    rows = cursor.fetchall()
    if not rows:
        conn.close()
        return None, []

    ids = []
    features = []
    for pid, blob in rows:
        feat = pickle.loads(blob)
        ids.append(pid)
        features.append(feat)

    conn.close()

    return np.array(features), ids

# ------------------- 主流程 -------------------
def parse_args():
    parser = argparse.ArgumentParser(
        description="汉字笔画 SVG 路径形态归类 - 拉伸不变、旋转敏感的傅里叶描述子（带特征缓存）"
    )

    parser.add_argument("--db", type=str, required=True, help="存储了汉字笔画 SVG 路径的 SQLITE 数据库文件路径")
    parser.add_argument("--eps", type=float, default=0.1, help="DBSCAN 邻域半径。值越小，归类时的特征匹配容差越小")
    parser.add_argument("--recompute", type=bool, default=False, help="是否重新计算笔画路径的特征值")
    parser.add_argument('--debug-dir', help='路径形态归类过程所生成的中间图片的存放目录，方便调试。若未指定，则不输出过程图片')

    return parser.parse_args()

def main():
    args = parse_args()

    db_path = args.db
    eps = args.eps
    force_recompute = args.recompute
    debug_dir = args.debug_dir

    # --------------------------------------------------------------
    # 加载或计算特征
    features = None
    valid_ids = None
    if not force_recompute:
        features, valid_ids = load_features_from_db(db_path)
        if features is not None:
            print(f"已加载笔画路径特征 {len(features)} 个")

    if features is None:
        # 计算并存储特征
        compute_and_store_features(
            db_path, canvas_size=500,
            sample_points=1200, n_coeffs=20,
            debug_dir=debug_dir
        )

        # 重新加载
        features, valid_ids = load_features_from_db(db_path)

    if len(features) == 0:
        print("未提取到任何笔画特征")
        return {}

    # --------------------------------------------------------------
    # 计算并保存聚类结果
    print("归类笔画路径 ...")

    # features = features[:50000]
    # valid_ids = valid_ids[:50000]
    labels  = cluster_paths(features, eps, min_samples=2)
    store_clusters_to_db(db_path, valid_ids, labels)

    # # 整理结果
    # clusters = {}
    # for pid, label in zip(valid_ids, labels):
    #     clusters.setdefault(label, []).append(pid)

    # # 输出统计
    # for label, pid_list in clusters.items():
    #     if label == -1:
    #         print(f"未分类笔画路径 {len(pid_list)} 条")
    #     else:
    #         print(f"笔画路径类别 {label} 包含 {len(pid_list)} 条路径")

if __name__ == "__main__":
    main()
