import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useSave } from '../app/store';
import { animalDef, stageName, type AnimalDef } from '../content/config';
import { sightings } from '../domain/game';
import type { FocusSession } from '../domain/types';

// 臨時動物圖（程式畫的，依外形與主色區分）：美術圖到位後換成圖片。畫布 100×100，地面在 y = 92。
const EYE = '#2b2622';

function body(a: AnimalDef): ReactNode {
  const c = a.color;
  const x = a.accent;
  switch (a.shape) {
    case 'bird':
      return (
        <g>
          <path d="M30 70 L8 86 L14 88 L34 76 Z" fill={c} />
          <ellipse cx="52" cy="66" rx="24" ry="20" fill={c} />
          <path d="M40 62 Q54 54 66 66 Q54 74 40 62 Z" fill={x} opacity="0.85" />
          <circle cx="70" cy="46" r="13" fill={c} />
          <path d="M82 46 L94 49 L82 52 Z" fill={x} />
          <circle cx="74" cy="44" r="2.4" fill={EYE} />
          <path d="M46 84 L46 92 M58 84 L58 92" stroke="#d98c3a" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'owl':
      return (
        <g>
          <ellipse cx="50" cy="64" rx="26" ry="28" fill={c} />
          <path d="M30 40 L34 24 L42 38 Z M70 40 L66 24 L58 38 Z" fill={c} />
          <circle cx="40" cy="52" r="10" fill={x} />
          <circle cx="60" cy="52" r="10" fill={x} />
          <circle cx="40" cy="52" r="4.5" fill={EYE} />
          <circle cx="60" cy="52" r="4.5" fill={EYE} />
          <path d="M47 60 L53 60 L50 66 Z" fill="#6b4b30" />
          <path d="M36 74 Q50 80 64 74 M38 82 Q50 88 62 82" stroke="#00000033" strokeWidth="2" fill="none" />
        </g>
      );
    case 'raptor':
      return (
        <g>
          <path d="M50 60 Q20 40 4 58 Q24 60 36 72 Z M50 60 Q80 40 96 58 Q76 60 64 72 Z" fill={c} />
          <ellipse cx="50" cy="68" rx="16" ry="20" fill={c} />
          <circle cx="50" cy="44" r="12" fill={x} />
          <path d="M50 46 Q58 48 54 56 Q52 50 47 49 Z" fill="#e0a530" />
          <circle cx="45" cy="42" r="2.2" fill={EYE} />
          <circle cx="56" cy="42" r="2.2" fill={EYE} />
          <path d="M44 86 L44 92 M56 86 L56 92" stroke="#e0a530" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'pheasant':
      return (
        <g>
          <path d="M34 70 Q8 60 2 76 Q16 74 32 80 Z" fill={x} opacity="0.9" />
          <path d="M34 72 Q12 70 6 86 Q20 80 36 80 Z" fill={c} />
          <ellipse cx="52" cy="70" rx="22" ry="16" fill={c} />
          <path d="M66 62 Q70 44 76 36" stroke={c} strokeWidth="9" strokeLinecap="round" fill="none" />
          <circle cx="78" cy="34" r="8" fill={c} />
          <ellipse cx="80" cy="34" rx="4" ry="5" fill="#d8392f" />
          <circle cx="80" cy="32" r="1.8" fill={EYE} />
          <path d="M86 34 L92 36 L86 38 Z" fill="#e8d9b0" />
          <path d="M46 84 L46 92 M58 84 L58 92" stroke="#c9a37a" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'pangolin':
      return (
        <g>
          <path d="M18 80 Q4 82 6 92 L26 88 Z" fill={c} />
          <ellipse cx="46" cy="72" rx="30" ry="18" fill={c} />
          {[26, 36, 46, 56, 66].map((cx) => (
            <path key={cx} d={`M${cx - 7} 64 Q${cx} 56 ${cx + 7} 64`} stroke={x} strokeWidth="2.5" fill="none" />
          ))}
          {[31, 41, 51, 61].map((cx) => (
            <path key={cx} d={`M${cx - 7} 74 Q${cx} 66 ${cx + 7} 74`} stroke={x} strokeWidth="2.5" fill="none" />
          ))}
          <ellipse cx="80" cy="76" rx="12" ry="8" fill="#d8b98e" />
          <circle cx="84" cy="73" r="1.8" fill={EYE} />
          <path d="M34 88 L34 92 M58 88 L58 92" stroke={x} strokeWidth="4" strokeLinecap="round" />
        </g>
      );
    case 'cat':
      return (
        <g>
          <path d="M24 84 Q6 78 12 60" stroke={c} strokeWidth="7" strokeLinecap="round" fill="none" />
          <ellipse cx="44" cy="74" rx="22" ry="17" fill={c} />
          <circle cx="66" cy="50" r="17" fill={c} />
          <path d="M52 40 L54 24 L64 36 Z M80 40 L78 24 L68 36 Z" fill={c} />
          {[[36, 66], [48, 70], [40, 80], [54, 80], [30, 76]].map(([cx, cy]) => (
            <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx="3.5" ry="2.5" fill={x} />
          ))}
          <path d="M62 36 L62 44 M70 36 L70 44" stroke="#ffffffcc" strokeWidth="2" />
          <circle cx="60" cy="50" r="2.4" fill={EYE} />
          <circle cx="72" cy="50" r="2.4" fill={EYE} />
          <path d="M64 56 L68 56 L66 59 Z" fill="#d07a6a" />
          <path d="M34 88 L34 92 M54 88 L54 92" stroke={c} strokeWidth="5" strokeLinecap="round" />
        </g>
      );
    case 'mustelid':
      return (
        <g>
          <path d="M16 78 Q2 70 8 58" stroke={c} strokeWidth="8" strokeLinecap="round" fill="none" />
          <ellipse cx="44" cy="76" rx="30" ry="13" fill={c} />
          <ellipse cx="76" cy="62" rx="14" ry="12" fill={c} />
          <circle cx="70" cy="52" r="4" fill={c} />
          <circle cx="82" cy="52" r="4" fill={c} />
          <path d="M68 68 Q78 80 88 66" fill={x} />
          <circle cx="74" cy="60" r="2.2" fill={EYE} />
          <circle cx="84" cy="60" r="2.2" fill={EYE} />
          <path d="M26 86 L26 92 M60 86 L60 92" stroke={c} strokeWidth="5" strokeLinecap="round" />
        </g>
      );
    case 'bear':
      return (
        <g>
          <ellipse cx="46" cy="70" rx="30" ry="22" fill={c} />
          <circle cx="72" cy="46" r="17" fill={c} />
          <circle cx="60" cy="32" r="6" fill={c} />
          <circle cx="84" cy="32" r="6" fill={c} />
          <path d="M30 60 L46 72 L62 60" stroke={x} strokeWidth="5" fill="none" strokeLinejoin="round" />
          <ellipse cx="80" cy="52" rx="7" ry="5" fill="#8a7663" />
          <circle cx="82" cy="50" r="2" fill={EYE} />
          <circle cx="68" cy="42" r="2.2" fill="#f5efe4" />
          <circle cx="78" cy="42" r="2.2" fill="#f5efe4" />
          <path d="M28 88 L28 92 M60 88 L60 92" stroke={c} strokeWidth="7" strokeLinecap="round" />
        </g>
      );
    case 'goat':
      return (
        <g>
          <ellipse cx="44" cy="66" rx="26" ry="16" fill={c} />
          <path d="M60 58 Q66 44 74 40" stroke={x} strokeWidth="10" strokeLinecap="round" fill="none" />
          <ellipse cx="76" cy="40" rx="11" ry="9" fill={c} />
          <path d="M72 32 Q70 22 76 18 M80 32 Q80 22 86 20" stroke="#3b3228" strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="80" cy="38" r="2" fill={EYE} />
          <path d="M28 78 L28 92 M38 80 L38 92 M52 80 L52 92 M60 78 L60 92" stroke={c} strokeWidth="5" strokeLinecap="round" />
        </g>
      );
  }
}

/** 混一點白色（幼年個體的毛色比較淡）。 */
function lighten(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(v + (255 - v) * t);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('')}`;
}

// 族群成長階段（0 幼年、1 亞成年、2 成年）：臨時圖用大小與毛色深淺表現，美術圖到位後換成各階段的圖
const STAGE_SCALE = [0.6, 0.8, 1];
const STAGE_LIGHT = [0.35, 0.15, 0];
const staged = (a: AnimalDef, stage: number) => {
  const t = STAGE_LIGHT[stage];
  return t ? { ...a, color: lighten(a.color, t), accent: lighten(a.accent, t) } : a;
};
const clampStage = (stage: number) => Math.max(0, Math.min(2, stage));

/** 一隻動物（100×100，地面在 y = 92）。stage：族群成長階段，預設成年。 */
export function AnimalArt({ id, stage = 2, size = 64, hidden = false }: { id: string | undefined; stage?: number; size?: number | string; hidden?: boolean }) {
  const st = clampStage(stage);
  const a = staged(animalDef(id), st);
  const k = STAGE_SCALE[st];
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width={size} height={size} className={hidden ? 'animal-art silhouette' : 'animal-art'} aria-hidden="true">
      <ellipse cx="50" cy="93" rx={30 * k} ry={4 * k} fill="#00000022" />
      <g transform={`translate(${50 - 50 * k} ${92 - 92 * k}) scale(${k})`}>{body(a)}</g>
    </svg>
  );
}

/**
 * 探索中的動物：一開始只看得到灰色剪影，專注越久（progress 0～1）牠越靠近、顏色越清楚；
 * fled 是提前放棄、牠被嚇跑了（只剩淡淡的剪影和跑走的線條）。
 */
export function TrackArt({ id, progress = 0, fled = false, stage = 2, size = 64 }: { id: string | undefined; progress?: number; fled?: boolean; stage?: number; size?: number | string }) {
  const st = clampStage(stage);
  const a = staged(animalDef(id), st);
  const k = STAGE_SCALE[st] * (fled ? 0.85 : 0.85 + 0.15 * progress); // 慢慢走近：變大一點
  const p = Math.max(0, Math.min(1, progress));
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width={size} height={size} className="track-art" aria-hidden="true">
      <defs>
        <filter id="qg-silhouette">
          <feColorMatrix type="matrix" values="0 0 0 0 0.45 0 0 0 0 0.5 0 0 0 0 0.44 0 0 0 1 0" />
        </filter>
      </defs>
      <ellipse cx="50" cy="93" rx={30 * k} ry={4 * k} fill="#00000022" />
      <g transform={`translate(${50 - 50 * k} ${92 - 92 * k}) scale(${k})`}>
        <g filter="url(#qg-silhouette)" opacity={fled ? 0.3 : 0.75}>
          {body(a)}
        </g>
        {!fled && p > 0 && <g opacity={p}>{body(a)}</g>}
      </g>
      {fled && <path d="M8 60 H26 M4 70 H24 M10 80 H28" stroke="#9a9488" strokeWidth="2.5" strokeLinecap="round" />}
      {!fled && p === 0 && (
        <text x="50" y="58" fontSize="22" textAnchor="middle" fill="#fffdf6" fontWeight="700">
          ?
        </text>
      )}
    </svg>
  );
}

// 格子裡的動物畫成圖片並依「物種：階段」快取：一年的格子可能上千個，每格都畫一份 SVG 手機會卡
const cellImages = new Map<string, string>();
const cellImage = (key: string, make: () => ReactElement) => {
  let url = cellImages.get(key);
  if (!url) cellImages.set(key, (url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderToStaticMarkup(make()))}`));
  return url;
};

