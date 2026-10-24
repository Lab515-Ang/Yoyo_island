import type { ReactNode } from 'react';
import { plantDef, plantTier, tagColor, type PlantBloom } from '../content/config';
import type { FocusSession } from '../domain/types';
import { Creature } from './Creature';

// 臨時植物圖（程式畫的）：美術圖到位後換成圖片
const STEM = '#5e8f4e';
const LEAF = '#7fb069';
const DRY = '#c2a274';

function Bloom({ kind, x, y, r, color }: { kind: PlantBloom; x: number; y: number; r: number; color: string }) {
  const ring = (n: number, f: (a: number, i: number) => ReactNode) => Array.from({ length: n }, (_, i) => f((i * 360) / n, i));
  switch (kind) {
    case 'petals':
      return (
        <g>
          {ring(8, (a, i) => (
            <circle key={i} cx={x + Math.cos((a * Math.PI) / 180) * r * 0.75} cy={y + Math.sin((a * Math.PI) / 180) * r * 0.75} r={r * 0.42} fill={color} />
          ))}
          <circle cx={x} cy={y} r={r * 0.38} fill="#f4c542" />
        </g>
      );
    case 'star':
      return (
        <g>
          {ring(8, (a, i) => (
            <ellipse key={i} cx={x} cy={y - r * 0.55} rx={r * 0.22} ry={r * 0.55} fill={color} transform={`rotate(${a} ${x} ${y})`} />
          ))}
          <circle cx={x} cy={y} r={r * 0.25} fill="#f4c542" />
        </g>
      );
    case 'cup':
      return <path d={`M${x - r * 0.7} ${y - r * 0.6} Q${x - r * 0.75} ${y + r * 0.7} ${x} ${y + r * 0.7} Q${x + r * 0.75} ${y + r * 0.7} ${x + r * 0.7} ${y - r * 0.6} L${x + r * 0.35} ${y - r * 0.15} L${x} ${y - r * 0.75} L${x - r * 0.35} ${y - r * 0.15} Z`} fill={color} />;
    case 'cluster':
      return (
        <g>
          {ring(6, (a, i) => (
            <circle key={i} cx={x + Math.cos((a * Math.PI) / 180) * r * 0.5} cy={y + Math.sin((a * Math.PI) / 180) * r * 0.5} r={r * 0.38} fill={color} opacity={0.9} />
          ))}
          <circle cx={x} cy={y} r={r * 0.4} fill={color} />
        </g>
      );
    case 'bells':
      return (
        <g>
          <path d={`M${x} ${y} q${r * 1.4} ${-r * 0.4} ${r * 1.8} ${r * 0.9}`} stroke={STEM} strokeWidth={1.2} fill="none" />
          {[0.35, 0.75, 1.1].map((t, i) => (
            <path key={i} d={`M${x + r * 1.5 * t - r * 0.3} ${y + r * t * 0.6 + r * 0.25} q${r * 0.3} ${-r * 0.7} ${r * 0.6} 0 Z`} fill={color} stroke={color} strokeWidth={r * 0.25} strokeLinejoin="round" />
          ))}
        </g>
      );
    case 'spike':
      return <ellipse cx={x} cy={y} rx={r * 0.32} ry={r * 1.1} fill={color} />;
    case 'lotus':
      return (
        <g>
          {[-50, -25, 0, 25, 50].map((a, i) => (
            <ellipse key={i} cx={x} cy={y - r * 0.45} rx={r * 0.26} ry={r * 0.6} fill={color} transform={`rotate(${a} ${x} ${y})`} />
          ))}
        </g>
      );
  }
}

/**
 * 一株植物（100×100，地面在 y = 92）。tier：-1 剛發芽、0～3 依專注時間長大；withered：放棄時枯萎。
 */
