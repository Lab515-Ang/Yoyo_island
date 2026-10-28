"""批量產動物主圖：提示與風格圖照 cozy-creatures skill，動物資料讀 tools/art-list/art_data.py，產圖走 route_media.py。

在專案根目錄執行：
  python -I tools/animal-batch/batch.py masters --batch 1                 # 預設走 OpenAI API、透明背景
  python -I tools/animal-batch/batch.py masters --batch 1 --route codex-cli   # 沒 API key 時（白底）
  python -I tools/animal-batch/batch.py masters --ids pitta --redo --note "尾巴太長，改短"
  python -I tools/animal-batch/batch.py sheet --batch 1                   # 審圖總表 .forge/animals/sheet-batch1.png
  python -I tools/animal-batch/batch.py normalize --batch 1               # 審過後：<代號>-2_1024.png、<代號>-2.png（512）
  python -I tools/animal-batch/batch.py peels --batch 1 [--only e1,eye]   # 剝層圖＋自動對齊 → <代號>/peels/<代號>/reg_*.png
  python -I tools/animal-batch/batch.py sheet --batch 1 --peels           # 剝層圖總表（洋紅＝有改變的範圍）
  python -I tools/animal-batch/batch.py serve                             # 審圖網頁 http://localhost:8765/（結果存 .forge/animals/review.json）
  python -I tools/animal-batch/batch.py redo [--route ...]                # 網頁上退回的圖，帶退回原因重產
  python -I tools/animal-batch/batch.py pack --batch 1                    # 打包 .forge/animals/export/*.zip（含 manifest.json、README.md）

輸出：.forge/animals/<代號>/master/generated.png（重產時舊的移到 master-1、master-2…）。
物種照片（只管解剖與毛色）放 .forge/animals/<代號>/refs/，有就自動帶上。
"""
import argparse
import glob
import json
import os
import pathlib
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/art-list'))
import art_data  # noqa: E402

SKILL = pathlib.Path.home() / '.codex/skills/cozy-creatures'
# ponytail: 版本用字串排序，agent-sprite-forge 出到 0.10 以後要改成數字比較
ROUTE_MEDIA = sorted(glob.glob(str(pathlib.Path.home() / '.claude/plugins/cache/agent-sprite-forge/*/*/skills/generate2dmedia/scripts/route_media.py')))[-1]
OUT = ROOT / '.forge/animals'
SKIP = {'leopard_cat'}  # 已有主圖且綁好骨架，先保留（2026-10-28 決定）

VIEW = 'Right-facing strict side profile: nose toward image RIGHT, body perfectly side-on, no head turn, true orthographic'
# 蝴蝶側面幾乎看不到翅膀，拍翅動畫也要翅膀展開，所以例外（2026-10-28 決定）
VIEW_SHAPE = {'butterfly': 'Seen from above, slightly tilted: wings fully open, flat and symmetrical, head toward the top of the image'}
BIRDS = art_data.BIRD_SHAPES | {'wader'}
POSE_MAMMAL = ('standing calmly on all four legs, legs slightly apart so all four are readable '
               '(near legs in front, far legs slightly darker behind), head level, tail relaxed and fully visible')
POSE_BIRD = ('standing calmly on the ground, wings folded against the body, both legs visible '
             '(far leg slightly behind and darker), tail fully visible, head level')
POSE_SHAPE = {
    'fish': 'swimming calmly with the body horizontal, all fins relaxed and fully visible, tail fin fully visible',
    'dolphin': 'swimming calmly with the body horizontal, flippers, dorsal fin and tail flukes fully visible',
    'turtle': ('swimming calmly with the shell horizontal, all four flippers readable '
               '(near flippers in front, far flippers slightly darker behind), head extended'),
    'frog': ('sitting calmly in a typical frog crouch, near front and hind legs fully visible, '
             'far legs slightly darker behind'),
    'bat': 'resting upright with both wings folded tightly against the body, feet visible below, head level',
    'butterfly': 'resting with wings fully spread open, antennae and body fully visible',
}
AQUATIC = {'fish', 'dolphin', 'turtle', 'otter'}  # 風格圖改用 skill 的鯊魚
PROJECT = ('Project rules (wildlife-conservation focus app): exactly one animal. Cute but species-accurate: players must '
           'recognize the real species. Not anthropomorphic, no clothes. Keep a clean readable silhouette with no limb hidden, '
           'because the image will be cut into parts for 2D mesh animation.')
LIGHT = ('Diffuse upper-left key light fixed relative to camera, gentle fill, neutral-warm white balance, consistent exposure. '
         'NO contact shadow, no ground plane, no cast shadow. No dramatic light, depth-of-field blur, microtexture, scenery, '
         'props, clothes, accessories, text, labels, border, watermark or additional animals.')
