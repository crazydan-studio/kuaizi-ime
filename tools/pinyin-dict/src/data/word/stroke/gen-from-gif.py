#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import cv2
from PIL import Image, ImageSequence
import numpy as np
import argparse
import sys
import os
import textwrap
from lib.cli import parse_hsv_range, StrokeOption, GridOption
from lib.image import smooth_mask, smooth_contour, crop_by_contour, keep_contour_region, is_extend_from, create_matting_mask
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
    :return: (田字格（BGR 颜色格式）列表, 田字格宽度, 田字格高度)
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
    :return: (笔画轮廓点集, 笔画掩码图, 笔画轮廓)。通过相邻两个笔画掩码图的笔画重叠区域面积来判断是否为新笔画，若为同一笔画，则重叠区域应该与前一张图相等
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

    # 在放大后的区域中提取指定色系的掩膜
    lower = np.array(stroke_opt.hsv_lower, dtype=np.uint8)
    upper = np.array(stroke_opt.hsv_upper, dtype=np.uint8)

    grid_hsv = cv2.cvtColor(grid_scaled, cv2.COLOR_BGR2HSV)
    # 得到单通道的二值图，白色为在范围内的像素，黑色为不在范围内的像素
    grid_mask = cv2.inRange(grid_hsv, lower, upper)
    if debug_dir:
        cv2.imwrite(os.path.join(debug_dir, f'{debug_stage}1.grid_masked_{grid_opt.idx:03d}.png'), grid_mask)

    # 抠图，去掉无关位置的像素
    if grid_opt.matting_mask is not None:
        grid_mask = cv2.bitwise_and(grid_mask, grid_opt.matting_mask)
        if debug_dir:
            cv2.imwrite(os.path.join(debug_dir, f'{debug_stage}2.grid_masked_matting_{grid_opt.idx:03d}.png'), grid_mask)

    # 平滑笔画
    grid_smooth_mask = grid_mask
    if stroke_opt.mask_sigma > 0:
        grid_smooth_mask = smooth_mask(grid_mask, stroke_opt.mask_sigma)
        if debug_dir:
            cv2.imwrite(os.path.join(debug_dir, f'{debug_stage}3.grid_masked_smooth_{grid_opt.idx:03d}.png'), grid_smooth_mask)

    # 查找笔画
    stroke_contours, _ = cv2.findContours(grid_smooth_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not stroke_contours:
        return None, None, None

    # 取面积最大的笔画
    stroke_main_contour = max(stroke_contours, key=cv2.contourArea)
    cnt_area = cv2.contourArea(stroke_main_contour) / (grid_opt.scale_factor * grid_opt.scale_factor)  # 换算回原始尺寸面积
    # 检查是否满足远小于方形区域的条件
    if cnt_area < stroke_opt.min_area:
        return None, None, None

    if debug_dir:
        cropped = crop_by_contour(grid_smooth_mask, stroke_main_contour)
        cv2.imwrite(os.path.join(debug_dir, f'{debug_stage}4.stroke_{grid_opt.idx:03d}.png'), cropped)

    # 笔画点平滑
    stroke_smooth_contour = stroke_main_contour
    if stroke_opt.contour_sigma > 0:
        stroke_smooth_contour = smooth_contour(stroke_main_contour, stroke_opt.contour_sigma)

    # 笔画简化（减少顶点）
    stroke_simplify_contour = stroke_smooth_contour
    if stroke_opt.simplify_tolerance > 0:
        stroke_simplify_contour = cv2.approxPolyDP(stroke_smooth_contour, stroke_opt.simplify_tolerance, True)

    # 将坐标从放大区域转换回原始田字格坐标系（除以放大倍数）
    pts = stroke_simplify_contour.squeeze().astype(np.float64)
    if len(pts) < 3:
        return None, None, None

    pts[:, 0] = pts[:, 0] / grid_opt.scale_factor
    pts[:, 1] = pts[:, 1] / grid_opt.scale_factor

    return pts, grid_mask, stroke_main_contour

def is_in_same_stroke(cur_grid_mask, cur_stroke_contour, prev_grid_mask, prev_stroke_contour, delta, idx):
    """
    通过相邻的田字格掩码图和笔画轮廓判断二者是否属于同一笔画
    """
    # 仅保留笔画轮廓范围内的图形
    cur_stroke = keep_contour_region(cur_grid_mask, cur_stroke_contour)
    prev_stroke = keep_contour_region(prev_grid_mask, prev_stroke_contour)

    return is_extend_from(cur_stroke, prev_stroke, delta, idx)

def extract_frame_strokes_from_gif(
        gif_path, grid_matting_mask_path,
        stroke_opt,
        grid_scale_factor=1.0,
        debug_dir=None,
):
    """
    :return: (笔画帧列表（二维数组）, 田字格宽度, 田字格高度)。笔画帧列表的第一维为笔画，第二维为该笔画的动画帧轮廓点，且该维数组的最后一个为该笔画的完整轮廓
    """
    grids, width, height = extract_grids_from_gif(gif_path)
    if len(grids) == 0:
        print(f"未在 GIF 图像中找到图像帧。")
        return None, width, height

    grid_matting_mask = create_matting_mask(
        grids[0],
        grid_matting_mask_path, grid_scale_factor,
        # 保留原图中与抠图遮罩重叠的白色系区域，
        # 也就是 gif 第一帧图中在需要被抠去区域的有效笔画的颜色，
        # 从而确保有效笔画不会被抠去
        overlap_hsv_lower=[0, 0, 221], overlap_hsv_upper=[180, 30, 255]
    )

    strokes = []
    frame_strokes = []
    prev_grid_mask = None
    prev_stroke_contour = None
    for idx, grid in enumerate(grids):
        if debug_dir:
            cv2.imwrite(os.path.join(debug_dir, f'00.grid_{idx:03d}.png'), grid)

        stroke, grid_mask, stroke_contour = find_stroke_from_grid(
            grid,
            grid_opt=GridOption(
                idx=idx,
                scale_factor=grid_scale_factor,
                matting_mask=grid_matting_mask
            ),
            stroke_opt=stroke_opt,
            debug_stage="1", debug_dir=debug_dir,
        )

        # stroke 为 None 时，grid_mask 和 stroke_contour 也为 None
        is_same = is_in_same_stroke(
            grid_mask, stroke_contour,
            prev_grid_mask, prev_stroke_contour,
            delta=10*grid_scale_factor,
            idx=idx,
        )
        if not is_same and len(strokes) > 0:
            # 记录当前笔画的全部动画帧
            frame_strokes.append(strokes)
            # 开始记录新的动画帧
            strokes = []

            if debug_dir is not None:
                i = idx - 1
                cv2.imwrite(os.path.join(debug_dir, f'20.stroke_full_{i:03d}.png'), grids[i])

        if stroke is not None:
            strokes.append(stroke)

        prev_grid_mask = grid_mask
        prev_stroke_contour = stroke_contour

    return frame_strokes, width, height

def save_full_strokes_to_svg(svg_path, frame_strokes, width, height):
    """
    """
    svg_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">',
    ]

    for idx, strokes in enumerate(frame_strokes):
        # 取最后一帧的笔画完整轮廓
        stroke = strokes[-1]

        path = contour_to_bezier_path(stroke, {
            'id': f"s-{idx}",
        })

        svg_lines.append(path)

    svg_lines.append('</svg>')

    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(svg_lines))

    print(f"成功生成笔画 SVG 图像，包含 {len(frame_strokes)} 个笔画，田字格尺寸为 {width}x{height} 像素")

