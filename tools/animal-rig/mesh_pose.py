"""離線渲染網格版（和 m_template.html 同一套骨頭與蒙皮數學），檢查用。
render({'head': 13, 'neck': 6}, hide=()) → BGR 圖（主圖座標 1254×1254）。紋理用原尺寸 mesh_layers/。"""
import base64, json, math
import numpy as np
import cv2

import os
MESH_DIR = os.environ.get('MESH_DIR', 'D:/RiveSandbox/player/m')   # make_mesh_player.py 的輸出資料夾
D = json.load(open(f'{MESH_DIR}/mesh.json', encoding='utf8'))
W, H = D['size']
dec = lambda s, t: np.frombuffer(base64.b64decode(s), t)
import os
HALF = os.environ.get('HALF') == '1'
LAY = []
for L in D['layers']:
    tex = np.zeros((H, W, 4), np.float32)
    if HALF:   # 跟手機一樣用半尺寸 webp，放大回原尺寸
        im = cv2.imread(f'{MESH_DIR}/{L["name"]}.webp', cv2.IMREAD_UNCHANGED).astype(np.float32)
        im[..., :3] *= im[..., 3:] / 255                      # 跟瀏覽器一樣先預乘再內插（不然透明處的黑色會滲出一圈暗邊）
        im = cv2.resize(im, (L['w'], L['h']), interpolation=cv2.INTER_LINEAR)
        im[..., :3] /= np.maximum(im[..., 3:], 1e-3) / 255
    else:
        im = cv2.imread(f'mesh_layers/{L["name"]}.png', cv2.IMREAD_UNCHANGED).astype(np.float32)
    tex[L['y']:L['y'] + im.shape[0], L['x']:L['x'] + im.shape[1]] = im
    tex[..., :3] *= tex[..., 3:] / 255          # 預乘 alpha
    LAY.append(dict(name=L['name'], P=dec(L['pos'], np.float32).reshape(-1, 2), bi=dec(L['bi'], np.uint8).reshape(-1, 4),
                    bw=dec(L['bw'], np.float32).reshape(-1, 4), tri=dec(L['tri'], np.uint16).reshape(-1, 3).astype(int), tex=tex))

def mul(m, n):
    return [m[0]*n[0] + m[1]*n[3], m[0]*n[1] + m[1]*n[4], m[0]*n[2] + m[1]*n[5] + m[2],
            m[3]*n[0] + m[4]*n[3], m[3]*n[1] + m[4]*n[4], m[3]*n[2] + m[4]*n[5] + m[5]]

def rot(deg, px, py):
    r = math.radians(deg); c, s = math.cos(r), math.sin(r)
    return [c, -s, px - c * px + s * py, s, c, py - s * px - c * py]

def bone_mats(pose):
    world, mats = {}, []
    for b in D['bones']:
        m = rot(pose.get(b['name'], 0), *b['pivot'])
        if b['name'] == 'body':
            sy = pose.get('sy', 1); m = mul([1, 0, 0, 0, sy, (1 - sy) * 1090 + pose.get('ty', 0)], m)
        world[b['name']] = mul(world[b['parent']], m) if b['parent'] else m
        mats.append(world[b['name']])
    return np.array(mats, np.float32)

def render(pose=None, hide=(), bg=(227, 239, 244)):
    pose = pose or {}
    A = bone_mats(pose)
    out = np.zeros((H, W, 3), np.float32) + np.array(bg, np.float32)
    for L in LAY:
        if L['name'] in hide or L['name'] == ('eye_open' if pose.get('blink') else 'eye_closed'):
            continue
        P = L['P']; Ph = np.c_[P, np.ones(len(P))]
        Q = np.zeros_like(P)
        for k in range(4):
            m = A[L['bi'][:, k]]                      # (n, 6)
            Q += L['bw'][:, k:k + 1] * np.c_[(m[:, 0:3] * Ph).sum(1), (m[:, 3:6] * Ph).sum(1)]
        # 光柵化：每個像素記下蓋住它的三角形，再用重心座標反推紋理座標
        ids = np.full((H, W), -1, np.int32)
        for i, t in enumerate(L['tri']):
            cv2.fillConvexPoly(ids, np.round(Q[t] * 16).astype(np.int32), i, lineType=cv2.LINE_8, shift=4)
        ys, xs = np.nonzero(ids >= 0)
        t = L['tri'][ids[ys, xs]]
        a, b, c = Q[t[:, 0]], Q[t[:, 1]], Q[t[:, 2]]
        v0, v1, v2 = b - a, c - a, np.c_[xs, ys] - a
        den = v0[:, 0] * v1[:, 1] - v1[:, 0] * v0[:, 1]; den[np.abs(den) < 1e-9] = 1e-9
        l1 = (v2[:, 0] * v1[:, 1] - v1[:, 0] * v2[:, 1]) / den
        l2 = (v0[:, 0] * v2[:, 1] - v2[:, 0] * v0[:, 1]) / den
        src = P[t[:, 0]] * (1 - l1 - l2)[:, None] + P[t[:, 1]] * l1[:, None] + P[t[:, 2]] * l2[:, None]
        mx = np.full((H, W), -10, np.float32); my = np.full((H, W), -10, np.float32)
        mx[ys, xs] = src[:, 0]; my[ys, xs] = src[:, 1]
        px = cv2.remap(L['tex'], mx, my, cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
        a_ = px[..., 3:] / 255
        out = out * (1 - a_) + px[..., :3]
    return np.clip(out, 0, 255).astype(np.uint8)
