// 原創低多邊形 3D 棲地：場景物件由工程狀態推導；住在島上的只有領養的寵物
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { renderToStaticMarkup } from 'react-dom/server';
import { PetArt, faceArtUrl, petArtUrl } from '../components/PetArt';
import type { HabitatId } from '../domain/types';

export interface SceneProps {
  habitatId: HabitatId;
  done: (projectId: string) => boolean;
  prog?: (projectId: string) => number; // 工程進度，切成 0／0.25／0.5／0.75／1，中途就讓場景有一點變化
  reducedMotion: boolean;
  onSelect?: (speciesId: string) => void;
  onSlow?: () => void;
  backdrop?: boolean; // 專注畫面的全螢幕背景：場景往上移，留出下方放倒數泡泡
  bubble?: boolean; // 大廳的圓形泡泡：鏡頭拉近
  lowPower?: boolean; // 省電：每秒只畫 12 張、解析度降到 1 倍（專注背景、大廳泡泡用）
  pets?: ScenePet[]; // 住在這個場景的寵物（點擊回傳 pet:{id}）
  facilities?: string[]; // 已購買的設施
}

const C = {
  cream: '#f3ecdc',
  stone: '#e3d7bf',
  wood: '#c9a77c',
  woodDark: '#a5845d',
  sage: '#8fb38a',
  sageDark: '#6f9a6e',
  grass: '#a9c99a',
  soil: '#8a6c4f',
  dry: '#b59f7f',
  water: '#8fd0d8',
  murky: '#9fb3a0',
  glass: '#dff0ea',
};
const FLOWER = ['#f2a7a0', '#f6d06f', '#f7f2e6', '#e98a6b', '#c9a0dc'];

const Mat = ({ color, opacity }: { color: string; opacity?: number }) => (
  <meshLambertMaterial color={color} transparent={opacity !== undefined} opacity={opacity ?? 1} depthWrite={opacity === undefined} />
);
const noHit = () => null;

/** 黃金角分佈的穩定位置，避免每次重繪跳動。 */
function spread(n: number, r: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = i * 2.39996;
    const d = r * Math.sqrt((i + 0.5) / n);
    return [Math.cos(a) * d, Math.sin(a) * d] as const;
  });
}

// ---------- 共用：鏡頭、效能、可點生物 ----------

/** raise：把畫面內容往上推（佔畫面高度的比例）。 */
function FitCamera({ dist, raise = 0 }: { dist: number; raise?: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const k = Math.min(1.9, Math.max(1, 1.25 / (size.width / size.height)));
    camera.position.set(0, 6.2 * k * (dist / 10), 9.4 * k * (dist / 10));
    camera.lookAt(0, 0.7, 0);
    const cam = camera as THREE.PerspectiveCamera;
    if (raise) cam.setViewOffset(size.width, size.height, 0, size.height * raise, size.width, size.height);
    else cam.clearViewOffset();
  }, [camera, size, dist, raise]);
  return null;
}

/** 暖機 1.5 秒後量 5 秒，平均低於 15fps 視為效能不足，交給外層降級成 2D。
 *  超過 0.5 秒的單幀（分頁被節流、切換視窗）不計入。 */
function PerfWatch({ onSlow }: { onSlow?: () => void }) {
  const acc = useRef({ warm: 0, t: 0, n: 0, done: false });
  useFrame((_, dt) => {
    const a = acc.current;
    if (a.done || !onSlow || dt > 0.5) return;
    if (a.warm < 1.5) return void (a.warm += dt);
    a.t += dt;
    a.n++;
    if (a.t > 5) {
      a.done = true;
      if (a.n / a.t < 15) onSlow();
    }
  });
  return null;
}