def save_stroke_anim_to_svg(svg_path, frame_strokes, width, height, anim_duration=0.5):
    """
    """
    anim_enabled = anim_duration > 0
    svg_defs = []
    svg_groups = []

    anim_gap = 0
    for idx, strokes in enumerate(frame_strokes):
        frame_count = len(strokes)

        gid = f's-{idx}'
        clip_id = f'c-{gid}'

        svg_groups.append(f'<g id="{gid}" clip-path="url(#{clip_id})">')

        # 帧动画需等待多少个延迟
        anim_gap += frame_count
        # Note: 倒序排列笔画轮廓，确保最早的动画帧在最上层
        for i, stroke in enumerate(reversed(strokes)):
            gap = anim_gap - i

            pid = f"{gid}-f-{i}"

            # 以笔画完整轮廓作为裁剪路径，确保笔画帧的多余部分不会显示
            if i == 0:
                path = contour_to_bezier_path(stroke, {'id': pid})

                svg_defs.append(path)
                svg_defs.append(f'<clipPath id="{clip_id}"><use href="#{pid}"/></clipPath>')

                opts = ""
                if anim_enabled:
                    opts += f' style="--g:{gap}"'
                svg_groups.append(f'<use href="#{pid}"{opts}/>')
            else:
                opts = { 'id': pid, }
                if anim_enabled:
                    opts['style'] = f'--g:{gap}'

                path = contour_to_bezier_path(stroke, opts)

                svg_groups.append(path)

        svg_groups.append('</g>')

    # --------------------------------------------------------------------------
    svg_opts = ""
    if anim_enabled:
        svg_opts += f' style="--d:{anim_duration}s"'
    svg_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}"{svg_opts}>',
    ]

    if anim_enabled:
        svg_lines.append(
            textwrap.dedent(
                f"""
                <style>
                @keyframes appear{{from{{opacity:var(--o,0);}} to{{opacity:1;}}}}
                path{{animation:appear ease-in-out forwards;animation-duration:var(--d);animation-delay:calc(var(--d)*var(--g));opacity:var(--o,0);fill:black;}}
                use[href$="-f-0"]{{--o:0.03;}}
                </style>"""
            )
        )

    svg_lines.append('<defs>')
    svg_lines += svg_defs
    svg_lines.append('</defs>')

    svg_lines += svg_groups

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
    parser.add_argument('--anim-duration', type=float, default=0.5, help='每帧笔画组的动画持续时间（秒），默认 0.5。若小于等于 0，则禁用动画')
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

    frame_strokes, width, height = extract_frame_strokes_from_gif(
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

    if not frame_strokes or len(frame_strokes) == 0:
        print("未提取到任何有效笔画。")
        sys.exit(1)

    save_full_strokes_to_svg(
        svg_path=args.output,
        frame_strokes=frame_strokes,
        width=width, height=height,
    )

    if args.anim_output:
        save_stroke_anim_to_svg(
            svg_path=args.anim_output,
            frame_strokes=frame_strokes,
            width=width, height=height,
            anim_duration=args.anim_duration,
        )

if __name__ == "__main__":
    main()
