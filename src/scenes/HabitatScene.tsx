import { Component, lazy, Suspense, useCallback, useState, type ReactNode } from 'react';
import { useSave } from '../app/store';
import { adoptedPets, isDone, speciesPresent } from '../domain/game';
import type { HabitatId } from '../domain/types';
import Scene2D from './Scene2D';

const Scene3D = lazy(() => import('./Scene3D'));

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
const WEBGL = typeof document !== 'undefined' && hasWebGL();

class Boundary extends Component<{ fallback: ReactNode; onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export const prefersReducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 依設定與裝置能力選 3D 或 2D；3D 失敗或太慢自動降級，核心功能不受影響。 */
export function HabitatScene({ habitatId, onSelect, calm = false }: { habitatId: HabitatId; onSelect?: (id: string) => void; calm?: boolean }) {
  const { save, notify } = useSave();
  const [degraded, setDegraded] = useState(false);
  const done = useCallback((id: string) => isDone(save, id), [save]);
  const present = speciesPresent(save, habitatId).map((s) => s.id);
  const pets = adoptedPets(save, habitatId).map((p) => ({ id: p.def.id, stage: p.stage }));
  const reducedMotion = save.settings.reducedMotion || prefersReducedMotion();
  const props = { habitatId, done, present, pets, reducedMotion, onSelect: calm ? undefined : onSelect, backdrop: calm };
  const flat = <Scene2D {...props} />;
  const degrade = useCallback(() => {
    setDegraded(true);
    notify('裝置效能較吃緊，已切換為簡化 2D 場景。');
  }, [notify]);
  const use3D = WEBGL && save.settings.sceneMode === 'auto' && !degraded;
  return (
    <div className="scene">
      {use3D ? (
        <Boundary fallback={flat} onError={() => setDegraded(true)}>
          <Suspense fallback={<div className="scene-loading">場景載入中…</div>}>
            <Scene3D {...props} onSlow={degrade} />
          </Suspense>
        </Boundary>
      ) : (
        flat
      )}
    </div>
  );
}
