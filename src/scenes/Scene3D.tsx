// 原創低多邊形 3D 棲地：場景物件由工程狀態推導；住在島上的只有領養的寵物
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { HabitatId } from '../domain/types';

export interface SceneProps {
  habitatId: HabitatId;
  done: (projectId: string) => boolean;
  reducedMotion: boolean;
  onSelect?: (speciesId: string) => void;
  onSlow?: () => void;
  backdrop?: boolean; // 專注畫面的全螢幕背景：場景往上移，留出下方放倒數泡泡
  pets?: { id: string; stage: number }[]; // 已領養的寵物與目前階段（點擊回傳 pet:{id}）
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

/** 放大的透明點擊範圍，放在會移動的群組內，手機也點得到 */
const Hit = ({ r = 0.5 }: { r?: number }) => (
  <mesh>
    <sphereGeometry args={[r, 8, 8]} />
    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
  </mesh>
);

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

// ---------- 生物 ----------

function Butterfly({ wing, accent, still, path }: { wing: string; accent: string; still: boolean; path: Anim }) {
  const ref = useAnim(still, path);
  const l = useRef<THREE.Group>(null!);
  const r = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    const a = still ? 0.5 : 0.25 + Math.abs(Math.sin(clock.elapsedTime * 5)) * 0.9;
    l.current.rotation.z = a;
    r.current.rotation.z = -a;
  });
  const W = ({ side }: { side: 1 | -1 }) => (
    <group ref={side === 1 ? l : r}>
      <mesh position={[0.17 * side, 0, 0.04]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1.15, 1]}>
        <circleGeometry args={[0.17, 12]} />
        <meshLambertMaterial color={wing} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.12 * side, 0.001, -0.12]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.1, 10]} />
        <meshLambertMaterial color={accent} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
  return (
    <group ref={ref} scale={1.8}>
      <Hit />
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.035, 0.22, 4, 8]} />
        <Mat color="#4a3d2e" />
      </mesh>
      <W side={1} />
      <W side={-1} />
    </group>
  );
}

// ---------- 寵物（每隻 4 個階段，簡單幾何） ----------

const PET_SPOT: Record<string, [number, number, number]> = {
  pet_butterfly: [-1.9, 0.12, 2.0],
  pet_whiteeye: [1.7, 0.12, -2.5],
  pet_frog: [-1.3, 0.1, 0.5],
  pet_firefly: [4.2, 0.3, 1.35],
  pet_axolotl: [0.7, 0.12, -0.45],
};

type V3 = [number, number, number];

function Ball({ p = [0, 0, 0], r, color, s = [1, 1, 1], opacity, emissive }: { p?: V3; r: number; color: string; s?: V3; opacity?: number; emissive?: string }) {
  return (
    <mesh position={p} scale={s}>
      <sphereGeometry args={[r, 12, 10]} />
      <meshLambertMaterial color={color} transparent={opacity !== undefined} opacity={opacity ?? 1} emissive={emissive ?? '#000000'} />
    </mesh>
  );
}

function SmallBird({ body, belly, ring }: { body: string; belly?: string; ring?: boolean }) {
  return (
    <group position={[0, 0.16, 0]}>
      <Ball r={0.14} color={body} s={[0.9, 0.8, 1.15]} />
      {belly && <Ball p={[0, -0.04, 0.05]} r={0.1} color={belly} s={[0.9, 0.7, 1]} />}
      <Ball p={[0, 0.1, 0.12]} r={0.09} color={body} />
      {ring && (
        <mesh position={[0.06, 0.12, 0.16]} rotation={[0, 0.6, 0]}>
          <torusGeometry args={[0.028, 0.01, 6, 14]} />
          <Mat color="#ffffff" />
        </mesh>
      )}
      <Ball p={[0.06, 0.12, 0.17]} r={0.015} color="#2e2a26" />
      <mesh position={[0, 0.09, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.02, 0.07, 6]} />
        <Mat color="#5b4a33" />
      </mesh>
    </group>
  );
}

