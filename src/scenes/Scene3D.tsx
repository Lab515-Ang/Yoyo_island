// 原創低多邊形 3D 森林：場景物件由工程狀態推導；動物是專注孵出來的
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnimalArt } from '../components/Animal';
import type { HabitatId } from '../domain/types';

export interface SceneProps {
  habitatId: HabitatId;
  done: (projectId: string) => boolean;
  prog?: (projectId: string) => number; // 工程進度，切成 0／0.25／0.5／0.75／1，中途就讓場景有一點變化
  reducedMotion: boolean;
  onSelect?: (id: string) => void;
  onSlow?: () => void;
  backdrop?: boolean; // 專注畫面的全螢幕背景：場景往上移，留出下方放倒數泡泡
  bubble?: boolean; // 大廳的圓形泡泡：鏡頭拉近
  lowPower?: boolean; // 省電：每秒只畫 12 張、解析度降到 1 倍（專注背景、大廳泡泡用）
  animals?: SceneAnimal[]; // 最近孵出的動物（點擊回傳 session id）
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

// ---------- 動物（2D 圖片，永遠面向鏡頭） ----------

export interface SceneAnimal {
  id: string; // 孵出牠的那段專注
  animalId: string;
  tier: number; // 0～3：專注越久越大
}

/** 最多 6 隻，依最近孵出的順序放在固定位置。 */
const SPOTS: [number, number, number][] = [
  [-1.2, 0.05, 1.9],
  [1.4, 0.05, 1.7],
  [-2.8, 0.05, 0.4],
  [2.9, 0.05, 0.2],
  [-0.4, 0.05, 3.0],
  [0.9, 0.05, -0.9],
];

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** 把動物圖（臨時 SVG；美術圖到位後換成圖片）畫成貼圖。
 *  所有場景共用同一份（最多 15 種動物）：換頁重開場景時不用重畫，也不會一直累積貼圖。 */
const texCache = new Map<string, Promise<THREE.CanvasTexture>>();
function animalTexture(animalId: string) {
  let p = texCache.get(animalId);
  if (!p) {
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderToStaticMarkup(<AnimalArt id={animalId} size={256} />))}`;
    p = loadImage(url).then((img) => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d')!.drawImage(img, 0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
    p.catch(() => texCache.delete(animalId)); // 失敗的下次再試
    texCache.set(animalId, p);
  }
  return p;
}

function useAnimalTexture(animalId: string) {
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    let alive = true;
    animalTexture(animalId)
      .then((t) => alive && setTex(t))
      .catch(() => undefined); // 圖檔缺漏時不顯示，不影響場景
    return () => {
      alive = false;
    };
  }, [animalId]);
  return tex;
}

function AnimalSprite({ a, spot, still, onSelect }: { a: SceneAnimal; spot: [number, number, number]; still: boolean; onSelect?: (id: string) => void }) {
  const tex = useAnimalTexture(a.animalId);
  const phase = a.id.length + spot[0];
  const ref = useAnim(still, (g, t) => {
    g.position.y = Math.abs(Math.sin(t * 1.4 + phase)) * 0.05; // 輕輕彈跳
    g.scale.y = 1 + Math.sin(t * 2.2 + phase) * 0.02; // 呼吸
  });
  const s = [1.0, 1.2, 1.4, 1.6][Math.max(0, Math.min(3, a.tier))];
  return (
    <Pick id={a.id} onSelect={onSelect}>
      <group position={spot}>
        <group ref={ref}>
          {tex && (
            // 畫布 100×100、地面在 y = 92（含自己的影子）：往下補回 8% 的留白，讓腳踩在地上
            <sprite scale={[s, s, 1]} position={[0, s / 2 - s * 0.08, 0]}>
              <spriteMaterial map={tex} transparent depthWrite={false} />
            </sprite>
          )}
        </group>
      </group>
    </Pick>
  );
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

function Log({ p, r = 0 }: { p: [number, number, number]; r?: number }) {
  return (
    <mesh position={p} rotation={[0, r, Math.PI / 2]}>
      <cylinderGeometry args={[0.16, 0.18, 1.6, 8]} />
      <Mat color={C.woodDark} />
    </mesh>
  );
}

function Fern({ p, s = 1 }: { p: [number, number, number]; s?: number }) {
  return (
    <group position={p} scale={s}>
      {[0, 1.2, 2.4, 3.6, 4.8].map((a) => (
        <mesh key={a} position={[Math.cos(a) * 0.12, 0.18, Math.sin(a) * 0.12]} rotation={[0.7 * Math.cos(a), a, 0.7 * Math.sin(a)]}>
          <coneGeometry args={[0.07, 0.5, 4]} />
          <Mat color={C.sageDark} />
        </mesh>
      ))}
    </group>
  );
}

/** 棲光森林：8 個工程各自讓森林有看得見的變化；進度每到 25% 就先出現一部分。 */
function Forest({ done, prog, still }: Progress) {
  const saplings = useMemo(() => spread(10, 1).map(([x, z]) => [-3.2 + x * 1.1, z * 1.1 - 1.6] as const), []);
  const ferns = useMemo(() => spread(16, 1).map(([x, z]) => [x * 4.2, z * 1.2 + 2.4] as const), []);
  const fireflies = useAnim(still, (g, t) => {
    g.position.y = 2.2 + Math.sin(t * 0.8) * 0.15;
  });
  const n = (id: string, count: number) => (done(id) ? count : Math.floor(count * prog(id)));
  const restored = ['fo_trail', 'fo_saplings', 'fo_cabin', 'fo_undergrowth', 'fo_corridor', 'fo_spring', 'fo_canopy', 'fo_rescue'].filter(done).length;
  // 森林越修越綠：地面從枯黃慢慢轉綠
  const ground = new THREE.Color(C.dry).lerp(new THREE.Color(C.grass), restored / 8);
  const logsLeft = 3 - n('fo_trail', 3);
  const cabin = prog('fo_cabin');
  const corridor = prog('fo_corridor');
  const spring = prog('fo_spring');
  const canopy = prog('fo_canopy');
  const rescue = prog('fo_rescue');
  return (
    <group>
      {/* 地面與遠景樹林（修好的工程越多，樹越多） */}
      <mesh position={[0, -0.15, 0]} raycast={noHit}>
        <cylinderGeometry args={[7.6, 7.8, 0.3, 40]} />
        <meshLambertMaterial color={ground} />
      </mesh>
      {spread(6 + restored * 2, 1).map(([x, z], i) => {
        const a = (i / (6 + restored * 2)) * Math.PI * 2 + 0.4;
        // 鏡頭那一側不種，免得擋住動物
        if (Math.sin(a) > 0.35) return null;
        return <Tree key={i} p={[Math.cos(a) * (6.2 + (x + z) * 0.3), 0, Math.sin(a) * 5.2 - 0.6]} s={1.1 + ((i * 7) % 5) * 0.12} />;
      })}

      {/* 1. 林間步道：倒木與落石慢慢清掉，步道出現 */}
      {prog('fo_trail') > 0 && (
        <mesh position={[0, 0.01, 1.2]} rotation={[-Math.PI / 2, 0, 0.12]} raycast={noHit}>
          <planeGeometry args={[1.3, 7.5]} />
          <Mat color="#c9b28c" />
        </mesh>
      )}
      {logsLeft > 0 && <Log p={[-0.3, 0.16, 2.2]} r={0.4} />}
      {logsLeft > 1 && <Log p={[0.5, 0.16, 0.2]} r={-0.6} />}
      {logsLeft > 2 && <Rock p={[0.1, 0.1, 3.2]} s={0.45} />}

      {/* 2. 原生樹苗 */}
      {saplings.slice(0, n('fo_saplings', saplings.length)).map(([x, z], i) => (
        <Tree key={i} p={[x, 0, z]} s={0.45} />
      ))}

      {/* 3. 森林觀察小屋：地板 → 牆 → 屋頂 → 亮燈 */}
      {cabin > 0 && (
        <group position={[3.0, 0, -1.6]} rotation={[0, -0.5, 0]}>
          <mesh position={[0, 0.08, 0]}>
            <boxGeometry args={[1.8, 0.16, 1.4]} />
            <Mat color={C.wood} />
          </mesh>
          {cabin >= 0.5 && (
            <mesh position={[0, 0.65, 0]}>
              <boxGeometry args={[1.6, 1.0, 1.2]} />
              <Mat color="#d8bf93" />
            </mesh>
          )}
          {cabin >= 0.75 && (
            <mesh position={[0, 1.42, 0]} rotation={[0, Math.PI / 4, 0]}>
              <coneGeometry args={[1.3, 0.7, 4]} />
              <Mat color="#7d5f45" />
            </mesh>
          )}
          {done('fo_cabin') && (
            <mesh position={[0, 0.7, 0.61]}>
              <planeGeometry args={[0.45, 0.35]} />
              <meshBasicMaterial color="#ffd77a" />
            </mesh>
          )}
        </group>
      )}

      {/* 4. 林下草叢與蕨類 */}
      {ferns.slice(0, n('fo_undergrowth', ferns.length)).map(([x, z], i) =>
        i % 3 === 0 ? <Bush key={i} p={[x, 0, z]} s={0.7} /> : <Fern key={i} p={[x, 0, z]} s={1.1} />,
      )}

      {/* 5. 生態廊道：綠色拱橋一段段搭起來 */}
      {corridor > 0 && (
        <group position={[-3.6, 0, -0.4]} rotation={[0, 0.3, 0]}>
          {[-0.9, 0.9].map((x, i) => (corridor >= (i + 1) * 0.25 ? (
            <mesh key={x} position={[x, 0.6, 0]}>
              <boxGeometry args={[0.25, 1.2, 1.2]} />
              <Mat color={C.woodDark} />
            </mesh>
          ) : null))}
          {corridor >= 0.75 && (
            <mesh position={[0, 1.28, 0]}>
              <boxGeometry args={[2.2, 0.18, 1.2]} />
              <Mat color={done('fo_corridor') ? C.sage : C.wood} />
            </mesh>
          )}
        </group>
      )}

      {/* 6. 森林水源地：由混濁轉清澈 */}
      {spring > 0 && (
        <group position={[-1.6, 0, -2.6]}>
          <Water y={0.03} still={still} color={done('fo_spring') ? C.water : C.murky} opacity={0.6 + spring * 0.35}>
            <cylinderGeometry args={[1.1, 1.1, 0.06, 24]} />
          </Water>
          {spread(6, 1.25).slice(0, Math.max(2, Math.floor(6 * spring))).map(([x, z], i) => (
            <Rock key={i} p={[x * 1.15, 0.08, z * 1.15]} s={0.2} />
          ))}
        </group>
      )}

      {/* 7. 樹冠步道：兩棵大樹之間的木棧道 */}
      {canopy > 0 && (
        <group position={[1.6, 0, -3.4]}>
          <Tree p={[-1.4, 0, 0]} s={1.6} />
          <Tree p={[1.4, 0, 0]} s={1.6} />
          {canopy >= 0.5 && (
            <mesh position={[0, 1.9, 0.3]}>
              <boxGeometry args={[2.4, 0.08, 0.45]} />
              <Mat color={C.wood} />
            </mesh>
          )}
          {done('fo_canopy') && (
            <mesh position={[0, 2.12, 0.5]}>
              <boxGeometry args={[2.4, 0.04, 0.04]} />
              <Mat color={C.woodDark} />
            </mesh>
          )}
        </group>
      )}

      {/* 8. 保育救傷站：帳篷 → 小屋 → 葉子標誌 */}
      {rescue > 0 && (
        <group position={[3.6, 0, 1.4]} rotation={[0, -0.9, 0]}>
          <mesh position={[0, 0.45, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[0.9, 0.9, 4]} />
            <Mat color={rescue >= 0.5 ? '#e8e1d0' : '#c9b28c'} />
          </mesh>
          {done('fo_rescue') && (
            <mesh position={[0, 1.0, 0]}>
              <sphereGeometry args={[0.14, 10, 8]} />
              <Mat color="#5fae6a" />
            </mesh>
          )}
        </group>
      )}

      {/* 全部修好：夜晚的螢火點點 */}
      {restored === 8 && (
        <group ref={fireflies} position={[0, 2.2, 0]}>
          {spread(8, 4).map(([x, z], i) => (
            <mesh key={i} position={[x, (i % 3) * 0.3, z]} raycast={noHit}>
              <sphereGeometry args={[0.05, 6, 6]} />
              <meshBasicMaterial color="#fff2a8" />
            </mesh>
          ))}
        </group>
      )}
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
export default function Scene3D({ done, prog, reducedMotion, onSelect, onSlow, backdrop, bubble, lowPower, animals = [] }: SceneProps) {
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const props = { done, prog: prog ?? ((id: string) => (done(id) ? 1 : 0)), still: reducedMotion };
  return (
    <Canvas
      // 背景分頁停止渲染；低動態只在變化時重繪；動作都很輕微，最多每秒 30 張（省電模式 12 張）
      frameloop={hidden ? 'never' : 'demand'}
      dpr={lowPower ? 1 : [1, 1.5]}
      camera={{ fov: 40, near: 0.1, far: 80 }}
      gl={{ antialias: true, powerPreference: 'low-power' }}
      aria-label="森林場景"
    >
      <color attach="background" args={['#d6e8d4']} />
      <hemisphereLight args={['#fff4dc', '#9fbf9a', 1.6]} />
      <directionalLight position={[5, 9, 5]} intensity={1.5} color="#fff0d2" />
      <FitCamera dist={10.5 * (bubble ? 0.78 : 1)} raise={backdrop ? 0.2 : 0} />
      {!reducedMotion && !lowPower && <PerfWatch onSlow={onSlow} />}
      {!reducedMotion && !hidden && <FpsCap fps={lowPower ? 12 : 30} />}
      <Forest {...props} />
      {animals.slice(0, SPOTS.length).map((a, i) => (
        <AnimalSprite key={a.id} a={a} spot={SPOTS[i]} still={reducedMotion} onSelect={onSelect} />
      ))}
    </Canvas>
  );
}
