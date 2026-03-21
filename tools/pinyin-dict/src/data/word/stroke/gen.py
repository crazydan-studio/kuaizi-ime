#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import cv2
import numpy as np
import argparse
import sys
import os
from lib.image import smooth_mask, smooth_contour
from lib.svg import contour_to_bezier_path

# Note: 以下代码由 DeepSeek 生成，并由 flytreeleft@crazydan.org 手工调整
# 需安装依赖：opencv、scipy
# - sudo pacman -S opencv python-opencv python-scipy
# - pip install opencv
# - pip install scipy
# 对于 bishun.net 的笔画图片，由于其田字格和笔画都采用红色系，为得到较好的结果，需配置参数
# --grid-scale 1 --stroke-hsv-range 0,50,50,10,255,255 --stroke-mask-sigma 1
# 对于 strokeorder.com 的笔画图片，则仅需配置参数
# --grid-scale 8 --stroke-hsv-range 0,50,50,10,255,255
# --stroke-contour-sigma 1 --stroke-simplify 2.5
# --grid-min-area $((150*150))

# ---------- 正方形区域检测 ----------
def detect_same_size_squares(image, min_area=100, size_cluster_threshold=0.2):
    """
    通过边缘检测和笔画分析，检测图像中大小相同、无旋转的轴对齐正方形区域。
    返回统一的边长 L 和每个正方形的中心坐标列表 [(cx, cy)]。
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # 预处理：高斯模糊 + 自适应阈值
    blurred = cv2.GaussianBlur(gray, (5, 5), 1.5)
    thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                  cv2.THRESH_BINARY_INV, 11, 2)

    # 查找笔画
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    rects = []  # 存储 (cx, cy, w, h)
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue

        # 获取外接轴对齐矩形
        x, y, w, h = cv2.boundingRect(cnt)

        # 检查是否为近似正方形（允许一定长宽比偏差）
        aspect_ratio = max(w, h) / min(w, h)
        if aspect_ratio > 1.5:  # 过于狭长，忽略
            continue

        # 计算中心
        cx = x + w / 2.0
        cy = y + h / 2.0

        rects.append((cx, cy, w, h))

    if not rects:
        return None, []

    # 提取所有矩形的边长（取最大值作为该矩形的特征边长）
    sides = [max(w, h) for (_, _, w, h) in rects]
    # 使用中位数作为候选统一边长
    median_side = np.median(sides)
    # 过滤掉偏离中位数太远的矩形
    filtered_rects = []
    for (cx, cy, w, h) in rects:
        side = max(w, h)
        if abs(side - median_side) / median_side < size_cluster_threshold:
            filtered_rects.append((cx, cy, w, h))

    if not filtered_rects:
        return None, []

    # 确定最终统一边长 L：取所有保留矩形中最大边长的最大值（确保能包含每个矩形）
    L = int(np.ceil(max(max(w, h) for (_, _, w, h) in filtered_rects)))
    # 提取每个正方形的中心
    centers = [(int(round(cx)), int(round(cy))) for (cx, cy, _, _) in filtered_rects]

    return L, centers

def crop_square_from_image(img, center, L, border_mode=cv2.BORDER_REPLICATE):
    """
    从图像中以指定中心裁剪边长为 L 的正方形区域。
    如果超出边界，使用 border_mode 进行填充。
    返回正方形图像块。
    """
    cx, cy = center
    half = L // 2
    x1 = cx - half
    y1 = cy - half
    x2 = x1 + L
    y2 = y1 + L
    h, w = img.shape[:2]

    # 计算需要填充的边界
    top = max(0, -y1)
    bottom = max(0, y2 - h)
    left = max(0, -x1)
    right = max(0, x2 - w)

    if top > 0 or bottom > 0 or left > 0 or right > 0:
        # 需要填充
        img_padded = cv2.copyMakeBorder(img, top, bottom, left, right, border_mode)
        # 调整裁剪坐标
        x1 += left
        y1 += top
        x2 += left
        y2 += top
        square = img_padded[y1:y2, x1:x2]
    else:
        square = img[y1:y2, x1:x2]

    return square

# ---------- 核心处理函数 ----------
def process_image(image_path, output_svg, stroke_hsv_lower, stroke_hsv_upper,
                  grid_min_area=100, grid_scale_factor=2.0,
                  stroke_simplify_tolerance=0.5, stroke_mask_sigma=0.0, stroke_contour_sigma=0.0,
                  stroke_min_area=10, stroke_area_max_ratio=0.5,
                  grid_border_margin=5, morphology_iterations=0, debug_dir=None,):
    """
    从图像中自动检测相同大小的正方形，裁剪统一尺寸，排序，放大每个正方形并提取内部红色笔画，
    平滑并转换为贝塞尔曲线，最终合并到同一张尺寸为正方形大小的 SVG 中。
    grid_border_margin: 排除的边框宽度（像素，原始图像尺寸），笔画必须完全在此内部区域。
    morphology_iterations: 形态学操作迭代次数（0表示不处理）
    """
    # 读取图像
    img = cv2.imread(image_path)
    if img is None:
        print(f"错误：无法读取图像 {image_path}")
        return False

    # 检测相同大小的正方形区域，得到统一边长 L 和中心点列表
    L, centers = detect_same_size_squares(img, min_area=grid_min_area)
    if L is None or not centers:
        print("未检测到符合要求的正方形区域。")
        return False

    # 按中心点排序：从上到下（y），从左到右（x）
    centers.sort(key=lambda c: (c[1], c[0]))

    square_area = L * L

    # 遍历每个中心点
    valid_contours = []
    for idx, (cx, cy) in enumerate(centers):
        # 裁剪统一大小的正方形区域
        square = crop_square_from_image(img, (cx, cy), L)
        if debug_dir:
            cv2.imwrite(os.path.join(debug_dir, f'00.grid_{idx:03d}.png'), square)

        # 放大正方形区域
        square_scaled = cv2.resize(square, None, fx=grid_scale_factor, fy=grid_scale_factor,
                                      interpolation=cv2.INTER_CUBIC)
        # if debug_dir:
        #     cv2.imwrite(os.path.join(debug_dir, f'10.grid_scaled_{idx:03d}.png'), square_scaled)

        h_up, w_up = square_scaled.shape[:2]

        # 创建内部区域掩膜（排除边框）
        margin_scaled = int(grid_border_margin * grid_scale_factor)
        if 2 * margin_scaled >= min(h_up, w_up):
            print(f"警告：边框排除宽度 {grid_border_margin} 导致内部区域过小，跳过第 {idx+1} 个正方形。")
            continue

        inner_mask = np.zeros((h_up, w_up), dtype=np.uint8)
        inner_mask[margin_scaled:h_up-margin_scaled, margin_scaled:w_up-margin_scaled] = 255

        # 在放大后的区域中提取红色掩膜
        square_hsv = cv2.cvtColor(square_scaled, cv2.COLOR_BGR2HSV)
        lower = np.array(stroke_hsv_lower, dtype=np.uint8)
        upper = np.array(stroke_hsv_upper, dtype=np.uint8)
        red_mask = cv2.inRange(square_hsv, lower, upper)
        if debug_dir:
            cv2.imwrite(os.path.join(debug_dir, f'20.grid_masked_{idx:03d}.png'), red_mask)

        # 形态学操作（去除噪声/填充孔洞）
        if morphology_iterations > 0:
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            red_mask = cv2.morphologyEx(red_mask, cv2.MORPH_OPEN, kernel, iterations=morphology_iterations)
            red_mask = cv2.morphologyEx(red_mask, cv2.MORPH_CLOSE, kernel, iterations=morphology_iterations)

        if stroke_mask_sigma > 0:
            red_mask = smooth_mask(red_mask, stroke_mask_sigma)
            if debug_dir:
                cv2.imwrite(os.path.join(debug_dir, f'30.grid_masked_smooth_{idx:03d}.png'), red_mask)

        # 仅保留内部区域的红色像素
        valid_mask = cv2.bitwise_and(red_mask, inner_mask)
        if debug_dir:
            cv2.imwrite(os.path.join(debug_dir, f'40.grid_masked_valid_{idx:03d}.png'), valid_mask)

        # 查找笔画
        square_contours, _ = cv2.findContours(valid_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not square_contours:
            continue

        # 取面积最大的笔画
        main_cnt = max(square_contours, key=cv2.contourArea)
        cnt_area = cv2.contourArea(main_cnt) / (grid_scale_factor * grid_scale_factor)  # 换算回原始尺寸面积
        # 检查是否满足远小于方形区域的条件
        if cnt_area < stroke_min_area or cnt_area > stroke_area_max_ratio * square_area:
            continue

        if debug_dir:
            x, y, w, h = cv2.boundingRect(main_cnt)
            cropped = valid_mask[y:y+h, x:x+w]
            cv2.imwrite(os.path.join(debug_dir, f'50.stroke_{idx:03d}.png'), cropped)

        # 笔画点平滑
        if stroke_contour_sigma > 0:
            main_cnt = smooth_contour(main_cnt, stroke_contour_sigma)

        # 笔画简化（减少顶点）
        if stroke_simplify_tolerance > 0:
            approx = cv2.approxPolyDP(main_cnt, stroke_simplify_tolerance, True)
        else:
            approx = main_cnt

        # 将坐标从放大区域转换回原始正方形坐标系（除以放大倍数）
        pts = approx.squeeze().astype(np.float64)
        if len(pts) < 3:
            continue

        pts[:, 0] = pts[:, 0] / grid_scale_factor
        pts[:, 1] = pts[:, 1] / grid_scale_factor

        # 可选：将坐标限制在 [0, L] 范围内（避免数值误差）
        pts[:, 0] = np.clip(pts[:, 0], 0, L)
        pts[:, 1] = np.clip(pts[:, 1], 0, L)

        valid_contours.append(pts)

    if not valid_contours:
        print("未提取到任何有效笔画。")
        return False

    # 生成 SVG 文件（尺寸为正方形边长 L）
    svg_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {L} {L}">'
    ]

    for idx, pts in enumerate(valid_contours):
        pid = f"s-{idx+1:03d}"

        path = contour_to_bezier_path(pts, {
            'id': pid, 'fill': 'black', 'stroke': 'none'
        })
        if not path:
            continue

        svg_lines.append(path)

    svg_lines.append('</svg>')

    with open(output_svg, 'w', encoding='utf-8') as f:
        f.write('\n'.join(svg_lines))

    print(f"成功生成 SVG，包含 {len(valid_contours)} 个笔画，田字格边长为 {L} 像素")

    return True

# ---------- 命令行接口 ----------
def parse_hsv_range(s):
    """解析 HSV 范围字符串，格式 "h_min,s_min,v_min,h_max,s_max,v_max" """
    parts = s.split(',')
    if len(parts) != 6:
        raise ValueError("HSV 范围必须包含 6 个整数，用逗号分隔")

    try:
        values = [int(p) for p in parts]
    except ValueError:
        raise ValueError("HSV 值必须为整数")

    return values[:3], values[3:]

def main():
    parser = argparse.ArgumentParser(
        description="自动检测图像中的田字格，并从中提取指定色系的笔画，最终生成由各个独立笔画组成的单字 SVG 图像"
    )

    parser.add_argument("--input", type=str, required=True, help="田字格图像的文件路径")
    parser.add_argument("--output", type=str, required=True, help="提取的笔画所保存的 SVG 文件路径")
    parser.add_argument("--grid-scale", type=float, default=2.0,
                        help="田字格放大倍数，默认 2.0。提高放大倍数可以提升笔画的精度")
    parser.add_argument("--grid-min-area", type=float, default=100,
                        help="田字格最小的有效面积（像素），默认 100")
    parser.add_argument("--grid-border-margin", type=int, default=4,
                        help="田字格的边框宽度（像素），只有在边框以内的笔画才是有效的，默认 4")
    parser.add_argument("--stroke-hsv-range", type=str, required=True, help="所要提取的笔画颜色的 HSV 范围（0-179,0-255,0-255），格式：h_min,s_min,v_min,h_max,s_max,v_max，如 0,50,50,10,255,255")
    parser.add_argument("--stroke-simplify", type=float, default=0.5,
                        help="笔画简化容差（像素），<=0 时不简化，默认 0.5。直接影响笔画的顶点数量（即曲线段数）。若希望笔画非常光滑且保留细节，可减小简化容差（如 0.1），但可能生成较多曲线段")
    parser.add_argument("--stroke-mask-sigma", type=float, default=0.0,
                        help="笔画掩膜高斯平滑标准差，0 表示不处理，默认 0。可消除锯齿，但可能使笔画略微收缩。建议 0.5~2")
    parser.add_argument("--stroke-contour-sigma", type=float, default=0.0,
                        help="笔画点高斯滤波标准差，0 表示不处理，默认 0。用于平滑笔画曲线。建议 0.5~3")
    parser.add_argument("--stroke-min-area", type=float, default=10,
                        help="笔画最小的有效面积（像素），默认 10")
    parser.add_argument("--stroke-area-max-ratio", type=float, default=0.5,
                        help="笔画面积占田字格面积的最大有效比例，超过则忽略，默认 0.5")
    parser.add_argument('--debug-dir', help='提取过程所生成的中间图片的存放目录，方便调试。若未指定，则不输出过程图片')

    args = parser.parse_args()

    try:
        lower, upper = parse_hsv_range(args.stroke_hsv_range)
    except ValueError as e:
        print(f"所要提取的笔画颜色的 HSV 范围解析发生错误：{e}")
        sys.exit(1)

    success = process_image(
        image_path=args.input,
        output_svg=args.output,
        grid_min_area=args.grid_min_area,
        grid_scale_factor=args.grid_scale,
        grid_border_margin=args.grid_border_margin,
        stroke_hsv_lower=lower,
        stroke_hsv_upper=upper,
        stroke_simplify_tolerance=args.stroke_simplify,
        stroke_mask_sigma=args.stroke_mask_sigma,
        stroke_contour_sigma=args.stroke_contour_sigma,
        stroke_min_area=args.stroke_min_area,
        stroke_area_max_ratio=args.stroke_area_max_ratio,
        debug_dir=args.debug_dir,
    )

    if not success:
        sys.exit(1)

if __name__ == "__main__":
    main()