/** 事件會從子物件冒泡到這一層 */
function Pick({ id, onSelect, children }: { id: string; onSelect?: (id: string) => void; children: ReactNode }) {
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect?.(id);
  };
  return (
    <group onClick={click} onPointerOver={() => onSelect && (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
      {children}
    </group>
  );
}

type Anim = (g: THREE.Group, t: number) => void;
function useAnim(still: boolean, fn: Anim) {
  const ref = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    if (!still && ref.current) fn(ref.current, clock.elapsedTime);
  });
  useEffect(() => {
    if (ref.current) fn(ref.current, 1.3); // 低動態：停在自然姿勢
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

// ---------- 寵物（2D 圖片，永遠面向鏡頭）與設施 ----------

export interface ScenePet {
  id: string;
  typeId: string;
  art?: boolean;
  stage: number;
  face: number;
  grow?: number; // 0～1：目前階段裡長大了多少
}

/** 每個場景最多 5 隻，依領養順序放在固定位置。 */
const PET_SPOTS: Record<string, [number, number, number][]> = {
  greenhouse: [[-1.9, 0.1, 2.0], [1.9, 0.1, 2.0], [-1.6, 0.1, -1.9], [1.7, 0.1, -2.0], [-3.6, 0.1, -0.8]],
  stream: [[-1.4, 0.3, 1.5], [0.4, 0.3, 1.6], [-3.4, 0.3, -1.6], [1.0, 0.3, -1.6], [-4.6, 0.3, 1.6]],
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** 把寵物圖（美術圖疊圖，或臨時 SVG）畫成貼圖。 */
function usePetTexture(p: ScenePet) {
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    let alive = true;
    const urls = p.art
      ? [petArtUrl(p.typeId, p.stage), ...(p.stage > 0 ? [faceArtUrl(p.typeId, p.stage, p.face)] : [])]
      : [`data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderToStaticMarkup(<PetArt id={p.typeId} stage={p.stage} face={p.face} size={256} />))}`];
    Promise.all(urls.map(loadImage))
      .then((imgs) => {
        if (!alive) return;
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const g = c.getContext('2d')!;
        for (const img of imgs) g.drawImage(img, 0, 0, 256, 256);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        setTex(t);
      })
      .catch(() => undefined); // 圖檔缺漏時不顯示，不影響場景
    return () => {
      alive = false;
    };
  }, [p.typeId, p.art, p.stage, p.face]);
  return tex;
}

function PetSprite({ pet, spot, still, onSelect }: { pet: ScenePet; spot: [number, number, number]; still: boolean; onSelect?: (id: string) => void }) {
  const tex = usePetTexture(pet);
  const phase = pet.id.length + spot[0];
  const ref = useAnim(still, (g, t) => {
    g.position.y = Math.abs(Math.sin(t * 1.4 + phase)) * 0.05; // 輕輕彈跳
    g.scale.y = 1 + Math.sin(t * 2.2 + phase) * 0.02; // 呼吸
  });
  const s = [0.6, 0.85, 1, 1.15][pet.stage] * 1.5 * (1 + 0.15 * (pet.grow ?? 0));
  return (
    <Pick id={`pet:${pet.id}`} onSelect={onSelect}>
      <group position={spot}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} raycast={noHit}>
          <circleGeometry args={[s * 0.32, 16]} />
          <meshBasicMaterial color="#2f4a36" transparent opacity={0.14} depthWrite={false} />
        </mesh>
        <group ref={ref}>
          {tex && (
            // 美術規格：腳底在畫布 472/512 處，往下補回 40px 的留白，讓腳踩在地上
            <sprite scale={[s, s, 1]} position={[0, s / 2 - s * (40 / 512), 0]}>
              <spriteMaterial map={tex} transparent depthWrite={false} />
            </sprite>
          )}
        </group>
      </group>
    </Pick>
  );
}

