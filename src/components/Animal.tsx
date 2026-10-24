import type { ReactNode } from 'react';
import { animalDef, sizeTier, type AnimalDef } from '../content/config';
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

const SCALE = [0.62, 0.76, 0.9, 1];

/** 一隻動物（100×100，地面在 y = 92）。tier 0～3：專注越久孵出來越大。 */
export function AnimalArt({ id, tier = 3, size = 64, hidden = false }: { id: string | undefined; tier?: number; size?: number | string; hidden?: boolean }) {
  const a = animalDef(id);
  const k = SCALE[Math.max(0, Math.min(3, tier))];
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width={size} height={size} className={hidden ? 'animal-art silhouette' : 'animal-art'} aria-hidden="true">
      <ellipse cx="50" cy="93" rx={30 * k} ry={4 * k} fill="#00000022" />
      <g transform={`translate(${50 - 50 * k} ${92 - 92 * k}) scale(${k})`}>{body(a)}</g>
    </svg>
  );
}

/**
 * 蛋：斑點顏色跟著動物。crack 0～3 是專注時慢慢出現的裂痕；cold 是放棄後沒有孵化的蛋。
 */
export function EggArt({ id, crack = 0, cold = false, size = 64 }: { id: string | undefined; crack?: number; cold?: boolean; size?: number | string }) {
  const a = animalDef(id);
  const shell = cold ? '#d6d2c8' : '#fbf5e6';
  const spot = cold ? '#b4aea2' : a.color;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width={size} height={size} className="egg-art" aria-hidden="true">
      <ellipse cx="50" cy="93" rx="22" ry="3.5" fill="#00000022" />
      <path d="M50 18 C70 18 78 52 78 66 C78 82 66 92 50 92 C34 92 22 82 22 66 C22 52 30 18 50 18 Z" fill={shell} stroke={cold ? '#a39e93' : '#e2d5b8'} strokeWidth="2" />
      <circle cx="40" cy="48" r="5" fill={spot} opacity="0.75" />
      <circle cx="60" cy="40" r="3.5" fill={spot} opacity="0.75" />
      <circle cx="58" cy="66" r="6" fill={spot} opacity="0.75" />
      <circle cx="38" cy="74" r="3.5" fill={spot} opacity="0.75" />
      {crack >= 1 && <path d="M40 34 L46 42 L42 48" stroke="#7a6a52" strokeWidth="2" fill="none" strokeLinecap="round" />}
      {crack >= 2 && <path d="M60 52 L54 58 L62 64 L56 70" stroke="#7a6a52" strokeWidth="2" fill="none" strokeLinecap="round" />}
      {crack >= 3 && <path d="M28 60 L36 58 L34 66 L44 64" stroke="#7a6a52" strokeWidth="2" fill="none" strokeLinecap="round" />}
      {cold && <path d="M36 50 Q50 42 64 50" stroke="#a39e93" strokeWidth="2" fill="none" />}
    </svg>
  );
}

/** 一段專注在每日紀錄裡的樣子：孵出的動物（大小依分鐘）或沒孵化的蛋。 */
export function HatchCell({ s, fresh = false }: { s: FocusSession; fresh?: boolean }) {
  const min = Math.floor(s.accumulatedMs / 60000);
  const a = animalDef(s.animalId);
  const done = s.status === 'completed';
  const label = `${a.name}・${s.tag}・${min} 分鐘${done ? '' : '（提前結束，蛋沒有孵化）'}`;
  return (
    <div className={fresh ? 'hatch-cell filled fresh' : 'hatch-cell filled'} role="img" aria-label={label} title={label}>
      {done ? <AnimalArt id={a.id} tier={sizeTier(min)} size="100%" /> : <EggArt id={a.id} cold size="70%" />}
    </div>
  );
}

/** 每日紀錄：一格一隻，空格是還沒孵的草地。 */
export function HatchPlot({ sessions, cols, minCells, freshId }: { sessions: FocusSession[]; cols: number; minCells: number; freshId?: string }) {
  const total = Math.max(minCells, Math.ceil(sessions.length / cols) * cols);
  return (
    <div className="hatch-plot" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {sessions.map((s) => (
        <HatchCell key={s.id} s={s} fresh={s.id === freshId} />
      ))}
      {Array.from({ length: total - sessions.length }, (_, i) => (
        <div key={`e${i}`} className="hatch-cell" aria-hidden="true" />
      ))}
    </div>
  );
}
