"""從主圖＋剝層編輯圖切出完整骨架部件。
座標都是主圖（1254×1254）像素。輸出 layers/<name>.png（裁到內容範圍）與 rig.json（位置、轉軸、父層、順序）。

原則：
- 看得到的像素一律用主圖；只有被擋住、動起來才會露出的地方用 GPT 剝層圖（E1 去近側腿、E3 去頭、E4 去耳、E5 閉眼）。
- 相鄰部件在內部接縫互補、硬邊（不羽化），靜止時拼回來就是主圖，不會透白縫。
- 每個關節用「以轉軸為圓心」的圓盤：子段、父段都含這個圓盤，轉動時圓盤原地不動，蓋住接縫。
  圓盤半徑＝該處部件的半寬（距離轉換自動量），不會比部件窄而露出缺口。"""
import json, os
import numpy as np
import cv2
from scipy import ndimage as nd

M = cv2.imread('../side/generated.png')
E1, E3, E4, E5 = (cv2.imread(f'e{i}_aligned.png') for i in (1, 3, 4, 5))
k = np.load('masks.npz')
H, W = M.shape[:2]
YY, XX = np.mgrid[0:H, 0:W]
fgM, fgE1, fgE3 = k['fgM'], k['fgE1'], k['fgE3']

# ---------- 小工具 ----------
def soft(m, erode=2, blur=0.8):
    """外輪廓：往內縮掉混白的邊，再柔化"""
    return cv2.GaussianBlur(nd.binary_erosion(m, iterations=erode).astype(np.float32), (0, 0), blur)

def poly(pts):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1)
    return m.astype(bool)

def below(pts):
    """折線以下（含）的區域；折線外的 x 不限制"""
    xs, ys = zip(*pts)
    yb = np.interp(np.arange(W), xs, ys, left=-1, right=-1)
    return (YY >= yb[None, :]) & (yb[None, :] >= 0)

def disc(c, r, feather=0):
    d = np.hypot(XX - c[0], YY - c[1])
    return (d <= r).astype(np.float32) if not feather else np.clip((r - d) / feather + 0.5, 0, 1).astype(np.float32)

def seg_param(mask, pts):
    """遮罩內每個像素投影到折線上的沿線距離（遮罩外為 -1）"""
    P = np.array(pts, np.float32)
    dense, acc = [], 0.0
    for a, b in zip(P[:-1], P[1:]):
        L = float(np.hypot(*(b - a))); t = np.linspace(0, 1, int(L) + 1, endpoint=False)[:, None]
        dense.append(np.c_[a + (b - a) * t, acc + t[:, 0] * L]); acc += L
    D = np.vstack(dense)
    ys, xs = np.nonzero(mask)
    S = np.full((H, W), -1, np.float32)
    for i in range(0, len(xs), 20000):
        px, py = xs[i:i + 20000, None], ys[i:i + 20000, None]
        j = np.argmin((px - D[None, :, 0]) ** 2 + (py - D[None, :, 1]) ** 2, axis=1)
        S[ys[i:i + 20000], xs[i:i + 20000]] = D[j, 2]
    return S

def joint(region, guess, search=40, search_y=12):
    """在猜的位置附近找部件最粗的點（距離轉換最大），回傳 (中心, 半徑)"""
    dt = nd.distance_transform_edt(region)
    win = (np.abs(XX - guess[0]) <= search) & (np.abs(YY - guess[1]) <= search_y)
    i = np.argmax(np.where(win, dt, 0))
    return (int(XX.flat[i]), int(YY.flat[i])), float(dt.flat[i]) + 1.5

def clean(m, r=5):
    """去碎片：開運算、留最大塊、補洞"""
    m = nd.binary_opening(m, structure=np.ones((3, 3)), iterations=r)
    lab, n = nd.label(m)
    if n > 1:
        s = nd.sum(m, lab, range(1, n + 1)); m = lab == (np.argmax(s) + 1)
    return nd.binary_fill_holes(m)

aM, aE1, aE3 = soft(fgM), soft(fgE1), soft(fgE3)
layers = {}
def add(name, rgb, alpha, pivot, parent):
    layers[name] = dict(rgb=rgb, a=np.clip(alpha, 0, 1), pivot=pivot, parent=parent)

# 肚子線（身體下緣；腿從這條線以下開始）。近側腿底下用 E1 補畫的肚子
BELLY = [(150, 820), (250, 845), (350, 860), (450, 864), (560, 864), (680, 852), (780, 838), (880, 820), (960, 800), (1060, 780)]
under_belly = below(BELLY)
under_belly_shift = lambda dy: below([(x, y + dy) for x, y in BELLY])

