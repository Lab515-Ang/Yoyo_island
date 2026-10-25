// 觀察圖鑑的地圖：能用 3D 就用立體台灣，不行（或設定成簡化 2D）就用平面地圖。
import { Component, lazy, Suspense, type ReactNode } from 'react';
import { animalDef } from '../content/config';
import { AnimalArt } from '../components/Animal';
import { useSave } from '../app/store';
import { WEBGL } from './HabitatScene';
import { OUTLINE, project } from './taiwanGeo';
import type { MapPin } from './TaiwanMap3D';

const TaiwanMap3D = lazy(() => import('./TaiwanMap3D'));
const RIDGE: [number, number][] = [[121.62, 24.62], [121.44, 24.36], [121.27, 24.12], [121.1, 23.75], [120.96, 23.47], [120.9, 23.0], [120.86, 22.6], [120.85, 22.3]];

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** 平面台灣（由上往下看）：海岸線＋動物。 */
function TaiwanMap2D({ pins, onSelect }: { pins: MapPin[]; onSelect: (id: string) => void }) {
  const pts = OUTLINE.map(([lon, lat]) => project(lon, lat));
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const pad = 0.35;
  const [x0, z0, w, h] = [Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...zs) - Math.min(...zs) + pad * 2];
  const s = 0.36;
  return (
    <svg viewBox={`${x0} ${z0} ${w} ${h}`} className="taiwan-2d" role="img" aria-label="台灣地圖">
      <rect x={x0} y={z0} width={w} height={h} fill="#cfe7ea" />
      <polygon points={pts.map((p) => p.join(',')).join(' ')} fill="#a9cc8f" stroke="#7fa877" strokeWidth="0.02" />
      {/* 中央山脈（示意） */}
      <polyline points={RIDGE.map(([lon, lat]) => project(lon, lat).join(',')).join(' ')} fill="none" stroke="#5f8a57" strokeWidth="0.12" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      {pins.map((p) => {
        const a = animalDef(p.id);
        const [x, z] = project(a.habitat.lon, a.habitat.lat);
        return (
          <g
            key={p.id}
            role="button"
            tabIndex={0}
            aria-label={p.state === 'met' ? a.name : '還沒遇見的動物'}
            onClick={() => onSelect(a.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(a.id)}
            style={{ cursor: 'pointer' }}
            opacity={p.state === 'locked' ? 0.45 : p.state === 'legend' ? 0.35 : 1}
          >
            <circle cx={x} cy={z - s / 2} r={s * 0.75} fill="transparent" />
            <svg x={x - s / 2} y={z - s} width={s} height={s} viewBox="0 0 100 100">
              <AnimalArt id={a.id} stage={p.state === 'met' ? p.stage : 2} size={100} hidden={p.state !== 'met'} />
            </svg>
          </g>
        );
      })}
    </svg>
  );
}

export function TaiwanMap({ pins, onSelect }: { pins: MapPin[]; onSelect: (id: string) => void }) {
  const { save } = useSave();
  const flat = <TaiwanMap2D pins={pins} onSelect={onSelect} />;
  const use3D = WEBGL && save.settings.sceneMode === 'auto';
  return (
    <div className="taiwan-map">
      {use3D ? (
        <Boundary fallback={flat}>
          <Suspense fallback={<div className="scene-loading">地圖載入中…</div>}>
            <TaiwanMap3D pins={pins} onSelect={onSelect} />
          </Suspense>
        </Boundary>
      ) : (
        flat
      )}
    </div>
  );
}
