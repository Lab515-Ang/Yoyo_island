// 會動的動物（網格骨架）：分層貼圖切成三角網格，每個頂點照骨頭權重跟著骨頭變形，用 WebGL 畫。
// 素材由 tools/animal-rig/ 產生（規範：docs/規格-動物動態網格.md），放在 src/assets/animals/mesh/<id>/：mesh.json＋各層 webp。
// 版面跟 AnimalArt 一樣：方形框、地面在 92%，原本放 AnimalArt 的地方可以直接換成這個。
import { useEffect, useRef } from 'react';
import { useSave } from '../app/store';
import { prefersReducedMotion } from '../scenes/HabitatScene';

const MESH_JSON = import.meta.glob('../assets/animals/mesh/*/mesh.json', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const MESH_IMG = import.meta.glob('../assets/animals/mesh/*/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const dir = (id: string) => `../assets/animals/mesh/${id}/`;

/** 這隻動物有沒有網格動態素材。 */
export const hasMesh = (id: string | undefined) => !!id && `${dir(id)}mesh.json` in MESH_JSON;

type Bone = { name: string; parent: string | null; pivot: [number, number] };
type Layer = { name: string; x: number; y: number; w: number; h: number; n: number; t: number; pos: string; bi: string; bw: string; tri: string };
type Mesh = { size: [number, number]; bones: Bone[]; layers: Layer[] };
type Pose = Record<string, number> & { blink?: number };

const meshes = new Map<string, Promise<Mesh>>();
const loadMesh = (id: string) => {
  if (!meshes.has(id)) meshes.set(id, fetch(MESH_JSON[`${dir(id)}mesh.json`]).then((r) => r.json()));
  return meshes.get(id)!;
};
const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((ok, bad) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = bad;
    i.src = src;
  });
const dec = <T,>(b64: string, T: new (b: ArrayBuffer) => T) => {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return new T(u.buffer);
};

const VS = `
attribute vec2 aPos; attribute vec4 aBi; attribute vec4 aBw;
uniform vec3 uA[24]; uniform vec3 uB[24];
uniform vec4 uView; uniform vec4 uLayer;
varying vec2 vUv;
vec2 tf(float i, vec3 p) { int k = int(i + 0.5); return vec2(dot(uA[k], p), dot(uB[k], p)); }
void main() {
  vec3 p = vec3(aPos, 1.0);
  vec2 s = aBw.x * tf(aBi.x, p) + aBw.y * tf(aBi.y, p) + aBw.z * tf(aBi.z, p) + aBw.w * tf(aBi.w, p);
  vUv = (aPos - uLayer.xy) / uLayer.zw;
  gl_Position = vec4((s.x - uView.x) * uView.z - 1.0, 1.0 - (s.y - uView.y) * uView.w, 0.0, 1.0);
}`;
const FS = `
precision mediump float;
uniform sampler2D uTex; varying vec2 vUv;
void main() {
  vec2 inside = step(0.0, vUv) * step(vUv, vec2(1.0)); // 網格多留的一圈不能拉到邊緣像素
  gl_FragColor = texture2D(uTex, vUv) * inside.x * inside.y;
}`;

// ---------- 骨頭 ----------
// 矩陣 [a,b,c,d,e,f]：x' = a x + b y + c，y' = d x + e y + f
type M6 = number[];
const mul = (m: M6, n: M6): M6 => [
  m[0] * n[0] + m[1] * n[3], m[0] * n[1] + m[1] * n[4], m[0] * n[2] + m[1] * n[5] + m[2],
  m[3] * n[0] + m[4] * n[3], m[3] * n[1] + m[4] * n[4], m[3] * n[2] + m[4] * n[5] + m[5],
];
const rotAbout = (deg: number, px: number, py: number): M6 => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); // 正角度＝順時針
  return [c, -s, px - c * px + s * py, s, c, py - s * px - c * py];
};

// ---------- 動作（貓科；角度上限見規範第 8 節） ----------
const kf = (keys: [number, number][], u: number) => {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++)
    if (u <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      return v0 + (v1 - v0) * ((1 - Math.cos((Math.PI * (u - t0)) / (t1 - t0))) / 2);
    }
  return keys[keys.length - 1][1];
};
const wave = (t: number, period: number, delay = 0) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (t - delay)) / period);
type Act = 'look' | 'sniff' | 'flick';
const ACTS: Record<Act, { dur: number; f: (u: number) => Record<string, number> }> = {
  look: { dur: 2600, f: (u) => ({ head: kf([[0, 0], [0.25, -7], [0.45, -7], [0.6, -5], [0.75, -5], [1, 0]], u), neck: kf([[0, 0], [0.3, -3], [0.7, -3], [1, 0]], u), ear_near: kf([[0, 0], [0.3, -7], [0.7, -7], [1, 0]], u), ear_far: kf([[0, 0], [0.3, -7], [0.7, -7], [1, 0]], u) }) },
  sniff: { dur: 2000, f: (u) => ({ head: kf([[0, 0], [0.3, 13], [0.4, 10], [0.5, 13], [0.6, 10], [0.75, 12], [1, 0]], u), neck: kf([[0, 0], [0.3, 6], [0.75, 6], [1, 0]], u), jaw: kf([[0, 0], [0.4, 3], [0.6, 3], [1, 0]], u) }) },
  flick: { dur: 1000, f: (u) => ({ tail_1: kf([[0, 0], [0.25, -6], [0.6, 4], [1, 0]], u), tail_2: kf([[0, 0], [0.3, -9], [0.65, 6], [1, 0]], u), tail_3: kf([[0, 0], [0.35, -12], [0.7, 8], [1, 0]], u) }) },
};
const LEGS: [string, number][] = [['leg_front', 0], ['leg_back_far', 0], ['leg_back', 0.5], ['leg_front_far', 0.5]];

