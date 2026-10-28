"""把 GPT 編輯圖（已對齊）的局部區域換進主圖，邊緣羽化。用法：python patch_master.py <aligned.png> x0 y0 x1 y1
原主圖備份在 ../side/generated_orig.png；輸出覆蓋 ../side/generated.png，並出對照圖 patch_check.png"""
import sys
import numpy as np, cv2
src, x0, y0, x1, y1 = sys.argv[1], *map(int, sys.argv[2:6])
M = cv2.imread('../side/generated_orig.png').astype(np.float32)
E = cv2.imread(src).astype(np.float32)
m = np.zeros(M.shape[:2], np.float32); m[y0:y1, x0:x1] = 1
m = cv2.GaussianBlur(m, (0, 0), 14)[..., None]          # 邊緣 ~30px 漸變
out = M * (1 - m) + E * m
cv2.imwrite('../side/generated.png', out.round().astype(np.uint8))
pad = 40
a = M[y0 - pad:y1 + pad, x0 - pad:x1 + pad]; b = out[y0 - pad:y1 + pad, x0 - pad:x1 + pad]
cv2.imwrite('patch_check.png', np.hstack([a, np.full((a.shape[0], 8, 3), 128), b]).astype(np.uint8))
print('patched', x0, y0, x1, y1)
