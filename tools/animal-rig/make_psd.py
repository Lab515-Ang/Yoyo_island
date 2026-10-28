"""layers/ + rig.json → 有群組的分層 PSD（群組＝骨架父子關係）"""
import json, sys
from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer, Group

R = json.load(open('rig.json', encoding='utf8'))
W, H = R['size']
psd = PSDImage.new('RGBA', (W, H))

def px(parent, name):
    L = R['layers'][name]
    lay = PixelLayer.frompil(Image.open(f'layers/{name}.png'), psd, name, top=L['y'], left=L['x'])
    parent.append(lay)
    if name == 'eye_closed':
        lay.visible = False   # 眨眼時才開
    return lay

def group(parent, name):
    g = Group.new(psd, name=name, open_folder=True) if parent is psd else Group.new(parent, name=name, open_folder=True)
    return g

root = group(psd, 'leopard_cat')
for leg in ('leg_back_far', 'leg_front_far'):
    g = group(root, leg)
    for seg in ('paw', 'lower', 'upper'):
        px(g, f'{leg}_{seg}')
px(root, 'body')
g = group(root, 'tail')
for n in ('tail_3', 'tail_2', 'tail_1'):
    px(g, n)
for leg in ('leg_back', 'leg_front'):
    g = group(root, leg)
    for seg in ('paw', 'lower', 'upper'):
        px(g, f'{leg}_{seg}')
neck = group(root, 'neck_group')
px(neck, 'neck')
head = group(neck, 'head')
for n in ('ear_far', 'head_base', 'eye_open', 'eye_closed', 'jaw', 'ear_near'):
    px(head, n)
out = sys.argv[1] if len(sys.argv) > 1 else 'leopard_cat_rig.psd'
psd.save(out)

def tree(g, d=0):
    for l in g:
        print('  ' * d + ('[' + l.name + ']' if l.is_group() else l.name) + ('' if l.visible else '（隱藏）'))
        if l.is_group():
            tree(l, d + 1)
tree(PSDImage.open(out))