BG_TRANSPARENT = 'Fully transparent background (real alpha, no backdrop colour). ' + LIGHT
BG_WHITE = 'Plain pure white (#FFFFFF) background. ' + LIGHT


def build_prompt(a, transparent, note, photos):
    text = (SKILL / 'references/prompt.md').read_text(encoding='utf-8')
    paras = [p.strip() for p in text.split('\n\n') if p.strip()]
    # 去掉標題、給人看的說明、轉角度用的段落；背景段換成棲光小島規格（無陰影、白底或透明）
    paras = [p for p in paras if not p.startswith(('#', 'Use the full base', 'For derived views'))]
    bg = [i for i, p in enumerate(paras) if p.startswith('Seamless')]
    assert len(bg) == 1, 'skill 的 prompt.md 背景段落改了，要更新 build_prompt'
    paras[bg[0]] = BG_TRANSPARENT if transparent else BG_WHITE
    out = '\n\n'.join(paras)
    subs = {
        '[SPECIES / BREED]': f"{a['name']} ({a['id'].replace('_', ' ')})",
        '[SPECIES FEATURES]': a['look'],
        '[SELECTED EXPRESSION]': 'calm neutral',
        '[POSE]': POSE_SHAPE.get(a['shape_id'], POSE_BIRD if a['shape_id'] in BIRDS else POSE_MAMMAL),
        '[VIEW]': VIEW_SHAPE.get(a['shape_id'], VIEW),
        # 棲光小島主圖：本體寬約 850～950 / 1024
        'Fit largest projected view within approximately 75% canvas': 'The animal spans about 85-90% of the canvas width',
    }
    for k, v in subs.items():
        assert k in out, f'skill 的 prompt.md 找不到 {k}，要更新 build_prompt'
        out = out.replace(k, v)
    out += '\n\n' + PROJECT + '\nSquare 1024x1024.'
    if photos:
        out += '\nThe last reference images are photos of the real species: use them for anatomy and colouring ONLY.'
    if note:
        out += '\nCorrection from review: ' + note
    return out


def refs_for(a):
    # skill 的風格圖沒有鳥：鳥類加上批次 1 通過的八色鳥（2026-10-28 決定）
    if a['shape_id'] in BIRDS:
        style = [SKILL / 'assets/style-bee.png', pathlib.Path(__file__).parent / 'style-bird-pitta.png']
    elif a['shape_id'] in AQUATIC:
        style = [SKILL / 'assets/style-bee.png', SKILL / 'assets/style-shark.png']
    else:
        style = [SKILL / 'assets/style-bee.png', SKILL / 'assets/style-tiger.png']
    photos = sorted(p for p in (OUT / a['id'] / 'refs').glob('*') if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp'))
    return style, photos


def fresh(d, redo):
    """產圖資料夾：已有圖且不重產 → None；重產時舊的移到 <名稱>-1、-2…（route_media 要新資料夾）。"""
    if (d / 'generated.png').exists() and not redo:
        return None
    if d.exists():
        n = 1
        while d.with_name(f'{d.name}-{n}').exists():
            n += 1
        d.rename(d.with_name(f'{d.name}-{n}'))
    d.parent.mkdir(parents=True, exist_ok=True)
    return d


def route(prompt, refs, d, purpose, args, transparent=False):
    pf = d.with_name(d.name + '-prompt.txt')
    pf.write_text(prompt, encoding='utf-8')
    cmd = [sys.executable, '-I', ROUTE_MEDIA, 'image', '--route', args.route, '--prompt-file', str(pf),
           '--size', '1024x1024', '--out-dir', str(d), '--project-dir', str(ROOT), '--purpose', purpose]
    for r in refs:
        cmd += ['--reference', str(r)]
    if transparent:
        cmd.append('--transparent')
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding='utf-8',
                       env={**os.environ, 'PYTHONUTF8': '1'})
    lines = [l for l in r.stdout.splitlines() if l.startswith('{')]
    return lines[-1] if lines else f'失敗 (exit {r.returncode}): {r.stderr.strip()[-400:]}'


def gen_master(a, args):
    d = fresh(OUT / a['id'] / 'master', args.redo)
    if d is None:
        return a['id'], 'skip (已有)'
    transparent = args.route != 'codex-cli' and not args.white
    style, photos = refs_for(a)
    prompt = build_prompt(a, transparent, args.note, photos)
    return a['id'], route(prompt, style + photos, d, f"animal master {a['id']}", args, transparent)


