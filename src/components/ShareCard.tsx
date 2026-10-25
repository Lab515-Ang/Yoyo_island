// 專注成果統計圖：把這段期間的孵化格子與時間分布畫成一張圖（先組 SVG，再轉成 PNG 給存檔／分享用）
import { renderToStaticMarkup } from 'react-dom/server';
import { animalDef, sizeTier } from '../content/config';
import type { FocusSession } from '../domain/types';
import { AnimalArt, EggArt } from './Animal';

export interface ShareCardData {
  title: string; // 例如「10/24（昨天）」
  subtitle: string; // 例如「全部標籤」
  total: string; // 例如「1 小時 24 分」
  counts: string; // 例如「孵出 4 隻・沒孵化 0 顆」
  sessions: FocusSession[];
  cols: number;
  bars: number[];
  axis: string[];
}

const W = 540;
const H = 760;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 把元件的 SVG 放到指定位置（AnimalArt／EggArt 的根元素就是 <svg>）。 */
const place = (markup: string, x: number, y: number, size: number) => markup.replace('<svg ', `<svg x="${x}" y="${y}" `).replace(/width="[^"]*"/, `width="${size}"`).replace(/height="[^"]*"/, `height="${size}"`);

function cardSvg(d: ShareCardData) {
  // 孵化格子：最多畫 6 行，超過的在角落寫「另外 N 隻」
  const plotX = 40;
  const plotY = 210;
  const plotW = W - 80;
  const cell = plotW / d.cols;
  const maxRows = Math.max(1, Math.min(6, Math.floor(260 / cell)));
  const shown = d.sessions.slice(0, d.cols * maxRows);
  const rows = Math.max(1, Math.ceil(shown.length / d.cols));
  const plotH = Math.max(cell, rows * cell) + 16;
  const cells = shown
    .map((s, i) => {
      const x = plotX + (i % d.cols) * cell;
      const y = plotY + 8 + Math.floor(i / d.cols) * cell;
      const min = Math.floor(s.accumulatedMs / 60000);
      const art = s.status === 'completed' ? <AnimalArt id={animalDef(s.animalId).id} tier={sizeTier(min)} size={cell} /> : <EggArt id={animalDef(s.animalId).id} cold size={cell * 0.7} />;
      const off = s.status === 'completed' ? 0 : cell * 0.15;
      return place(renderToStaticMarkup(art), x + off, y + off, s.status === 'completed' ? cell : cell * 0.7);
    })
    .join('');
  const more = d.sessions.length - shown.length;

  // 長條圖
  const chartY = plotY + plotH + 56;
  const chartH = H - chartY - 90;
  const peak = Math.max(1, ...d.bars);
  const bw = plotW / d.bars.length;
  const bars = d.bars
    .map((v, i) => {
      const h = (v / peak) * chartH;
      return `<rect x="${plotX + i * bw + bw * 0.15}" y="${chartY + chartH - Math.max(h, 2)}" width="${bw * 0.7}" height="${Math.max(h, 2)}" rx="2" fill="#4f7a55" opacity="${v ? 0.9 : 0.25}"/>`;
    })
    .join('');
  // 標籤和長條一樣多（例如星期）就對齊長條中間，否則平均分布在兩端之間
  const centered = d.axis.length === d.bars.length;
  const axis = d.axis
    .map((a, i) => {
      const x = centered ? plotX + (i + 0.5) * bw : plotX + (i / Math.max(1, d.axis.length - 1)) * plotW;
      const anchor = centered ? 'middle' : i === 0 ? 'start' : i === d.axis.length - 1 ? 'end' : 'middle';
      return `<text x="${x}" y="${chartY + chartH + 22}" font-size="14" fill="#6d7f6f" text-anchor="${anchor}">${esc(a)}</text>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif">
<rect width="${W}" height="${H}" fill="#f6f1e4"/>
<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="24" fill="#fffbf2" stroke="#e7dcc5"/>
<rect x="16" y="16" width="${W - 32}" height="64" rx="24" fill="#4f7a55"/><rect x="16" y="56" width="${W - 32}" height="24" fill="#4f7a55"/>
<text x="${W / 2}" y="58" font-size="22" font-weight="700" fill="#fffdf6" text-anchor="middle">專注成果統計圖</text>
<text x="40" y="122" font-size="18" fill="#6d7f6f">${esc(d.title)}・${esc(d.subtitle)}</text>
<text x="40" y="166" font-size="34" font-weight="700" fill="#2f4a36">${esc(d.total)}</text>
<text x="${W - 40}" y="166" font-size="16" fill="#6d7f6f" text-anchor="end">${esc(d.counts)}</text>
<rect x="${plotX - 8}" y="${plotY - 8}" width="${plotW + 16}" height="${plotH + 16}" rx="18" fill="#a9cc8f"/>
${cells}
${more > 0 ? `<text x="${plotX + plotW - 6}" y="${plotY + plotH - 4}" font-size="14" fill="#2f4a36" text-anchor="end">另外 ${more} 隻</text>` : ''}
${d.sessions.length ? '' : `<text x="${W / 2}" y="${plotY + plotH / 2 + 6}" font-size="16" fill="#2f4a36" text-anchor="middle">這段時間還沒有孵出動物</text>`}
<text x="40" y="${chartY - 12}" font-size="16" fill="#2f4a36">專注時間分布</text>
${bars}
<line x1="${plotX}" y1="${chartY + chartH}" x2="${plotX + plotW}" y2="${chartY + chartH}" stroke="#e7dcc5"/>
${axis}
<text x="${W / 2}" y="${H - 34}" font-size="15" fill="#8fb38a" text-anchor="middle">🌿 棲光小島</text>
</svg>`;
}

/** 回傳 PNG data URL（2 倍解析度）。 */
export async function renderShareCard(d: ShareCardData) {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cardSvg(d))}`;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = url;
  });
  const c = document.createElement('canvas');
  c.width = W * 2;
  c.height = H * 2;
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
