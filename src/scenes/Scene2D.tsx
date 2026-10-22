// 不支援 WebGL / 效能不足時的 2D 降級：保留工程變化與可點熱區
import { speciesDef } from '../content/config';
import { Creature } from '../components/Creature';
import type { SceneProps } from './Scene3D';

const SPOT: Record<string, [number, number]> = {
  butterfly_yellow: [70, 70],
  bee: [110, 120],
  butterfly_green: [250, 50],
  ladybird: [270, 150],
  dragonfly: [120, 70],
  minnow: [60, 135],
  frog: [270, 165],
  waterside_bird: [200, 95],
};

export default function Scene2D({ habitatId, done, present, reducedMotion, onSelect }: SceneProps) {
  const flowers = Array.from({ length: 12 }, (_, i) => [40 + (i % 6) * 14, 160 + Math.floor(i / 6) * 10, i] as const);
  return (
    <svg viewBox="0 0 360 240" className={`scene2d${reducedMotion ? '' : ' animate'}`} role="img" aria-label="簡化 2D 棲地場景">
      {habitatId === 'greenhouse' ? (
        <g>
          <rect width="360" height="240" fill="#d9ead9" />
          <path d="M20 200 V90 Q180 -10 340 90 V200 Z" fill="#e8f3ee" stroke="#f6f1e6" strokeWidth="6" />
          {[60, 120, 180, 240, 300].map((x) => (
            <line key={x} x1={x} y1="200" x2={x} y2={x === 180 ? 40 : 70} stroke="#f6f1e6" strokeWidth="4" />
          ))}
          <rect x="0" y="195" width="360" height="45" fill="#efe5cf" />
          {done('gh_entrance') ? (
            <g fill="#e3d7bf">
              <ellipse cx="180" cy="232" rx="16" ry="5" />
              <ellipse cx="186" cy="220" rx="14" ry="4" />
              <rect x="128" y="205" width="16" height="18" rx="3" fill="#d39a77" />
              <rect x="216" y="205" width="16" height="18" rx="3" fill="#d39a77" />
              <circle cx="136" cy="203" r="8" fill="#8fb38a" />
              <circle cx="224" cy="203" r="8" fill="#8fb38a" />
            </g>
          ) : (
            <g fill="#b8ad99">
              <circle cx="160" cy="222" r="7" />
              <circle cx="200" cy="228" r="5" />
              <rect x="150" y="212" width="40" height="3" fill="#b59f7f" transform="rotate(12 170 214)" />
            </g>
          )}
          {/* 噴泉 */}
          <ellipse cx="180" cy="190" rx="50" ry="12" fill="#e3d7bf" />
          <ellipse cx="180" cy="186" rx="42" ry="8" fill={done('gh_fountain') ? '#8fd0d8' : '#cdbfa3'} />
          <rect x="174" y="140" width="12" height="46" fill="#e3d7bf" />
          <ellipse cx="180" cy="140" rx="22" ry="6" fill="#e3d7bf" />
          {done('gh_fountain') && <path className="drift" d="M160 142 Q150 165 145 185 M200 142 Q210 165 215 185" stroke="#d8f1f3" strokeWidth="4" fill="none" />}
          {/* 左花圃 */}
          <ellipse cx="75" cy="175" rx="45" ry="12" fill="#8a6c4f" stroke="#e3d7bf" strokeWidth="5" />
          {done('gh_flowers')
            ? flowers.map(([x, y, i]) => <circle key={i} cx={x} cy={y} r="5" fill={['#f2a7a0', '#f6d06f', '#f7f2e6', '#e98a6b'][i % 4]} />)
            : <path d="M60 170 l4 -10 M80 172 l-3 -9 M95 170 l2 -8" stroke="#b59f7f" strokeWidth="2" />}
          {/* 右花圃 */}
          <ellipse cx="285" cy="175" rx="45" ry="12" fill="#8a6c4f" stroke="#e3d7bf" strokeWidth="5" />
          {done('gh_plants') ? (
            <g fill="#8fb38a">
              <ellipse cx="265" cy="160" rx="16" ry="9" />
              <ellipse cx="290" cy="152" rx="18" ry="10" fill="#6f9a6e" />
              <ellipse cx="310" cy="163" rx="14" ry="8" />
              <circle cx="40" cy="120" r="16" />
              <circle cx="320" cy="115" r="18" fill="#6f9a6e" />
            </g>
          ) : (
            <path d="M285 170 l0 -8" stroke="#8fb38a" strokeWidth="3" />
          )}
        </g>
      ) : (
        <g>
          <rect width="360" height="240" fill="#cfe5df" />
          <rect x="0" y="40" width="360" height="60" fill="#a9c99a" />
          <circle cx="60" cy="45" r="22" fill="#6f9a6e" />
          <circle cx="300" cy="40" r="26" fill="#6f9a6e" />
          <rect x="0" y="100" width="360" height="60" fill={done('st_water') ? '#8fd0d8' : '#9fb3a0'} />
          {done('st_water') && <path className="drift" d="M20 120 h40 M120 140 h50 M240 125 h40" stroke="#e2f6f8" strokeWidth="2" />}
          <rect x="0" y="160" width="360" height="80" fill="#a9c99a" />
          <g fill="#e3d7bf">
            <ellipse cx="150" cy="230" rx="14" ry="4" />
            <ellipse cx="160" cy="214" rx="12" ry="4" />
            <ellipse cx="150" cy="198" rx="11" ry="3" />
          </g>
          {done('st_bank') ? (
            <g stroke="#6f9a6e" strokeWidth="3">
              {[20, 30, 40, 300, 312, 324, 90, 100].map((x, i) => (
                <line key={i} x1={x} y1={i < 6 ? 165 : 100} x2={x + 2} y2={i < 6 ? 130 : 70} />
              ))}
            </g>
          ) : (
            <g fill="#8f7a5d">
              <ellipse cx="60" cy="175" rx="20" ry="5" />
              <ellipse cx="260" cy="95" rx="18" ry="4" />
            </g>
          )}
          {done('st_bridge') ? (
            <g>
              <path d="M215 170 Q240 120 265 170" stroke="#c9a77c" strokeWidth="16" fill="none" />
              <path d="M215 160 Q240 110 265 160" stroke="#a5845d" strokeWidth="3" fill="none" />
            </g>
          ) : (
            <g fill="#a5845d">
              <rect x="215" y="88" width="6" height="16" />
              <rect x="258" y="160" width="6" height="14" />
              <rect x="230" y="128" width="30" height="5" transform="rotate(20 245 130)" />
            </g>
          )}
        </g>
      )}
      {present.map((id) => {
        const [x, y] = SPOT[id];
        return (
          <g
            key={id}
            className="creature-hit drift"
            role="button"
            tabIndex={0}
            aria-label={speciesDef(id)?.name}
            onClick={() => onSelect?.(id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect?.(id)}
          >
            <circle cx={x} cy={y} r="22" fill="transparent" />
            <svg x={x - 18} y={y - 18} width="36" height="36" viewBox="0 0 64 64">
              <Creature id={id} size={64} />
            </svg>
          </g>
        );
      })}
    </svg>
  );
}
