// 望遠鏡視野（專注畫面）：鏡頭在一張橫向全景上左右搜尋、推近拉遠。
// 前半段什麼都看不到；中段才在很遠的地方出現（小、霧霧的），之後分 6～15 段（每段專注隨機）越來越近、越來越清楚，
// 每一段的位置都不一樣，而且只在鏡頭轉開（看不到牠）的時候換；看得到的時候牠會自己走幾步、張望、低頭。
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
const WALK_MS = 2500; // 走幾步的時間（和 .scope-actor 的位置轉場一樣長）
// 推近／拉遠（[時間點, 0 拉遠～1 推近]）：配合掃視，兩次停下來看的時候推近
const ZOOMS: [number, number][] = [[0, 0.7], [0.08, 1], [0.16, 0.6], [0.24, 0], [0.42, 0.1], [0.52, 0.8], [0.6, 1], [0.68, 0.5], [0.76, 0], [0.9, 0.3], [1, 0.7]];
const STAGE_SCALE = [0.6, 0.8, 1]; // 和 Animal.tsx 一致：算貓頭鷹眼睛的位置

type Mode = 'walk' | 'perch' | 'soar' | 'eyes';
type Look = 'idle' | 'flying' | 'eyes' | 'perched';
// d：遠近（0 最遠、1 鏡頭正前方），用來決定霧的濃淡、貓頭鷹看得多清楚
type Pos = { x: number; y: number; s: number; d: number; flip: boolean; look: Look };
const modeOf = (shape: string): Mode => (shape === 'owl' ? 'eyes' : shape === 'bird' ? 'perch' : shape === 'raptor' ? 'soar' : 'walk');
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** 每段專注固定的一串亂數（同一段專注重開 App，段數和位置都不變）。 */
function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * 這段專注的路線：6～15 段（最後一段是時間到、走到鏡頭正前方），steps 是每一段開始的進度。
 * 越後面越近、越大、越清楚；左右位置隨機，相鄰兩段不會擠在同一個地方。
 */
