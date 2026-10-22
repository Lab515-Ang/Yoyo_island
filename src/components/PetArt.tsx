// 5 隻寵物、各 4 個成長階段的原創簡化插圖（寵物卡、2D 場景共用）
import type { ReactElement } from 'react';
import { Creature } from './Creature';

const leaf = <path d="M6 52 Q30 30 58 48 Q34 62 6 52 Z" fill="#8fb38a" />;
const nest = (
  <g>
    <ellipse cx="32" cy="48" rx="24" ry="10" fill="#a5845d" />
    <path d="M10 46 Q32 58 54 46" stroke="#7d6243" strokeWidth="2" fill="none" />
  </g>
);
const water = <ellipse cx="32" cy="44" rx="28" ry="14" fill="#cfeef3" />;

const ART: Record<string, ReactElement[]> = {
  pet_butterfly: [
    <g>
      {leaf}
      <ellipse cx="32" cy="44" rx="6" ry="7" fill="#f6e7a6" stroke="#e3c96a" />
    </g>,
    <g>
      {leaf}
      {[18, 26, 34, 42].map((x, i) => (
        <circle key={x} cx={x} cy={44 - (i % 2) * 2} r="5.5" fill={i === 3 ? '#6f9a6e' : '#9cc96b'} />
      ))}
      <circle cx="44" cy="40" r="1.2" fill="#2e2a26" />
    </g>,
    <g>
      <rect x="10" y="8" width="44" height="4" rx="2" fill="#a5845d" />
      <path d="M32 12 Q42 28 34 50 Q32 54 30 50 Q22 28 32 12 Z" fill="#9cc96b" stroke="#6f9a6e" />
      <path d="M28 30 Q32 33 36 30" stroke="#e3c96a" strokeWidth="1.5" fill="none" />
    </g>,
    <Creature id="butterfly_yellow" size={64} />,
  ],
  pet_whiteeye: [
    <g>
      {nest}
      <ellipse cx="32" cy="40" rx="7" ry="9" fill="#d8eef0" />
      <circle cx="29" cy="38" r="1" fill="#a9c3c6" />
    </g>,
    <g>
      {nest}
      <circle cx="32" cy="36" r="11" fill="#c9bdb3" />
      <path d="M28 28 L32 18 L36 28 Z" fill="#f2c14e" />
      <circle cx="28" cy="33" r="1.5" fill="#2e2a26" />
      <circle cx="36" cy="33" r="1.5" fill="#2e2a26" />
    </g>,
    <g>
      <rect x="6" y="50" width="52" height="4" rx="2" fill="#a5845d" />
      <ellipse cx="30" cy="38" rx="14" ry="11" fill="#9db56a" />
      <circle cx="42" cy="30" r="8" fill="#9db56a" />
      <path d="M49 30 L56 31 L49 33 Z" fill="#5b4a33" />
      <circle cx="43" cy="29" r="1.5" fill="#2e2a26" />
    </g>,
    <g>
      <rect x="6" y="50" width="52" height="4" rx="2" fill="#a5845d" />
      <ellipse cx="30" cy="38" rx="15" ry="12" fill="#b9c94a" />
      <ellipse cx="28" cy="42" rx="10" ry="6" fill="#efe9c9" />
      <circle cx="42" cy="29" r="9" fill="#b9c94a" />
      <circle cx="44" cy="28" r="3.6" fill="#fff" />
      <circle cx="44" cy="28" r="1.8" fill="#2e2a26" />
      <path d="M50 30 L58 31 L50 33 Z" fill="#5b4a33" />
    </g>,
  ],
  pet_frog: [
    <g>
      {water}
      {[[24, 40], [32, 38], [40, 42], [28, 47], [37, 48]].map(([x, y]) => (
        <g key={`${x}${y}`}>
          <circle cx={x} cy={y} r="5" fill="#eef8f3" opacity=".9" />
          <circle cx={x} cy={y} r="1.6" fill="#3a3a33" />
        </g>
      ))}
    </g>,
    <g>
      {water}
      <circle cx="26" cy="42" r="7" fill="#4b5240" />
      <path d="M32 42 Q42 36 50 44 Q42 46 32 44 Z" fill="#6b7360" />
      <circle cx="24" cy="40" r="1.3" fill="#fff" />
    </g>,
    <g>
      {water}
      <ellipse cx="27" cy="42" rx="8" ry="7" fill="#5f7a4a" />
      <path d="M34 42 Q44 37 52 44 Q44 46 34 44 Z" fill="#6b7360" />
      <path d="M30 48 l-4 6 M33 47 l2 7" stroke="#5f7a4a" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="24" cy="40" r="1.4" fill="#fff" />
    </g>,
    <Creature id="frog" size={64} />,
  ],
  pet_firefly: [
    <g>
      <ellipse cx="32" cy="48" rx="24" ry="9" fill="#7fa36a" />
      {[[24, 44], [29, 42], [34, 44], [39, 42], [31, 46]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="2.2" fill="#f3e08a" />
      ))}
    </g>,
    <g>
      {water}
      {[18, 25, 32, 39].map((x, i) => (
        <ellipse key={x} cx={x} cy={42} rx="4.5" ry={4 - i * 0.3} fill="#3c3a35" />
      ))}
      {[18, 25, 32].map((x) => (
        <circle key={x} cx={x} cy={40} r="1.1" fill="#e9dcae" />
      ))}
      <circle cx="44" cy="42" r="3" fill="#3c3a35" />
    </g>,
    <g>
      <ellipse cx="32" cy="50" rx="24" ry="8" fill="#8a6c4f" />
      <ellipse cx="32" cy="40" rx="9" ry="12" fill="#f1e2b8" stroke="#d9c38a" />
      <path d="M26 36 Q32 38 38 36 M26 42 Q32 44 38 42" stroke="#d9c38a" fill="none" />
    </g>,
    <g>
      <circle cx="32" cy="44" r="14" fill="#fff3a8" opacity=".55" />
      <ellipse cx="32" cy="30" rx="9" ry="12" fill="#2e2a26" />
      <ellipse cx="32" cy="19" rx="6" ry="4" fill="#e98a6b" />
      <ellipse cx="32" cy="44" rx="7" ry="6" fill="#f6e36a" />
      <path d="M28 18 Q24 10 20 9 M36 18 Q40 10 44 9" stroke="#2e2a26" strokeWidth="1.5" fill="none" />
    </g>,
  ],
  pet_axolotl: [
    <g>
      {water}
      <circle cx="32" cy="40" r="10" fill="#f4eef8" opacity=".85" stroke="#d9cde6" />
      <circle cx="32" cy="40" r="3" fill="#4a3f52" />
    </g>,
    <g>
      {water}
      <ellipse cx="30" cy="42" rx="12" ry="5" fill="#f2c4cf" />
      <path d="M40 42 Q50 38 54 43 Q48 46 40 44 Z" fill="#f2c4cf" />
      <circle cx="22" cy="41" r="1.3" fill="#2e2a26" />
    </g>,
    <g>
      {water}
      <ellipse cx="32" cy="42" rx="15" ry="7" fill="#f4b8c6" />
      <path d="M44 42 Q54 37 58 43 Q52 47 44 45 Z" fill="#f4b8c6" />
      {[-1, 1].map((s) => (
        <g key={s}>
          <path d={`M20 ${42 - s * 5} l-6 ${-s * 5}`} stroke="#e8879d" strokeWidth="2.5" strokeLinecap="round" />
          <path d={`M21 ${42 - s * 6} l-3 ${-s * 8}`} stroke="#e8879d" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      ))}
      <circle cx="22" cy="40" r="1.5" fill="#2e2a26" />
    </g>,
    <g>
      <ellipse cx="32" cy="40" rx="20" ry="10" fill="#f7b3c4" />
      <path d="M48 40 Q60 32 62 42 Q56 48 48 44 Z" fill="#f7b3c4" />
      <circle cx="18" cy="38" r="9" fill="#f7b3c4" />
      {[-1, 1].map((s) =>
        [0, 1, 2].map((k) => <path key={`${s}${k}`} d={`M${16 + k * 3} ${38 - s * 7} l${-4 + k * 2} ${-s * (7 - k)}`} stroke="#e46e8c" strokeWidth="2.6" strokeLinecap="round" />),
      )}
      <circle cx="14" cy="37" r="1.6" fill="#2e2a26" />
      <circle cx="22" cy="37" r="1.6" fill="#2e2a26" />
      <path d="M15 42 Q18 44 21 42" stroke="#c2577a" strokeWidth="1.2" fill="none" />
      <ellipse cx="28" cy="49" rx="3" ry="2" fill="#e8a0b2" />
      <ellipse cx="40" cy="49" rx="3" ry="2" fill="#e8a0b2" />
    </g>,
  ],
};