function PetModel({ id, stage, still }: { id: string; stage: number; still: boolean }) {
  if (id === 'pet_butterfly') {
    if (stage === 0)
      return (
        <group>
          <Ball r={0.22} color={C.sage} s={[1, 0.15, 0.6]} />
          <Ball p={[0, 0.05, 0]} r={0.05} color="#f6e7a6" />
        </group>
      );
    if (stage === 1)
      return (
        <group>
          <Ball r={0.28} color={C.sage} s={[1, 0.15, 0.6]} />
          {[-0.12, -0.04, 0.04, 0.12].map((x, i) => (
            <Ball key={x} p={[x, 0.07 + (i % 2) * 0.02, 0]} r={0.05} color={i === 3 ? '#6f9a6e' : '#9cc96b'} />
          ))}
        </group>
      );
    if (stage === 2)
      return (
        <group>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.6, 5]} />
            <Mat color={C.woodDark} />
          </mesh>
          <mesh position={[0.06, 0.38, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.06, 0.22, 10]} />
            <Mat color="#9cc96b" />
          </mesh>
        </group>
      );
    return (
      <Butterfly
        wing="#f3cf5a"
        accent="#eab949"
        still={still}
        path={(g, t) => {
          g.position.set(Math.sin(t * 0.5) * 0.35, 0.45 + Math.sin(t * 1.3) * 0.06, Math.cos(t * 0.5) * 0.35);
          g.rotation.y = t * 0.5 + Math.PI / 2;
        }}
      />
    );
  }
  if (id === 'pet_whiteeye')
    return (
      <group>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <torusGeometry args={[0.16, 0.06, 8, 16]} />
          <Mat color={C.woodDark} />
        </mesh>
        {stage === 0 && <Ball p={[0, 0.08, 0]} r={0.07} color="#d8eef0" s={[1, 1.25, 1]} />}
        {stage === 1 && (
          <group position={[0, 0.06, 0]}>
            <Ball p={[0, 0.06, 0]} r={0.1} color="#c9bdb3" />
            <mesh position={[0, 0.16, 0.04]} rotation={[0.3, 0, 0]}>
              <coneGeometry args={[0.03, 0.07, 6]} />
              <Mat color="#f2c14e" />
            </mesh>
          </group>
        )}
        {stage === 2 && <SmallBird body="#9db56a" />}
        {stage === 3 && <SmallBird body="#b9c94a" belly="#efe9c9" ring />}
      </group>
    );
  if (id === 'pet_frog') {
    if (stage === 0)
      return (
        <group>
          {[[0, 0], [0.09, 0.03], [-0.07, 0.05], [0.03, -0.08], [-0.05, -0.05]].map(([x, z]) => (
            <group key={`${x}${z}`} position={[x, 0.03, z]}>
              <Ball r={0.05} color="#eef8f3" opacity={0.85} />
              <Ball r={0.018} color="#3a3a33" />
            </group>
          ))}
        </group>
      );
    if (stage < 3)
      return (
        <group position={[0, 0.03, 0]}>
          <Ball r={0.08} color={stage === 1 ? '#4b5240' : '#5f7a4a'} s={[1, 0.8, 1]} />
          <Ball p={[0.14, 0, 0]} r={0.1} color="#6b7360" s={[1, 0.25, 0.6]} />
          {stage === 2 &&
            [-0.05, 0.05].map((z) => (
              <mesh key={z} position={[0.06, -0.03, z]} rotation={[0, 0, 0.6]}>
                <cylinderGeometry args={[0.012, 0.012, 0.1, 5]} />
                <Mat color="#5f7a4a" />
              </mesh>
            ))}
        </group>
      );
    return (
      <group>
        <mesh position={[0, -0.01, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 0.02, 14]} />
          <Mat color={C.sageDark} />
        </mesh>
        <group position={[0, 0.08, 0]}>
          <Ball r={0.12} color="#79b36a" s={[1, 0.6, 1.1]} />
          {[-0.05, 0.05].map((x) => (
            <group key={x}>
              <Ball p={[x, 0.07, 0.06]} r={0.035} color="#79b36a" />
              <Ball p={[x, 0.09, 0.085]} r={0.015} color="#2e2a26" />
            </group>
          ))}
        </group>
      </group>
    );
  }
  if (id === 'pet_firefly') {
    if (stage === 0)
      return (
        <group>
          <Ball r={0.22} color="#7fa36a" s={[1, 0.25, 0.8]} />
          {[[-0.06, 0], [0, 0.04], [0.06, -0.02]].map(([x, z]) => (
            <Ball key={`${x}${z}`} p={[x, 0.05, z]} r={0.018} color="#f3e08a" />
          ))}
        </group>
      );
    if (stage === 1)
      return (
        <group>
          <mesh>
            <cylinderGeometry args={[0.22, 0.22, 0.02, 14]} />
            <Mat color={C.water} opacity={0.8} />
          </mesh>
          {[-0.09, -0.03, 0.03, 0.09].map((x) => (
            <Ball key={x} p={[x, 0.03, 0]} r={0.035} color="#3c3a35" />
          ))}
        </group>
      );
    if (stage === 2)
      return (
        <group>
          <Ball r={0.16} color={C.soil} s={[1, 0.35, 1]} />
          <Ball p={[0, 0.08, 0]} r={0.06} color="#f1e2b8" s={[1, 1.4, 1]} />
        </group>
      );
    return (
      <group position={[0, 0.25, 0]}>
        <Ball r={0.06} color="#2e2a26" s={[0.8, 0.7, 1.3]} />
        <Ball p={[0, 0.01, 0.08]} r={0.035} color="#e98a6b" />
        <Ball p={[0, -0.01, -0.08]} r={0.045} color="#f6e36a" emissive="#f6e36a" />
        <pointLight position={[0, 0, -0.1]} color="#fff3a8" intensity={0.8} distance={1.4} />
      </group>
    );
  }
  // 六角恐龍：0 是卵，1～3 粉紅身體，階段越後越大、外鰓越多
  if (stage === 0)
    return (
      <group position={[0, 0.04, 0]}>
        <Ball r={0.08} color="#f4eef8" opacity={0.85} />
        <Ball r={0.025} color="#4a3f52" />
      </group>
    );
  const k = [0, 0.7, 0.9, 1.15][stage];
  return (
    <group position={[0, 0.04, 0]} scale={k}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.06, 0.22, 4, 8]} />
        <Mat color="#f4b8c6" />
      </mesh>
      {stage === 3 && <Ball p={[-0.17, 0.01, 0]} r={0.08} color="#f7b3c4" />}
      {stage >= 2 &&
        [-1, 1].flatMap((side) =>
          [0, 1, 2].slice(0, stage === 3 ? 3 : 2).map((i) => (
            <mesh key={`${side}${i}`} position={[-0.18 + i * 0.03, 0.04, side * 0.07]} rotation={[side * 0.9, 0, 0.3 - i * 0.3]}>
              <coneGeometry args={[0.012, 0.09, 5]} />
              <Mat color="#e46e8c" />
            </mesh>
          )),
        )}
    </group>
  );
}

