"""網格版播放頁的資料：每個網格圖層切三角網格、算骨頭權重。
用法：python make_mesh_player.py <輸出資料夾>   → mesh.json、各層 webp、index.html（m_template.html）

權重設計（同一個位置、不同圖層一定取到一樣的權重，疊在一起的地方才會一起變形、不露縫）：
- 脊椎場 spine(p)：只有 body、head 兩根。head 權重＝離身體核心的距離 /（離身體核心＋離頭的距離），平滑化。
  頭（含耳朵、下巴）裡面＝1；胸口以後＝0；脖子中間漸變，低頭時整段脖子彎。neck 骨頭是 head 的父骨頭，不直接帶權重。
- 腿、尾巴、耳朵、下巴：沿著自己的骨頭鏈量距離 s，在每個關節前後 band 像素內，從上一段（第一段是 spine(p)）線性漸變到下一段。
"""
import base64, json, os, sys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as nd

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
R = json.load(open('rig_mesh.json', encoding='utf8'))
W, H = R['size']
L = R['layers']
B = {b['name']: b for b in R['bones']}
BONES = [b['name'] for b in R['bones']]
BI = {n: i for i, n in enumerate(BONES)}
G = 12  # 網格間距（主圖像素）

def alpha_full(name):
    a = np.zeros((H, W), np.uint8)
    im = np.asarray(Image.open(f'mesh_layers/{name}.png').convert('RGBA'))[..., 3]
    v = L[name]; a[v['y']:v['y'] + v['h'], v['x']:v['x'] + v['w']] = im
    return a > 128

def poly(pts):
    m = np.zeros((H, W), np.uint8); cv2.fillPoly(m, [np.array(pts, np.int32)], 1); return m > 0

# ---------- 脊椎場 ----------
head_core = alpha_full('head_base') | alpha_full('ear_near') | alpha_full('ear_far') | alpha_full('jaw')
# 脖子過渡帶：喉嚨前面往下多留到胸口（y≈800），下巴往下壓時才有足夠距離漸變、不摺疊
NECK_ZONE = [(640, 520), (740, 380), (830, 290), (962, 300), (1050, 378), (1120, 700), (1100, 800), (980, 800), (860, 720), (720, 650), (650, 600)]
body_core = alpha_full('body_neck') & ~nd.binary_dilation(poly(NECK_ZONE), iterations=6) & ~head_core
dB = nd.distance_transform_edt(~body_core)
dH = nd.distance_transform_edt(~head_core)
t = dB / (dB + dH + 1e-6)
T_HEAD = cv2.GaussianBlur(t.astype(np.float32), (0, 0), 20)   # 柔化：距離場在核心邊界有折角，不柔化會出現摺線

ears_a = alpha_full('ear_near') | alpha_full('ear_far')
D_GLUE = nd.distance_transform_edt(~((alpha_full('head_base') | alpha_full('body_neck')) & ~ears_a))  # 離看得到的頭皮／脖子多遠
EAR_REACH = {'ear_near': 120, 'ear_far': 70}   # 加大耳朵擺動：拉長黏著漸變，耳根幾乎不動、耳尖彎過去，底下不會露出頭皮