# ---------- 剝層圖：對主圖「只改一處」，照 docs/規格-動物動態網格.md 第 4 節 ----------
# 提示裡不要寫 joints／rounded ends where limbs attach（GPT 會畫成玩具接頭）
EDIT_HEAD = ('This is an EDIT of the reference image. Output the SAME image: identical animal, identical pose, identical '
             'position, scale and framing on the canvas, identical colors, markings, surface style and soft lighting, plain pure '
             'white background, same canvas size as the reference. Change ONLY what is described below; every other pixel '
             'must stay as close to the reference as possible.\n')
PEEL_TEXT = {
    'e1': ('Remove the two NEAR-side legs (the near front leg and the near hind leg), but ONLY the parts that hang below the '
           'body; the outline of the body, the haunch and the chest stay exactly as they are. Now the two FAR-side legs, which '
           'were partly hidden behind the near legs, are fully visible: paint their hidden parts completely (same style, colors '
           'and markings, slightly darker as far legs), and paint the smooth belly line where the near legs used to cover it.'),
    'e3': ('Remove the HEAD completely (face, ears, muzzle, chin). Keep the neck and the body exactly as they are; the neck '
           'continues upward and ends in a smooth rounded top where the head used to be, with the same coat color and markings '
           'continuing naturally. Paint the parts of the neck, chest and shoulders that were hidden behind the head.'),
    'e4': ('Remove BOTH EARS completely (the near ear and the far ear). Paint the top and back of the head that was hidden '
           'behind the ears: smooth rounded skull with the same coat color and markings continuing naturally.'),
    'eye': ('Close the visible EYE gently, as if the animal is blinking peacefully: the eye becomes a soft closed eyelid colored '
            'like the surrounding face, with a short gently curved dark line where the eyelids meet. Keep the eye position and size.'),
    'wing': ('Remove the NEAR-side folded WING completely. Paint the flank, back and breast that were hidden under the wing, '
             'with the same colors and smooth simplified surface continuing naturally. Head, tail and legs stay unchanged.'),
    'bhead': ('Remove the HEAD completely (head, beak, eye). The neck ends in a smooth rounded top where the head used to be, '
              'with the same feather color continuing naturally. Paint the neck, breast and back that were hidden behind the head.'),
    'bleg': ('Remove the NEAR-side LEG and foot completely (only the part below the body). The FAR-side leg and foot, partly '
             'hidden behind it, are now fully visible: paint its hidden parts completely, slightly darker as the far leg. Paint '
             'the smooth belly line where the near leg used to cover it.'),
    # E7（2026-10-28 新增，每種動物都要有）
    'look': ('Turn ONLY the HEAD toward the viewer: the face now looks straight at the camera (front view of the face, both '
             'eyes visible, symmetrical), as if the animal calmly noticed the viewer. The neck turns naturally with it. Keep the '
             'same head size, colors and markings (now seen from the front) and a calm neutral expression. The body, legs, '
             'wings, fins, tail and their positions stay exactly the same.'),
    'fin': ('Remove the near-side PECTORAL FIN completely. Paint the side of the body that was hidden behind it, with the '
            'same colors and markings continuing naturally.'),
    'flipper': ('Remove the NEAR-side FRONT FLIPPER completely. Paint the shell edge and body side that were hidden behind it; '
                'the far front flipper, partly hidden before, is now fully visible (slightly darker as the far one).'),
    'hleg': ('Remove the NEAR-side HIND LEG completely. The FAR-side hind leg, partly hidden behind it, is now fully visible: '
             'paint its hidden parts completely, slightly darker as the far leg. Paint the body side where the near leg was.'),
    'tuft': ('Remove BOTH EAR TUFTS (the feather tufts on top of the head) completely. Paint the smooth rounded top of the head '
             'with the same feather colors continuing naturally.'),
}
# 額外姿勢：不是編輯圖（不對齊），同一隻動物換姿勢
POSE_TEXT = ('The SAME animal as the reference (identical design, colors, markings, proportions and surface style), now {pose}. '
             'Plain pure white background, same canvas size, the animal at about the same scale, no shadow, no water, '
             'no branch, flower or any other prop.')
