#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import cv2
from PIL import Image, ImageSequence
import numpy as np
import argparse
import sys
import os
from lib.cli import parse_hsv_range, StrokeOption, GridOption
from lib.image import smooth_mask, smooth_contour, read_matting_mask
from lib.svg import contour_to_bezier_path

# Note: 以下代码核心逻辑由 DeepSeek 生成，并由 flytreeleft@crazydan.org 改进
# 需安装依赖：opencv、scipy
# - sudo pacman -S opencv python-opencv python-scipy
# - pip install opencv
# - pip install scipy
# 对于 strokeorder.com 的笔画 gif 图片，需配置参数
# --grid-scale 8 --grid-matting-mask assets/extra-mask.png
# --stroke-hsv-range 130,40,40,178,255,255 --stroke-min-area 80
# --stroke-contour-sigma 1 --stroke-simplify 2.5
#
# 从 gif 生成的结果更圆润，因为其原始图的尺寸更大，笔画的细节更充分

def extract_grids_from_gif(gif_path):
    """
    从 GIF 各帧中提取田字格。

    :param gif_path: GIF 文件路径
    :return: 田字格（BGR 颜色格式）列表, 田字格宽度, 田字格高度
    """
    gif = Image.open(gif_path)

    width, height = gif.size

    grids = []
    for frame in ImageSequence.Iterator(gif):
        frame = frame.convert('RGB')

        grid = np.array(frame)
        grid = cv2.cvtColor(grid, cv2.COLOR_RGB2BGR)

        grids.append(grid)

    return grids, width, height