function route(mode: Mode, seed: string): { steps: number[]; path: Pos[] } {
  const r = seeded(seed);
  const n = 6 + Math.floor(r() * 10);
  const start = 0.38 + r() * 0.1; // 中段才出現
  const steps = Array.from({ length: n }, (_, i) => (i === n - 1 ? 1 : start + (0.96 - start) * (i / (n - 2))));
  const path: Pos[] = [];
  let lastX = SPOT.x;
  for (let i = 0; i < n - 1; i++) {
    const d = clamp(i / (n - 2) + (r() - 0.5) * 0.06, 0, 0.97);
    const spread = lerp(46, 16, d); // 遠的時候整片草原都可能，近了就在正前方附近
    let x = clamp(SPOT.x + (r() * 2 - 1) * spread, 8, 92);
    if (Math.abs(x - lastX) < 8) x = clamp(x + (x < lastX ? -10 : 10), 8, 92);
    lastX = x;
    const ground = (): Pos => ({ x, y: lerp(56.5, 68.5, d ** 0.9), s: lerp(0.24, 0.92, d ** 1.1), d, flip: r() < 0.5, look: 'idle' });
    const air = (): Pos => ({ x, y: lerp(42, 55, d), s: lerp(0.24, 0.62, d), d, flip: false, look: 'flying' });
    const onLog = (): Pos => ({ x: SPOT.x, y: LOG_TOP, s: lerp(0.8, 0.95, d), d, flip: r() < 0.5, look: 'perched' });
    if (mode === 'walk') path.push(ground());
    else if (mode === 'soar') path.push(d < 0.7 ? air() : ground());
    else if (mode === 'perch') path.push(d < 0.72 ? air() : onLog());
    else path.push(d < 0.5 ? { x, y: lerp(57, 63, d), s: lerp(0.3, 0.55, d), d, flip: false, look: 'eyes' } : onLog());
  }
  const last = path[n - 2];
  path.push(mode === 'perch' || mode === 'eyes' ? { ...last, s: 1, d: 1 } : { x: SPOT.x, y: SPOT.y, s: 1, d: 1, flip: last.flip, look: 'idle' });
  return { steps, path };
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

/** 動物在全景上佔的半寬（％）：飛的會左右來回、地上的會自己走幾步，範圍要算進去。 */
const margin = (q: Pos) => ACTOR_W * q.s * (q.look === 'flying' ? 2 : 0.6) + (q.look === 'idle' ? 9 * q.s : 0);

/** 看得到的時候自己的小動作：走幾步（dx 是離原本位置多遠）、張望、低頭；face＝面向左邊。 */
type Wander = { dx: number; walking: boolean; act: '' | 'look' | 'sniff'; face: boolean };

// memo：專注畫面每秒更新時間，望遠鏡的參數沒變就不用重畫
export const Scope = memo(function Scope({ id, stage, progress, paused, seed }: { id: string | undefined; stage: number; progress: number; paused: boolean; seed: string }) {
  // 減少動態：系統設定或 App 的「低動態效果」都算
  const calm = useSave().save.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pan = useRef<HTMLDivElement>(null);
  const look = useRef<HTMLDivElement>(null);
  const p = Math.max(0, Math.min(1, progress));
  const pScan = Math.round(p * 40) / 40; // 掃視幅度每 2.5% 換一次就好（每次都要重建動畫）
  const mode = modeOf(animalDef(id).shape);
  const { steps, path } = useMemo(() => route(mode, seed), [mode, seed]);
  const final = steps.length - 1;
  const want = steps.filter((t) => p >= t).length - 1; // -1：還沒出現
  // 畫面上的位置只在「鏡頭看不到牠」的時候才換（見下面的檢查）；重開 App 時直接用現在的位置
  const [shown, setShown] = useState(want);
  const at = shown >= 0 ? path[shown] : null;

  // 左右搜尋＋推近／拉遠：交給瀏覽器的動畫（顯示晶片處理，不用每一格重算）
  // 掃的範圍到 85% 前都很寬（動物才有機會在死角換位置），之後才收到正前方
  useEffect(() => {
    const el = pan.current;
    if (!el) return;
    const d = el.parentElement!.clientWidth; // 鏡片直徑
    const w = d * ZOOM * ASPECT;
    const fit = (x: number) => Math.min(0, Math.max(d - w, x));
    const center = d / 2 - (SPOT.x / 100) * w;
    const q = pScan;
    const amp = w * 0.42 * (q < 0.85 ? 1 - 0.25 * q : (1 - 0.25 * 0.85) * (1 - (q - 0.85) / 0.15));
    // 往左看、停一下、掃到右邊、停一下、回到附近、再往左
    const pts = [-1, -1, 0.35, 1, 1, -0.2, -1];
    const offset = [0, 0.14, 0.32, 0.5, 0.64, 0.82, 1];
    if (calm || amp < 1) {
      el.style.transform = `translateX(${fit(center)}px)`;
      return;
    }
    const anims = [
      el.animate(
        pts.map((k, i) => ({ transform: `translateX(${fit(center + k * amp)}px)`, offset: offset[i], easing: 'ease-in-out' })),
        { duration: SCAN_MS, iterations: Infinity },
      ),
      look.current!.animate(
        ZOOMS.map(([o, k]) => ({ transform: `scale(${1 + 0.06 * q + 0.12 * (1 - q / 2) * k})`, offset: o, easing: 'ease-in-out' })),
        { duration: SCAN_MS, iterations: Infinity },
      ),
    ];
    for (const a of anims) {
      a.currentTime = performance.now() % SCAN_MS; // 換幅度時接著原本的節奏，不要跳回開頭
      if (paused) a.pause();
    }
    return () => anims.forEach((a) => a.cancel());
  }, [pScan, paused, calm]);

  // 換位置：舊的和新的位置都在鏡片外面時才換，玩家就不會看到牠「瞬移」；時間到直接走到正前方
  useEffect(() => {
    if (shown === want) return;
    if (want === final || want < shown || calm) return setShown(want);
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
  }, [want, shown, path, final, calm]);

  // 看得到的時候自己的小動作：每隔幾秒隨機走幾步（會轉向走的方向）、張望、低頭；鳥在倒木上跳一兩步
  const [wander, setWander] = useState<Wander>({ dx: 0, walking: false, act: '', face: false });
  useEffect(() => {
    setWander({ dx: 0, walking: false, act: '', face: at?.flip ?? false }); // 換到新的地方：從原位開始
    if (!at || calm || paused || (at.look !== 'idle' && at.look !== 'perched')) return;
    let t = 0;
    const perched = at.look === 'perched';
    const next = (ms: number) => (t = window.setTimeout(step, ms));
    const step = () => {
      const roll = Math.random();
      if (shown < final && roll < 0.45) {
        // 走幾步（越遠走得越短）；最後在鏡頭正前方就不走了
        const reach = perched ? 7 : 9 * at.s;
        setWander((w) => {
          let dx = w.dx + (perched ? 1.5 + Math.random() * 2 : (2 + Math.random() * 4) * at.s) * (Math.random() < 0.5 ? -1 : 1);
          if (Math.abs(dx) > reach) dx = w.dx - Math.sign(dx) * Math.abs(dx - w.dx); // 走太遠就往回走
          return { dx, walking: true, act: '', face: dx < w.dx };
        });
        t = window.setTimeout(() => {
          setWander((w) => ({ ...w, walking: false }));
          next(2500 + Math.random() * 3500);
        }, perched ? 600 : WALK_MS);
      } else {
        setWander((w) => ({ ...w, act: roll < 0.75 ? 'look' : 'sniff' }));
        t = window.setTimeout(() => {
          setWander((w) => ({ ...w, act: '' }));
          next(2000 + Math.random() * 3500);
        }, 1800);
      }
    };
    next(1500 + Math.random() * 2500);
    return () => clearTimeout(t);
  }, [shown, calm, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // 時間到走向鏡頭正前方的那 2.5 秒播走路
  const meshed = hasMesh(id);
  const arriving = shown === final;
  const [walkIn, setWalkIn] = useState(false);
  useEffect(() => {
    if (!arriving || calm) return;
    setWalkIn(true);
    const t = window.setTimeout(() => setWalkIn(false), WALK_MS);
    return () => clearTimeout(t);
  }, [arriving]); // eslint-disable-line react-hooks/exhaustive-deps

  const k = STAGE_SCALE[Math.max(0, Math.min(2, stage))];
  const d = at?.d ?? 0;
  // 貓頭鷹：停到倒木上之後越來越亮、越清楚
  const seen = mode === 'eyes' ? (at?.look === 'perched' ? lerp(0.3, 1, clamp((d - 0.5) / 0.47, 0, 1)) : 0) : 1;
  const eyesOnly = at?.look === 'eyes';
  // 遠的時候霧霧的（顏色淡、對比低），越近越清楚
  const haze = 1 - d;
  const walking = wander.walking || walkIn;
  const gait = ['scope-gait', at?.look, meshed ? 'meshed' : walking ? 'walking' : wander.act && `act-${wander.act}`].filter(Boolean).join(' ');

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
                  key={shown >= final - 1 ? 'close' : shown}
                  className={arriving ? 'scope-actor arrive' : at.look === 'perched' ? 'scope-actor hop' : 'scope-actor'}
                  style={{ left: `${at.x + wander.dx}%`, top: `${at.y}%`, transform: `translate(-50%, -100%) scale(${at.s})` }}
                >
                  <div className={gait} style={{ scale: wander.face ? '-1 1' : undefined }}>
                    {!eyesOnly && (
                      <div
                        className="scope-art"
                        style={{
                          opacity: mode === 'eyes' ? lerp(0.08, 1, seen) : lerp(1, 0.72, haze),
                          filter: mode === 'eyes' ? (seen < 1 ? `brightness(${lerp(0.35, 1, seen)})` : undefined) : haze > 0.05 ? `saturate(${lerp(1, 0.45, haze)}) contrast(${lerp(1, 0.75, haze)}) brightness(${lerp(1, 1.12, haze)})` : undefined,
                        }}
                      >
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