/** 一次探索在紀錄裡的樣子：遇見的動物（當時的成長階段），或被嚇跑的剪影。 */
export function HatchCell({ s, stage = 2, fresh = false }: { s: FocusSession; stage?: number; fresh?: boolean }) {
  const min = Math.floor(s.accumulatedMs / 60000);
  const a = animalDef(s.animalId);
  const done = s.status === 'completed';
  const label = `${done ? `遇見${a.name}（${stageName(a, stage)}）` : `${a.name}被嚇跑了`}・${s.tag}・${min} 分鐘`;
  const src = done ? cellImage(`${a.id}:${stage}`, () => <AnimalArt id={a.id} stage={stage} size={100} />) : cellImage(`${a.id}:fled`, () => <TrackArt id={a.id} fled size={100} />);
  return (
    <div className={fresh ? 'hatch-cell filled fresh' : 'hatch-cell filled'} role="img" aria-label={label} title={label}>
      <img src={src} alt="" className={done ? '' : 'fled'} />
    </div>
  );
}

/** 土地隨著數量往外擴張：至少 base 欄，放不下就變成更大的方形（一天最多 144 次 → 12 × 12）。 */
export const plotCols = (n: number, base: number) => Math.max(base, Math.ceil(Math.sqrt(n)));
const PLOT_CAP = 10_000; // ponytail: 100 × 100 格以上只畫最近的；真的有人超過再改成分批畫

