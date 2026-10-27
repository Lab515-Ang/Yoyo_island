// 觀察圖鑑的地圖：能用 3D 就用立體地圖，不行（或設定成簡化 2D）就用平面地圖。區域的地形資料在 geo.ts。
import { Component, lazy, Suspense, type ReactNode } from 'react';
import { animalDef } from '../content/config';
import { AnimalArt } from '../components/Animal';
import { useSave } from '../app/store';
import { WEBGL } from './HabitatScene';
import type { Geo } from './geo';
import type { MapPin } from './RegionMap3D';

const RegionMap3D = lazy(() => import('./RegionMap3D'));

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** 平面地圖（由上往下看）：海岸線＋動物。 */
function RegionMap2D({ geo, pins, onSelect }: { geo: Geo; pins: MapPin[]; onSelect: (id: string) => void }) {
  const { project } = geo;
  const islands = geo.outlines.map((o) => o.map(([lon, lat]) => project(lon, lat)));
  const pts = islands.flat();
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const pad = 0.35;
  const [x0, z0, w, h] = [Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...zs) - Math.min(...zs) + pad * 2];
  const s = 0.36;
  const art = geo.art;
  const [ax0, azN] = art ? project(art.bounds[0], art.bounds[3]) : [0, 0];
  const [ax1, azS] = art ? project(art.bounds[2], art.bounds[1]) : [0, 0];
  return (
    <svg viewBox={`${x0} ${z0} ${w} ${h}`} className="taiwan-2d" style={art ? { background: '#31c4f3' } : undefined} role="img" aria-label={`${geo.name}地圖`}>
      {art ? (
        <>
          {/* 手繪地圖（和 3D 地圖同一張） */}
          <rect x={x0} y={z0} width={w} height={h} fill="#31c4f3" />
          <image href={art.src} x={ax0} y={azN} width={ax1 - ax0} height={azS - azN} preserveAspectRatio="none" />
        </>
      ) : (
        <>
          <rect x={x0} y={z0} width={w} height={h} fill="#cfe7ea" />
          {islands.map((isl, i) => (
            <polygon key={i} points={isl.map((p) => p.join(',')).join(' ')} fill="#a9cc8f" stroke="#7fa877" strokeWidth="0.02" />
          ))}
          {/* 主要山脈（示意） */}
          <polyline points={geo.ridgeLine.map(([lon, lat]) => project(lon, lat).join(',')).join(' ')} fill="none" stroke="#5f8a57" strokeWidth="0.12" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        </>
      )}
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

export function RegionMap({ geo, pins, onSelect }: { geo: Geo; pins: MapPin[]; onSelect: (id: string) => void }) {
  const { save } = useSave();
  const flat = <RegionMap2D geo={geo} pins={pins} onSelect={onSelect} />;
  const use3D = WEBGL && save.settings.sceneMode === 'auto';
  return (
    <div className="taiwan-map">
      {use3D ? (
        <Boundary fallback={flat}>
          <Suspense fallback={<div className="scene-loading">地圖載入中…</div>}>
            <RegionMap3D key={geo.id} geo={geo} pins={pins} onSelect={onSelect} />
          </Suspense>
        </Boundary>
      ) : (
        flat
      )}
    </div>
  );
}