function Facility({ id }: { id: string }) {
  switch (id) {
    case 'gh_trellis':
      return (
        <group position={[-2.3, 0.1, -2.7]}>
          {[-0.6, 0.6].map((x) => (
            <mesh key={x} position={[x, 0.7, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 1.4, 6]} />
              <Mat color={C.wood} />
            </mesh>
          ))}
          <mesh position={[0, 1.4, 0]}>
            <torusGeometry args={[0.6, 0.05, 6, 20, Math.PI]} />
            <Mat color={C.wood} />
          </mesh>
          {[0.3, 0.9, 1.5, 2.1, 2.7].map((a, i) => (
            <Flower key={a} p={[Math.cos(a) * 0.6, 1.4 + Math.sin(a) * 0.6 - 0.14, 0]} color={FLOWER[i % FLOWER.length]} h={0.1} />
          ))}
        </group>
      );
    case 'gh_nestbox':
      return (
        <group position={[3.5, 1.9, -2.55]}>
          <mesh>
            <boxGeometry args={[0.36, 0.42, 0.32]} />
            <Mat color={C.wood} />
          </mesh>
          <mesh position={[0, 0.27, 0]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.32, 0.32, 0.38]} />
            <Mat color={C.woodDark} />
          </mesh>
          <mesh position={[0, 0.02, 0.17]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.02, 12]} />
            <Mat color="#3a3128" />
          </mesh>
        </group>
      );
    case 'gh_basket':
      return (
        <group position={[-1.4, 2.6, -4.1]}>
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.01, 0.01, 1, 4]} />
            <Mat color={C.woodDark} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.3, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
            <Mat color={C.wood} />
          </mesh>
          <Bush p={[0, -0.12, 0]} s={0.5} />
          <Flower p={[0.12, 0, 0.1]} color={FLOWER[3]} h={0.12} />
        </group>
      );
    case 'gh_planter':
      return (
        <group position={[3.3, 0.1, 2.5]}>
          <mesh position={[0, 0.35, 0]}>
            <boxGeometry args={[1, 0.3, 0.5]} />
            <Mat color={C.wood} />
          </mesh>
          {[-0.4, 0.4].map((x) => (
            <mesh key={x} position={[x, 0.12, 0]}>
              <boxGeometry args={[0.08, 0.25, 0.4]} />
              <Mat color={C.woodDark} />
            </mesh>
          ))}
          {[-0.3, 0, 0.3].map((x, i) => (
            <Bush key={x} p={[x, 0.45, 0]} s={0.35} color={i % 2 ? C.sage : C.sageDark} />
          ))}
        </group>
      );
    case 'st_pond':
      return (
        <group position={[-3.8, 0.3, 2.7]}>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.6, 0.6, 0.02, 20]} />
            <Mat color={C.water} />
          </mesh>
          {Array.from({ length: 9 }, (_, i) => (i / 9) * Math.PI * 2).map((a) => (
            <Rock key={a} p={[Math.cos(a) * 0.68, 0.04, Math.sin(a) * 0.68]} s={0.12} />
          ))}
        </group>
      );
    case 'st_rocks':
      return (
        <group position={[-0.8, 0.3, -2.3]}>
          <Rock p={[0, 0.12, 0]} s={0.35} />
          <Rock p={[0.4, 0.08, 0.15]} s={0.24} />
          <Rock p={[-0.35, 0.06, 0.2]} s={0.2} />
        </group>
      );
    case 'st_reeds':
      return (
        <group position={[4.6, 0.3, 1.9]}>
          {spread(9, 0.4).map(([x, z], i) => (
            <mesh key={i} position={[x, 0.5, z]} rotation={[0, 0, (i % 3 - 1) * 0.1]}>
              <cylinderGeometry args={[0.02, 0.03, 1, 5]} />
              <Mat color={C.sageDark} />
            </mesh>
          ))}
        </group>
      );
    case 'st_log':
      return (
        <mesh position={[4.2, 0.42, -2.1]} rotation={[0, 0.4, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.18, 1.6, 10]} />
          <Mat color={C.woodDark} />
        </mesh>
      );
    default:
      return null;
  }
}

// ---------- 場景物件 ----------

function Tree({ p, s = 1 }: { p: [number, number, number]; s?: number }) {
  return (
    <group position={p} scale={s}>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 1.2, 8]} />
        <Mat color={C.woodDark} />
      </mesh>
      <mesh position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.85, 14, 12]} />
        <Mat color={C.sageDark} />
      </mesh>
      <mesh position={[0.35, 1.25, 0.25]}>
        <sphereGeometry args={[0.55, 12, 10]} />
        <Mat color={C.sage} />
      </mesh>
    </group>
  );
}

