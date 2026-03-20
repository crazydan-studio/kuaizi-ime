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
