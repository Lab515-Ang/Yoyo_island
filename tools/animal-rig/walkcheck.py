"""走路 4 個階段，裁前腳、後腿、脖子拼成一張（和手機截圖同樣的範圍）。用法：HALF=1 python walkcheck.py <輸出>"""
import sys, cv2, numpy as np, mesh_pose as mp
from walkpose import walk
rows = []
for u in (0, .25, .5, .75):
    r = mp.render(walk(u))
    a = cv2.resize(r[740:980, 640:900], (390, 360)); b = cv2.resize(r[720:960, 230:520], (435, 360)); c = cv2.resize(r[260:560, 680:920], (288, 360))
    rows.append(np.hstack([a, np.full((360, 6, 3), 128, np.uint8), b, np.full((360, 6, 3), 128, np.uint8), c]))
cv2.imwrite(sys.argv[1], np.vstack(rows))