function Flower({ p, color, h = 0.35 }: { p: [number, number, number]; color: string; h?: number }) {
  return (
    <group position={p}>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.015, 0.015, h, 4]} />
        <Mat color={C.sageDark} />
      </mesh>
      <mesh position={[0, h, 0]} scale={[1, 0.6, 1]}>
        <sphereGeometry args={[0.14, 8, 6]} />
        <Mat color={color} />
      </mesh>
    </group>
  );
}

function Bush({ p, s = 1, color = C.sage }: { p: [number, number, number]; s?: number; color?: string }) {
  return (
    <group position={p} scale={s}>
      <mesh position={[0, 0.25, 0]}>
        <sphereGeometry args={[0.38, 12, 10]} />
        <Mat color={color} />
      </mesh>
      <mesh position={[0.28, 0.18, 0.12]}>
        <sphereGeometry args={[0.26, 10, 8]} />
        <Mat color={C.sageDark} />
      </mesh>
      <mesh position={[-0.25, 0.16, 0.1]}>
        <sphereGeometry args={[0.24, 10, 8]} />
        <Mat color={color} />
      </mesh>
    </group>
  );
}

function Rock({ p, s = 0.3 }: { p: [number, number, number]; s?: number }) {
  return (
    <mesh position={p} scale={[s, s * 0.7, s]}>
      <dodecahedronGeometry args={[1, 0]} />
      <Mat color="#b8ad99" />
    </mesh>
  );
}

function Water({ y, still, color, opacity, children }: { y: number; still: boolean; color: string; opacity: number; children: ReactNode }) {
  const ref = useAnim(still, (g, t) => {
    g.scale.setScalar(1 + Math.sin(t * 1.5) * 0.004);
  });
  return (
    <group ref={ref} position={[0, y, 0]}>
      <mesh raycast={noHit}>
        {children}
        <Mat color={color} opacity={opacity} />
      </mesh>
    </group>
  );
}

type Progress = { done: (id: string) => boolean; prog: (id: string) => number; still: boolean };

