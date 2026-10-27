// 觀察圖鑑的立體地圖（台灣、日本…）：低多邊形地形，動物站在牠的棲息地；可以拖曳旋轉、點動物看動物卡。
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { renderToStaticMarkup } from 'react-dom/server';
import { animalDef } from '../content/config';
import { AnimalArt, TrackArt } from '../components/Animal';
import { HEIGHT, colorAt, type Geo } from './geo';
import { useSvgTexture } from './svgTexture';

/** 依頂點的平面座標算貼圖座標（貼圖上緣是北）。 */
function setUV(g: THREE.BufferGeometry, geo: Geo, [w, s, e, n]: [number, number, number, number]) {
  const [x0, zN] = geo.project(w, n);
  const [x1, zS] = geo.project(e, s);
  const p = g.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) - x0) / (x1 - x0);
    uv[i * 2 + 1] = 1 - (p.getZ(i) - zN) / (zS - zN);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** 貼圖四邊淡出（只用綠色通道當透明度），海面和外圍的海接起來看不到方形的邊。 */
let edgeFade: THREE.CanvasTexture | null = null;
function fadeMask() {
  if (edgeFade) return edgeFade;
  const N = 64;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d')!;
  const img = x.createImageData(N, N);
  const ramp = (t: number) => Math.min(1, Math.max(0, t / 0.1)) ** 2;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      const v = (j + 0.5) / N;
      const a = Math.round(255 * ramp(Math.min(u, 1 - u)) * ramp(Math.min(v, 1 - v)));
      img.data.set([a, a, a, 255], (j * N + i) * 4);
    }
  x.putImageData(img, 0, 0);
  return (edgeFade = new THREE.CanvasTexture(c));
}

/** 有手繪貼圖的區域：整張貼圖鋪成海面（海浪、沙灘），地形也貼同一張，山脈的起伏保留。 */
function PaintedLand({ geo, terrain, art }: { geo: Geo; terrain: THREE.BufferGeometry; art: NonNullable<Geo['art']> }) {
  const invalidate = useThree((s) => s.invalidate);
  const tex = useMemo(() => {
    const t = new THREE.TextureLoader().load(art.src, () => invalidate());
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [art, invalidate]);
  useEffect(() => () => tex.dispose(), [tex]);
  const plane = useMemo(() => {
    const [w, s, e, n] = art.bounds;
    const [x0, zN] = geo.project(w, n);
    const [x1, zS] = geo.project(e, s);
    const g = new THREE.PlaneGeometry(x1 - x0, zS - zN);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0, (zN + zS) / 2);
    return g;
  }, [geo, art]);
  useMemo(() => setUV(terrain, geo, art.bounds), [terrain, geo, art]);
  return (
    <>
      <mesh geometry={plane} position={[0, -0.004, 0]}>
        <meshBasicMaterial map={tex} alphaMap={fadeMask()} transparent depthWrite={false} />
      </mesh>
      <mesh geometry={terrain}>
        <meshLambertMaterial map={tex} />
      </mesh>
    </>
  );
}

export interface MapPin {
  id: string; // 動物代號
  state: 'met' | 'open' | 'locked' | 'legend'; // 遇見過、可以去找、還找不到、傳說（沒有確切紀錄）
  stage: number;
}

/**
 * 地形：四個角都在島內的格子才畫，每個角依高度抬起、上色（平面著色，低多邊形風格）。
 * 海岸線用整個輪廓做一片平地墊在下面，邊緣才是平滑的、不會是鋸齒格子。
 */
const terrainCache = new Map<string, THREE.BufferGeometry>(); // 地形不會變，切換分頁回來不用重算
function useTerrain(geo: Geo) {
  return useMemo(() => {
    let g = terrainCache.get(geo.id);
    if (!g) terrainCache.set(geo.id, (g = buildTerrain(geo)));
    return g;
  }, [geo]);
}
function buildTerrain({ bounds: [west, south, east, north], step, inside, heightAt, project }: Geo) {
  {
    // 每個格點只判斷一次在不在島內（四個角共用）
    const cols = Math.ceil((east - west) / step) + 1;
    const rows = Math.ceil((north - south) / step) + 1;
    const ins: boolean[] = [];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) ins.push(inside(west + i * step, south + j * step));
    const at = (i: number, j: number) => ins[i * rows + j];
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    const vert = (lon: number, lat: number) => {
      const h = heightAt(lon, lat);
      const [x, z] = project(lon, lat);
      pos.push(x, h * HEIGHT, z);
      c.setRGB(...colorAt(h), THREE.SRGBColorSpace); // 頂點顏色要換成線性色彩，不然會偏白
      col.push(c.r, c.g, c.b);
    };
    for (let i = 0; i < cols - 1; i++)
      for (let j = 0; j < rows - 1; j++) {
        if (!(at(i, j) && at(i + 1, j) && at(i, j + 1) && at(i + 1, j + 1))) continue;
        const lon = west + i * step;
        const lat = south + j * step;
        // 兩個三角形（逆時針，法線朝上）
        vert(lon, lat);
        vert(lon + step, lat);
        vert(lon, lat + step);
        vert(lon + step, lat);
        vert(lon + step, lat + step);
        vert(lon, lat + step);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }
}

