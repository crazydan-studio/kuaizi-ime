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

def crop_by_contour(img, contour):
    """
    根据轮廓裁剪图形
    """
    x, y, w, h = cv2.boundingRect(contour)

    return img[y:y+h, x:x+w]

def keep_contour_region(image, contour):
    """
    保留指定轮廓内部的区域，外部像素全部置为黑色。

    :param image: 输入图像（彩色或灰度）
    :param contour: 轮廓（OpenCV 格式）
    :return: 处理后的图像（与原始图像尺寸、通道相同）
    """
    if image is None or contour is None:
        return None

    # 创建一个全零的掩码（单通道）
    mask = np.zeros(image.shape[:2], dtype=np.uint8)

    cv2.drawContours(mask, [contour], 0, 255, thickness=cv2.FILLED)

    # 将原图与掩码按位与，外部区域变为黑色
    return cv2.bitwise_and(image, image, mask=mask)

def is_extend_from(img, source, delta, idx=0):
    """
    检查 img 是否是在 source 的基础上延伸。也即，二者重叠的部分是否与 source 的差异在 delta 范围内。

    注意，该检查仅针对二值掩码图。

    :return: img/source 任何为 None，均返回 False
    """
    if img is None or source is None:
        return False

    overlap = cv2.bitwise_and(img, source)

    # cv2.imwrite(f'/tmp/stroke-{idx:03d}-0-{cv2.countNonZero(source)}.png', source)
    # cv2.imwrite(f'/tmp/stroke-{idx:03d}-1-{cv2.countNonZero(overlap)}.png', overlap)

    # 完全相同：np.array_equal(overlap, source)
    if abs(cv2.countNonZero(source) - cv2.countNonZero(overlap)) < delta:
        return True

    return False

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
