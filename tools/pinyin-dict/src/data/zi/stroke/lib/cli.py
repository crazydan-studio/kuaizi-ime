# Note: 以下代码核心逻辑由 DeepSeek 生成，并由 flytreeleft@crazydan.org 改进

class GridOption:
    def __init__(
            self, idx, matting_mask, scale_factor
    ):
        self.idx = idx
        self.matting_mask = matting_mask
        self.scale_factor = scale_factor

class StrokeOption:
    def __init__(
            self, hsv_lower, hsv_upper,
            min_area, simplify_tolerance,
            mask_sigma, contour_sigma,
    ):
        self.hsv_lower = hsv_lower
        self.hsv_upper = hsv_upper
        self.min_area = min_area
        self.simplify_tolerance = simplify_tolerance
        self.mask_sigma = mask_sigma
        self.contour_sigma = contour_sigma

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
