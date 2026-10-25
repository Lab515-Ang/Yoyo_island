// 專注成果統計圖：把這段期間的觀察格子與時間分布畫成一張圖（先組 SVG，再轉成 PNG 給存檔／分享用）
import { useEffect, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { animalDef } from '../content/config';
import type { FocusSession } from '../domain/types';
import { AnimalArt, TrackArt } from './Animal';
import { Modal } from './ui';
import { saveImage, shareImage } from '../platform';

const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

export interface ShareCardData {
  title: string; // 例如「10/24（昨天）」
  subtitle: string; // 例如「全部標籤」
  total: string; // 例如「1 小時 24 分」
  counts: string; // 例如「遇見 4 次・被嚇跑 0 次」
  sessions: FocusSession[];
  stages: Map<string, number>; // 每次遇見時的成長階段
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
  // 觀察格子：最多畫 6 行，超過的在角落寫「另外 N 次」
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
      const art = s.status === 'completed' ? <AnimalArt id={animalDef(s.animalId).id} stage={d.stages.get(s.id) ?? 2} size={cell} /> : <TrackArt id={animalDef(s.animalId).id} fled size={cell * 0.7} />;
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
<text x="40" y="122" font-size="18" fill="#6d7f6f">${esc(clip(`${d.title}・${d.subtitle}`, 26))}</text>
<text x="40" y="166" font-size="34" font-weight="700" fill="#2f4a36">${esc(d.total)}</text>
<text x="${W - 40}" y="166" font-size="16" fill="#6d7f6f" text-anchor="end">${esc(d.counts)}</text>
<rect x="${plotX - 8}" y="${plotY - 8}" width="${plotW + 16}" height="${plotH + 16}" rx="18" fill="#a9cc8f"/>
${cells}
${more > 0 ? `<text x="${plotX + plotW - 6}" y="${plotY + plotH - 4}" font-size="14" fill="#2f4a36" text-anchor="end">另外 ${more} 次</text>` : ''}
${d.sessions.length ? '' : `<text x="${W / 2}" y="${plotY + plotH / 2 + 6}" font-size="16" fill="#2f4a36" text-anchor="middle">這段時間還沒有遇見動物</text>`}
<text x="40" y="${chartY - 12}" font-size="16" fill="#2f4a36">專注時間分布</text>
${bars}
<line x1="${plotX}" y1="${chartY + chartH}" x2="${plotX + plotW}" y2="${chartY + chartH}" stroke="#e7dcc5"/>
${axis}
<text x="${W / 2}" y="${H - 34}" font-size="15" fill="#8fb38a" text-anchor="middle">🌿 棲光小島</text>
</svg>`;
}

/** 回傳 PNG data URL（2 倍解析度）。 */
export const renderShareCard = (d: ShareCardData) => toPng(cardSvg(d), W, H);

// ---------- 單次探索的觀察卡（時間歷程的「分享」） ----------

/** 依字數換行（SVG 文字不會自動換行），最多 maxLines 行。 */
const wrap = (text: string, per: number, maxLines: number) => {
  const chars = [...text.replace(/\s+/g, ' ').trim()];
  const lines: string[] = [];
  for (let i = 0; i < chars.length && lines.length < maxLines; i += per) lines.push(chars.slice(i, i + per).join(''));
  if (chars.length > per * maxLines) lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
  return lines;
};

export interface SessionCardData {
  session: FocusSession;
  when: string; // 例如「10/24 22:24–01:24」
  title: string; // 例如「遇見了台灣藍鵲（幼鳥）」
  stage: number;
}

function sessionSvg({ session: s, when, title, stage }: SessionCardData) {
  const w = 540;
  const h = 640;
  const done = s.status === 'completed';
  const a = animalDef(s.animalId);
  const min = Math.floor(s.accumulatedMs / 60000);
  const art = done ? renderToStaticMarkup(<AnimalArt id={a.id} stage={stage} size={220} />) : renderToStaticMarkup(<TrackArt id={a.id} fled size={170} />);
  const meta = [s.taskTitle && s.taskTitle !== '一段專注' ? s.taskTitle : '', s.tag].filter(Boolean).join('・');
  const note = s.note ? wrap(s.note, 22, 3) : [];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif">
<rect width="${w}" height="${h}" fill="#f6f1e4"/>
<rect x="16" y="16" width="${w - 32}" height="${h - 32}" rx="24" fill="#fffbf2" stroke="#e7dcc5"/>
<circle cx="${w / 2}" cy="200" r="130" fill="${done ? '#dcebc9' : '#e6e1d6'}"/>
${place(art, done ? w / 2 - 110 : w / 2 - 85, done ? 90 : 115, done ? 220 : 170)}
<text x="${w / 2}" y="378" font-size="28" font-weight="700" fill="#2f4a36" text-anchor="middle">${esc(clip(title, 16))}</text>
<text x="${w / 2}" y="414" font-size="17" fill="#6d7f6f" text-anchor="middle">${esc(when)}・${min} 分鐘</text>
${meta ? `<text x="${w / 2}" y="446" font-size="16" fill="#4f7a55" text-anchor="middle">${esc(clip(meta, 28))}</text>` : ''}
${note.map((l, i) => `<text x="${w / 2}" y="${490 + i * 26}" font-size="16" fill="#2f4a36" text-anchor="middle">${esc(l)}</text>`).join('')}
<text x="${w / 2}" y="${h - 36}" font-size="15" fill="#8fb38a" text-anchor="middle">🌿 棲光小島</text>
</svg>`;
}

async function toPng(svg: string, w: number, h: number) {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = url;
  });
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

export const renderSessionCard = (d: SessionCardData) => toPng(sessionSvg(d), 540, 640);

/** 分享圖視窗：製作圖片 → 預覽 → 儲存／分享。 */
export function ShareModal({ title, fileName, make, onClose }: { title: string; fileName: string; make: () => Promise<string>; onClose: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    make()
      .then((d) => alive && setImg(d))
      .catch(() => alive && setMsg('圖片做不出來，請再試一次。'));
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal title={title} onClose={onClose}>
      {img ? <img className="share-card" src={img} alt={title} /> : !msg && <p className="muted center-text">製作中…</p>}
      {msg && <p className="small muted">{msg}</p>}
      <div className="row editor-actions">
        <button
          disabled={!img}
          onClick={() =>
            void saveImage(img!, fileName)
              .then(() => setMsg('已存到相簿。'))
              .catch(() => setMsg('存不進相簿，可以改用分享。'))
          }
        >
          儲存
        </button>
        <button className="primary" disabled={!img} onClick={() => void shareImage(img!, fileName, title).catch(() => setMsg('無法分享，請再試一次。'))}>
          分享
        </button>
      </div>
    </Modal>
  );
}
