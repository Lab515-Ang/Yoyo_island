# 把中文字型縮到「App 用到的字＋常用字」：原本 Chiron GoRound（118 片，約 17 MB）＋粉圓（約 3 MB）全部打包進 App。
# 字集＝程式裡出現的所有字（src、index.html）＋ Big5 常用字（第一字面 5,401 字）＋標點、英數；標題的粉圓只留程式裡出現的字。
# 玩家自己打的罕用字不在裡面時，會改用系統字型顯示（styles.css 的 --font 後面接著系統字型）。
# 用法：python tools/fonts/subset_fonts.py   → 產生 src/assets/fonts/** 與 src/fonts.css
# 新增文案用到新的罕用字時要重跑一次（不跑的話那個字只是改用系統字型，不會壞）。
import pathlib
import re
import shutil

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
NM = ROOT / 'node_modules'
OUT = ROOT / 'src' / 'assets' / 'fonts'


def wanted(common: bool = True) -> set[int]:
    cps: set[int] = set(range(0x20, 0x7F))  # 英數
    cps |= set(range(0x2000, 0x2070)) | set(range(0x3000, 0x3040)) | set(range(0xFF00, 0xFFF0))  # 標點、全形
    for f in list((ROOT / 'src').rglob('*')) + [ROOT / 'index.html']:
        if f.is_file() and f.suffix in {'.ts', '.tsx', '.css', '.json', '.html'} and 'assets' not in f.parts:
            cps |= {ord(c) for c in f.read_text(encoding='utf-8', errors='ignore')}
    if not common:
        return cps
    # Big5 常用字（0xA440～0xC67E）
    for hi in range(0xA4, 0xC7):
        for lo in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
            try:
                cps |= {ord(c) for c in bytes([hi, lo]).decode('big5')}
            except UnicodeDecodeError:
                pass
    return cps


def ranges(cps: list[int]) -> str:
    out, start, prev = [], None, None
    for c in sorted(cps):
        if start is None:
            start = prev = c
        elif c == prev + 1:
            prev = c
        else:
            out.append(f'U+{start:x}' if start == prev else f'U+{start:x}-{prev:x}')
            start = prev = c
    if start is not None:
        out.append(f'U+{start:x}' if start == prev else f'U+{start:x}-{prev:x}')
    return ','.join(out)


def cut(src: pathlib.Path, dst: pathlib.Path, keep: set[int]) -> list[int]:
    font = TTFont(src)
    have = set(font.getBestCmap())
    k = sorted(have & keep)
    if not k:
        return []
    o = subset.Options()
    o.flavor = 'woff2'
    o.layout_features = ['*']
    o.name_IDs = ['*']
    o.notdef_outline = True
    o.hinting = False
    s = subset.Subsetter(o)
    s.populate(unicodes=k)
    s.subset(font)
    dst.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = 'woff2'
    font.save(dst)
    return k


def main():
    keep = wanted()
    titles = wanted(common=False)  # 粉圓只用在標題（多半是固定文案）：只留程式裡出現的字
    if OUT.exists():
        shutil.rmtree(OUT)
    css = ['/* 由 tools/fonts/subset_fonts.py 產生，不要手改。只含 App 用到的字＋常用字。 */']
    total = 0

    # Chiron GoRound（內文，可變字重）：照 fontsource 的分片各自縮
    pkg = NM / '@fontsource-variable' / 'chiron-goround-tc'
    blocks = re.findall(r'@font-face\s*{(.*?)}', (pkg / 'index.css').read_text(encoding='utf-8'), re.S)
    for b in blocks:
        f = re.search(r'url\(\./files/([^)]+)\)', b).group(1)
        k = cut(pkg / 'files' / f, OUT / 'chiron' / f, keep)
        if not k:
            continue
        total += (OUT / 'chiron' / f).stat().st_size
        css.append(f"@font-face {{ font-family: 'Chiron GoRound TC Variable'; font-style: normal; font-display: swap; font-weight: 200 900; "
                   f"src: url(./assets/fonts/chiron/{f}) format('woff2-variations'); unicode-range: {ranges(k)}; }}")

    # 粉圓（標題）：中文一整個檔，英數另一個
    hpkg = NM / '@fontsource' / 'huninn' / 'files'
    k = cut(hpkg / 'huninn-chinese-traditional-400-normal.woff2', OUT / 'huninn-tc.woff2', titles)
    total += (OUT / 'huninn-tc.woff2').stat().st_size
    css.append(f"@font-face {{ font-family: 'Huninn'; font-style: normal; font-display: swap; font-weight: 400; src: url(./assets/fonts/huninn-tc.woff2) format('woff2'); unicode-range: {ranges(k)}; }}")
    shutil.copy(hpkg / 'huninn-latin-400-normal.woff2', OUT / 'huninn-latin.woff2')
    total += (OUT / 'huninn-latin.woff2').stat().st_size
    latin = (NM / '@fontsource' / 'huninn' / 'latin-400.css').read_text(encoding='utf-8')
    lr = re.search(r'unicode-range:\s*([^;]+);', latin)
    css.append("@font-face { font-family: 'Huninn'; font-style: normal; font-display: swap; font-weight: 400; src: url(./assets/fonts/huninn-latin.woff2) format('woff2');"
               + (f' unicode-range: {lr.group(1).strip()};' if lr else '') + ' }')

    (ROOT / 'src' / 'fonts.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
    print(f'chars {len(keep)}, chiron slices {len(list((OUT / "chiron").glob("*.woff2")))}, total {total / 1024 / 1024:.2f} MB')


if __name__ == '__main__':
    main()