type State = { act: { name: Act; t0: number } | null; walking: boolean; walkT0: number };
function poseAt(t: number, st: State): Pose {
  const p: Pose = {};
  const br = wave(t, 3600);
  p.sy = 1 + 0.008 * br;
  p.head = -1.2 * br;
  p.tail_1 = -2 * wave(t, 3600);
  p.tail_2 = -3 * wave(t, 3600, 300);
  p.tail_3 = -4 * wave(t, 3600, 600);
  const eu = (t % 7000) / 7000;
  p.ear_near = kf([[0, 0], [0.86, 0], [0.89, -10], [0.92, 4], [0.95, -3], [1, 0]], eu);
  p.ear_far = kf([[0, 0], [0.87, 0], [0.9, -5], [0.93, 2], [1, 0]], eu);
  const bu = (t % 4300) / 4300;
  p.blink = bu > 0.95 && bu < 0.98 ? 1 : 0;
  if (st.act) {
    const u = Math.min(1, (t - st.act.t0) / ACTS[st.act.name].dur);
    for (const [k, v] of Object.entries(ACTS[st.act.name].f(u))) p[k] = (p[k] || 0) + v;
    if (u >= 1) st.act = null;
  }
  if (st.walking) {
    const u = ((t - st.walkT0) % 800) / 800;
    for (const [leg, ph] of LEGS) {
      const v = (u + ph) % 1; // 0→.5 往前擺（膝蓋收、腳掌抬），.5→1 踩地往後推
      p[`${leg}_upper`] = kf([[0, 6], [0.5, -6], [1, 6]], v);
      p[`${leg}_lower`] = kf([[0, 0], [0.25, 12], [0.5, -4], [0.75, 0], [1, 0]], v);
      p[`${leg}_paw`] = kf([[0, 8], [0.25, 10], [0.5, -6], [0.75, 0], [1, 8]], v);
    }
    p.ty = -4 * wave(t - st.walkT0, 400);
    p.head += -1.5 * wave(t - st.walkT0, 400);
    p.tail_2 += -3 * wave(t - st.walkT0, 800);
  }
  return p;
}

const STAGE_SCALE = [0.6, 0.8, 1]; // 和 Animal.tsx 一致
const PAD = 15; // 畫布比方形框多出的邊（％），尾巴、頭轉出去不會被切掉

/**
 * 會動的動物。walking：走路；auto：待機時每 3～6 秒隨機張望／低頭聞／甩尾巴；
 * smooth＝false（預設）是每秒 8 格的定格感，畫面沒變就不重畫，比較省電；paused：停在目前的樣子。
 */
