// 8 種生物的原創簡化插圖（圖鑑卡、2D 降級場景共用）
import type { ReactElement } from 'react';
const ART: Record<string, ReactElement> = {
  butterfly_yellow: (
    <g>
      <ellipse cx="22" cy="26" rx="14" ry="12" fill="#f3cf5a" />
      <ellipse cx="42" cy="26" rx="14" ry="12" fill="#f3cf5a" />
      <ellipse cx="24" cy="42" rx="9" ry="8" fill="#eab949" />
      <ellipse cx="40" cy="42" rx="9" ry="8" fill="#eab949" />
      <rect x="30" y="18" width="4" height="30" rx="2" fill="#5b4a33" />
      <path d="M31 18 Q27 10 24 9 M33 18 Q37 10 40 9" stroke="#5b4a33" strokeWidth="1.5" fill="none" />
    </g>
  ),
  butterfly_green: (
    <g>
      <path d="M32 30 L6 14 Q4 34 22 38 Z" fill="#2f3b33" />
      <path d="M32 30 L58 14 Q60 34 42 38 Z" fill="#2f3b33" />
      <path d="M28 30 L12 20 Q12 31 23 34 Z" fill="#6fd0a6" />
      <path d="M36 30 L52 20 Q52 31 41 34 Z" fill="#6fd0a6" />
      <path d="M32 34 L22 54 Q30 52 32 40 Z M32 34 L42 54 Q34 52 32 40 Z" fill="#2f3b33" />
      <rect x="30" y="20" width="4" height="26" rx="2" fill="#3d3326" />
      <circle cx="26" cy="51" r="2" fill="#f2c94c" />
      <circle cx="38" cy="51" r="2" fill="#f2c94c" />
    </g>
  ),
  ladybird: (
    <g>
      <ellipse cx="32" cy="50" rx="22" ry="5" fill="#9ccf8f" />
      <path d="M12 44 A20 20 0 0 1 52 44 Z" fill="#d9543f" />
      <path d="M32 24 V44" stroke="#2e2a26" strokeWidth="2" />
      <circle cx="23" cy="36" r="3.5" fill="#2e2a26" />
      <circle cx="41" cy="36" r="3.5" fill="#2e2a26" />
      <circle cx="26" cy="29" r="2.5" fill="#2e2a26" />
      <circle cx="38" cy="29" r="2.5" fill="#2e2a26" />
      <path d="M22 26 A10 8 0 0 1 42 26 Z" fill="#2e2a26" transform="translate(0 -4) scale(1 .9)" />
    </g>
  ),
  bee: (
    <g>
      <ellipse cx="24" cy="20" rx="10" ry="7" fill="#dff1f5" opacity=".9" />
      <ellipse cx="40" cy="20" rx="10" ry="7" fill="#dff1f5" opacity=".9" />
      <ellipse cx="32" cy="36" rx="16" ry="12" fill="#f2c14e" />
      <rect x="25" y="25" width="5" height="22" rx="2" fill="#3a3128" />
      <rect x="35" y="25" width="5" height="22" rx="2" fill="#3a3128" />
      <circle cx="16" cy="34" r="6" fill="#3a3128" />
      <circle cx="14" cy="32" r="1.5" fill="#fff" />
    </g>
  ),
  dragonfly: (
    <g>
      <ellipse cx="20" cy="22" rx="14" ry="5" fill="#cfeef3" opacity=".9" transform="rotate(-12 20 22)" />
      <ellipse cx="44" cy="22" rx="14" ry="5" fill="#cfeef3" opacity=".9" transform="rotate(12 44 22)" />
      <ellipse cx="20" cy="32" rx="12" ry="4" fill="#cfeef3" opacity=".9" transform="rotate(10 20 32)" />
      <ellipse cx="44" cy="32" rx="12" ry="4" fill="#cfeef3" opacity=".9" transform="rotate(-10 44 32)" />
      <rect x="30" y="20" width="4" height="38" rx="2" fill="#3f8f9a" />
      <circle cx="32" cy="18" r="5" fill="#2f6f78" />
    </g>
  ),
  minnow: (
    <g>
      <ellipse cx="30" cy="24" rx="14" ry="6" fill="#b9c8cf" />
      <path d="M44 24 L54 17 V31 Z" fill="#a3b4bc" />
      <circle cx="21" cy="23" r="1.6" fill="#2e3a40" />
      <ellipse cx="24" cy="44" rx="11" ry="5" fill="#b9c8cf" />
      <path d="M35 44 L43 38 V50 Z" fill="#a3b4bc" />
      <circle cx="17" cy="43" r="1.4" fill="#2e3a40" />
    </g>
  ),
  frog: (
    <g>
      <ellipse cx="32" cy="42" rx="20" ry="13" fill="#79b36a" />
      <ellipse cx="32" cy="46" rx="12" ry="7" fill="#c7e3a8" />
      <circle cx="22" cy="28" r="7" fill="#79b36a" />
      <circle cx="42" cy="28" r="7" fill="#79b36a" />
      <circle cx="22" cy="27" r="3" fill="#2e2a26" />
      <circle cx="42" cy="27" r="3" fill="#2e2a26" />
      <ellipse cx="14" cy="52" rx="7" ry="3" fill="#679d5a" />
      <ellipse cx="50" cy="52" rx="7" ry="3" fill="#679d5a" />
    </g>
  ),
  waterside_bird: (
    <g>
      <ellipse cx="30" cy="34" rx="16" ry="11" fill="#8d8a7c" />
      <ellipse cx="28" cy="38" rx="11" ry="6" fill="#e9e1cf" />
      <circle cx="44" cy="24" r="8" fill="#8d8a7c" />
      <path d="M51 24 L60 26 L51 27 Z" fill="#d9a441" />
      <circle cx="46" cy="22" r="1.6" fill="#2e2a26" />
      <path d="M14 30 L4 26 L12 36 Z" fill="#76736a" />
      <path d="M27 45 V56 M33 45 V56" stroke="#c98d3d" strokeWidth="2" />
    </g>
  ),
};

export function Creature({ id, size = 56, hidden = false }: { id: string; size?: number; hidden?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className={hidden ? 'silhouette' : undefined}>
      {ART[id]}
    </svg>
  );
}
