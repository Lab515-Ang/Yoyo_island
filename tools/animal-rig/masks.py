"""從主圖與對齊後的編輯圖，算出各部件的區域遮罩（存成 masks.npz）並出檢查圖。"""
import numpy as np
import cv2
from scipy import ndimage as nd

M = cv2.imread('../side/generated_orig.png')   # 剝層編輯圖都是對原主圖做的，找範圍要跟原主圖比（新主圖只改後腿根一小塊，像素在 rig.py 取）
E = {i: cv2.imread(f'e{i}_aligned.png') for i in range(1, 6)}
H, W = M.shape[:2]

def fg(im):
    """白底以外（和邊框連通的白色當背景），補洞"""
    white = (im.min(2) > 236) & (im.max(2).astype(int) - im.min(2) < 14)
    lab, _ = nd.label(white)
    edge = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])) - {0}
    return nd.binary_fill_holes(~np.isin(lab, list(edge)))

def diff(a, b, t=30):
    d = cv2.GaussianBlur(cv2.absdiff(a, b).max(2), (0, 0), 3) > t
    d = nd.binary_opening(d, iterations=3)
    return d

def big(m, area=3000):
    lab, n = nd.label(m)
    if not n: return m
    s = nd.sum(m, lab, range(1, n + 1))
    return np.isin(lab, [i + 1 for i in np.nonzero(s > area)[0]])

def close_fill(m, r):
    return nd.binary_fill_holes(nd.binary_closing(m, iterations=r))

fgM, fgE1, fgE2, fgE3 = fg(M), fg(E[1]), fg(E[2]), fg(E[3])
X = np.arange(W)[None, :].repeat(H, 0)

# 近側腿＝主圖有、拿掉近側腿後沒了（前景差）或改變的部分
near = big(close_fill((fgM & ~fgE1) | (diff(M, E[1]) & fgM), 6))
# 遠側腿＝E1 有、E2 沒有（四條腿都拿掉）
far = big(close_fill((fgE1 & ~fgE2) | (diff(E[1], E[2]) & fgE1 & ~fgE2), 6)) & fgE1
# 頭＝去頭後消失的前景＋大幅改變處
head = big(close_fill((fgM & ~fgE3) | (diff(M, E[3], 45) & fgM), 12), 20000)
ears = big(close_fill(diff(M, E[4]) & fgM, 4), 1500)
eye = nd.binary_dilation(big(diff(M, E[5]), 300), iterations=6)

np.savez_compressed('masks.npz', fgM=fgM, fgE1=fgE1, fgE2=fgE2, fgE3=fgE3,
                    near=near, far=far, head=head, ears=ears, eye=eye)

chk = M.astype(np.float32).copy()
for m, c in [(far, (255, 120, 0)), (near, (255, 0, 255)), (head, (0, 160, 255)), (ears, (0, 200, 0)), (eye, (0, 0, 255))]:
    chk[m] = chk[m] * 0.45 + np.array(c) * 0.55
cv2.imwrite('masks_check.png', cv2.resize(chk.astype(np.uint8), None, fx=0.6, fy=0.6))
far_img = np.where(far[..., None], E[1], 255)
cv2.imwrite('far_check.png', cv2.resize(far_img, None, fx=0.6, fy=0.6))
print({k: int(v.sum()) for k, v in dict(near=near, far=far, head=head, ears=ears, eye=eye).items()})