# ---------- 四條腿：髖／肩圓盤＋三段 ----------
LEGS = {
    #               來源  x 範圍        髖／肩(中心,半徑)    膝 y  踝 y
    'leg_back':      ('M',  (160, 420),  ((300, 800), 128),   925, 995),
    'leg_front':     ('M',  (660, 905),  ((775, 790), 126),   882, 1000),
    'leg_back_far':  ('E1', (385, 600),  ((485, 805), 105),   908, 968),
    'leg_front_far': ('E1', (815, 1060), ((905, 800), 105),   902, 978),
}
regions = {}
covers = {}   # 近側腿整層（含髖部圓盤）靜止時蓋住的範圍
for name, (src, (x0, x1), (hip, rh), yk, ya) in LEGS.items():
    near = src == 'M'
    rgb, fg_src, a_src = (M, fgM, aM) if near else (E1, fgE1, aE1)
    if not near:   # 遠側腿：看得到的地方用主圖，只有被近側腿擋住的地方用 E1 補畫
        # 被近側腿（含它壓在身體上的大腿根）擋住的地方用 E1 補畫；E1 那一帶是 GPT 依原主圖畫的，
        # 跟新主圖的接縫處顏色不一樣，所以邊緣羽化 6px 過渡
        occl = nd.binary_dilation(regions['leg_back'] | regions['leg_front'] | (fgM & ~fgE1), iterations=3)
        mix_ = cv2.GaussianBlur(occl.astype(np.float32), (0, 0), 3)[..., None] * occl[..., None]
        rgb = (M * (1 - mix_) + E1 * mix_).astype(np.uint8)
    side = (XX >= x0) & (XX <= x1)
    if near:   # 近側腿：主圖減掉 E1 的差異（清過碎片），只取肚子線以下
        region = clean(k['near'] & side) & under_belly
        if name == 'leg_front':  # 差異裡黏到一塊遠側腳掌（GPT 重畫過）；沿主圖近側腳掌的右緣切掉
            region &= ~poly([(846, 940), (850, 990), (865, 1005), (880, 1020), (891, 1040), (897, 1060),
                             (895, 1080), (885, 1100), (1000, 1100), (1000, 940)])
    else:      # 遠側腿：E1 裡肚子線以下的前景就是完整的遠側腿
        # 只取主圖也有東西的像素（E1 胖出來的肚子自然排除）；往肚子線上方多延伸 25px 藏在身體後面，
        # 身體在這幾段只到肚子線，轉動時接縫兩側是同一張腿的貼圖
        region = clean(fg_src & fgM & side & under_belly_shift(-25), 3)
        # 腿本身＝肚子線下 6px 以下、不是奶油色肚皮的部分；往上只延伸成「腿本身寬度」的柱狀，不帶肚皮的形狀
        _hsv_ = cv2.cvtColor(M, cv2.COLOR_BGR2HSV)
        is_cream = (_hsv_[..., 1] < 110) & (_hsv_[..., 2] > 200) & ~under_belly_shift(60)
        body_leg = clean(region & under_belly_shift(6) & ~is_cream, 2)
        cols = body_leg[:, :].any(0)
        top_y = np.where(cols, np.argmax(body_leg, 0), H)                     # 每一欄腿本身的最上緣
        column = (YY >= top_y[None, :] - 25) & cols[None, :]
        # 延伸段（藏在身體後面）一律用腿本身最上緣那一排的顏色往上拉，不用主圖該處的身體／肚皮像素
        region = (body_leg | (region & column & ~under_belly_shift(6))) & ~(is_cream & under_belly_shift(-2))
        # 跟近側大腿重疊的那一塊：主圖裡是近側大腿（亮橘色），不是遠側腿，移出去（靜止時被近側大腿蓋住，看不出差別）
        region &= ~nd.binary_dilation(regions['leg_back'], iterations=4)
        region = clean(region, 1)
    if not near:
        # 往身體後面延伸的那段（肚子線上方）在主圖裡是身體的肚皮色，腿往前擺會露出一撮淺色：改成沿用最近的腿本身顏色
        # 看得到的遠側腿＝腿本身、且靜止時沒被近側腿（含髖部圓盤）蓋住；其餘（被蓋住、延伸段）一律用看得到的腿顏色往外拉，
        # 否則被蓋住處取到的是近側大腿的奶油色摺邊，腿一擺就露出一撮淺色
        cover = nd.binary_dilation(covers['leg_back'] | covers['leg_front'], iterations=3)
        vis = body_leg & ~cover
        hid = region & ~vis
        if hid.any():
            _, (iy, ix) = nd.distance_transform_edt(~vis, return_indices=True)
            rgb = np.where(hid[..., None], cv2.GaussianBlur(rgb[iy, ix], (0, 0), 2), rgb)
    (kc, rk), (ac, ra) = joint(region, ((x0 + x1) // 2, yk), 90), joint(region, ((x0 + x1) // 2, ya), 90)
    # 切線垂直於腿的方向（斜腿用水平線切，橫切面比圓盤寬，轉動時邊角會露出來）
    bottom = region & (YY > YY[region].max() - 20)
    toe = (XX[bottom].mean(), YY[bottom].mean())
    def past(c, d, back=0):
        n = np.hypot(*d)
        return ((XX - c[0]) * d[0] + (YY - c[1]) * d[1]) / n >= -back
    dk, da = (ac[0] - kc[0], ac[1] - kc[1]), (toe[0] - ac[0], toe[1] - ac[1])
    # 子段往父段底下多伸 6px，切線超出圓盤的那一點點也有重疊、不會透縫
    upper = region & ~past(kc, dk)
    lower = region & past(kc, dk, 6) & ~past(ac, da)
    paw = region & past(ac, da, 6)
    kd = disc(kc, rk) * region; ad = disc(ac, ra) * region
    # 髖／肩圓盤：身體上的那一片一起轉，邊緣羽化 24px 融進身體；半徑自動放大到把腿上端完整包進來
    top = region & ~under_belly_shift(30)
    rh = max(rh, np.hypot(XX[top] - hip[0], YY[top] - hip[1]).max() + 16) if top.any() else rh
    hd = disc(hip, rh, 24) * fg_src
    if not near:
        # 遠側腿在身體後面，不需要圓盤蓋身體（身體在上面）；圓盤只留在腿本身範圍內，
        # 否則圓盤裡的身體、肚皮、近側大腿像素會被腿帶著轉，從身體邊緣或兩腿之間露出來
        hd = hd * nd.binary_dilation(region, iterations=2)
    # 近側腿蓋在身體上、圓盤都是主圖像素，整片保留（挖缺口會在腿頂端留下邊緣，縮圖後露出細線；試過 2px、12px 硬切、柔性淡出都會）
    add(f'{name}_paw', rgb, np.maximum(paw, ad) * a_src, ac, f'{name}_lower')
    add(f'{name}_lower', rgb, np.maximum(lower, np.maximum(kd, ad)) * a_src, kc, f'{name}_upper')
    add(f'{name}_upper', rgb, np.maximum(np.maximum(upper, hd), kd) * a_src, hip, 'body')
    regions[name] = region
    if near:
        covers[name] = np.maximum(np.maximum(upper, hd), kd) * a_src > 0.5
near_legs = regions['leg_back'] | regions['leg_front']
far_legs = regions['leg_back_far'] | regions['leg_front_far']

# ---------- 尾巴：三節，蓋在身體上 ----------
tail_poly = poly([(0, 230), (300, 230), (300, 590), (262, 640), (240, 760), (0, 800)])  # 切線落在根部圓盤裡
tail_reg = fgM & tail_poly
J0, R0 = (268, 685), 92                      # 根部：橫跨尾巴與屁股的接合處
(J1, R1), (J2, R2) = joint(tail_reg, (112, 640), 30, 30), joint(tail_reg, (64, 470), 30, 30)
# 沿尾巴中心線分節：每個像素投影到中心線上的距離 s，切線自然垂直於尾巴
TAIL_LINE = [J0, (190, 700), J1, (70, 545), J2, (90, 405), (150, 362), (215, 342), (262, 345)]
S = seg_param(tail_reg | ((disc(J0, R0) > 0) & fgM), TAIL_LINE)
sJ1, sJ2 = S[J1[1], J1[0]], S[J2[1], J2[0]]
t1 = tail_reg & (S >= 0) & (S < sJ1)
t2 = tail_reg & (S >= sJ1 - 6) & (S < sJ2)      # 子節往父節底下多伸 6px
t3 = tail_reg & (S >= sJ2 - 6)
b0 = disc(J0, R0, 16) * fgM
add('tail_3', M, np.maximum(t3, disc(J2, R2) * tail_reg) * aM, J2, 'tail_2')
add('tail_2', M, np.maximum(t2, np.maximum(disc(J1, R1), disc(J2, R2)) * tail_reg) * aM, J1, 'tail_1')
add('tail_1', M, np.maximum(np.maximum(t1, b0), disc(J1, R1) * tail_reg) * aM, J0, 'body')

# ---------- 頭、脖子 ----------
# 耳朵（範圍往外多抓 5px，連深色耳緣一起帶走）
# 耳朵：手描它和頭、脖子、另一隻耳朵的交界線（從主圖細格線量的），外側輪廓由白底決定。
# 差異遮罩不能用：去耳圖是 GPT 重畫的，逐像素差異很雜，會把頭頂的毛抓進來或在耳緣破洞。
NEAR_EAR_POLY = [(790, 205), (935, 205), (945, 250), (955, 262), (966, 285), (973, 302), (977, 326),
                 (962, 333), (950, 338), (927, 353), (912, 368), (900, 388), (887, 415), (876, 430),
                 (862, 440), (845, 441), (832, 432), (825, 420), (821, 400), (820, 370), (822, 345), (790, 335)]
FAR_EAR_POLY = [(935, 205), (1070, 205), (1070, 291), (1033, 288), (1013, 283), (987, 279), (963, 281),
                (955, 262), (945, 250)]
ear_near = poly(NEAR_EAR_POLY) & fgM
ear_far = poly(FAR_EAR_POLY) & fgM
ears = ear_near | ear_far
# 頭：後緣沿著耳朵底下的頭殼輪廓（x≈845），耳朵後面的頸毛歸脖子
HEAD_POLY = [(845, 190), (1254, 190), (1254, 700), (1180, 645), (1100, 666), (1000, 670), (930, 657),
             (876, 618), (853, 552), (848, 482), (845, 432)]
head_reg = poly(HEAD_POLY) & fgM & ~ears
# 脖子：看得到的部分用主圖；被頭、耳朵擋住的部分用去頭圖（E3），頭轉開時露出來的是完整的脖子
NECK_POLY = [(680, 560), (640, 520), (740, 380), (830, 290), (962, 300), (1050, 378), (1060, 720), (960, 725), (860, 690), (760, 620)]  # 後緣推到輪廓外，由前景決定邊界
NECK_PIVOT, NECK_R = (760, 585), 95
HEAD_PIVOT = (860, 470)   # 後腦與頸椎的接點：點頭時後腦幾乎不動，臉往下
hidden = head_reg | ears
# 頭底下：去頭圖有的地方用 E3；E3 的喉嚨比主圖窄，缺的那一點用主圖墊（頭抬起來才不會露白縫）
use_e3 = hidden & fgE3
neck_reg = poly(NECK_POLY) & ((fgM & ~ears) | use_e3)   # 耳朵位置不取主圖（否則頭轉開會露出耳朵殘影）
# 耳朵拿掉後脖子頂端留下 V 形缺口：閉合補平輪廓，缺口的顏色從周圍的毛 inpaint
closed = cv2.morphologyEx(neck_reg.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61))) > 0
notch = nd.binary_fill_holes(closed) & poly(NECK_POLY) & ~neck_reg & (YY < 560)
# 頭邊緣內側 8px 先保留主圖（縮圖後頭的邊緣半透明，底下要是同樣的像素，才不會透出一條線），再漸變成 E3
mix = cv2.GaussianBlur(nd.binary_erosion(use_e3, iterations=8).astype(np.float32), (0, 0), 3)[..., None] * use_e3[..., None]
neck_rgb = (M * (1 - mix) + E3 * mix).astype(np.uint8)
neck_rgb = cv2.inpaint(neck_rgb, (notch * 255).astype(np.uint8), 9, cv2.INPAINT_TELEA)
neck_reg = neck_reg | notch
neck_a = np.maximum(neck_reg, disc(NECK_PIVOT, NECK_R, 20) * fgM * ~hidden) * np.maximum(aM, aE3 * use_e3)
add('neck', neck_rgb, neck_a, NECK_PIVOT, 'body')
# 網格版的脖子：頭底下只用去頭圖的自然脖子輪廓（不要主圖的下巴像素、不被多邊形切成直邊）；
# 硬切片版需要那塊墊底蓋喉嚨白縫，所以分開輸出給 make_mesh.py
wide = poly([(640, 520), (740, 380), (830, 290), (962, 280), (1200, 330), (1200, 760), (960, 725), (860, 690), (760, 620)])
neck_mesh = ((neck_reg & ~hidden) | (wide & use_e3)) & ~(hidden & ~fgE3)
neck_mesh_a = np.maximum(neck_mesh, disc(NECK_PIVOT, NECK_R, 20) * fgM * ~hidden) * np.maximum(aM * ~hidden, aE3 * use_e3)
os.makedirs('mesh_extra', exist_ok=True)
_a8 = (np.clip(neck_mesh_a, 0, 1) * 255).astype(np.uint8); _ys, _xs = np.nonzero(_a8 > 2)
cv2.imwrite('mesh_extra/neck.png', np.dstack([neck_rgb, _a8])[_ys.min():_ys.max() + 1, _xs.min():_xs.max() + 1])
json.dump(dict(x=int(_xs.min()), y=int(_ys.min())), open('mesh_extra/neck.json', 'w'))