EXTRA = {
    ('fly', 'bird'): 'in flight: strict side profile facing RIGHT, both wings raised and spread in a flapping pose, legs tucked under the body, tail slightly spread',
    ('fly', 'raptor'): 'in flight: strict side profile facing RIGHT, wings spread wide and flat, soaring, legs tucked under the body, tail slightly spread',
    ('fly', 'bat'): 'in flight: strict side profile facing RIGHT, both wings fully spread in a flapping pose, legs trailing behind',
    ('swim', 'otter'): 'swimming: strict side profile facing RIGHT, body long and horizontal, legs paddling, thick tail stretched out behind',
    ('leap', 'dolphin'): 'leaping: strict side profile facing RIGHT, body arched in a jump, flippers and tail flukes fully visible',
    ('perch', 'butterfly'): 'perched with wings closed upright above the body: strict side profile facing RIGHT, legs below, antennae forward',
    ('hang', 'bat'): 'hanging upside down by its feet from the top of the canvas, wings wrapped around the body, head at the bottom looking RIGHT',
}
EXTRA_CODES = {c for c, _ in EXTRA}
# 依體型的剝層清單（e5 閉眼在各體型共用 eye；look＝E7 頭轉向鏡頭，魚、蝴蝶除外）
MAMMAL_PEELS = ['e1', 'e3', 'e4', 'eye', 'look']
BIRD_PEELS = ['wing', 'bhead', 'eye', 'bleg', 'look']
PEELS = {'cat': MAMMAL_PEELS, 'bear': MAMMAL_PEELS, 'mustelid': MAMMAL_PEELS, 'pangolin': MAMMAL_PEELS,
         'goat': MAMMAL_PEELS,  # ponytail: 山羊的「拿掉鬃毛」到批次 3 再加
         'otter': MAMMAL_PEELS + ['swim'],
         'bird': BIRD_PEELS + ['fly'], 'pheasant': BIRD_PEELS, 'raptor': BIRD_PEELS + ['fly'],
         'wader': BIRD_PEELS,  # 飛行姿勢是選配，要做再加 'fly'（EXTRA 也要補）
         'owl': ['bhead', 'eye', 'tuft', 'look'],
         'fish': ['fin'], 'turtle': ['flipper', 'look'], 'dolphin': ['fin', 'look', 'leap'],
         'butterfly': ['perch'], 'frog': ['hleg', 'eye', 'look'], 'bat': ['look', 'fly', 'hang']}
RIG = ROOT / 'tools/animal-rig'
# 石虎的主圖和剝層圖在 .forge/rive-test（網格版已綁好），只補後來新增的剝層
MASTER = {'leopard_cat': ROOT / '.forge/rive-test/side/generated_orig.png'}
PEELS_DONE = {'leopard_cat': {'e1', 'e3', 'e4', 'eye'}}


def gen_peel(a, code, args):
    master = MASTER.get(a['id'], OUT / a['id'] / 'master/generated.png')
    # ponytail: 主圖若是 API 透明背景，register.py 會讀成黑底；到時先把主圖墊白再做剝層
    d = fresh(OUT / a['id'] / 'peels' / code, args.redo)
    if d is None:
        return f"{a['id']}/{code}", 'skip (已有)'
    if code in EXTRA_CODES:
        prompt = POSE_TEXT.format(pose=EXTRA[code, a['shape_id']])
    else:
        prompt = EDIT_HEAD + PEEL_TEXT[code]
    if args.note:
        prompt += '\nCorrection from review: ' + args.note
    res = route(prompt, [master], d, f"animal peel {a['id']} {code}", args)
    if code not in EXTRA_CODES and (d / 'generated.png').exists():
        res = align(master, d)
    return f"{a['id']}/{code}", res


def align(master, d):
    """register.py 對齊＋校色；規格：位移 < 2px、相關係數 > 0.89。
    GPT 常把整張圖稍微移動／縮放，仿射對齊補得回來，所以沒過只標「需看」，最後看 reg_check.png 的洋紅範圍
    是不是只在該改的地方（整隻都洋紅＝GPT 重畫了身體，要重產）。結果另存 align.txt 給總表用。"""
    r = subprocess.run([sys.executable, '-I', str(RIG / 'register.py'), str(master), str(d / 'generated.png'), str(d / 'reg')],
                       capture_output=True, text=True, encoding='utf-8')
    line = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr.strip()[-300:]
    try:
        cc = float(line.split('cc=')[1].split()[0])
        warp = json.loads(line.split('warp=')[1].split(' changed=')[0])
        shift = max(abs(warp[0][2]), abs(warp[1][2]))
        ok = cc > 0.89 and shift < 2
        res = f"{'OK' if ok else '需看'} cc={cc:.3f} 位移={shift:.1f}px"
    except (IndexError, ValueError):
        res = '對齊失敗：' + line
    (d / 'align.txt').write_text(res, encoding='utf-8')
    return res


