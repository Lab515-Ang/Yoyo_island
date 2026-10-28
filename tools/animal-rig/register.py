"""把 GPT 編輯圖對齊到主圖、校正色調，輸出差異遮罩。
用法：python register.py <master.png> <edit.png> <out_prefix>
輸出：<out>_aligned.png（對齊＋調色後的編輯圖）、<out>_diff.png（有改變的區域，白＝改變）、<out>_check.png"""
import sys
import numpy as np
import cv2

m_path, e_path, out = sys.argv[1:4]
M = cv2.imread(m_path)
E = cv2.imread(e_path)
E = cv2.resize(E, (M.shape[1], M.shape[0]), interpolation=cv2.INTER_LANCZOS4)

g = lambda im: cv2.GaussianBlur(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255, (0, 0), 2)
warp = np.eye(2, 3, dtype=np.float32)
crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6)
cc, warp = cv2.findTransformECC(g(M), g(E), warp, cv2.MOTION_AFFINE, crit, None, 5)
A = cv2.warpAffine(E, warp, (M.shape[1], M.shape[0]), flags=cv2.INTER_LANCZOS4 | cv2.WARP_INVERSE_MAP,
                   borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255))

def diffmask(A):
    d = cv2.absdiff(M, A).max(2)
    d = cv2.GaussianBlur(d, (0, 0), 3)
    k = (d > 38).astype(np.uint8)
    k = cv2.morphologyEx(k, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    k = cv2.morphologyEx(k, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(k)
    keep = np.zeros_like(k)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > 1500:
            keep[lab == i] = 1
    return keep

# 色調：在沒改變的前景區域，逐通道把編輯圖的平均值拉回主圖
k = diffmask(A)
fg = (M.min(2) < 235) & (k == 0)
gain = M[fg].reshape(-1, 3).mean(0) / np.maximum(A[fg].reshape(-1, 3).mean(0), 1)
A = np.clip(A.astype(np.float32) * gain, 0, 255).astype(np.uint8)
A[A.min(2) > 247] = 255
k = diffmask(A)

cv2.imwrite(out + '_aligned.png', A)
cv2.imwrite(out + '_diff.png', k * 255)
chk = M.copy()
chk[k > 0] = (chk[k > 0] * 0.4 + np.array([255, 0, 255]) * 0.6).astype(np.uint8)
cv2.imwrite(out + '_check.png', cv2.resize(chk, None, fx=0.5, fy=0.5))
print(f'cc={cc:.4f} gain={np.round(gain, 3)} warp={np.round(warp, 3).tolist()} changed={k.sum()}')