EAR_NEAR_PIVOT, EAR_FAR_PIVOT = (893, 428), (995, 305)
# 遠側耳朵被近側耳朵擋住的部分：往近側耳朵後面延伸 30px，顏色從看得到的遠側耳朵 inpaint（近側耳朵擺動時才不會露白）
far_hidden = nd.binary_dilation(ear_far & ~nd.binary_erosion(ear_far, iterations=2), iterations=30) & ear_near & ~ear_far & (YY < 320)
far_hidden &= YY > 245 + (945 - XX) * 0.42      # 不超出遠側耳朵頂緣（(1000,222)→(945,245)）往左下的延長線
_, (iy, ix) = nd.distance_transform_edt(~nd.binary_erosion(ear_far, iterations=3), return_indices=True)
ext = cv2.GaussianBlur(M[iy, ix], (0, 0), 2)                     # 最近的遠側耳朵像素顏色往外延伸
far_rgb = np.where(far_hidden[..., None], ext, M)
add('ear_far', far_rgb, nd.binary_fill_holes(np.maximum(ear_far | far_hidden, disc(EAR_FAR_PIVOT, 34) * head_reg) > 0) * np.maximum(aM, far_hidden),
    EAR_FAR_PIVOT, 'head_base')
add('ear_near', M, ear_near * aM, EAR_NEAR_PIVOT, 'head_base')