def cutout(im):
    """回傳 alpha（0～1）。透明圖直接用；白底圖去掉跟外框相連的白色，加上被圍起來的純白區塊（兩腿之間），
    遮罩內縮 2px、柔化 0.8px。白色羽毛有明暗、平均亮度到不了 248，不會被當成背景。"""
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    if a[..., 3].min() < 255:
        return a[..., 3] / 255
    m = a[..., :3].min(-1)
    lab, n = ndimage.label(m > 235)
    edge = np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])
    ids = np.arange(1, n + 1)
    holes = ids[np.asarray(ndimage.mean(m, lab, ids)) >= 248]
    fg = ndimage.binary_erosion(~np.isin(lab, np.r_[edge[edge > 0], holes]), iterations=2)
    return ndimage.gaussian_filter(fg.astype(np.float32), 0.8)


def check(alpha):
    ys, xs = np.nonzero(alpha > 0.5)
    if not len(xs):
        return '空白圖', None
    h, w = alpha.shape
    box = (xs.min(), ys.min(), xs.max(), ys.max())
    # 美術清單：本體約 850～950 / 1024；貓頭鷹這類直立的動物看高度
    span = max(box[2] - box[0], box[3] - box[1]) / w
    notes = [f'本體 {span:.0%}']
    if min(box[0], box[1]) < 4 or box[2] > w - 5 or box[3] > h - 5:
        notes.append('貼邊，可能被裁切')
    if not 850 / 1024 <= span <= 950 / 1024:
        notes.append('不在 83～93%，標準化時縮放')
    return '、'.join(notes), box


def normalize(a):
    """審過的主圖 → 製作主圖 <代號>-2_1024.png（本體長邊 900 px）＋ App 用 <代號>-2.png（512，腳底 y=472，水平置中）。
    縮圖先預乘 alpha 再用 BOX，避免透明處的白底顏色滲進邊緣。"""
    f = OUT / a['id'] / 'master/generated.png'
    if not f.exists():
        return a['id'], '還沒有主圖'
    src = Image.open(f)
    alpha = cutout(src)
    _, box = check(alpha)
    rgba = Image.fromarray(np.dstack([np.asarray(src.convert('RGB')), (alpha * 255).round().astype(np.uint8)]), 'RGBA')
    body = rgba.crop((box[0], box[1], box[2] + 1, box[3] + 1)).convert('RGBa')
    k = 900 / max(body.size)
    body = body.resize((round(body.width * k), round(body.height * k)), Image.BOX)
    canvas = Image.new('RGBa', (1024, 1024))
    canvas.paste(body, ((1024 - body.width) // 2, 944 - body.height))  # 944 = 472 × 2
    out1024 = canvas.convert('RGBA')
    out1024.save(OUT / a['id'] / f"{a['id']}-2_1024.png")
    canvas.resize((512, 512), Image.BOX).convert('RGBA').save(OUT / a['id'] / f"{a['id']}-2.png")
    return a['id'], f'本體 {body.width}×{body.height}'


def peel_sheet(rows, path):
    """每隻一列：主圖，接著每張剝層圖的疊色檢查（洋紅＝有改變的範圍）；飛行姿勢放原圖。"""
    T = 300
    font = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 18)
    cols = max(len(PEELS[a['shape_id']]) for a in rows) + 1
    page = Image.new('RGB', (T * cols, (T + 50) * len(rows)), '#ffffff')
    dr = ImageDraw.Draw(page)
    for i, a in enumerate(rows):
        y = i * (T + 50)
        master = MASTER.get(a['id'], OUT / a['id'] / 'master/generated.png')
        page.paste(Image.open(master).convert('RGB').resize((T, T), Image.BOX), (0, y + 50))
        dr.text((5, y + 5), f"{a['name']} 主圖", fill='#222', font=font)
        for j, c in enumerate(PEELS[a['shape_id']], 1):
            d = OUT / a['id'] / 'peels' / c
            f = d / ('generated.png' if c in EXTRA_CODES else 'reg_check.png')
            label = (d / 'align.txt').read_text(encoding='utf-8') if (d / 'align.txt').exists() else ''
            dr.text((j * T + 5, y + 5), c, fill='#222', font=font)
            dr.text((j * T + 5, y + 27), label, fill='#c00' if label.startswith(('需看', '對齊失敗')) else '#666', font=font)
            if f.exists():
                page.paste(Image.open(f).convert('RGB').resize((T, T), Image.BOX), (j * T, y + 50))
            elif c in PEELS_DONE.get(a['id'], ()):
                dr.text((j * T + 5, y + 80), '已完成（.forge/rive-test）', fill='#666', font=font)
    page.save(path)


def sheet(rows, path):
    """每隻一列：淺底、深底（看白邊）、實際 48／32 px（看小尺寸認不認得出），用 BOX 縮圖。"""
    T, H = 360, 400
    font = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 20)
    page = Image.new('RGB', (T * 3, H * len(rows)), '#ffffff')
    dr = ImageDraw.Draw(page)
    for i, a in enumerate(rows):
        y = i * H
        f = OUT / a['id'] / 'master/generated.png'
        if not f.exists():
            dr.text((10, y + 10), f"{a['name']} {a['id']}：還沒有圖", fill='#c00', font=font)
            continue
        im = Image.open(f).convert('RGB')
        alpha = cutout(Image.open(f))
        note, _ = check(alpha)
        rgba = np.dstack([np.asarray(im), (alpha * 255).astype(np.uint8)])
        cut = Image.fromarray(rgba, 'RGBA')
        for j, bg in enumerate(('#FBF6EC', '#2B2B2B')):
            tile = Image.new('RGBA', cut.size, bg)
            tile.alpha_composite(cut)
            page.paste(tile.convert('RGB').resize((T, T), Image.BOX), (j * T, y + 40))
        small = Image.new('RGB', (T, T), '#FBF6EC')
        for k, s in enumerate((48, 32)):
            t = Image.new('RGBA', cut.size, '#FBF6EC')
            t.alpha_composite(cut)
            small.paste(t.convert('RGB').resize((s, s), Image.BOX), (40 + k * 100, 150))
        page.paste(small, (2 * T, y + 40))
        dr.text((10, y + 8), f"{a['name']} {a['id']}　{note}", fill='#222', font=font)
    page.save(path)