export function MeshAnimal({ id, stage = 2, walking = false, auto = true, smooth = false, paused = false }: { id: string; stage?: number; walking?: boolean; auto?: boolean; smooth?: boolean; paused?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const { save } = useSave();
  const still = paused || save.settings.reducedMotion || prefersReducedMotion(); // 減少動態：停在待機姿勢
  const opts = useRef({ walking, auto, smooth, paused: still });
  opts.current = { walking, auto, smooth, paused: still };
  const k = STAGE_SCALE[Math.max(0, Math.min(2, stage))];

  useEffect(() => {
    // 每次都建新的畫布：舊的那張在清理時把 WebGL 還掉了（lost），不能再拿來用（開發模式 StrictMode 會跑兩次）
    const cv = document.createElement('canvas');
    box.current!.append(cv);
    const gl = cv.getContext('webgl', { premultipliedAlpha: true, antialias: true, alpha: true });
    if (!gl) return () => cv.remove();
    let dead = false, raf = 0;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const uni = (n: string) => gl.getUniformLocation(prog, n);
    const U = { A: uni('uA'), B: uni('uB'), view: uni('uView'), layer: uni('uLayer') };
    const attr = { pos: gl.getAttribLocation(prog, 'aPos'), bi: gl.getAttribLocation(prog, 'aBi'), bw: gl.getAttribLocation(prog, 'aBw') };
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const buf = (data: BufferSource, target: number = gl.ARRAY_BUFFER) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(target, b);
      gl.bufferData(target, data, gl.STATIC_DRAW);
      return b;
    };

    const st: State = { act: null, walking: false, walkT0: 0 };
    let nextAct = performance.now() + 3000 + Math.random() * 3000;
    let lastDrawn = -1;

    (async () => {
      const M = await loadMesh(id);
      const layers = await Promise.all(
        M.layers.map(async (L) => {
          const img = await loadImg(MESH_IMG[`${dir(id)}${L.name}.webp`]);
          if (dead) return null;
          const tex = gl.createTexture()!;
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          return { ...L, tex, pos: buf(dec(L.pos, Float32Array)), bi: buf(dec(L.bi, Uint8Array)), bw: buf(dec(L.bw, Float32Array)), tri: buf(dec(L.tri, Uint16Array), gl.ELEMENT_ARRAY_BUFFER) };
        }),
      );
      if (dead) return;

      // 版面對齊 AnimalArt：內容等比放進 100×93 的框、靠下置中，成長階段以地面 (50, 92) 為中心縮小
      const cx0 = Math.min(...M.layers.map((l) => l.x)), cx1 = Math.max(...M.layers.map((l) => l.x + l.w));
      const cy0 = Math.min(...M.layers.map((l) => l.y)), cy1 = Math.max(...M.layers.map((l) => l.y + l.h));
      const s = Math.min(100 / (cx1 - cx0), 93 / (cy1 - cy0));
      const left = (100 - (cx1 - cx0) * s) / 2, top = 93 - (cy1 - cy0) * s;
      const wx = (u: number) => cx0 + (50 + (u - 50) / k - left) / s;
      const wy = (v: number) => cy0 + (92 + (v - 92) / k - top) / s;
      const view = { x0: wx(-PAD), y0: wy(-PAD), w: wx(100 + PAD) - wx(-PAD), h: wy(100 + PAD) - wy(-PAD) };

      const draw = (pose: Pose) => {
        const world: Record<string, M6> = {};
        const A = new Float32Array(72), B = new Float32Array(72);
        M.bones.forEach((b, i) => {
          let m = rotAbout(pose[b.name] || 0, b.pivot[0], b.pivot[1]);
          if (b.name === 'body') m = mul([1, 0, 0, 0, pose.sy || 1, (1 - (pose.sy || 1)) * 1090 + (pose.ty || 0)], m); // 呼吸：以地面為基準
          const w = (world[b.name] = b.parent ? mul(world[b.parent], m) : m);
          A.set([w[0], w[1], w[2]], i * 3);
          B.set([w[3], w[4], w[5]], i * 3);
        });
        gl.viewport(0, 0, cv.width, cv.height);
        gl.uniform3fv(U.A, A);
        gl.uniform3fv(U.B, B);
        gl.uniform4f(U.view, view.x0, view.y0, 2 / view.w, 2 / view.h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        for (const L of layers) {
          if (!L || L.name === (pose.blink ? 'eye_open' : 'eye_closed')) continue;
          gl.uniform4f(U.layer, L.x, L.y, L.w, L.h);
          gl.bindTexture(gl.TEXTURE_2D, L.tex);
          for (const [a, b, n, t] of [[attr.pos, L.pos, 2, gl.FLOAT], [attr.bi, L.bi, 4, gl.UNSIGNED_BYTE], [attr.bw, L.bw, 4, gl.FLOAT]] as const) {
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.enableVertexAttribArray(a);
            gl.vertexAttribPointer(a, n, t, false, 0, 0);
          }
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, L.tri);
          gl.drawElements(gl.TRIANGLES, L.t * 3, gl.UNSIGNED_SHORT, 0);
        }
      };

      const frame = (now: number) => {
        if (dead) return;
        raf = requestAnimationFrame(frame);
        const o = opts.current;
        const w = Math.round(cv.clientWidth * devicePixelRatio), h = Math.round(cv.clientHeight * devicePixelRatio);
        if (cv.width !== w || cv.height !== h) {
          cv.width = w;
          cv.height = h;
          lastDrawn = -1;
        }
        if (o.paused) {
          if (lastDrawn < 0) {
            draw(poseAt(0, st));
            lastDrawn = 0;
          }
          return;
        }
        if (o.walking !== st.walking) {
          st.walking = o.walking;
          st.walkT0 = now;
          st.act = null;
        }
        if (o.auto && !st.walking && !st.act && now > nextAct) {
          st.act = { name: (['look', 'sniff', 'flick'] as Act[])[Math.floor(Math.random() * 3)], t0: now };
          nextAct = now + ACTS[st.act.name].dur + 3000 + Math.random() * 3000;
        }
        const t = o.smooth ? now : Math.floor(now / 125) * 125; // 定格感：每秒 8 格
        if (t !== lastDrawn) {
          draw(poseAt(t, st));
          lastDrawn = t;
        }
      };
      raf = requestAnimationFrame(frame);
    })().catch(() => {});

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      gl.getExtension('WEBGL_lose_context')?.loseContext(); // 馬上還掉 WebGL 資源（同時能開的數量有限）
      cv.remove();
    };
  }, [id, k]);

  return (
    <div className="mesh-animal" ref={box} aria-hidden="true">
      <svg viewBox="0 0 100 100" className="mesh-animal-shadow">
        <ellipse cx="50" cy="93" rx={30 * k} ry={4 * k} fill="#00000022" />
      </svg>
    </div>
  );
}