/** 6 組表情的臨時圖（24×24），美術圖到之前用小徽章疊在右下角。 */
const FACE_ART: ReactElement[] = [
  // 開心
  <g>
    <path d="M7 10 q2 -3 4 0 M13 10 q2 -3 4 0" stroke="#2e2a26" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M8 14 q4 4 8 0" stroke="#2e2a26" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </g>,
  // 瞇瞇眼
  <g>
    <path d="M7 10 h4 M13 10 h4" stroke="#2e2a26" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10 15 q2 1.5 4 0" stroke="#2e2a26" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </g>,
  // 驚訝
  <g>
    <circle cx="9" cy="10" r="2" fill="#2e2a26" />
    <circle cx="15" cy="10" r="2" fill="#2e2a26" />
    <ellipse cx="12" cy="16" rx="1.6" ry="2" fill="#2e2a26" />
  </g>,
  // 害羞
  <g>
    <circle cx="9" cy="10" r="1.2" fill="#2e2a26" />
    <circle cx="15" cy="10" r="1.2" fill="#2e2a26" />
    <ellipse cx="7" cy="13.5" rx="2" ry="1.2" fill="#f2a7a0" />
    <ellipse cx="17" cy="13.5" rx="2" ry="1.2" fill="#f2a7a0" />
    <path d="M11 15 h2" stroke="#2e2a26" strokeWidth="1.3" strokeLinecap="round" />
  </g>,
  // 睏睏
  <g>
    <path d="M7 10 q2 2 4 0 M13 10 q2 2 4 0" stroke="#2e2a26" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <ellipse cx="12" cy="15.5" rx="1.4" ry="1" fill="#2e2a26" />
    <text x="17" y="7" fontSize="5" fill="#6d7f6f">z</text>
  </g>,
  // 調皮
  <g>
    <path d="M7 10 q2 -2.5 4 0" stroke="#2e2a26" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <circle cx="15" cy="10" r="1.5" fill="#2e2a26" />
    <path d="M8 14 q4 3 8 0" stroke="#2e2a26" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M12 15.5 q1.5 3 3 0" fill="#e98a6b" />
  </g>,
];

