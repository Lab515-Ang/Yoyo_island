// 不支援 WebGL / 效能不足時的 2D 降級：保留工程變化與可點熱區
import type { ReactElement } from 'react';
import { PetImage } from '../components/PetArt';
import type { SceneProps } from './Scene3D';


const PET_SPOTS: Record<string, [number, number][]> = {
  greenhouse: [[120, 208], [240, 208], [110, 132], [250, 132], [40, 165]],
  stream: [[90, 178], [175, 182], [60, 88], [205, 90], [320, 182]],
};

/** 設施的簡化 2D 圖 */
const FACILITY_2D: Record<string, ReactElement> = {
  gh_trellis: <path d="M60 120 V80 Q80 55 100 80 V120" stroke="#c9a77c" strokeWidth="5" fill="none" />,
  gh_nestbox: (
    <g>
      <rect x="292" y="70" width="18" height="20" fill="#c9a77c" />
      <path d="M288 72 L301 60 L314 72 Z" fill="#a5845d" />
      <circle cx="301" cy="80" r="3" fill="#3a3128" />
    </g>
  ),
  gh_basket: (
    <g>
      <line x1="150" y1="40" x2="150" y2="62" stroke="#a5845d" strokeWidth="1.5" />
      <path d="M138 62 Q150 78 162 62 Z" fill="#c9a77c" />
      <circle cx="150" cy="60" r="7" fill="#8fb38a" />
    </g>
  ),
  gh_planter: (
    <g>
      <rect x="300" y="196" width="44" height="12" fill="#c9a77c" />
      <circle cx="310" cy="194" r="6" fill="#6f9a6e" />
      <circle cx="322" cy="192" r="7" fill="#8fb38a" />
      <circle cx="334" cy="194" r="6" fill="#6f9a6e" />
    </g>
  ),
  st_pond: (
    <g>
      <ellipse cx="40" cy="215" rx="26" ry="9" fill="#8fd0d8" stroke="#b8ad99" strokeWidth="3" />
    </g>
  ),
  st_rocks: (
    <g fill="#b8ad99">
      <ellipse cx="150" cy="80" rx="12" ry="8" />
      <ellipse cx="166" cy="84" rx="8" ry="5" />
    </g>
  ),
  st_reeds: (
    <g stroke="#6f9a6e" strokeWidth="3">
      <line x1="340" y1="200" x2="338" y2="168" />
      <line x1="348" y1="200" x2="350" y2="164" />
      <line x1="332" y1="200" x2="328" y2="172" />
    </g>
  ),
  st_log: <rect x="270" y="72" width="44" height="10" rx="5" fill="#a5845d" transform="rotate(-8 292 77)" />,
};

export default function Scene2D({ habitatId, done, reducedMotion, onSelect, backdrop, pets = [], facilities = [] }: SceneProps) {
  const flowers = Array.from({ length: 12 }, (_, i) => [40 + (i % 6) * 14, 160 + Math.floor(i / 6) * 10, i] as const);
  return (
    <svg viewBox="0 0 360 240" preserveAspectRatio={backdrop ? 'xMidYMin slice' : undefined} className={`scene2d${reducedMotion ? '' : ' animate'}`} role="img" aria-label="簡化 2D 棲地場景">
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
      {facilities.map((f) => (
        <g key={f}>{FACILITY_2D[f]}</g>
      ))}
      {pets.slice(0, PET_SPOTS[habitatId].length).map(({ id, typeId, art, stage, face }, i) => {
        const [x, y] = PET_SPOTS[habitatId][i];
        const pick = () => onSelect?.(`pet:${id}`);
        return (
          <g key={id} className="creature-hit drift" role="button" tabIndex={0} aria-label="寵物" onClick={pick} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && pick()}>
            <circle cx={x} cy={y} r="22" fill="transparent" />
            <foreignObject x={x - 20} y={y - 20} width="40" height="40">
              <PetImage typeId={typeId} art={art} stage={stage} face={face} size={40} />
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}
