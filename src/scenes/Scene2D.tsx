// 不支援 WebGL / 效能不足時的 2D 降級：保留工程變化與可點的動物
import { AnimalArt } from '../components/Animal';
import { MeshAnimal, hasMesh } from '../components/MeshAnimal';
import type { SceneProps } from './Scene3D';

const SPOTS: [number, number][] = [
  [130, 214],
  [228, 210],
  [70, 186],
  [292, 184],
  [176, 230],
  [196, 168],
];
const SIZE = [36, 44, 52];

function Tree2D({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-3" y="-18" width="6" height="18" fill="#a5845d" />
      <circle cx="0" cy="-26" r="14" fill="#6f9a6e" />
      <circle cx="6" cy="-20" r="9" fill="#8fb38a" />
    </g>
  );
}

export default function Scene2D({ done, prog, reducedMotion, onSelect, backdrop, bubble, lowPower, animals = [] }: SceneProps) {
  const p = prog ?? ((id: string) => (done(id) ? 1 : 0));
  const restored = ['fo_trail', 'fo_saplings', 'fo_cabin', 'fo_undergrowth', 'fo_corridor', 'fo_spring', 'fo_canopy', 'fo_rescue'].filter(done).length;
  const n = (id: string, count: number) => (done(id) ? count : Math.floor(count * p(id)));
  return (
    <svg viewBox="0 0 360 240" preserveAspectRatio={backdrop ? 'xMidYMin slice' : bubble ? 'xMidYMid slice' : undefined} className={`scene2d${reducedMotion ? '' : ' animate'}`} role="img" aria-label="簡化 2D 森林場景">
      <rect width="360" height="240" fill="#d6e8d4" />
      <rect y="150" width="360" height="90" fill={restored >= 4 ? '#a9c99a' : '#c2b38f'} />
      {/* 遠景樹林：修得越多樹越多 */}
      {Array.from({ length: 6 + restored }, (_, i) => (
        <Tree2D key={i} x={20 + ((i * 47) % 330)} y={150 - (i % 2) * 6} s={1 + (i % 3) * 0.15} />
      ))}
      {/* 步道與倒木 */}
      {p('fo_trail') > 0 && <path d="M160 240 Q170 200 190 152 L210 152 Q196 200 200 240 Z" fill="#d9c7a0" />}
      {3 - n('fo_trail', 3) > 0 && <rect x="150" y="196" width="60" height="9" rx="4" fill="#8a6c4f" transform="rotate(-12 180 200)" />}
      {/* 樹苗 */}
      {Array.from({ length: n('fo_saplings', 8) }, (_, i) => (
        <Tree2D key={i} x={30 + i * 16} y={176 + (i % 2) * 8} s={0.45} />
      ))}
      {/* 觀察小屋 */}
      {p('fo_cabin') > 0 && (
        <g>
          <rect x="268" y="150" width="54" height="30" fill={p('fo_cabin') >= 0.5 ? '#d8bf93' : 'none'} stroke="#c9a77c" strokeWidth="3" />
          {p('fo_cabin') >= 0.75 && <path d="M262 152 L295 130 L328 152 Z" fill="#7d5f45" />}
          {done('fo_cabin') && <rect x="288" y="160" width="12" height="9" fill="#ffd77a" />}
        </g>
      )}
      {/* 草叢 */}
      {Array.from({ length: n('fo_undergrowth', 10) }, (_, i) => (
        <circle key={i} cx={20 + i * 34} cy={232} r={9} fill="#6f9a6e" />
      ))}
      {/* 水源地 */}
      {p('fo_spring') > 0 && <ellipse cx="90" cy="160" rx="34" ry="9" fill={done('fo_spring') ? '#8fd0d8' : '#9fb3a0'} />}
      {/* 生態廊道、樹冠步道、救傷站 */}
      {p('fo_corridor') >= 0.75 && <path d="M20 168 Q50 140 80 168" stroke={done('fo_corridor') ? '#8fb38a' : '#c9a77c'} strokeWidth="8" fill="none" />}
      {p('fo_canopy') >= 0.5 && <rect x="200" y="96" width="70" height="5" fill="#c9a77c" />}
      {p('fo_rescue') > 0 && <path d="M318 214 L338 190 L358 214 Z" fill="#e8e1d0" />}
      {/* 動物 */}
      {animals.slice(0, SPOTS.length).map((a, i) => {
        const [x, y] = SPOTS[i];
        const s = SIZE[Math.max(0, Math.min(2, a.stage))];
        return (
          <g key={a.id} transform={`translate(${x - s / 2} ${y - s})`} onClick={() => onSelect?.(a.id)} style={{ cursor: onSelect ? 'pointer' : undefined }}>
            <foreignObject width={s} height={s}>
              {hasMesh(a.animalId) ? (
                // 專注背景、大廳泡泡（lowPower）停住不動，省電
                <MeshAnimal id={a.animalId} stage={a.stage} paused={reducedMotion || lowPower} />
              ) : (
                <AnimalArt id={a.animalId} stage={a.stage} size={s} />
              )}
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}
