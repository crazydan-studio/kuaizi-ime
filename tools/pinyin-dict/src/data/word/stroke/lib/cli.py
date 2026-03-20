# Note: 以下代码核心逻辑由 DeepSeek 生成，并由 flytreeleft@crazydan.org 改进

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