/** 觀察紀錄格子：一格一次探索，空格是還沒走過的草地；數量多了土地自動變大、格子變小。 */
export function HatchPlot({ sessions: all, cols: base, minCells, freshId }: { sessions: FocusSession[]; cols: number; minCells: number; freshId?: string }) {
  const { save } = useSave();
  const stages = sightings(save);
  const sessions = all.length > PLOT_CAP ? all.slice(-PLOT_CAP) : all;
  const cols = plotCols(sessions.length, base);
  const total = Math.max(minCells, Math.ceil(sessions.length / cols) * cols);
  const big = cols > 20; // 格子只剩幾個像素：整片畫在一張 canvas 上（上千個元素切換時會卡）
  const canvas = useRef<HTMLCanvasElement>(null);
  const srcOf = (s: FocusSession) => {
    const id = animalDef(s.animalId).id;
    const stage = stages.get(s.id)?.stage ?? 2;
    return s.status === 'completed' ? cellImage(`${id}:${stage}`, () => <AnimalArt id={id} stage={stage} size={100} />) : cellImage(`${id}:fled`, () => <TrackArt id={id} fled size={100} />);
  };
  useEffect(() => {
    const c = canvas.current;
    if (!big || !c) return;
    const CELL = 24;
    const rows = Math.ceil(total / cols);
    c.width = cols * CELL;
    c.height = rows * CELL;
    const srcs = sessions.map(srcOf);
    const imgs = new Map<string, HTMLImageElement>();
    for (const u of new Set(srcs)) {
      const img = new Image();
      img.src = u;
      imgs.set(u, img);
    }
    let alive = true;
    void Promise.all([...imgs.values()].map((i) => i.decode().catch(() => {}))).then(() => {
      const g = c.getContext('2d');
      if (!alive || !g) return;
      g.clearRect(0, 0, c.width, c.height);
      srcs.forEach((u, i) => g.drawImage(imgs.get(u)!, (i % cols) * CELL, Math.floor(i / cols) * CELL, CELL, CELL));
    });
    return () => {
      alive = false;
    };
  }, [big, sessions, cols, total]); // eslint-disable-line react-hooks/exhaustive-deps
  const capped = all.length > sessions.length && <p className="small muted center-text">格子只放最近的 {sessions.length} 次，較早的 {all.length - sessions.length} 次一樣算在統計裡。</p>;
  if (big)
    return (
      <>
        <div className="hatch-plot big">
          <canvas ref={canvas} role="img" aria-label={`觀察紀錄：${sessions.length} 次探索`} />
        </div>
        {capped}
      </>
    );
  // 等角（斜 45°）的一塊草地：一格是 100×50 的菱形，動物站在菱形中心；下方露出土壤側面（參考 Forest）
  const rows = Math.ceil(total / cols);
  const VW = (cols + rows) * 50;
  const SOIL = 16;
  const VH = (cols + rows) * 25 + SOIL;
  const pt = (r: number, c: number) => [rows * 50 + (c - r) * 50, (c + r) * 25] as const;
  const [T, R, B, L] = [pt(0, 0), pt(0, cols), pt(rows, cols), pt(rows, 0)];
  const poly = (...ps: (readonly [number, number])[]) => ps.map((p) => p.join(',')).join(' ');
  const down = (p: readonly [number, number]) => [p[0], p[1] + SOIL] as const;
  return (
    <>
      <div className="hatch-plot iso" style={{ aspectRatio: `${VW} / ${VH}` }}>
        <svg viewBox={`0 0 ${VW} ${VH}`} aria-hidden="true">
          <polygon points={poly(L, B, down(B), down(L))} fill="#8a6847" />
          <polygon points={poly(B, R, down(R), down(B))} fill="#a3805a" />
          <polygon points={poly(T, R, B, L)} fill="#a9cf80" />
          <g stroke="#fffdf8" strokeOpacity="0.22" strokeWidth="1.5">
            {Array.from({ length: cols - 1 }, (_, i) => (
              <line key={`c${i}`} x1={pt(0, i + 1)[0]} y1={pt(0, i + 1)[1]} x2={pt(rows, i + 1)[0]} y2={pt(rows, i + 1)[1]} />
            ))}
            {Array.from({ length: rows - 1 }, (_, i) => (
              <line key={`r${i}`} x1={pt(i + 1, 0)[0]} y1={pt(i + 1, 0)[1]} x2={pt(i + 1, cols)[0]} y2={pt(i + 1, cols)[1]} />
            ))}
          </g>
        </svg>
        {sessions.map((s, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const [x, y] = pt(r, c);
          return (
            <div key={s.id} className="iso-cell" style={{ left: `${(x / VW) * 100}%`, top: `${((y + 25) / VH) * 100}%`, width: `${(72 / VW) * 100}%`, zIndex: r + c }}>
              <HatchCell s={s} stage={stages.get(s.id)?.stage ?? 2} fresh={s.id === freshId} />
            </div>
          );
        })}
      </div>
      {capped}
    </>
  );
}