def find_stroke_from_grid(
        grid, grid_opt,
        stroke_opt,
        debug_stage, debug_dir=None,
):
    """
    :param matting_mask: 抠图图像（黑白色），从 grid 中去掉该图像中的白色区域
    :return:
    """
    # 放大田字格
    if grid_opt.scale_factor > 1:
        grid_scaled = cv2.resize(
            grid, None,
            fx=grid_opt.scale_factor, fy=grid_opt.scale_factor,
            interpolation=cv2.INTER_CUBIC
        )
    else:
        grid_scaled = grid
    # if debug_dir:
    #     cv2.imwrite(os.path.join(debug_dir, f'{debug_stage}0.grid_scaled_{grid_opt.idx:03d}.png'), grid_scaled)

    # 在放大后的区域中提取红色掩膜
    lower = np.array(stroke_opt.hsv_lower, dtype=np.uint8)
    upper = np.array(stroke_opt.hsv_upper, dtype=np.uint8)

    grid_hsv = cv2.cvtColor(grid_scaled, cv2.COLOR_BGR2HSV)
    # 得到单通道的二值图，白色为在范围内的像素，黑色为不在范围内的像素
    grid_red_mask = cv2.inRange(grid_hsv, lower, upper)
    if debug_dir:
        cv2.imwrite(os.path.join(debug_dir, f'{debug_stage}1.grid_masked_{grid_opt.idx:03d}.png'), grid_red_mask)

    if grid_opt.matting_mask is not None:
        # 从 grid_red_mask 中抠图，去掉无关位置的像素
        grid_red_mask = cv2.bitwise_and(grid_red_mask, grid_opt.matting_mask)
        if debug_dir:
            cv2.imwrite(os.path.join(debug_dir, f'{debug_stage}2.grid_masked_matting_{grid_opt.idx:03d}.png'), grid_red_mask)

    if stroke_opt.mask_sigma > 0:
        grid_red_mask = smooth_mask(grid_red_mask, stroke_opt.mask_sigma)
        if debug_dir:
            cv2.imwrite(os.path.join(debug_dir, f'{debug_stage}3.grid_masked_smooth_{grid_opt.idx:03d}.png'), grid_red_mask)

    # 查找笔画
    stroke_contours, _ = cv2.findContours(grid_red_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not stroke_contours:
        return None

    # 取面积最大的笔画
    stroke_main_contour = max(stroke_contours, key=cv2.contourArea)
    cnt_area = cv2.contourArea(stroke_main_contour) / (grid_opt.scale_factor * grid_opt.scale_factor)  # 换算回原始尺寸面积
    # 检查是否满足远小于方形区域的条件
    if cnt_area < stroke_opt.min_area:
        return None

    if debug_dir:
        x, y, w, h = cv2.boundingRect(stroke_main_contour)
        cropped = grid_red_mask[y:y+h, x:x+w]
        cv2.imwrite(os.path.join(debug_dir, f'{debug_stage}4.stroke_{grid_opt.idx:03d}.png'), cropped)

    # 笔画点平滑
    if stroke_opt.contour_sigma > 0:
        stroke_main_contour = smooth_contour(stroke_main_contour, stroke_opt.contour_sigma)

    # 笔画简化（减少顶点）
    if stroke_opt.simplify_tolerance > 0:
        approx = cv2.approxPolyDP(stroke_main_contour, stroke_opt.simplify_tolerance, True)
    else:
        approx = stroke_main_contour

    # 将坐标从放大区域转换回原始田字格坐标系（除以放大倍数）
    pts = approx.squeeze().astype(np.float64)
    if len(pts) < 3:
        return None

    pts[:, 0] = pts[:, 0] / grid_opt.scale_factor
    pts[:, 1] = pts[:, 1] / grid_opt.scale_factor

    return pts

def extract_strokes_from_gif(
        gif_path, grid_matting_mask_path,
        stroke_opt,
        grid_scale_factor=1.0,
        debug_dir=None,
):
    """
    """
    grids, width, height = extract_grids_from_gif(gif_path)
    if len(grids) == 0:
        print(f"未在 GIF 图像中找到图像帧。")
        return None, None, width, height

    grid_matting_mask = read_matting_mask(grid_matting_mask_path, grid_scale_factor)

    full_strokes = []
    partial_strokes = []
    for idx, grid in enumerate(grids):
        if debug_dir:
            cv2.imwrite(os.path.join(debug_dir, f'00.grid_{idx:03d}.png'), grid)

        stroke = find_stroke_from_grid(
            grid,
            grid_opt=GridOption(
                idx=idx,
                scale_factor=grid_scale_factor,
                matting_mask=grid_matting_mask
            ),
            stroke_opt=stroke_opt,
            debug_stage="1", debug_dir=debug_dir,
        )

        if stroke is None:
            if len(partial_strokes) > 0:
                # 当前无笔画的图像帧的前一帧图像为完整的笔画
                last = partial_strokes[-1]
                full_strokes.append(last)

                if debug_dir is not None:
                    i = idx - 1
                    cv2.imwrite(os.path.join(debug_dir, f'20.stroke_full_{i:03d}.png'), grids[i])
            continue

        partial_strokes.append(stroke)

    return full_strokes, partial_strokes, width, height

def save_full_strokes_to_svg(svg_path, strokes, width, height):
    """
    """
    svg_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">'
    ]
    for idx, pts in enumerate(strokes):
        pid = f"s-{idx+1:03d}"

        path = contour_to_bezier_path(pts, {
            'id': pid, 'fill': 'black', 'stroke': 'none'
        })
        if not path:
            continue

        svg_lines.append(path)

    svg_lines.append('</svg>')

    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(svg_lines))

    print(f"成功生成笔画 SVG 图像，包含 {len(strokes)} 个笔画，田字格尺寸为 {width}x{height} 像素")

def save_stroke_anim_to_svg(svg_path, strokes, width, height, anim_duration=0.5):
    """
    """
    # SVG头部，包含CSS动画定义
    svg_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">'
    ]

    svg_lines.append("""
<style>
@keyframes appear {
    from { opacity: 0; }
    to { opacity: 1; }
}
.contour-group {
    animation: appear {duration}s ease-in-out forwards;
    opacity: 0;
}
</style>
""".replace("{duration}", str(anim_duration)))

    # 逐个帧添加笔画组
    for idx, pts in enumerate(strokes):
        color = [0, 0, 0]
        fill_color = f"rgba({color[0]},{color[1]},{color[2]},1)"

        # 组属性：类名 + 动画延迟
        group_attrs = 'class="contour-group"'
        delay = idx * anim_duration
        group_attrs += f' style="animation-delay: {delay}s;"'

        svg_lines.append(f'<g {group_attrs}>')

        # ---------------------------------------------------------------
        path = contour_to_bezier_path(pts, {
            'fill': fill_color, 'stroke': 'none'
        })
        if not path:
            continue

        svg_lines.append(path)

        svg_lines.append('</g>')

    svg_lines.append('</svg>')

    # 写入文件
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(svg_lines))

