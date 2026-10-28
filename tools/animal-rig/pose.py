"""照 rig.json 擺姿勢合成（離線檢查用）。
pose.render({'leg_back_upper': 12, ...}, hide={'eye_closed'}) → BGRA 圖；角度單位度、順時針為正（同 CSS）。"""
import json
import numpy as np
import cv2

R = json.load(open('rig.json', encoding='utf8'))
IMG = {n: cv2.imread(f'layers/{n}.png', cv2.IMREAD_UNCHANGED) for n in R['order']}

def _mat(name, angles, cache):
    if name in cache:
        return cache[name]
    L = R['layers'][name]
    px, py = L['pivot']
    a = np.deg2rad(angles.get(name, 0))
    c, s = np.cos(a), np.sin(a)
    # 繞轉軸旋轉（螢幕座標 y 向下，正角度＝順時針）
    T = np.array([[c, -s, px - c * px + s * py], [s, c, py - s * px - c * py], [0, 0, 1]])
    if L['parent']:
        T = _mat(L['parent'], angles, cache) @ T
    cache[name] = T
    return T

def render(angles=None, hide=('eye_closed',), bg=(255, 255, 255)):
    angles = angles or {}
    W, H = R['size']
    out = np.zeros((H, W, 3), np.float32) + np.array(bg, np.float32)
    cache = {}
    for n in R['order']:
        if n in hide:
            continue
        L = R['layers'][n]
        T = _mat(n, angles, cache) @ np.array([[1, 0, L['x']], [0, 1, L['y']], [0, 0, 1]])
        im = cv2.warpAffine(IMG[n], T[:2], (W, H), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0)).astype(np.float32)
        a = im[..., 3:] / 255
        out = out * (1 - a) + im[..., :3] * a
    return out.astype(np.uint8)