# ---------- 審圖網頁、退回重產、打包 ----------
CODE_NAME = {'master': '主圖', 'e1': 'E1 拿掉近側腿', 'e3': 'E3 拿掉頭', 'e4': 'E4 拿掉耳朵', 'eye': 'E5 閉眼',
             'look': 'E7 頭轉向鏡頭', 'wing': '拿掉近側翅膀', 'bhead': '拿掉頭', 'bleg': '拿掉近側腳', 'tuft': '拿掉耳羽',
             'fly': '飛行姿勢', 'fin': '拿掉胸鰭', 'flipper': '拿掉近側前鰭', 'hleg': '拿掉近側後腳',
             'swim': '游泳姿勢', 'leap': '躍出水面', 'perch': '停棲（翅膀合起）', 'hang': '倒掛'}
DONE_FILE = {('leopard_cat', c): ROOT / f'.forge/rive-test/rig/{e}_aligned.png'
             for c, e in (('e1', 'e1'), ('e3', 'e3'), ('e4', 'e4'), ('eye', 'e5'))}
REVIEW = OUT / 'review.json'


def ver(f):
    return str(f.stat().st_mtime_ns)  # 重產後檔案變了，舊的審核結果就不算


def load_review():
    return json.loads(REVIEW.read_text(encoding='utf-8')) if REVIEW.exists() else {}


def collect(rows):
    """所有已產的圖。done＝石虎以前就完成、不用再審的剝層圖。"""
    out = []
    for a in rows:
        base = OUT / a['id']
        if a['id'] not in SKIP and (base / 'master/generated.png').exists():
            out.append({'key': f"{a['id']}/master", 'a': a, 'code': 'master', 'file': base / 'master/generated.png', 'dir': base / 'master'})
        for c in PEELS[a['shape_id']]:
            d = base / 'peels' / c
            f = DONE_FILE.get((a['id'], c)) or d / ('generated.png' if c in EXTRA_CODES else 'reg_aligned.png')
            if f.exists():
                out.append({'key': f"{a['id']}/{c}", 'a': a, 'code': c, 'file': f, 'dir': d, 'done': (a['id'], c) in DONE_FILE})
    return out


def api_items():
    import importlib
    importlib.reload(art_data)  # 審圖網頁開著時美術清單可能被改，每次都讀新的
    forge, rv, out = ROOT / '.forge', load_review(), []
    url = lambda f: f'/{f.relative_to(forge).as_posix()}?v={ver(f)}'
    for it in collect(art_data.animals()):
        if it.get('done'):
            continue
        a, f, r = it['a'], it['file'], rv.get(it['key'])
        check, align_txt = it['dir'] / 'reg_check.png', it['dir'] / 'align.txt'
        out.append({
            'key': it['key'], 'name': a['name'], 'id': a['id'], 'batch': a['batch'], 'label': CODE_NAME[it['code']],
            'img': url(f), 'master': url(MASTER.get(a['id'], OUT / a['id'] / 'master/generated.png')),
            'check': url(check) if check.exists() else None,
            'align': align_txt.read_text(encoding='utf-8') if align_txt.exists() else '',
            'ver': ver(f), 'review': r if r and r['ver'] == ver(f) else None,
            'prev': r['note'] if r and r['ver'] != ver(f) and r['status'] == 'reject' else '',
        })
    return out