def parse_args():
    parser = argparse.ArgumentParser(
        description="自动检测图像中的田字格，并从中提取指定色系的笔画，最终生成由各个独立笔画组成的单字 SVG 图像"
    )

    parser.add_argument("--input", type=str, required=True, help="笔画 GIF 动图的文件路径")
    parser.add_argument("--output", type=str, required=True, help="提取的笔画所保存的 SVG 文件路径")
    parser.add_argument("--anim-output", type=str, help="提取的笔画动画所保存的 SVG 文件路径")
    parser.add_argument('--anim-duration', type=float, default=0.5, help='每帧笔画组的动画持续时间（秒），默认 0.5')
    parser.add_argument("--grid-matting-mask", type=str,
                        help="田字格抠图遮罩图像。黑白图像，用于从田字格中扣去相同位置的白色区域像素，以避免干扰笔画的提取")
    parser.add_argument("--grid-scale", type=float, default=2.0,
                        help="田字格放大倍数，默认 2.0。提高放大倍数可以提升笔画的精度")
    parser.add_argument("--stroke-hsv-range", type=str, required=True, help="所要提取的笔画颜色的 HSV 范围（0-179,0-255,0-255），格式：h_min,s_min,v_min,h_max,s_max,v_max，如 0,50,50,10,255,255")
    parser.add_argument("--stroke-simplify", type=float, default=0.5,
                        help="笔画简化容差（像素），<=0 时不简化，默认 0.5。直接影响笔画的顶点数量（即曲线段数）。若希望笔画非常光滑且保留细节，可减小简化容差（如 0.1），但可能生成较多曲线段")
    parser.add_argument("--stroke-mask-sigma", type=float, default=0.0,
                        help="笔画掩膜高斯平滑标准差，0 表示不处理，默认 0。可消除锯齿，但可能使笔画略微收缩。建议 0.5~2")
    parser.add_argument("--stroke-contour-sigma", type=float, default=0.0,
                        help="笔画点高斯滤波标准差，0 表示不处理，默认 0。用于平滑笔画曲线。建议 0.5~3")
    parser.add_argument("--stroke-min-area", type=float, default=10,
                        help="笔画最小的有效面积（像素），默认 10")
    parser.add_argument('--debug-dir', help='提取过程所生成的中间图片的存放目录，方便调试。若未指定，则不输出过程图片')

    return parser.parse_args()

def main():
    args = parse_args()

    try:
        lower, upper = parse_hsv_range(args.stroke_hsv_range)
    except ValueError as e:
        print(f"所要提取的笔画颜色的 HSV 范围解析发生错误：{e}")
        sys.exit(1)

    full_strokes, partial_strokes, width, height = extract_strokes_from_gif(
        gif_path=args.input,
        grid_scale_factor=args.grid_scale,
        grid_matting_mask_path=args.grid_matting_mask,
        stroke_opt=StrokeOption(
            hsv_lower=lower,
            hsv_upper=upper,
            min_area=args.stroke_min_area,
            simplify_tolerance=args.stroke_simplify,
            mask_sigma=args.stroke_mask_sigma,
            contour_sigma=args.stroke_contour_sigma,
        ),
        debug_dir=args.debug_dir,
    )

    if not full_strokes:
        print("未提取到任何有效笔画。")
        sys.exit(1)

    save_full_strokes_to_svg(
        svg_path=args.output,
        strokes=full_strokes,
        width=width, height=height,
    )

    if args.anim_output:
        save_stroke_anim_to_svg(
            svg_path=args.anim_output,
            strokes=partial_strokes,
            width=width, height=height,
            anim_duration=args.anim_duration,
        )

if __name__ == "__main__":
    main()
