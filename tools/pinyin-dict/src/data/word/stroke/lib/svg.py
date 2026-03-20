# Note: 以下代码核心逻辑由 DeepSeek 生成，并由 flytreeleft@crazydan.org 改进

def catmull_rom_to_bezier(p0, p1, p2, p3):
    """
    给定四个点 p0, p1, p2, p3，计算从 p1 到 p2 的三次贝塞尔曲线控制点。
    返回 (c1, c2, end)，其中 end = p2。
    """
    c1 = p1 + (p2 - p0) / 6.0
    c2 = p2 - (p3 - p1) / 6.0

    return c1, c2, p2

def contour_to_bezier_path_all_curves(pts):
    """
    将闭合笔画的顶点列表 (N,2) 转换为全部为三次贝塞尔曲线的路径命令。
    返回命令列表，每个元素为 ('C', c1, c2, end)。
    注意：该函数不包含起始移动命令，也不包含闭合命令。
    """
    n = len(pts)
    if n < 3:
        return None

    commands = []
    for i in range(n):
        p_prev = pts[(i - 1) % n]
        p_curr = pts[i]
        p_next = pts[(i + 1) % n]
        p_next2 = pts[(i + 2) % n]

        c1, c2, end = catmull_rom_to_bezier(p_prev, p_curr, p_next, p_next2)

        commands.append(('C', c1, c2, end))

    return commands
