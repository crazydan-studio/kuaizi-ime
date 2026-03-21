import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d

# Note: 以下代码核心逻辑由 DeepSeek 生成，并由 flytreeleft@crazydan.org 改进

def smooth_mask(mask, sigma=1.0):
    """对二值掩膜进行高斯模糊后重新二值化，使边缘平滑"""
    if sigma <= 0:
        return mask

    blurred = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), sigma)

    _, smoothed = cv2.threshold(blurred, 127, 255, cv2.THRESH_BINARY)

    return smoothed.astype(np.uint8)

def smooth_contour(contour, sigma=1.0):
    """对闭合轮廓点进行高斯滤波（通过周期延拓处理边界）"""
    if sigma <= 0 or len(contour) < 4:
        return contour

    pts = contour.squeeze().astype(np.float32)

    extend = int(sigma * 3)
    extended = np.vstack([pts[-extend:], pts, pts[:extend]])

    filtered_x = gaussian_filter1d(extended[:, 0], sigma, mode='wrap')
    filtered_y = gaussian_filter1d(extended[:, 1], sigma, mode='wrap')
    filtered = np.stack([filtered_x[extend:-extend], filtered_y[extend:-extend]], axis=1)

    return filtered[:, np.newaxis, :].astype(np.int32)

def create_matting_mask(target, mask_path, mask_scale, overlap_hsv_lower, overlap_hsv_upper):
    """
    创建抠图遮罩。首先得到按指定比例缩放后的遮罩原始图像，
    然后得到其与抠图目标的重叠部分，再将该重叠部分从原始遮罩中抠除，从而得到真正可用的抠图遮罩
    """
    if not mask_path:
        return None

    mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
    if mask is None:
        print(f"无法读取抠图图像 {mask_path}")
        return None

    # 将掩码扩展为三通道，以便按位与
    mask = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
    # 按位与：只有掩码白色区域保留原色，其余区域变成黑色
    overlap = cv2.bitwise_and(target, mask)

    # -----------------------------------------------------------
    lower = np.array(overlap_hsv_lower, dtype=np.uint8)
    upper = np.array(overlap_hsv_upper, dtype=np.uint8)

    overlap_hsv = cv2.cvtColor(overlap, cv2.COLOR_BGR2HSV)
    overlap_mask = cv2.inRange(overlap_hsv, lower, upper)

    overlap = cv2.bitwise_and(target, target, mask=overlap_mask)

    # -----------------------------------------------------------
    overlap = cv2.bitwise_not(overlap)
    # 最终待抠除的图形
    mask = cv2.bitwise_and(mask, overlap)

    # 将三通道转换为灰度通道
    mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)
    if mask_scale > 1:
        mask = cv2.resize(
            mask, None,
            fx=mask_scale, fy=mask_scale,
            interpolation=cv2.INTER_CUBIC
        )

    return cv2.bitwise_not(mask)
