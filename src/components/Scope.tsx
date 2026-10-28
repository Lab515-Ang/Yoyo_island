// 望遠鏡視野（專注畫面）：鏡頭在一張橫向全景上左右搜尋，動物躲在草叢後面。
// 專注越久，掃的範圍越小、越常停在牠附近，牠也探出越多；時間到就鎖定、推近。
import { useEffect, useRef } from 'react';
import pano from '../assets/scenes/focus-done.webp'; // 原型：先用白天山景當全景
import { AnimalArt } from './Animal';

const ASPECT = 1697 / 927; // 全景圖的寬高比
const SPOT_X = 0.62; // 動物躲的位置（全景的比例，和 styles.css 的 .scope-spot 一致）
const ZOOM = 1.3; // 全景高度是鏡片的幾倍（放大倍率）
const SCAN_MS = 48_000; // 掃一輪的時間：很慢，中間會停下來看

/** 草叢（黏土風格）：擋在動物前面。 */
function Bush() {
  return (
    <svg className="scope-bush" viewBox="0 0 200 80" aria-hidden="true">
      <ellipse cx="100" cy="76" rx="92" ry="7" fill="#2a3a1e" opacity="0.25" />
      <path d="M8 76 Q6 48 32 46 Q38 20 66 28 Q80 6 104 20 Q126 4 144 26 Q170 20 174 46 Q196 50 192 76 Z" fill="#6c8c58" />
      <path d="M22 76 Q24 56 46 55 Q56 36 78 44 Q94 28 112 40 Q132 30 146 50 Q166 50 170 76 Z" fill="#85a46d" />
      <ellipse cx="62" cy="40" rx="12" ry="6" fill="#a6c189" opacity="0.7" />
      <ellipse cx="108" cy="30" rx="14" ry="6" fill="#a6c189" opacity="0.7" />
      <ellipse cx="146" cy="40" rx="10" ry="5" fill="#a6c189" opacity="0.6" />
    </svg>
  );
}

export function Scope({ id, stage, progress, paused }: { id: string | undefined; stage: number; progress: number; paused: boolean }) {
  const pan = useRef<HTMLDivElement>(null);
  const p = Math.max(0, Math.min(1, progress));
  const reveal = Math.max(0, Math.min(1, (p - 0.1) / 0.8)); // 一開始只露出耳朵，快結束時整隻走出來

  // 左右搜尋：交給瀏覽器的動畫（顯示晶片處理，不用每一格重算）；進度變了才換一組幅度
  useEffect(() => {
    const el = pan.current;
    if (!el) return;
    const d = el.parentElement!.clientWidth; // 鏡片直徑
    const w = d * ZOOM * ASPECT;
    const clamp = (x: number) => Math.min(0, Math.max(d - w, x));
    const center = d / 2 - SPOT_X * w; // 動物在鏡片正中間時的位移
    const amp = (1 - p) ** 1.3 * w * 0.42;
    // 往左看、停一下、掃到右邊、停一下、回到附近、再往左
    const at = [-1, -1, 0.35, 1, 1, -0.2, -1];
    const offset = [0, 0.14, 0.32, 0.5, 0.64, 0.82, 1];
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || amp < 1) {
      el.style.transform = `translateX(${clamp(center)}px)`;
      return;
    }
    const anim = el.animate(
      at.map((k, i) => ({ transform: `translateX(${clamp(center + k * amp)}px)`, offset: offset[i], easing: 'ease-in-out' })),
      { duration: SCAN_MS, iterations: Infinity },
    );
    anim.currentTime = performance.now() % SCAN_MS; // 換幅度時接著原本的節奏，不要跳回開頭
    if (paused) anim.pause();
    return () => anim.cancel();
  }, [p, paused]);

  return (
    <div className={p >= 1 ? 'scope locked' : 'scope'} aria-hidden="true">
      <div className="scope-zoom">
        <div className="scope-sway">
          <div className="scope-pano" ref={pan}>
            <img src={pano} alt="" draggable={false} />
            <div className={p >= 1 ? 'scope-spot out' : reveal < 0.3 ? 'scope-spot rustle' : 'scope-spot'}>
              <div className="scope-hide">
                {/* 時間到：從草叢後面走出來，站到草叢前面 */}
                <div className="scope-animal" style={{ transform: p >= 1 ? 'translate(-58%, 6%)' : `translateY(${(1 - reveal) * 58}%)` }}>
                  <AnimalArt id={id} stage={stage} size="100%" />
                </div>
              </div>
              <Bush />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