/** 平滑的海岸線：每座島的輪廓（平地）。 */
function useCoast(geo: Geo) {
  return useMemo(() => {
    const shapes = geo.outlines.map((o) => new THREE.Shape(o.map(([lon, lat]) => new THREE.Vector2(...geo.project(lon, lat)))));
    const g = new THREE.ShapeGeometry(shapes);
    g.rotateX(Math.PI / 2); // 平面座標的 y 是南北（z）
    return g;
  }, [geo]);
}

/** 拖曳旋轉：左右轉、上下傾斜，各最多 35 度；只在有變化時重畫。 */
const MAX_TURN = (35 * Math.PI) / 180;
const clampTurn = (r: number) => Math.max(-MAX_TURN, Math.min(MAX_TURN, r));

function DragRotate({ target }: { target: React.RefObject<THREE.Group | null> }) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    let last: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => (last = { x: e.clientX, y: e.clientY });
    const move = (e: PointerEvent) => {
      const g = target.current;
      if (!last || !g) return;
      // 左右、上下各最多轉 35 度
      g.rotation.y = clampTurn(g.rotation.y + (e.clientX - last.x) * 0.008);
      g.rotation.x = clampTurn(g.rotation.x + (e.clientY - last.y) * 0.008);
      last = { x: e.clientX, y: e.clientY };
      invalidate();
    };
    const up = () => (last = null);
    // 剛打開、或從背景回來時多畫一次（畫面在背景時第一張可能沒畫到）
    const first = window.setTimeout(() => invalidate(), 400);
    const visible = () => document.visibilityState === 'visible' && invalidate();
    document.addEventListener('visibilitychange', visible);
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up); // 瀏覽器接手捲動時
    return () => {
      clearTimeout(first);
      document.removeEventListener('visibilitychange', visible);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [gl, invalidate, target]);
  return null;
}

function Pin({ geo, pin, onSelect }: { geo: Geo; pin: MapPin; onSelect: (id: string) => void }) {
  const a = animalDef(pin.id);
  const [x, z] = geo.project(a.habitat.lon, a.habitat.lat);
  const y = geo.heightAt(a.habitat.lon, a.habitat.lat) * HEIGHT;
  const tex = useSvgTexture(pin.state === 'met' ? `animal:${a.id}:${pin.stage}` : `track:${a.id}`, () =>
    renderToStaticMarkup(pin.state === 'met' ? <AnimalArt id={a.id} stage={pin.stage} size={256} /> : <TrackArt id={a.id} size={256} />),
  );
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return; // 拖曳旋轉，不算點擊
    onSelect(a.id);
  };
  const s = pin.state === 'met' ? 0.52 : 0.38;
  const ring = { met: '#ffd77a', open: '#ffffff', locked: '#8a8579', legend: '#d9dde0' }[pin.state];
  return (
    <group position={[x, y, z]} onClick={click}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <circleGeometry args={[0.07, 20]} />
        <meshBasicMaterial color={ring} transparent opacity={pin.state === 'locked' ? 0.5 : 0.9} />
      </mesh>
      {/* 點擊範圍：比圖示大一圈，手指比較好點 */}
      <mesh position={[0, s / 2, 0]}>
        <sphereGeometry args={[0.38, 8, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {pin.state === 'legend' && (
        <mesh position={[0, 0.12, 0]}>
          <sphereGeometry args={[0.17, 16, 12]} />
          <meshBasicMaterial color="#f4f6f7" transparent opacity={0.5} depthWrite={false} />
        </mesh>
      )}
      {tex && (
        <sprite scale={[s, s, 1]} position={[0, s / 2 - s * 0.08, 0]}>
          <spriteMaterial map={tex} transparent depthWrite={false} opacity={pin.state === 'locked' ? 0.45 : pin.state === 'legend' ? 0.35 : 1} />
        </sprite>
      )}
    </group>
  );
}

export default function RegionMap3D({ geo, pins, onSelect }: { geo: Geo; pins: MapPin[]; onSelect: (id: string) => void }) {
  const terrain = useTerrain(geo);
  const coast = useCoast(geo);
  const group = useRef<THREE.Group>(null);
  const art = geo.art;
  return (
    <Canvas flat={!!art} frameloop="demand" dpr={[1, 1.5]} camera={{ fov: 36, position: [0, 7.2, 3.6], near: 0.1, far: 50 }} gl={{ antialias: true, powerPreference: 'low-power' }} aria-label={`立體${geo.name}地圖`}>
      <color attach="background" args={[art ? '#31c4f3' : '#bfe0e6']} />
      <hemisphereLight args={['#fff6e0', '#6f8f7a', 1.1]} />
      <directionalLight position={[3, 6, 2]} intensity={1.3} color="#fff2d8" />
      <group ref={group} position={[0, 0, -0.35]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <circleGeometry args={[3.4, 48]} />
          <meshBasicMaterial color={art ? '#31c4f3' : '#8fc6cf'} />
        </mesh>
        {art ? (
          <PaintedLand geo={geo} terrain={terrain} art={art} />
        ) : (
          <>
            <mesh geometry={coast} position={[0, -0.002, 0]}>
              <meshLambertMaterial color="#b7d49a" side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={terrain}>
              <meshLambertMaterial vertexColors flatShading />
            </mesh>
          </>
        )}
        {pins.map((p) => (
          <Pin key={p.id} geo={geo} pin={p} onSelect={onSelect} />
        ))}
      </group>
      <DragRotate target={group} />
    </Canvas>
  );
}
