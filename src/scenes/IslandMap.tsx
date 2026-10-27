// 島嶼總覽：中央的棲光森林（目前唯一開放的陸地），水域與海岸留待日後改版
import { HABITATS, REGIONS } from '../content/config';
import { AnimalArt } from '../components/Animal';
import { habitatOpen, habitatProgress, sceneAnimals } from '../domain/game';
import type { HabitatId, SaveFile } from '../domain/types';

const POS: Record<HabitatId, [number, number]> = {
  forest: [170, 118],
  wetland: [262, 70],
  coast: [292, 196],
  bay: [52, 206],
  satoyama: [0, 0], // 日本是另一座島，不畫在台灣的小島地圖上
};
// 只畫台灣這座島上的棲地（其他區域的主棲地不在這張圖）
const HERE = HABITATS.filter((h) => !REGIONS.some((r) => r.id !== 'tw' && r.habitatId === h.id));

export function IslandMap({ save, onEnter }: { save: SaveFile; onEnter: (h: HabitatId) => void }) {
  const prog = habitatProgress(save, 'forest');
  const trees = 5 + Math.round(prog * 9);
  const animals = sceneAnimals(save, 3);
  return (
    <svg viewBox="0 0 360 250" className="island-map" role="img" aria-label="小島總覽地圖">
      <rect width="360" height="250" fill="#cfe9ea" />
      <path d="M0 170 Q60 160 100 196 Q90 240 0 250 Z" fill="#b8dfe3" />
      <path d="M40 40 Q120 0 230 22 Q330 40 335 120 Q340 200 260 222 Q180 240 120 215 Q90 200 95 175 Q60 150 45 120 Q25 75 40 40 Z" fill="#efe1c0" />
      <path d="M55 50 Q125 15 225 32 Q318 50 320 120 Q322 190 255 208 Q190 224 128 202 Q110 192 108 172 Q78 150 62 118 Q45 80 55 50 Z" fill={prog > 0.5 ? '#9fc98e' : '#b5d3a3'} />
      {/* 森林：修復越多樹越多 */}
      {Array.from({ length: trees }, (_, i) => {
        const a = i * 2.39996;
        const d = 54 * Math.sqrt((i + 0.5) / trees);
        const x = 170 + Math.cos(a) * d * 1.3;
        const y = 112 + Math.sin(a) * d * 0.8;
        return (
          <g key={i}>
            <rect x={x - 1.5} y={y} width="3" height="7" fill="#8a6c4f" />
            <circle cx={x} cy={y - 2} r="7" fill={i % 3 ? '#6f9a6e' : '#5f8a5e'} />
          </g>
        );
      })}
      {HERE.map((h) => {
        const [x, y] = POS[h.id];
        const open = habitatOpen(save, h.id);
        // 有進度就至少顯示 1%（第一個工程很小，四捨五入會變成 0%）
        const p = habitatProgress(save, h.id);
        const pct = p > 0 ? Math.max(1, Math.round(p * 100)) : 0;
        const label = open ? `${h.name} · ${pct}%` : `${h.name} · 日後開放`;
        return (
          <g
            key={h.id}
            className={open ? 'map-spot open' : 'map-spot'}
            opacity={open ? 1 : 0.5}
            role={open ? 'button' : undefined}
            tabIndex={open ? 0 : undefined}
            aria-label={open ? `進入${h.name}` : label}
            onClick={open ? () => onEnter(h.id) : undefined}
            onKeyDown={open ? (e) => (e.key === 'Enter' || e.key === ' ') && onEnter(h.id) : undefined}
          >
            {h.id === 'wetland' && <path d={`M${x - 20} ${y - 30} Q${x - 30} ${y} ${x} ${y + 8}`} stroke="#c3d6cf" strokeWidth="8" fill="none" strokeLinecap="round" />}
            {h.id === 'coast' && <path d={`M${x - 24} ${y} Q${x} ${y - 14} ${x + 24} ${y}`} stroke="#9fc6c9" strokeWidth="3" fill="none" strokeDasharray="4 3" />}
            {h.id === 'bay' && <path d={`M${x - 18} ${y} q6 -6 12 0 t12 0 t12 0`} stroke="#7fb3ba" strokeWidth="2" fill="none" strokeDasharray="3 3" />}
            {open &&
              animals.map((a, i) => (
                <svg key={a.id} x={x - 44 + i * 30} y={y + 22} width="26" height="26" viewBox="0 0 100 100">
                  <AnimalArt id={a.animalId} stage={a.stage} size={100} />
                </svg>
              ))}
            <rect x={x - 54} y={y + (open ? 50 : 14)} width="108" height="18" rx="9" fill="rgba(255,252,244,.92)" />
            <text x={x} y={y + (open ? 63 : 27)} textAnchor="middle" fontSize="10" fill="#36523d">
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
