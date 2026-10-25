// 觀察圖鑑的立體台灣：低多邊形地形，動物站在牠的棲息地；可以拖曳旋轉、點動物看動物卡。
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { renderToStaticMarkup } from 'react-dom/server';
import { animalDef } from '../content/config';
import { AnimalArt, TrackArt } from '../components/Animal';
import { HEIGHT, OUTLINE, colorAt, heightAt, inside, project } from './taiwanGeo';
import { useSvgTexture } from './svgTexture';

export interface MapPin {
  id: string; // 動物代號
  state: 'met' | 'open' | 'locked' | 'legend'; // 遇見過、可以去找、還找不到、傳說（沒有確切紀錄）
  stage: number;
}

/**
 * 地形：四個角都在島內的格子才畫，每個角依高度抬起、上色（平面著色，低多邊形風格）。
 * 海岸線用整個輪廓做一片平地墊在下面，邊緣才是平滑的、不會是鋸齒格子。
 */
let terrainCache: THREE.BufferGeometry | null = null; // 地形不會變，切換分頁回來不用重算
function useTerrain() {
  return useMemo(() => (terrainCache ??= buildTerrain()), []);
}
function buildTerrain() {
  {
    const step = 0.018;
    // 每個格點只判斷一次在不在島內（四個角共用）
    const cols = Math.ceil((122.0 - 119.98) / step) + 1;
    const rows = Math.ceil((25.32 - 21.88) / step) + 1;
    const ins: boolean[] = [];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) ins.push(inside(119.98 + i * step, 21.88 + j * step));
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
        const lon = 119.98 + i * step;
        const lat = 21.88 + j * step;
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

/** 平滑的海岸線：整個島的輪廓（平地）。 */
function useCoast() {
  return useMemo(() => {
    const shape = new THREE.Shape(OUTLINE.map(([lon, lat]) => new THREE.Vector2(...project(lon, lat))));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2); // 平面座標的 y 是南北（z）
    return g;
  }, []);
}

/** 左右拖曳旋轉（上下滑交給頁面捲動）；只在有變化時重畫。 */
function DragRotate({ target }: { target: React.RefObject<THREE.Group | null> }) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    let last: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => (last = { x: e.clientX, y: e.clientY });
    const move = (e: PointerEvent) => {
      const g = target.current;
      if (!last || !g) return;
      g.rotation.y += (e.clientX - last.x) * 0.008;
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

function Pin({ pin, onSelect }: { pin: MapPin; onSelect: (id: string) => void }) {
  const a = animalDef(pin.id);
  const [x, z] = project(a.habitat.lon, a.habitat.lat);
  const y = heightAt(a.habitat.lon, a.habitat.lat) * HEIGHT;
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

export default function TaiwanMap3D({ pins, onSelect }: { pins: MapPin[]; onSelect: (id: string) => void }) {
  const terrain = useTerrain();
  const coast = useCoast();
  const group = useRef<THREE.Group>(null);
  return (
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ fov: 36, position: [0, 7.2, 3.6], near: 0.1, far: 50 }} gl={{ antialias: true, powerPreference: 'low-power' }} aria-label="立體台灣地圖">
      <color attach="background" args={['#bfe0e6']} />
      <hemisphereLight args={['#fff6e0', '#6f8f7a', 1.1]} />
      <directionalLight position={[3, 6, 2]} intensity={1.3} color="#fff2d8" />
      <group ref={group} position={[0, 0, -0.35]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <circleGeometry args={[3.4, 48]} />
          <meshLambertMaterial color="#8fc6cf" />
        </mesh>
        <mesh geometry={coast} position={[0, -0.002, 0]}>
          <meshLambertMaterial color="#b7d49a" side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={terrain}>
          <meshLambertMaterial vertexColors flatShading />
        </mesh>
        {pins.map((p) => (
          <Pin key={p.id} pin={p} onSelect={onSelect} />
        ))}
      </group>
      <DragRotate target={group} />
    </Canvas>
  );
}