# 頭本體：耳朵底下換成去耳圖（E4）的頭頂與輪廓
fgE4 = nd.binary_fill_holes(cv2.cvtColor(E4, cv2.COLOR_BGR2GRAY) < 236)
ears_zone = ear_near | ear_far   # 只有耳朵正下方換成去耳圖；耳朵外一律主圖，靜止時接縫就是耳朵的硬邊
# 耳根（耳朵貼著頭皮、脖子的那條邊）內側 6px 保留主圖，理由同上；耳朵外緣（碰到背景的那邊）照樣換成去耳圖
glue_band = nd.binary_dilation(fgM & ~ears_zone, iterations=6)
head_rgb = np.where((ears_zone & ~glue_band)[..., None], E4, M)
head_shape = (poly(HEAD_POLY) & fgM & ~ears_zone) | (ears_zone & fgE4 & poly(HEAD_POLY))  # 耳朵底下整片都要有頭皮，不能留縫
head_a = head_shape * np.where(ears_zone, soft(fgE4), aM)

# 下巴：嘴線以下那一小塊；頭本體在下巴底下畫嘴巴內側（張嘴才露出來）
JAW_POLY = [(1048, 598), (1110, 604), (1160, 611), (1196, 600), (1210, 590), (1200, 628), (1160, 652),
            (1090, 664), (1040, 660), (1020, 630)]