function Greenhouse({ done, prog, still }: Progress) {
  const R = 4.8;
  const pillars = [0, 1, 2, 3, 4, 5].map((i) => (i / 5) * Math.PI);
  const flowers = useMemo(() => spread(14, 0.8), []);
  const leafs = useMemo(() => spread(7, 0.75), []);
  const jet = useAnim(still, (g, t) => {
    g.scale.y = 1 + Math.sin(t * 3) * 0.06;
  });
  const fountainOn = done('gh_fountain');
  const fq = prog('gh_fountain');
  const flowerCount = done('gh_flowers') ? flowers.length : Math.floor(flowers.length * prog('gh_flowers'));
  const leafCount = done('gh_plants') ? leafs.length : Math.floor(leafs.length * prog('gh_plants'));
  return (
    <group>
      {/* 戶外草地與遠景樹 */}
      <mesh position={[0, -0.15, 0]} raycast={noHit}>
        <cylinderGeometry args={[16, 16, 0.1, 40]} />
        <Mat color={C.grass} />
      </mesh>
      <Tree p={[-6.5, 0, -6.5]} s={1.4} />
      <Tree p={[-2.5, 0, -8.5]} s={1.7} />
      <Tree p={[3.5, 0, -8]} s={1.5} />
      <Tree p={[7, 0, -5]} s={1.3} />

      {/* 溫室地板、柱子、玻璃（後半剖面，讓 3/4 視角看得到內部） */}
      <mesh position={[0, 0, 0]} raycast={noHit}>
        <cylinderGeometry args={[R + 0.2, R + 0.3, 0.2, 40]} />
        <Mat color={C.cream} />
      </mesh>
      {pillars.map((a) => (
        <mesh key={a} position={[Math.cos(a) * R, 1.6, -Math.sin(a) * R]}>
          <cylinderGeometry args={[0.14, 0.17, 3.2, 10]} />
          <Mat color="#f6f1e6" />
        </mesh>
      ))}
      {[3.2, 1.6].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[R, y > 2 ? 0.09 : 0.04, 6, 40, Math.PI]} />
          <Mat color="#f6f1e6" />
        </mesh>
      ))}
      <mesh position={[0, 1.6, 0]} raycast={noHit}>
        <cylinderGeometry args={[R - 0.02, R - 0.02, 3.2, 32, 1, true, Math.PI / 2, Math.PI]} />
        <meshLambertMaterial color={C.glass} transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, 3.2, 0]} scale={[1, 0.5, 1]} raycast={noHit}>
        <sphereGeometry args={[R, 32, 10, Math.PI, Math.PI, 0, Math.PI / 2]} />
        <meshLambertMaterial color={C.glass} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* gh_entrance：入口小徑與花盆 */}
      {done('gh_entrance') ? (
        <group>
          {[4.6, 3.9, 3.2, 2.5].map((z, i) => (
            <mesh key={z} position={[i % 2 ? 0.15 : -0.15, 0.12, z]}>
              <cylinderGeometry args={[0.36, 0.38, 0.05, 14]} />
              <Mat color={C.stone} />
            </mesh>
          ))}
          {[-1.3, 1.3].map((x) => (
            <group key={x} position={[x, 0.1, 4.1]}>
              <mesh position={[0, 0.22, 0]}>
                <cylinderGeometry args={[0.3, 0.22, 0.44, 12]} />
                <Mat color="#d39a77" />
              </mesh>
              <Bush p={[0, 0.3, 0]} s={0.6} />
              <Flower p={[0.1, 0.5, 0.1]} color={FLOWER[1]} h={0.25} />
            </group>
          ))}
        </group>
      ) : (
        <group>
          <Rock p={[-0.5, 0.2, 3.9]} s={0.32} />
          <Rock p={[0.6, 0.2, 3.3]} s={0.26} />
          <Rock p={[1.4, 0.18, 4.3]} s={0.22} />
          {[[-1, 3, 0.6], [0.2, 4.4, -0.4], [1.1, 2.8, 1.2]].map(([x, z, r]) => (
            <mesh key={x} position={[x, 0.15, z]} rotation={[Math.PI / 2, 0, r]}>
              <cylinderGeometry args={[0.03, 0.04, 0.9, 5]} />
              <Mat color={C.dry} />
            </mesh>
          ))}
        </group>
      )}

      {/* 噴泉 */}
      <group>
        <mesh position={[0, 0.32, 0]}>
          <cylinderGeometry args={[1.4, 1.5, 0.45, 32]} />
          <Mat color={C.stone} />
        </mesh>
        {fountainOn ? (
          <Water y={0.33} still={still} color={C.water} opacity={0.85}>
            <cylinderGeometry args={[1.22, 1.22, 0.47, 32]} />
          </Water>
        ) : (
          <>
            <mesh position={[0, 0.33, 0]}>
              <cylinderGeometry args={[1.22, 1.22, 0.46, 32]} />
              <Mat color={fq >= 0.25 ? '#ddd2bc' : '#cdbfa3'} />
            </mesh>
            {fq >= 0.5 && (
              <mesh position={[0, 0.57, 0]} raycast={noHit}>
                <cylinderGeometry args={[1.2 * fq, 1.2 * fq, 0.02, 32]} />
                <Mat color={C.water} opacity={0.8} />
              </mesh>
            )}
          </>
        )}
        <mesh position={[0, 0.95, 0]}>
          <cylinderGeometry args={[0.18, 0.28, 1.1, 14]} />
          <Mat color={C.stone} />
        </mesh>
        <mesh position={[0, 1.55, 0]}>
          <cylinderGeometry args={[0.62, 0.3, 0.25, 20]} />
          <Mat color={C.stone} />
        </mesh>
        <mesh position={[0, 1.8, 0]}>
          <sphereGeometry args={[0.14, 12, 10]} />
          <Mat color={C.stone} />
        </mesh>
        {fountainOn && (
          <group ref={jet}>
            <mesh position={[0, 1.1, 0]} raycast={noHit}>
              <cylinderGeometry args={[0.64, 1.1, 0.85, 24, 1, true]} />
              <meshLambertMaterial color="#d8f1f3" transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh position={[0, 2.05, 0]} raycast={noHit}>
              <cylinderGeometry args={[0.02, 0.05, 0.4, 8]} />
              <meshLambertMaterial color="#d8f1f3" transparent opacity={0.6} depthWrite={false} />
            </mesh>
          </group>
        )}
      </group>

      {/* 左花圃：gh_flowers */}
      <group position={[-2.8, 0, 0.6]}>
        <mesh position={[0, 0.25, 0]}>
          <cylinderGeometry args={[1.1, 1.15, 0.35, 24]} />
          <Mat color={C.stone} />
        </mesh>
        <mesh position={[0, 0.43, 0]}>
          <cylinderGeometry args={[1, 1, 0.02, 24]} />
          <Mat color={C.soil} />
        </mesh>
        {flowerCount > 0
          ? flowers.slice(0, flowerCount).map(([x, z], i) => <Flower key={i} p={[x, 0.43, z]} color={FLOWER[i % FLOWER.length]} h={0.25 + (i % 3) * 0.07} />)
          : [[-0.3, 0.2], [0.35, -0.2], [0.1, 0.45]].map(([x, z]) => (
              <mesh key={x} position={[x, 0.55, z]} rotation={[0.3, 0, x]}>
                <cylinderGeometry args={[0.015, 0.02, 0.25, 4]} />
                <Mat color={C.dry} />
              </mesh>
            ))}
      </group>

      {/* 右花圃與葉叢：gh_plants */}
      <group position={[2.8, 0, 0.6]}>
        <mesh position={[0, 0.25, 0]}>
          <cylinderGeometry args={[1.1, 1.15, 0.35, 24]} />
          <Mat color={C.stone} />
        </mesh>
        <mesh position={[0, 0.43, 0]}>
          <cylinderGeometry args={[1, 1, 0.02, 24]} />
          <Mat color={C.soil} />
        </mesh>
        {leafCount > 0 ? (
          <>
            {leafs.slice(0, leafCount).map(([x, z], i) => (
              <mesh key={i} position={[x, 0.6, z]} rotation={[0.5, i, 0]} scale={[1, 0.25, 0.6]}>
                <sphereGeometry args={[0.35, 10, 8]} />
                <Mat color={i % 2 ? C.sage : C.sageDark} />
              </mesh>
            ))}
            {done('gh_plants') && <Flower p={[0.2, 0.43, -0.4]} color={FLOWER[4]} h={0.45} />}
          </>
        ) : (
          <Flower p={[0, 0.43, 0]} color={C.sage} h={0.12} />
        )}
      </group>
      {done('gh_plants') && (
        <group>
          <Bush p={[-3.4, 0.1, -2.6]} s={1.3} />
          <Bush p={[0, 0.1, -3.8]} s={1.5} />
          <Bush p={[3.4, 0.1, -2.6]} s={1.2} color={C.sageDark} />
          {[1, 4].map((i) => {
            const a = pillars[i];
            return (
              <group key={i} position={[Math.cos(a) * (R - 0.45), 2.3, -Math.sin(a) * (R - 0.45)]}>
                <mesh>
                  <sphereGeometry args={[0.3, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
                  <Mat color={C.wood} />
                </mesh>
                <Bush p={[0, -0.15, 0]} s={0.55} />
              </group>
            );
          })}
        </group>
      )}
      {done('gh_flowers') && !done('gh_plants') && <Bush p={[0, 0.1, -3.8]} s={0.9} />}

    </group>
  );
}