/** 美術圖檔路徑（規格見 docs/美術規格-寵物.md）：每層都是同尺寸、對齊好的透明圖。 */
export const petArtUrl = (typeId: string, stage: number) => `/pets/${typeId}/stage${stage + 1}.png`;
export const faceArtUrl = (typeId: string, stage: number, face: number) => `/pets/${typeId}/face${face + 1}_stage${stage + 1}.png`;

/** 臨時圖：寵物本體＋右下角表情徽章（卵的階段沒有表情）。 */
export function PetArt({ id, stage, face, size = 64, hidden = false }: { id: string; stage: number; face?: number; size?: number; hidden?: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className={hidden ? 'silhouette' : undefined}>
      {ART[id]?.[stage]}
      {face !== undefined && stage > 0 && !hidden && (
        <g transform="translate(42 42)">
          <circle cx="11" cy="11" r="11" fill="#fffbf2" stroke="#e7dcc5" />
          <svg x="-1" y="-1" width="24" height="24" viewBox="0 0 24 24">
            {FACE_ART[face]}
          </svg>
        </g>
      )}
    </svg>
  );
}

/** 寵物圖：有美術圖就疊圖（本體＋表情），沒有就用臨時圖。 */
export function PetImage({ typeId, art, stage, face, size = 64, hidden = false }: { typeId: string; art?: boolean; stage: number; face?: number; size?: number; hidden?: boolean }) {
  if (!art) return <PetArt id={typeId} stage={stage} face={face} size={size} hidden={hidden} />;
  return (
    <span className={hidden ? 'pet-image silhouette' : 'pet-image'} style={{ width: size, height: size }} aria-hidden="true">
      <img src={petArtUrl(typeId, stage)} alt="" />
      {face !== undefined && stage > 0 && !hidden && <img src={faceArtUrl(typeId, stage, face)} alt="" />}
    </span>
  );
}