JAW_PIVOT = (1045, 600)
jaw_reg = poly(JAW_POLY) & head_reg
mouth = cv2.GaussianBlur(nd.binary_erosion(jaw_reg, iterations=7).astype(np.float32), (0, 0), 2)[..., None]
head_rgb = (head_rgb * (1 - mouth) + np.array([52, 60, 112]) * mouth).astype(np.uint8)  # 深玫瑰褐（BGR）
add('head_base', head_rgb, head_a, HEAD_PIVOT, 'neck')
add('jaw', M, jaw_reg * aM, JAW_PIVOT, 'head_base')

# 眼睛：張眼（主圖）／閉眼（E5），疊在頭本體上
eye_a = cv2.GaussianBlur(k['eye'].astype(np.float32), (0, 0), 3)
EYE_PIVOT = (int(XX[k['eye']].mean()), int(YY[k['eye']].mean()))
add('eye_open', M, eye_a, EYE_PIVOT, 'head_base')
add('eye_closed', E5, eye_a, EYE_PIVOT, 'head_base')

# ---------- 身體：其他部件的互補 ----------
# 肚子線以下：用 E1（拿掉近側腿、補畫了肚子）的自然輪廓，扣掉遠側腿；不再切水平直線
# 肚子線以下的肚皮：用主圖原本的輪廓（扣掉腿）；近側腿正下方只到肚子線（E1 補畫偏白、邊緣直，腿一擺就露）
belly_fill = under_belly & fgM & ~near_legs & ~nd.binary_dilation(far_legs, iterations=1)
# 遠側腿那幾欄，肚子線以下還有一段奶油色肚皮（主圖裡肚皮下緣是平順的弧線），原本被分給遠側腿，腿一擺身體輪廓就露出階梯。
# 奶油色（低飽和、高亮度）、跟身體連在一起、在肚子線下 40px 內的像素歸身體；遠側腿在身體後面，重疊沒關係
_hsv = cv2.cvtColor(M, cv2.COLOR_BGR2HSV)
cream = (_hsv[..., 1] < 110) & (_hsv[..., 2] > 200) & fgM & under_belly & ~under_belly_shift(40) & ~near_legs
cream = nd.binary_opening(nd.binary_closing(cream, iterations=2), iterations=4) & ~nd.binary_dilation(near_legs, iterations=6)  # 去掉胯下細碎的奶油色
lab_, _ = nd.label(cream | belly_fill | (fgM & ~under_belly))
keep = np.unique(lab_[fgM & ~under_belly & (YY < 800)]); keep = keep[keep > 0]
belly_fill |= cream & np.isin(lab_, keep)
body_shape = ((fgM | fgE1) & ~under_belly | belly_fill) \
             & ~(tail_reg & (b0 < 0.5)) & ~(neck_reg & (disc(NECK_PIVOT, NECK_R) == 0)) & ~head_reg & ~ears
