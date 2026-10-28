// 望遠鏡視野（專注畫面）：鏡頭在一張橫向全景上左右搜尋、推近拉遠；動物依習性用不同方式出現，越久越近。
//   walk  從遠處走過來（貓科、穿山甲、熊、山羊、貂、雉雞類）
//   perch 遠處飛來飛去，最後停到前景的樹枝上（一般鳥類）
//   soar  在天空盤旋，越飛越低、越近，最後降落（猛禽）
//   eyes  夜裡樹枝上先亮起一對眼睛，輪廓慢慢清楚（貓頭鷹）
import { useEffect, useRef, type CSSProperties } from 'react';
import pano from '../assets/scenes/focus-done.webp'; // 原型：先用白天山景當全景（夜晚用調色暫代）
import { animalDef } from '../content/config';
import { AnimalArt } from './Animal';

const ASPECT = 1697 / 927; // 全景圖的寬高比
const ZOOM = 1.3; // 全景高度是鏡片的幾倍（放大倍率）
const SPOT = { x: 62, y: 70 }; // 最後停下來的地方（全景的百分比，地面）
// 鏡片看得到的全景高度範圍約 23%～100%（全景上移 30%、高 130%）：飛行的高度要在這裡面
const SCAN_MS = 48_000; // 掃一輪的時間：很慢，中間會停下來看
// 推近／拉遠（[時間點, 0 拉遠～1 推近]）：配合掃視，兩次停下來看的時候推近
const ZOOMS: [number, number][] = [[0, 0.7], [0.08, 1], [0.16, 0.6], [0.24, 0], [0.42, 0.1], [0.52, 0.8], [0.6, 1], [0.68, 0.5], [0.76, 0], [0.9, 0.3], [1, 0.7]];
const STAGE_SCALE = [0.6, 0.8, 1]; // 和 Animal.tsx 一致：算貓頭鷹眼睛的位置

type Mode = 'walk' | 'perch' | 'soar' | 'eyes';
const modeOf = (shape: string): Mode => (shape === 'owl' ? 'eyes' : shape === 'bird' ? 'perch' : shape === 'raptor' ? 'soar' : 'walk');
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const ease = (t: number) => 1 - (1 - clamp01(t)) ** 2;

/** 前景樹枝（黏土風格）：鳥和貓頭鷹停的地方，從鏡片右邊伸進來。 */
function Branch() {
  return (
    <svg className="scope-branch" viewBox="0 0 300 70" aria-hidden="true">
      <path d="M300 30 Q220 26 150 34 Q90 40 20 32 Q8 31 6 38 Q10 44 24 42 Q100 50 160 46 Q230 42 300 48 Z" fill="#7a5a3e" />
      <path d="M300 32 Q230 30 160 37 Q100 42 30 36" stroke="#9b7752" strokeWidth="3" fill="none" opacity="0.7" />
      <ellipse cx="236" cy="20" rx="26" ry="12" fill="#6c8c58" />
      <ellipse cx="262" cy="24" rx="22" ry="11" fill="#85a46d" />
      <ellipse cx="70" cy="30" rx="16" ry="8" fill="#85a46d" />
      <ellipse cx="248" cy="16" rx="10" ry="4" fill="#a6c189" opacity="0.7" />
    </svg>
  );
}

/** 依習性算出動物在全景上的位置（地面的點）、大小，以及是不是已經停到前景的樹枝上。 */
function placement(mode: Mode, p: number) {
  const done = p >= 1;
  if (mode === 'walk') {
    const e = ease(p);
    return { x: lerp(36, SPOT.x, e), y: lerp(57, SPOT.y, e), s: lerp(0.3, 1, e), gait: done ? '' : 'walking', perched: false };
  }
  if (mode === 'soar') {
    if (p >= 0.85) return { x: SPOT.x, y: SPOT.y, s: 1, gait: done ? '' : 'landed', perched: false };
    const q = ease(p / 0.85);
    return { x: lerp(48, 58, q), y: lerp(44, 56, q), s: lerp(0.3, 0.75, q), gait: 'flying', perched: false };
  }
  if (mode === 'perch') {
    if (p >= 0.75) return { x: SPOT.x, y: SPOT.y, s: 1, gait: '', perched: true };
    const q = ease(p / 0.75);
    return { x: lerp(40, 58, q), y: lerp(42, 54, q), s: lerp(0.3, 0.7, q), gait: 'flying', perched: false };
  }
  return { x: SPOT.x, y: SPOT.y, s: 1, gait: '', perched: true }; // eyes：一開始就在樹枝上，只是看不清楚
}