export function PlantArt({ id, tier, color, withered = false, size = 64 }: { id: string | undefined; tier: number; color: string; withered?: boolean; size?: number | string }) {
  const p = plantDef(id);
  const lotus = p.bloom === 'lotus';
  let body: ReactNode;
  if (withered)
    body = (
      <g fill="none" stroke={DRY} strokeWidth={3} strokeLinecap="round">
        <path d="M50 92 C50 80 52 72 60 70" />
        <path d="M51 82 q-10 -2 -12 6" />
        <path d="M60 70 q6 2 5 9" />
      </g>
    );
  else if (tier < 0)
    body = (
      <g>
        <path d="M50 92 V80" stroke={STEM} strokeWidth={3} strokeLinecap="round" />
        <ellipse cx={43} cy={78} rx={7} ry={4} fill={LEAF} transform="rotate(-25 43 78)" />
        <ellipse cx={57} cy={78} rx={7} ry={4} fill={LEAF} transform="rotate(25 57 78)" />
      </g>
    );
  else {
    const h = [42, 52, 62, 72][tier]; // 最小的也要在花圃小格子裡看得出來
    const r = [7.5, 8.5, 9.5, 10.5][tier];
    const xs = tier >= 3 ? [34, 50, 66] : tier === 2 ? [41, 59] : [50];
    body = lotus ? (
      <g>
        {xs.map((x, i) => (
          <ellipse key={`p${i}`} cx={x} cy={88 - (i % 2) * 4} rx={9 + tier * 1.5} ry={3.5 + tier * 0.4} fill={LEAF} />
        ))}
        {xs.map((x, i) => (
          <Bloom key={i} kind="lotus" x={x} y={84 - (i % 2) * 4} r={r} color={color} />
        ))}
      </g>
    ) : (
      <g>
        {xs.map((x, i) => {
          const top = 92 - h + (i === 1 ? 0 : 6) * (xs.length > 1 ? 1 : 0);
          return (
            <g key={i}>
              <path d={`M${x} 92 Q${x + (i - 1) * 3} ${(92 + top) / 2} ${x} ${top}`} stroke={STEM} strokeWidth={2.4} fill="none" strokeLinecap="round" />
              <ellipse cx={x - 6} cy={92 - h * 0.35} rx={7} ry={3} fill={LEAF} transform={`rotate(-30 ${x - 6} ${92 - h * 0.35})`} />
              <ellipse cx={x + 6} cy={92 - h * 0.55} rx={6} ry={2.6} fill={LEAF} transform={`rotate(30 ${x + 6} ${92 - h * 0.55})`} />
              <Bloom kind={p.bloom} x={x} y={top} r={r} color={color} />
            </g>
          );
        })}
      </g>
    );
  }
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="plant-art" aria-hidden="true">
      {body}
    </svg>
  );
}

/** 一段專注在花圃裡的樣子：植物（大小依分鐘、花色依標籤；放棄的枯萎）＋偶遇的生物。 */
export function PlantedCell({ s, visitor, fresh = false }: { s: FocusSession; visitor?: string | null; fresh?: boolean }) {
  const min = Math.floor(s.accumulatedMs / 60000);
  const withered = s.status === 'abandoned';
  const label = `${plantDef(s.plantId).name}・${s.tag}・${min} 分鐘${withered ? '（提前結束，枯萎了）' : ''}${visitor ? '・有生物來訪' : ''}`;
  return (
    <div className={fresh ? 'garden-cell planted fresh' : 'garden-cell planted'} role="img" aria-label={label} title={label}>
      <PlantArt id={s.plantId} tier={plantTier(min)} color={tagColor(s.tag)} withered={withered} size="100%" />
      {visitor && (
        <span className="garden-visitor">
          <Creature id={visitor} size={22} />
        </span>
      )}
    </div>
  );
}

/** 花圃：一格一株，空格是還沒種的土。 */
export function GardenPlot({ sessions, visitors, cols, minCells, freshId }: { sessions: FocusSession[]; visitors: Map<string, string>; cols: number; minCells: number; freshId?: string }) {
  const total = Math.max(minCells, Math.ceil(sessions.length / cols) * cols);
  return (
    <div className="garden-plot" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {sessions.map((s) => (
        <PlantedCell key={s.id} s={s} visitor={visitors.get(s.id)} fresh={s.id === freshId} />
      ))}
      {Array.from({ length: total - sessions.length }, (_, i) => (
        <div key={`e${i}`} className="garden-cell" aria-hidden="true" />
      ))}
    </div>
  );
}