body_shape |= (b0 > 0) & fgM                                       # 尾巴根部圓盤底下
body_rgb = np.where((near_legs | (fgE1 & ~fgM))[..., None], E1, M)  # 近側腿後面用 E1 的肚子
body_a = body_shape * np.maximum(aM, aE1)
add('body', body_rgb, body_a, (560, 780), None)

# ---------- 輸出 ----------
ORDER = ['leg_back_far_paw', 'leg_back_far_lower', 'leg_back_far_upper',
         'leg_front_far_paw', 'leg_front_far_lower', 'leg_front_far_upper',
         'body', 'tail_3', 'tail_2', 'tail_1',
         'leg_back_paw', 'leg_back_lower', 'leg_back_upper',
         'leg_front_paw', 'leg_front_lower', 'leg_front_upper',
         'neck', 'ear_far', 'head_base', 'eye_open', 'eye_closed', 'jaw', 'ear_near']
assert set(ORDER) == set(layers), set(layers) ^ set(ORDER)
os.makedirs('layers', exist_ok=True)
meta = {}
for name in ORDER:
    L = layers[name]
    a8 = (L['a'] * 255).round().astype(np.uint8)
    # 清掉孤立碎片：只留跟最大塊相連、或面積夠大的區塊
    lab_, n_ = nd.label(nd.binary_dilation(a8 > 8, iterations=3))
    if n_ > 1:
        sz = nd.sum(np.ones_like(lab_), lab_, range(1, n_ + 1))
        a8[~np.isin(lab_, [i + 1 for i in np.nonzero(sz >= 0.05 * sz.max())[0]])] = 0
    ys, xs = np.nonzero(a8 > 2)
    assert len(xs), f"{name} 是空的"
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    cv2.imwrite(f'layers/{name}.png', np.dstack([L['rgb'][y0:y1, x0:x1], a8[y0:y1, x0:x1]]))
    meta[name] = dict(x=int(x0), y=int(y0), w=int(x1 - x0), h=int(y1 - y0),
                      pivot=[int(L['pivot'][0]), int(L['pivot'][1])], parent=L['parent'])
json.dump(dict(size=[W, H], order=ORDER, layers=meta), open('rig.json', 'w', encoding='utf8'), indent=1, ensure_ascii=False)
print('ok', {n: meta[n]['pivot'] for n in ('leg_back_lower', 'leg_back_paw', 'leg_front_lower', 'leg_front_paw', 'tail_2', 'tail_3')})