export function Scope({ id, stage, progress, paused }: { id: string | undefined; stage: number; progress: number; paused: boolean }) {
  const pan = useRef<HTMLDivElement>(null);
  const look = useRef<HTMLDivElement>(null);
  const p = clamp01(progress);
  const mode = modeOf(animalDef(id).shape);
  const at = placement(mode, p);
  // 貓頭鷹：越久越亮、越清楚
  const seen = mode === 'eyes' ? ease((p - 0.15) / 0.75) : 1;

  // 左右搜尋（跟著動物現在的位置）＋推近／拉遠：交給瀏覽器的動畫（顯示晶片處理，不用每一格重算）；進度變了才換一組幅度
  const focusX = at.perched ? SPOT.x : at.x;
  useEffect(() => {
    const el = pan.current;
    if (!el) return;
    const d = el.parentElement!.clientWidth; // 鏡片直徑
    const w = d * ZOOM * ASPECT;
    const clamp = (x: number) => Math.min(0, Math.max(d - w, x));
    const center = d / 2 - (focusX / 100) * w;
    const amp = (1 - p) ** 1.3 * w * 0.42;
    // 往左看、停一下、掃到右邊、停一下、回到附近、再往左
    const pts = [-1, -1, 0.35, 1, 1, -0.2, -1];
    const offset = [0, 0.14, 0.32, 0.5, 0.64, 0.82, 1];
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || amp < 1) {
      el.style.transform = `translateX(${clamp(center)}px)`;
      return;
    }
    const anims = [
      el.animate(
        pts.map((k, i) => ({ transform: `translateX(${clamp(center + k * amp)}px)`, offset: offset[i], easing: 'ease-in-out' })),
        { duration: SCAN_MS, iterations: Infinity },
      ),
      // 同一個節奏的推近／拉遠：停下來看的時候推近，掃過去的時候拉遠；越接近找到，整體越近
      look.current!.animate(
        ZOOMS.map(([o, k]) => ({ transform: `scale(${1 + 0.06 * p + 0.12 * (1 - p / 2) * k})`, offset: o, easing: 'ease-in-out' })),
        { duration: SCAN_MS, iterations: Infinity },
      ),
    ];
    for (const a of anims) {
      a.currentTime = performance.now() % SCAN_MS; // 換幅度時接著原本的節奏，不要跳回開頭
      if (paused) a.pause();
    }
    return () => anims.forEach((a) => a.cancel());
  }, [p, paused, focusX]);

  const k = STAGE_SCALE[Math.max(0, Math.min(2, stage))];
  const perchArt = (
    <div className={`scope-perch${mode === 'perch' ? ' landing' : ''}`}>
      <div style={{ opacity: lerp(0.08, 1, seen), filter: `brightness(${lerp(0.35, 1, seen)})` }}>
        <AnimalArt id={id} stage={stage} size="100%" />
      </div>
      {mode === 'eyes' && (
        // 黑暗裡先看到的一對發光眼睛（位置對齊貓頭鷹的眼睛）
        <span className="scope-eyes" style={{ opacity: 1 - seen * 0.85, '--l': `${50 - 10 * k}%`, '--r': `${50 + 10 * k}%`, '--t': `${92 - 40 * k}%` } as CSSProperties}>
          <i />
          <i />
        </span>
      )}
    </div>
  );

  return (
    <div className={`scope${p >= 1 ? ' locked' : ''}${mode === 'eyes' ? ' night' : ''}`} aria-hidden="true">
      <div className="scope-zoom">
        <div className="scope-look" ref={look}>
          <div className="scope-sway">
            <div className="scope-pano" ref={pan}>
              <img src={pano} alt="" draggable={false} />
              {!at.perched && (
                <div className="scope-actor" style={{ left: `${at.x}%`, top: `${at.y}%`, transform: `translate(-50%, -100%) scale(${at.s})` }}>
                  <div className={`scope-gait ${at.gait}`}>
                    <AnimalArt id={id} stage={stage} size="100%" />
                  </div>
                </div>
              )}
            </div>
            {/* 前景：樹枝（不跟著左右掃，有一點視差），停在上面的鳥、貓頭鷹 */}
            {(mode === 'perch' || mode === 'eyes') && (
              <div className="scope-fore">
                <Branch />
                {at.perched && perchArt}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