function Stream({ done, prog, still }: Progress) {
  const clear = done('st_water');
  const wq = prog('st_water'); // 淺水區：越整理越清澈、漂流物越少
  const reedCount = done('st_bank') ? Infinity : Math.floor(16 * prog('st_bank'));
  const planks = done('st_bridge') ? 9 : Math.floor(9 * prog('st_bridge'));
  const reeds = useMemo(() => [...spread(9, 1).map(([x, z]) => [x * 2 - 3, z * 0.4 + 1.35] as const), ...spread(7, 1).map(([x, z]) => [x * 2 + 1, z * 0.3 - 1.35] as const)], []);
  return (
    <group>
      {/* 溪床、兩岸、水面 */}
      <mesh position={[0, -0.25, 0]} raycast={noHit}>
        <boxGeometry args={[16, 0.2, 3]} />
        <Mat color={clear ? '#cdbb98' : '#8f8466'} />
      </mesh>
      <mesh position={[0, 0, 4.5]} raycast={noHit}>
        <boxGeometry args={[16, 0.6, 7]} />
        <Mat color={C.grass} />
      </mesh>
      <mesh position={[0, 0, -4.5]} raycast={noHit}>
        <boxGeometry args={[16, 0.6, 7]} />
        <Mat color={C.grass} />
      </mesh>
      <Water y={0.08} still={still} color={clear ? C.water : wq >= 0.5 ? '#97c2bd' : C.murky} opacity={clear ? 0.72 : wq >= 0.5 ? 0.85 : 0.92}>
        <boxGeometry args={[16, 0.02, 2.2]} />
      </Water>
      {!clear && [[-2, 0.3], [1.5, -0.4], [4, 0.2]].slice(0, 3 - Math.floor(wq * 4)).map(([x, z]) => (
        <mesh key={x} position={[x, 0.08, z]} rotation={[0, x, 0]}>
          <boxGeometry args={[0.5, 0.06, 0.18]} />
          <Mat color={C.woodDark} />
        </mesh>
      ))}
      {clear && [[-4, 0.5], [-1, -0.6], [2.5, 0.6], [5, -0.3]].map(([x, z]) => <Rock key={x} p={[x, 0.02, z]} s={0.22} />)}

      {/* 遠景 */}
      <Tree p={[-5.5, 0.3, -5]} s={1.3} />
      <Tree p={[-1.5, 0.3, -6.5]} s={1.6} />
      <Tree p={[4.5, 0.3, -5.5]} s={1.4} />

      {/* st_entrance：步道 */}
      {[5, 4.2, 3.4, 2.6].map((z, i) => (
        <mesh key={z} position={[-0.6 + (i % 2) * 0.35, 0.32, z]}>
          <cylinderGeometry args={[0.34, 0.36, 0.05, 12]} />
          <Mat color={C.stone} />
        </mesh>
      ))}
      <group position={[-1.7, 0.3, 3]}>
        <mesh position={[0, 0.4, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.8, 6]} />
          <Mat color={C.woodDark} />
        </mesh>
        <mesh position={[0, 0.75, 0]}>
          <boxGeometry args={[0.6, 0.3, 0.05]} />
          <Mat color={C.wood} />
        </mesh>
      </group>

      {/* st_bank：蘆葦與水邊植物 */}
      {reedCount > 0 && (
        <group>
          {reeds.slice(0, reedCount).map(([x, z], i) => (
            <group key={i} position={[x, 0.3, z]}>
              <mesh position={[0, 0.45, 0]} rotation={[0, 0, (i % 3 - 1) * 0.08]}>
                <cylinderGeometry args={[0.02, 0.03, 0.9, 5]} />
                <Mat color={C.sageDark} />
              </mesh>
              {i % 2 === 0 && (
                <mesh position={[0, 0.9, 0]}>
                  <capsuleGeometry args={[0.035, 0.14, 4, 6]} />
                  <Mat color="#9b7653" />
                </mesh>
              )}
            </group>
          ))}
          {done('st_bank') && (
            <>
              <Bush p={[-5, 0.3, 1.8]} s={0.9} />
              <Bush p={[5.2, 0.3, 1.9]} s={0.8} color={C.sageDark} />
              <Bush p={[-3.5, 0.3, -1.9]} s={0.85} />
              <Bush p={[3.6, 0.3, -2]} s={1} />
            </>
          )}
        </group>
      )}
      {!done('st_bank') && prog('st_bank') < 0.5 && (
        <group>
          {[[-3, 1.6], [2, 1.8], [-1, -1.7]].map(([x, z]) => (
            <mesh key={x} position={[x, 0.31, z]}>
              <cylinderGeometry args={[0.5, 0.5, 0.02, 14]} />
              <Mat color="#8f7a5d" />
            </mesh>
          ))}
          {[[-4, 1.4], [0.5, -1.5], [4, 1.5]].map(([x, z]) => (
            <mesh key={x} position={[x, 0.45, z]} rotation={[0, 0, 0.3]}>
              <coneGeometry args={[0.08, 0.3, 5]} />
              <Mat color={C.dry} />
            </mesh>
          ))}
        </group>
      )}

      {/* st_bridge：木橋 */}
      <group position={[2.2, 0, 0]}>
        {[-1.5, 1.5].flatMap((z) =>
          [-0.55, 0.55].map((x) => (
            <mesh key={`${x}${z}`} position={[x, 0.45, z]}>
              <cylinderGeometry args={[0.07, 0.08, done('st_bridge') || prog('st_bridge') >= 0.25 ? 0.9 : 0.5, 8]} />
              <Mat color={C.woodDark} />
            </mesh>
          )),
        )}
        {planks > 0 ? (
          <group>
            {Array.from({ length: planks }, (_, i) => (
              <mesh key={i} position={[0, 0.42 + Math.sin((i / 8) * Math.PI) * 0.18, -1.6 + i * 0.4]} rotation={[Math.cos((i / 8) * Math.PI) * -0.4, 0, 0]}>
                <boxGeometry args={[1.25, 0.07, 0.36]} />
                <Mat color={i % 2 ? C.wood : '#d4b48a'} />
              </mesh>
            ))}
            {done('st_bridge') && [-0.58, 0.58].map((x) => (
              <mesh key={x} position={[x, 0.95, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 1]}>
                <cylinderGeometry args={[0.035, 0.035, 3.1, 6]} />
                <Mat color={C.woodDark} />
              </mesh>
            ))}
          </group>
        ) : (
          <mesh position={[0.3, 0.1, 0.2]} rotation={[0.2, 0.6, 0.1]}>
            <boxGeometry args={[1.1, 0.07, 0.35]} />
            <Mat color={C.woodDark} />
          </mesh>
        )}
      </group>

    </group>
  );
}

