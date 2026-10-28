// 望遠鏡視野（專注畫面）：鏡頭在一張橫向全景上左右搜尋、推近拉遠。
// 前半段什麼都看不到；中段才在遠方出現，之後每次鏡頭轉開（看不到牠）的時候，牠換到更近的地方（每次不同位置），
// 時間到才走到鏡頭正前方。出現的樣子依習性：
//   walk  地上的動物（貓科、穿山甲、熊、山羊、貂、雉雞類）
//   perch 一般鳥類：遠處飛，後來停到倒木上
//   soar  猛禽：天空盤旋，越飛越低，最後降落
//   eyes  貓頭鷹：夜裡先看到一對發光的眼睛，後來停到倒木上、慢慢看清楚
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSave } from '../app/store';
import pano from '../assets/scenes/focus-done.webp'; // 原型：先用白天山景當全景（夜晚用調色暫代）
import { animalDef } from '../content/config';
import { AnimalArt } from './Animal';
import { MeshAnimal, hasMesh } from './MeshAnimal';

const ASPECT = 1697 / 927; // 全景圖的寬高比
const ZOOM = 1.3; // 全景高度是鏡片的幾倍（放大倍率）；鏡片看得到的全景高度約 23%～100%
const SPOT = { x: 62, y: 70 }; // 最後停下來的地方（全景的百分比，地面）
const LOG_TOP = SPOT.y - 11; // 倒木上緣（停在上面的鳥、貓頭鷹腳下）
const ACTOR_W = 19; // 動物原本大小時的寬度（全景寬度的百分比）
const SCAN_MS = 48_000; // 掃一輪的時間：很慢，中間會停下來看
// 推近／拉遠（[時間點, 0 拉遠～1 推近]）：配合掃視，兩次停下來看的時候推近
const ZOOMS: [number, number][] = [[0, 0.7], [0.08, 1], [0.16, 0.6], [0.24, 0], [0.42, 0.1], [0.52, 0.8], [0.6, 1], [0.68, 0.5], [0.76, 0], [0.9, 0.3], [1, 0.7]];
const STAGE_SCALE = [0.6, 0.8, 1]; // 和 Animal.tsx 一致：算貓頭鷹眼睛的位置
// 進度到哪裡換下一個位置：0 遠、1 中、2 近、3 很近、4 時間到（鏡頭正前方）；之前看不到
const STEP_AT = [0.45, 0.6, 0.72, 0.85, 1];

type Mode = 'walk' | 'perch' | 'soar' | 'eyes';
type Pos = { x: number; y: number; s: number; flip: boolean; look: 'idle' | 'flying' | 'eyes' | 'perched' };
const modeOf = (shape: string): Mode => (shape === 'owl' ? 'eyes' : shape === 'bird' ? 'perch' : shape === 'raptor' ? 'soar' : 'walk');
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const stepOf = (p: number) => STEP_AT.filter((t) => p >= t).length - 1; // -1：還沒出現

/** 每段專注固定的一串亂數（同一段專注重開 App 位置不變）。 */
function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** 四個由遠到近的位置（左右隨機）＋最後鏡頭正前方。 */
function route(mode: Mode, seed: string): Pos[] {
  const r = seeded(seed);
  const side = () => (r() < 0.5 ? -1 : 1);
  const ground = (y: number, s: number, x: number): Pos => ({ x, y, s, flip: r() < 0.5, look: 'idle' });
  const air = (y: number, s: number, x: number): Pos => ({ x, y, s, flip: false, look: 'flying' });
  const onLog = (s: number): Pos => ({ x: SPOT.x, y: LOG_TOP, s, flip: r() < 0.5, look: 'perched' });
  const far = 12 + r() * 76;
  const mid = 12 + r() * 76;
  const near = 22 + r() * 60;
  const close = SPOT.x + side() * (10 + r() * 10);
  if (mode === 'walk') return [ground(57, 0.32, far), ground(61, 0.5, mid), ground(65, 0.72, near), ground(68, 0.88, close), ground(SPOT.y, 1, SPOT.x)];
  if (mode === 'soar') return [air(44, 0.3, far), air(48, 0.42, mid), air(52, 0.58, near), ground(68, 0.88, close), ground(SPOT.y, 1, SPOT.x)];
  if (mode === 'perch') return [air(46, 0.3, far), air(50, 0.45, mid), air(54, 0.6, near), onLog(0.9), onLog(1)];
  const eyes = (y: number, s: number, x: number): Pos => ({ x, y, s, flip: false, look: 'eyes' });
  return [eyes(58, 0.35, far), eyes(62, 0.5, mid), onLog(0.85), onLog(0.92), onLog(1)];
}