function Pet({ id, stage, still, onSelect }: { id: string; stage: number; still: boolean; onSelect?: (id: string) => void }) {
  const ref = useAnim(still, (g, t) => {
    g.position.y = Math.sin(t * 1.4 + id.length) * 0.015; // 輕微的呼吸／漂浮
  });
  return (
    <Pick id={`pet:${id}`} onSelect={onSelect}>
      <group position={PET_SPOT[id]} scale={1.6}>
        <group ref={ref}>
          <Hit r={0.35} />
          <PetModel id={id} stage={stage} still={still} />
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

function Greenhouse({ done, still }: { done: (id: string) => boolean; still: boolean }) {
  const R = 4.8;
  const pillars = [0, 1, 2, 3, 4, 5].map((i) => (i / 5) * Math.PI);
  const flowers = useMemo(() => spread(14, 0.8), []);
  const leafs = useMemo(() => spread(7, 0.75), []);
  const jet = useAnim(still, (g, t) => {
    g.scale.y = 1 + Math.sin(t * 3) * 0.06;
  });
  const fountainOn = done('gh_fountain');
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
          <mesh position={[0, 0.33, 0]}>
            <cylinderGeometry args={[1.22, 1.22, 0.46, 32]} />
            <Mat color="#cdbfa3" />
          </mesh>
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
        {done('gh_flowers')
          ? flowers.map(([x, z], i) => <Flower key={i} p={[x, 0.43, z]} color={FLOWER[i % FLOWER.length]} h={0.25 + (i % 3) * 0.07} />)
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
        {done('gh_plants') ? (
          <>
            {leafs.map(([x, z], i) => (
              <mesh key={i} position={[x, 0.6, z]} rotation={[0.5, i, 0]} scale={[1, 0.25, 0.6]}>
                <sphereGeometry args={[0.35, 10, 8]} />
                <Mat color={i % 2 ? C.sage : C.sageDark} />
              </mesh>
            ))}
            <Flower p={[0.2, 0.43, -0.4]} color={FLOWER[4]} h={0.45} />
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

function Stream({ done, still }: { done: (id: string) => boolean; still: boolean }) {
  const clear = done('st_water');
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
      <Water y={0.08} still={still} color={clear ? C.water : C.murky} opacity={clear ? 0.72 : 0.92}>
        <boxGeometry args={[16, 0.02, 2.2]} />
      </Water>
      {!clear && [[-2, 0.3], [1.5, -0.4], [4, 0.2]].map(([x, z]) => (
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
      {done('st_bank') ? (
        <group>
          {reeds.map(([x, z], i) => (
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
          <Bush p={[-5, 0.3, 1.8]} s={0.9} />
          <Bush p={[5.2, 0.3, 1.9]} s={0.8} color={C.sageDark} />
          <Bush p={[-3.5, 0.3, -1.9]} s={0.85} />
          <Bush p={[3.6, 0.3, -2]} s={1} />
        </group>
      ) : (
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
              <cylinderGeometry args={[0.07, 0.08, done('st_bridge') ? 0.9 : 0.5, 8]} />
              <Mat color={C.woodDark} />
            </mesh>
          )),
        )}
        {done('st_bridge') ? (
          <group>
            {Array.from({ length: 9 }, (_, i) => (
              <mesh key={i} position={[0, 0.42 + Math.sin((i / 8) * Math.PI) * 0.18, -1.6 + i * 0.4]} rotation={[Math.cos((i / 8) * Math.PI) * -0.4, 0, 0]}>
                <boxGeometry args={[1.25, 0.07, 0.36]} />
                <Mat color={i % 2 ? C.wood : '#d4b48a'} />
              </mesh>
            ))}
            {[-0.58, 0.58].map((x) => (
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

export default function Scene3D({ habitatId, done, reducedMotion, onSelect, onSlow, backdrop, pets = [] }: SceneProps) {
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const props = { done, still: reducedMotion };
  return (
    <Canvas
      // 背景分頁停止渲染；低動態模式只在變化時重繪
      frameloop={hidden ? 'never' : reducedMotion ? 'demand' : 'always'}
      dpr={[1, 1.5]}
      camera={{ fov: 40, near: 0.1, far: 80 }}
      gl={{ antialias: true, powerPreference: 'low-power' }}
      aria-label="棲地場景"
    >
      <color attach="background" args={[habitatId === 'stream' ? '#cfe5df' : '#d9ead9']} />
      <hemisphereLight args={['#fff4dc', '#9fbf9a', 1.6]} />
      <directionalLight position={[5, 9, 5]} intensity={1.5} color="#fff0d2" />
      <FitCamera dist={habitatId === 'stream' ? 10.5 : 10} raise={backdrop ? 0.2 : 0} />
      {!reducedMotion && <PerfWatch onSlow={onSlow} />}
      {habitatId === 'stream' ? <Stream {...props} /> : <Greenhouse {...props} />}
      {pets.map((p) => (
        <Pet key={p.id} id={p.id} stage={p.stage} still={reducedMotion} onSelect={onSelect} />
      ))}
    </Canvas>
  );
}