/** 限制每秒重繪次數（搭配 frameloop="demand"），動畫靠時間推算所以不會變慢。 */
function FpsCap({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const id = window.setInterval(() => invalidate(), 1000 / fps);
    return () => clearInterval(id);
  }, [invalidate, fps]);
  return null;
}

export default function Scene3D({ habitatId, done, prog, reducedMotion, onSelect, onSlow, backdrop, bubble, lowPower, pets = [], facilities = [] }: SceneProps) {
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const props = { done, prog: prog ?? ((id: string) => (done(id) ? 1 : 0)), still: reducedMotion };
  return (
    <Canvas
      // 背景分頁停止渲染；低動態只在變化時重繪；省電模式每秒 12 張
      frameloop={hidden ? 'never' : reducedMotion || lowPower ? 'demand' : 'always'}
      dpr={lowPower ? 1 : [1, 1.5]}
      camera={{ fov: 40, near: 0.1, far: 80 }}
      gl={{ antialias: true, powerPreference: 'low-power' }}
      aria-label="棲地場景"
    >
      <color attach="background" args={[habitatId === 'stream' ? '#cfe5df' : '#d9ead9']} />
      <hemisphereLight args={['#fff4dc', '#9fbf9a', 1.6]} />
      <directionalLight position={[5, 9, 5]} intensity={1.5} color="#fff0d2" />
      <FitCamera dist={(habitatId === 'stream' ? 10.5 : 10) * (bubble ? 0.78 : 1)} raise={backdrop ? 0.2 : 0} />
      {!reducedMotion && !lowPower && <PerfWatch onSlow={onSlow} />}
      {lowPower && !reducedMotion && !hidden && <FpsCap fps={12} />}
      {habitatId === 'stream' ? <Stream {...props} /> : <Greenhouse {...props} />}
      {facilities.map((f) => (
        <Facility key={f} id={f} />
      ))}
      {pets.slice(0, PET_SPOTS[habitatId].length).map((p, i) => (
        <PetSprite key={p.id} pet={p} spot={PET_SPOTS[habitatId][i]} still={reducedMotion} onSelect={onSelect} />
      ))}
    </Canvas>
  );
}
