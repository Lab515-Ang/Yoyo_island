"""硬切片圖層（layers/ + rig.json）→ 網格用 PSD 與骨頭資料。
需要連續彎曲的地方合回一塊（每條腿、尾巴、身體＋脖子），真的會互相重疊的（頭、耳朵、眼皮、下巴）維持分開。
合併時同一塊的各段像素來源相同，重疊處像素一樣，直接疊起來就是連續的一張。"""
import json, os
import numpy as np
from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer, Group

R = json.load(open('rig.json', encoding='utf8'))
W, H = R['size']
RL = R['layers']

def merged(names):
    """依序疊起來（後面的在上），裁到內容範圍，回傳 (圖, x, y)"""
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for n in names:
        if os.path.exists(f'mesh_extra/{n}.png'):   # 網格版專用的圖層（例如脖子）
            o = json.load(open(f'mesh_extra/{n}.json'))
            canvas.alpha_composite(Image.open(f'mesh_extra/{n}.png').convert('RGBA'), (o['x'], o['y']))
            continue
        canvas.alpha_composite(Image.open(f'layers/{n}.png').convert('RGBA'), (RL[n]['x'], RL[n]['y']))
    x0, y0, x1, y1 = canvas.getbbox()
    return canvas.crop((x0, y0, x1, y1)), x0, y0

# 由後往前；每塊：名稱 → 合併來源
MESH = [
    ('leg_back_far',  ['leg_back_far_paw', 'leg_back_far_lower', 'leg_back_far_upper']),
    ('leg_front_far', ['leg_front_far_paw', 'leg_front_far_lower', 'leg_front_far_upper']),
    ('body_neck',     ['body', 'neck']),
    ('tail',          ['tail_3', 'tail_2', 'tail_1']),
    ('leg_back',      ['leg_back_paw', 'leg_back_lower', 'leg_back_upper']),
    ('leg_front',     ['leg_front_paw', 'leg_front_lower', 'leg_front_upper']),
]
HEAD = ['ear_far', 'head_base', 'eye_open', 'eye_closed', 'jaw', 'ear_near']

# 先把每層放到整張畫布上（由後往前）
import numpy as np
from scipy import ndimage as nd
full = {}
for name, src in MESH:
    im, x, y = merged(src)
    c = Image.new('RGBA', (W, H), (0, 0, 0, 0)); c.paste(im, (x, y)); full[name] = np.asarray(c).copy()
for n in HEAD:
    c = Image.new('RGBA', (W, H), (0, 0, 0, 0)); c.paste(Image.open(f'layers/{n}.png').convert('RGBA'), (RL[n]['x'], RL[n]['y']))
    full[n] = np.asarray(c).copy()
ORDER = [n for n, _ in MESH] + HEAD

# 往上層底下延伸：相鄰圖層的邊緣剛好貼齊時，縮圖或變形後兩邊都半透明，疊起來會透出底色（白線）。
# 每層往「靜止時被上面圖層完全蓋住」的地方多長 BLEED px，顏色取自己最近的像素；靜止畫面不變。
BLEED = 10
for i, n in enumerate(ORDER):
    above = [m for m in ORDER[i + 1:] if m not in ('eye_open', 'eye_closed')]
    if not above:
        continue
    cover = np.zeros((H, W), np.float32)
    for m in above:
        a = full[m][..., 3] / 255.0; cover = cover + a * (1 - cover)
    own = full[n][..., 3] > 128
    grow = nd.binary_dilation(own, iterations=BLEED) & (nd.binary_erosion(cover > 0.995, iterations=2)) & ~own
    if not grow.any():
        continue
    _, (iy, ix) = nd.distance_transform_edt(~own, return_indices=True)
    f = full[n]
    f[grow, :3] = f[iy[grow], ix[grow], :3]
    f[..., 3] = np.where(grow, 255, f[..., 3])

psd = PSDImage.new('RGBA', (W, H))
root = Group.new(psd, name='leopard_cat_mesh', open_folder=True)
head = None
layers = {}
for n in ORDER:
    im = Image.fromarray(full[n]); x0, y0, x1, y1 = im.getbbox(); im = im.crop((x0, y0, x1, y1))
    if n == HEAD[0]:
        head = Group.new(root, name='head', open_folder=True)
    lay = PixelLayer.frompil(im, psd, n, top=y0, left=x0)
    (head if n in HEAD else root).append(lay)
    if n == 'eye_closed':
        lay.visible = False
    im.save(f'mesh_layers/{n}.png')
    layers[n] = dict(x=x0, y=y0, w=im.width, h=im.height)
psd.save('leopard_cat_mesh.psd')

# 骨頭：起點＝硬切片版各段的轉軸，終點＝下一根骨頭的起點（末端骨頭給方向與長度）
P = {n: tuple(RL[n]['pivot']) for n in RL}
bones = [dict(name='body', parent=None, start=P['body'], end=P['neck'])]
add = lambda name, parent, start, end: bones.append(dict(name=name, parent=parent, start=start, end=end))
add('neck', 'body', P['neck'], P['head_base'])
add('head', 'neck', P['head_base'], (P['head_base'][0] + 300, P['head_base'][1] + 60))
add('ear_near', 'head', P['ear_near'], (P['ear_near'][0] - 10, P['ear_near'][1] - 170))
add('ear_far', 'head', P['ear_far'], (P['ear_far'][0] + 5, P['ear_far'][1] - 80))
add('jaw', 'head', P['jaw'], (P['jaw'][0] + 150, P['jaw'][1] + 10))
add('tail_1', 'body', P['tail_1'], P['tail_2'])
add('tail_2', 'tail_1', P['tail_2'], P['tail_3'])
add('tail_3', 'tail_2', P['tail_3'], (215, 342))
for leg in ('leg_back', 'leg_front', 'leg_back_far', 'leg_front_far'):
    paw_end = (P[f'{leg}_paw'][0] + 20, RL[f'{leg}_paw']['y'] + RL[f'{leg}_paw']['h'])
    add(f'{leg}_upper', 'body', P[f'{leg}_upper'], P[f'{leg}_lower'])
    add(f'{leg}_lower', f'{leg}_upper', P[f'{leg}_lower'], P[f'{leg}_paw'])
    add(f'{leg}_paw', f'{leg}_lower', P[f'{leg}_paw'], paw_end)
for b in bones:
    b['start'], b['end'] = [int(v) for v in b['start']], [int(v) for v in b['end']]
order = [n for n, _ in MESH[:3]] + ['tail'] + [n for n, _ in MESH[4:]] + HEAD
json.dump(dict(size=[W, H], order=order, layers=layers, bones=bones,
               note='座標都是主圖像素；order 由後往前；eye_closed 預設隱藏（眨眼時切換）'),
          open('rig_mesh.json', 'w', encoding='utf8'), indent=1, ensure_ascii=False)
print('ok', order)