def smooth(a, b, x):
    u = np.clip((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u)

# 離身體多遠：交界上（含壓在身體上的部分）＝1，往腿裡 40px 漸變到 0
BODY_COVER = 1 - smooth(0, 40, nd.distance_transform_edt(~alpha_full('body_neck')))

def spine(P):
    x = np.clip(P[:, 0].round().astype(int), 0, W - 1); y = np.clip(P[:, 1].round().astype(int), 0, H - 1)
    w = np.zeros((len(P), len(BONES)), np.float32)
    th = T_HEAD[y, x]; w[:, BI['head']] = th; w[:, BI['body']] = 1 - th
    return w

def polyline_s(P, pts):
    """每點投影到折線上的沿線距離"""
    pts = np.asarray(pts, np.float32)
    best_d = np.full(len(P), np.inf); best_s = np.zeros(len(P)); acc = 0.0
    for a, b in zip(pts[:-1], pts[1:]):
        ab = b - a; l2 = float(ab @ ab); l = l2 ** 0.5
        u = np.clip(((P - a) @ ab) / l2, 0, 1)
        d = np.linalg.norm(P - (a + u[:, None] * ab), axis=1)
        m = d < best_d; best_d[m] = d[m]; best_s[m] = acc + u[m] * l
        acc += l
    return best_s

def s_of(pts, q):
    return polyline_s(np.array([q], np.float32), pts)[0]

def chain(P, pts, joints, bones, bands):
    """pts：折線（第 0 點是往父骨頭方向延伸的虛擬點）；joints：各段起點；bones：各段骨頭；bands：各關節漸變半寬"""
    s = polyline_s(P, pts)
    one = lambda b: np.eye(len(BONES), dtype=np.float32)[BI[b]][None, :]
    w = one(bones[-1]).repeat(len(P), 0)
    for k in range(len(bones) - 1, -1, -1):          # 由末端往根部套：w = lerp(上一段, 這一段以後, t_k)
        sk = s_of(pts, joints[k]); tk = smooth(sk - bands[k], sk + bands[k], s)[:, None]
        prev = spine(P) if k == 0 else one(bones[k - 1]).repeat(len(P), 0)
        w = prev * (1 - tk) + w * tk
    return w

def back(p, q, d):
    """從 p 往 q 的反方向延伸 d 的點"""
    v = np.subtract(p, q, dtype=np.float32); return tuple(np.asarray(p) + v / np.linalg.norm(v) * d)

def leg_chain(name, P):
    u, lo, pa = B[f'{name}_upper'], B[f'{name}_lower'], B[f'{name}_paw']
    hip, knee, ankle, toe = u['start'], lo['start'], pa['start'], pa['end']
    pts = [back(hip, knee, 200), hip, knee, ankle, toe]
    return chain(P, pts, [hip, knee, ankle], [f'{name}_upper', f'{name}_lower', f'{name}_paw'], [45, 32, 22])

def leg_upper_only(name, P):
    """只到大腿（上臂）那根：身體不能被小腿、腳掌的彎曲帶著剪切"""
    u, lo = B[f'{name}_upper'], B[f'{name}_lower']
    hip, knee = u['start'], lo['start']
    return chain(P, [back(hip, knee, 200), hip, knee], [hip], [f'{name}_upper'], [45])

def tail_chain(P):
    j0, j1, j2 = B['tail_1']['start'], B['tail_2']['start'], B['tail_3']['start']
    line = [back(j0, (190, 700), 150), j0, (190, 700), j1, (70, 545), j2, (90, 405), (150, 362), (215, 342), (262, 345)]
    return chain(P, line, [j0, j1, j2], ['tail_1', 'tail_2', 'tail_3'], [40, 30, 30])

# 蓋在身體上的部位（近側大腿根、肩膀、尾巴根）：圓心＝轉軸，半徑內身體跟它用「同一組權重」一起動，
# 外面一圈漸變回脊椎場。腿／尾巴圖層自己在這個範圍內也用同一個公式，所以重疊處像素一起走，不會重影。
# （遠側腿在身體後面，被身體蓋住，不用跟。）
ZONES = [  # (轉軸, 全跟的半徑, 漸變寬度, 權重函式)
    (tuple(B['leg_back_upper']['start']), 185, 90, lambda P: leg_upper_only('leg_back', P)),
    (tuple(B['leg_front_upper']['start']), 165, 90, lambda P: leg_upper_only('leg_front', P)),
    (tuple(B['tail_1']['start']), 110, 70, tail_chain),   # 半徑都大於「和身體重疊處離轉軸最遠」（175／155／99px）
]


def zoned(P, zones):
    w = spine(P)
    for c, r, band, f in zones:
        d = np.hypot(P[:, 0] - c[0], P[:, 1] - c[1]); k = (1 - smooth(r, r + band, d))[:, None]
        w = w + (f(P) - spine(P)) * k
    return w

def weights(name, P):
    if name in ('head_base', 'eye_open', 'eye_closed'):
        return spine(P)
    if name == 'body_neck':
        return zoned(P, ZONES)
    if name in ('leg_back', 'leg_front'):
        # 壓在身體上的部分＝身體的權重（只跟大腿）；離開身體輪廓後才接上整條腿的鏈
        x = np.clip(P[:, 0].round().astype(int), 0, W - 1); y = np.clip(P[:, 1].round().astype(int), 0, H - 1)
        c = BODY_COVER[y, x][:, None]
        return leg_upper_only(name, P) * c + leg_chain(name, P) * (1 - c)
    if name.startswith('leg'):
        return leg_chain(name, P)
    if name == 'tail':
        return tail_chain(P)
    if name in ('ear_near', 'ear_far'):
        # 耳朵貼著頭皮（和脖子）的整條邊都要黏住：權重按離頭皮的距離漸變，耳朵是彎的，不是整片掀起來
        x = np.clip(P[:, 0].round().astype(int), 0, W - 1); y = np.clip(P[:, 1].round().astype(int), 0, H - 1)
        t = smooth(0, EAR_REACH[name], D_GLUE[y, x])[:, None]
        e = np.zeros((1, len(BONES)), np.float32); e[0, BI[name]] = 1
        return spine(P) * (1 - t) + e * t
    if name == 'jaw':
        b = B[name]
        return chain(P, [back(b['start'], b['end'], 120), b['start'], b['end']], [b['start']], [name], [25])
    raise KeyError(name)

# ---------- 網格 ----------
b64 = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
mesh = []
for name in R['order']:
    v = L[name]
    a = np.asarray(Image.open(f'mesh_layers/{name}.png').convert('RGBA'))[..., 3] > 0
    cols, rows = -(-v['w'] // G), -(-v['h'] // G)
    pad = np.zeros((rows * G, cols * G), bool); pad[:v['h'], :v['w']] = a
    used = pad.reshape(rows, G, cols, G).any((1, 3))
    used = nd.binary_dilation(used)                      # 多留一圈，邊緣的半透明不會被切掉
    vid = -np.ones((rows + 1, cols + 1), int); verts = []
    tris = []
    for r, c in zip(*np.nonzero(used)):
        q = []
        for dr, dc in ((0, 0), (0, 1), (1, 1), (1, 0)):
            rr, cc = r + dr, c + dc
            if vid[rr, cc] < 0:
                vid[rr, cc] = len(verts); verts.append((v['x'] + cc * G, v['y'] + rr * G))
            q.append(vid[rr, cc])
        tris += [q[0], q[1], q[2], q[0], q[2], q[3]]
    P = np.array(verts, np.float32)
    w = weights(name, P)
    idx = np.argsort(-w, 1)[:, :4]
    ww = np.take_along_axis(w, idx, 1); ww /= ww.sum(1, keepdims=True)
    mesh.append(dict(name=name, x=v['x'], y=v['y'], w=v['w'], h=v['h'], n=len(verts), t=len(tris) // 3,
                     pos=b64(P.astype(np.float32)), bi=b64(idx.astype(np.uint8)), bw=b64(ww.astype(np.float32)),
                     tri=b64(np.array(tris, np.uint16))))
    im = Image.open(f'mesh_layers/{name}.png').convert('RGBA')
    im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.BOX).save(f'{out}/{name}.webp', quality=90)

bones = [dict(name=b['name'], parent=b['parent'], pivot=b['start']) for b in R['bones']]
json.dump(dict(size=[W, H], bones=bones, layers=mesh), open(f'{out}/mesh.json', 'w', encoding='utf8'))
open(f'{out}/index.html', 'w', encoding='utf8').write(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'm_template.html'), encoding='utf8').read())
# 檢查用：脊椎場的 head 權重圖
cv2.imwrite('spine_field.png', cv2.resize((T_HEAD * 255).astype(np.uint8), None, fx=0.4, fy=0.4))
tot_v = sum(m['n'] for m in mesh); tot_t = sum(m['t'] for m in mesh)
size = sum(os.path.getsize(f'{out}/{f}') for f in os.listdir(out))
print('ok', len(mesh), 'layers', tot_v, 'verts', tot_t, 'tris', size // 1024, 'KB')
