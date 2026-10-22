// 島嶼總覽：五個區域位置與恢復程度，少量生物剪影
import { HABITATS, SPECIES } from '../content/config';
import { Creature } from '../components/Creature';
import { discoveryOf, habitatOpen, habitatProgress } from '../domain/game';
import type { HabitatId, SaveFile } from '../domain/types';

const POS: Record<HabitatId, [number, number]> = {
  greenhouse: [120, 120],
  stream: [222, 110],
  woodland: [170, 52],
  coast: [292, 182],
  bay: [58, 200],
};

export function IslandMap({ save, onEnter }: { save: SaveFile; onEnter: (h: HabitatId) => void }) {
  return (
    <svg viewBox="0 0 360 250" className="island-map" role="img" aria-label="小島總覽地圖">
      <rect width="360" height="250" fill="#cfe9ea" />
      {/* 海灣（未來區域） */}
      <path d="M0 160 Q60 150 100 190 Q90 240 0 250 Z" fill="#b8dfe3" />
      <path d="M40 40 Q120 0 230 22 Q330 40 335 120 Q340 200 260 222 Q180 240 120 215 Q90 200 95 175 Q60 150 45 120 Q25 75 40 40 Z" fill="#efe1c0" />
      <path d="M55 50 Q125 15 225 32 Q318 50 320 120 Q322 190 255 208 Q190 224 128 202 Q110 192 108 172 Q78 150 62 118 Q45 80 55 50 Z" fill="#b5d3a3" />
      {/* 溪流 */}
      <path d="M215 30 Q200 80 228 112 Q250 140 250 215" stroke={habitatOpen(save, 'stream') ? '#8fd0d8' : '#c3d6cf'} strokeWidth="10" fill="none" strokeLinecap="round" />
      {HABITATS.map((h) => {
        const [x, y] = POS[h.id];
        const open = habitatOpen(save, h.id);
        const pct = Math.round(habitatProgress(save, h.id) * 100);
        const label = h.playable ? (open ? `${h.name} · ${pct}%` : `${h.name} · 未開放`) : `${h.name} · 未來區域`;
        const seen = SPECIES.filter((s) => s.habitatId === h.id && discoveryOf(save, s.id)).slice(0, 2);
        return (
          <g
            key={h.id}
            className={open ? 'map-spot open' : 'map-spot'}
            opacity={h.playable ? 1 : 0.45}
            role={open ? 'button' : undefined}
            tabIndex={open ? 0 : undefined}
            aria-label={open ? `進入${h.name}` : label}
            onClick={open ? () => onEnter(h.id) : undefined}
            onKeyDown={open ? (e) => (e.key === 'Enter' || e.key === ' ') && onEnter(h.id) : undefined}
          >
            {h.id === 'greenhouse' && <path d={`M${x - 22} ${y + 8} V${y - 6} Q${x} ${y - 30} ${x + 22} ${y - 6} V${y + 8} Z`} fill="#f6f1e6" stroke="#dfd3b9" strokeWidth="2" />}
            {h.id === 'stream' && <circle cx={x} cy={y} r="16" fill={open ? '#8fd0d8' : '#d7e3dd'} stroke="#fff" strokeWidth="2" />}
            {h.id === 'woodland' && (
              <g fill="none" stroke="#5f8a5e" strokeWidth="2" strokeDasharray="3 3">
                <circle cx={x - 12} cy={y} r="10" />
                <circle cx={x + 8} cy={y - 4} r="12" />
              </g>
            )}
            {h.id === 'coast' && <path d={`M${x - 24} ${y} Q${x} ${y - 14} ${x + 24} ${y}`} stroke="#9fc6c9" strokeWidth="3" fill="none" strokeDasharray="4 3" />}
            {h.id === 'bay' && <path d={`M${x - 18} ${y} q6 -6 12 0 t12 0 t12 0`} stroke="#7fb3ba" strokeWidth="2" fill="none" strokeDasharray="3 3" />}
            {seen.map((s, i) => (
              <svg key={s.id} x={x - 50 - i * 16} y={y - 24} width="18" height="18" viewBox="0 0 64 64">
                <Creature id={s.id} size={64} />
              </svg>
            ))}
            <rect x={x - 54} y={y + 14} width="108" height="18" rx="9" fill="rgba(255,252,244,.92)" />
            <text x={x} y={y + 27} textAnchor="middle" fontSize="10" fill="#36523d">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}