/** 倒木（黏土風格）：鳥、貓頭鷹最後停的地方。 */
function Log() {
  return (
    <svg className="scope-log" viewBox="0 0 200 60" aria-hidden="true">
      <ellipse cx="100" cy="56" rx="96" ry="5" fill="#2a3a1e" opacity="0.25" />
      <rect x="12" y="14" width="170" height="38" rx="19" fill="#7a5a3e" />
      <path d="M24 22 Q90 16 176 22" stroke="#9b7752" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.8" />
      <ellipse cx="182" cy="33" rx="12" ry="19" fill="#c9a77c" />
      <ellipse cx="182" cy="33" rx="6" ry="10" fill="none" stroke="#9b7752" strokeWidth="2" />
      <ellipse cx="60" cy="14" rx="16" ry="7" fill="#85a46d" />
      <ellipse cx="74" cy="12" rx="10" ry="5" fill="#a6c189" opacity="0.8" />
    </svg>
  );
}

/** 動物在全景上佔的半寬（％）；飛的會左右來回，範圍比較大。 */
const margin = (q: Pos) => ACTOR_W * q.s * (q.look === 'flying' ? 2 : 0.6);

// memo：專注畫面每秒更新時間，望遠鏡的參數沒變就不用重畫
export const Scope = memo(function Scope({ id, stage, progress, paused, seed }: { id: string | undefined; stage: number; progress: number; paused: boolean; seed: string }) {
  // 減少動態：系統設定或 App 的「低動態效果」都算
  const calm = useSave().save.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pan = useRef<HTMLDivElement>(null);
  const look = useRef<HTMLDivElement>(null);
  const p = Math.max(0, Math.min(1, progress));
  const mode = modeOf(animalDef(id).shape);
  const path = useMemo(() => route(mode, seed), [mode, seed]);
  const want = stepOf(p);
  // 畫面上的位置只在「鏡頭看不到牠」的時候才換（見下面的檢查）；重開 App 時直接用現在的位置
  const [shown, setShown] = useState(want);
  const at = shown >= 0 ? path[shown] : null;

  // 左右搜尋＋推近／拉遠：交給瀏覽器的動畫（顯示晶片處理，不用每一格重算）；進度變了才換一組幅度
  // 掃的範圍到 85% 前都很寬（動物才有機會在死角換位置），之後才收到正前方
  useEffect(() => {
    const el = pan.current;
    if (!el) return;
    const d = el.parentElement!.clientWidth; // 鏡片直徑
    const w = d * ZOOM * ASPECT;
    const clamp = (x: number) => Math.min(0, Math.max(d - w, x));
    const center = d / 2 - (SPOT.x / 100) * w;
    const amp = w * 0.42 * (p < 0.85 ? 1 - 0.25 * p : (1 - 0.25 * 0.85) * (1 - (p - 0.85) / 0.15));
    // 往左看、停一下、掃到右邊、停一下、回到附近、再往左
    const pts = [-1, -1, 0.35, 1, 1, -0.2, -1];
    const offset = [0, 0.14, 0.32, 0.5, 0.64, 0.82, 1];
    const reduce = calm;
    if (reduce || amp < 1) {
      el.style.transform = `translateX(${clamp(center)}px)`;
      return;
    }
    const anims = [
      el.animate(
        pts.map((k, i) => ({ transform: `translateX(${clamp(center + k * amp)}px)`, offset: offset[i], easing: 'ease-in-out' })),
        { duration: SCAN_MS, iterations: Infinity },
      ),
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
  }, [p, paused, calm]);

  // 換位置：舊的和新的位置都在鏡片外面時才換，玩家就不會看到牠「瞬移」；時間到直接走到正前方
  useEffect(() => {
    if (shown === want) return;
    if (want === STEP_AT.length - 1 || want < shown || calm) return setShown(want);
    const check = () => {
      const el = pan.current;
      if (!el) return;
      const d = el.parentElement!.clientWidth;
      const w = d * ZOOM * ASPECT;
      const tx = new DOMMatrix(getComputedStyle(el).transform).m41; // 掃到哪裡了（動畫中的值）
      const left = (-tx / w) * 100;
      const right = ((-tx + d) / w) * 100;
      const outside = (q: Pos | null) => !q || q.x + margin(q) < left || q.x - margin(q) > right;
      if (outside(shown >= 0 ? path[shown] : null) && outside(path[want])) setShown(want);
    };
    const t = window.setInterval(check, 300);
    return () => clearInterval(t);
  }, [want, shown, path]);

  // 有網格動態的動物：時間到走向鏡頭正前方的那 2.5 秒播走路（和位置轉場一樣長）
  const meshed = hasMesh(id);
  const arriving = shown === STEP_AT.length - 1;
  const [walking, setWalking] = useState(false);
  useEffect(() => {
    if (!arriving) return;
    setWalking(true);
    const t = window.setTimeout(() => setWalking(false), 2500);
    return () => clearTimeout(t);
  }, [arriving]);

  const k = STAGE_SCALE[Math.max(0, Math.min(2, stage))];
  // 貓頭鷹：停到倒木上之後越來越亮、越清楚
  const seen = mode === 'eyes' ? [0, 0, 0.35, 0.7, 1][Math.max(0, shown)] : 1;
  const eyesOnly = at?.look === 'eyes';

  return (
    <div className={`scope${p >= 1 ? ' locked' : ''}${mode === 'eyes' ? ' night' : ''}`} aria-hidden="true">
      <div className="scope-zoom">
        <div className="scope-look" ref={look}>
          <div className="scope-sway">
            <div className="scope-pano" ref={pan}>
              <img src={pano} alt="" draggable={false} />
              {(mode === 'perch' || mode === 'eyes') && (
                <div className="scope-log-at" style={{ left: `${SPOT.x}%`, top: `${SPOT.y}%` }}>
                  <Log />
                </div>
              )}
              {at && (
                // key：換位置是「在看不到的時候換到另一個地方」，不是走過去；最後從很近的地方走到正前方（同一個 key，才有移動的過程）
                <div
                  key={shown >= STEP_AT.length - 2 ? 'close' : shown}
                  className={shown === STEP_AT.length - 1 ? 'scope-actor arrive' : 'scope-actor'}
                  style={{ left: `${at.x}%`, top: `${at.y}%`, transform: `translate(-50%, -100%) scale(${at.s})` }}
                >
                  <div className={`scope-gait ${at.look}${meshed ? ' meshed' : ''}`} style={{ scale: at.flip ? '-1 1' : undefined }}>
                    {!eyesOnly && (
                      <div className="scope-art" style={{ opacity: lerp(0.08, 1, seen), filter: seen < 1 ? `brightness(${lerp(0.35, 1, seen)})` : undefined }}>
                        {meshed ? <MeshAnimal id={id!} stage={stage} walking={walking} paused={paused} /> : <AnimalArt id={id} stage={stage} size="100%" />}
                      </div>
                    )}
                    {mode === 'eyes' && (
                      // 黑暗裡的一對發光眼睛（位置對齊貓頭鷹的眼睛）
                      <span className="scope-eyes" style={{ opacity: eyesOnly ? 1 : 1 - seen * 0.85, '--l': `${50 - 10 * k}%`, '--r': `${50 + 10 * k}%`, '--t': `${92 - 40 * k}%` } as CSSProperties}>
                        <i />
                        <i />
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