def serve(port):
    from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
    page = pathlib.Path(__file__).with_name('review.html')

    class H(SimpleHTTPRequestHandler):
        def __init__(s, *a, **k):
            super().__init__(*a, directory=str(ROOT / '.forge'), **k)

        def reply(s, data, ctype):
            s.send_response(200)
            s.send_header('Content-Type', ctype)
            s.send_header('Content-Length', str(len(data)))
            s.end_headers()
            s.wfile.write(data)

        def do_GET(s):
            if s.path in ('/', '/review.html'):
                return s.reply(page.read_bytes(), 'text/html; charset=utf-8')
            if s.path == '/api/items':
                return s.reply(json.dumps(api_items(), ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8')
            super().do_GET()

        def do_POST(s):
            body = json.loads(s.rfile.read(int(s.headers['Content-Length'])))
            rv = load_review()
            rv[body['key']] = {'status': body['status'], 'note': body.get('note', ''), 'ver': body['ver']}
            REVIEW.write_text(json.dumps(rv, ensure_ascii=False, indent=1), encoding='utf-8')
            s.reply(b'{}', 'application/json')

        def log_message(s, *a):
            pass

    print(f'審圖網頁：http://localhost:{port}/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()


def redo_rejected(rows, args):
    """審圖網頁退回的圖，帶著退回原因重產（只重產目前這一版被退的）。"""
    rv = load_review()
    todo = [it for it in collect(rows) if not it.get('done') and rv.get(it['key'], {}).get('status') == 'reject'
            and rv[it['key']]['ver'] == ver(it['file'])]

    def one(it):
        sub = argparse.Namespace(**{**vars(args), 'redo': True, 'note': rv[it['key']]['note']})
        if it['code'] == 'master':
            res = gen_master(it['a'], sub)[1] + f"（主圖換了，剝層圖要重做：peels --ids {it['a']['id']} --redo）"
        else:
            res = gen_peel(it['a'], it['code'], sub)[1]
        return it['key'], res

    with ThreadPoolExecutor(1 if args.route == 'codex-cli' else args.jobs) as ex:
        for key, res in ex.map(one, todo):
            print(key, res, flush=True)
    if not todo:
        print('沒有被退回的圖')


PACK_README = """# 棲光小島｜動物圖包

給「動物動態（網格骨架）」流程用。規範：專案 docs/規格-動物動態網格.md。

每隻一個資料夾：
- `<代號>-master.png`：主圖（正側面朝右、白底；寬尾鳳蝶例外：翅膀展開、從上方斜看）。**所有部件的唯一像素來源**，
  剝層圖都是對它做的、已對齊到它。
- `<代號>-2_1024.png`／`<代號>-2.png`：標準化後的靜態圖（1024 製作主圖／App 用 512 透明、腳底 y=472）。不要拿來切部件。
- `peels/<代號>-<剝層>.png`：剝層圖（已用 register.py 對齊、校色）。額外姿勢（fly、swim、leap、perch、hang）
  不是編輯圖，沒有對齊。

剝層代號：e1＝E1 拿掉近側腿、e3＝E3 拿掉頭、e4＝E4 拿掉耳朵、eye＝E5 閉眼、look＝E7 頭轉向鏡頭、wing＝拿掉近側翅膀、
bhead＝鳥拿掉頭、bleg＝拿掉近側腳、tuft＝拿掉耳羽、fin＝拿掉胸鰭、flipper＝拿掉近側前鰭、hleg＝拿掉近側後腳。
額外姿勢：fly＝飛行、swim＝游泳、leap＝躍出水面、perch＝停棲（翅膀合起）、hang＝倒掛。

manifest.json 記每張圖的審核狀態（pass 通過／reject 退回／unreviewed 未審／done 以前就完成）與對齊結果；
reject、unreviewed 的圖先不要用。
"""


def pack(rows, tag):
    import datetime
    import zipfile
    rv, items = load_review(), collect(rows)
    (OUT / 'export').mkdir(exist_ok=True)
    path = OUT / 'export' / f"qiguang-animals-{tag}-{datetime.date.today():%Y%m%d}.zip"
    manifest = []
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_STORED) as z:  # PNG 已壓縮
        for a in rows:
            aid, files = a['id'], []
            master = MASTER.get(aid, OUT / aid / 'master/generated.png')
            for src, name in ((master, f'{aid}-master.png'), (OUT / aid / f'{aid}-2_1024.png', f'{aid}-2_1024.png'),
                              (OUT / aid / f'{aid}-2.png', f'{aid}-2.png')):
                if src.exists():
                    z.write(src, f'{aid}/{name}')
                    files.append({'file': name, 'code': 'master' if name.endswith('master.png') else 'normalized'})
            for it in (i for i in items if i['a']['id'] == aid and i['code'] != 'master'):
                r = rv.get(it['key'])
                status = 'done' if it.get('done') else (r['status'] if r and r['ver'] == ver(it['file']) else 'unreviewed')
                align_txt = it['dir'] / 'align.txt'
                name = f"peels/{aid}-{it['code']}.png"
                z.write(it['file'], f'{aid}/{name}')
                files.append({'file': name, 'code': it['code'], 'label': CODE_NAME[it['code']], 'status': status,
                              'align': align_txt.read_text(encoding='utf-8') if align_txt.exists() else ''})
            r = rv.get(f'{aid}/master')
            mstatus = 'done' if aid in SKIP else (r['status'] if r and master.exists() and r['ver'] == ver(master) else 'unreviewed')
            manifest.append({'id': aid, 'name': a['name'], 'shape': a['shape_id'], 'batch': a['batch'],
                             'master_status': mstatus, 'missing': [c for c in PEELS[a['shape_id']]
                                                                   if not any(f.get('code') == c for f in files)],
                             'files': files})
        z.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=1))
        z.writestr('README.md', PACK_README)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['masters', 'sheet', 'normalize', 'peels', 'align', 'serve', 'redo', 'pack'])
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--peels', action='store_true', help='sheet：改出剝層圖總表')
    ap.add_argument('--only', help='peels：只做這些代號（逗號分隔，例如 e1,eye）')
    ap.add_argument('--batch', type=int)
    ap.add_argument('--ids', help='逗號分隔的代號')
    ap.add_argument('--route', default='openai', help='openai（API）或 codex-cli 等，見 route_media.py')
    ap.add_argument('--white', action='store_true', help='API 也改用白底（透明背景不行時）')
    ap.add_argument('--jobs', type=int, default=3)
    ap.add_argument('--redo', action='store_true')
    ap.add_argument('--note', default='', help='重產時附在提示最後的修正說明')
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')

    ids = set(args.ids.split(',')) if args.ids else None
    rows = [a for a in art_data.animals()
            if (ids is None or a['id'] in ids) and (args.batch is None or a['batch'] == args.batch)]
    if args.cmd == 'masters':
        todo = [a for a in rows if a['id'] not in SKIP]
        jobs = 1 if args.route == 'codex-cli' else args.jobs  # 本機 CLI 一次一張
        with ThreadPoolExecutor(jobs) as ex:
            for aid, res in ex.map(lambda a: gen_master(a, args), todo):
                print(aid, res, flush=True)
    elif args.cmd == 'peels':
        only = set(args.only.split(',')) if args.only else None
        todo = [(a, c) for a in rows for c in PEELS[a['shape_id']]
                if c not in PEELS_DONE.get(a['id'], ()) and (only is None or c in only)]
        jobs = 1 if args.route == 'codex-cli' else args.jobs
        with ThreadPoolExecutor(jobs) as ex:
            for name, res in ex.map(lambda t: gen_peel(*t, args), todo):
                print(name, res, flush=True)
    elif args.cmd == 'serve':
        serve(args.port)
    elif args.cmd == 'redo':
        redo_rejected(rows, args)
    elif args.cmd == 'pack':
        print(pack(rows, 'batch' + str(args.batch) if args.batch else 'all'))
    elif args.cmd == 'align':  # 改了 register.py 之後，已產的剝層圖重新對齊
        for a in rows:
            master = MASTER.get(a['id'], OUT / a['id'] / 'master/generated.png')
            for c in PEELS[a['shape_id']]:
                d = OUT / a['id'] / 'peels' / c
                if c not in EXTRA_CODES and (d / 'generated.png').exists():
                    print(f"{a['id']}/{c}", align(master, d), flush=True)
    elif args.cmd == 'normalize':
        for a in rows:
            if a['id'] not in SKIP:
                print(*normalize(a))
    else:
        tag = 'batch' + str(args.batch) if args.batch else 'pick'
        if args.peels:
            path = OUT / f'sheet-peels-{tag}.png'
            peel_sheet(rows, path)
        else:
            path = OUT / f'sheet-{tag}.png'
            sheet([a for a in rows if a['id'] not in SKIP], path)
        print(path)


if __name__ == '__main__':
    main()
