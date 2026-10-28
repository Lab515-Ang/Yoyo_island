"""rig.json + layers/ → B 頁面（巢狀骨架＋CSS 動作）。用法：python make_b.py <輸出資料夾>"""
import json, os, sys
from PIL import Image

out = sys.argv[1]
R = json.load(open('rig.json', encoding='utf8'))
L, ORDER = R['layers'], R['order']
# 舞台＝所有部件的範圍再留邊（尾巴、頭轉動的空間）
x0 = min(v['x'] for v in L.values()) - 30; y0 = min(v['y'] for v in L.values()) - 40
x1 = max(v['x'] + v['w'] for v in L.values()) + 30; y1 = max(v['y'] + v['h'] for v in L.values()) + 20
CW, CH = x1 - x0, y1 - y0
pct = lambda v, s: f'{v / s * 100:.3f}%'

for f in os.listdir(out):
    if f.endswith('.webp'):
        os.remove(os.path.join(out, f))
for n in ORDER:
    im = Image.open(f'layers/{n}.png')
    im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.BOX).save(f"{out}/{n}.webp", quality=88)  # BOX：硬邊不會有振鈴亮線

children = {n: [c for c in ORDER if L[c]['parent'] == n] for n in ORDER}
def bone(n, ind='    '):
    v = L[n]
    px_, py_ = v['pivot']
    before = [c for c in children[n] if ORDER.index(c) < ORDER.index(n)]
    after = [c for c in children[n] if ORDER.index(c) > ORDER.index(n)]
    cls = ' body-img' if n == 'body' else ''
    img = (f'{ind}  <img class="p-{n}{cls}" src="{n}.webp" alt="" '
           f'style="left:{pct(v["x"] - x0, CW)};top:{pct(v["y"] - y0, CH)};width:{pct(v["w"], CW)}">')
    lines = [f'{ind}<div class="bone b-{n}" style="transform-origin:{pct(px_ - x0, CW)} {pct(py_ - y0, CH)}">']
    lines += [bone(c, ind + '  ') for c in before] + [img] + [bone(c, ind + '  ') for c in after]
    return '\n'.join(lines + [f'{ind}</div>'])

dom = bone('body')
tpl = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'b_template.html'), encoding='utf8').read()
html = tpl.replace('/*ASPECT*/', f'{CW} / {CH}').replace('<!--CAT-->', dom)
open(f'{out}/index.html', 'w', encoding='utf8').write(html)
size = sum(os.path.getsize(f'{out}/{n}.webp') for n in ORDER)
print('ok', len(ORDER), 'parts', size // 1024, 'KB', 'stage', CW, CH)
