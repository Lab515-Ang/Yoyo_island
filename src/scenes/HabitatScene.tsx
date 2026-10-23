import { Component, lazy, Suspense, useCallback, useState, type ReactNode } from 'react';
import { useSave } from '../app/store';
import { FACILITIES } from '../content/config';
import { adoptedPets, facilityOwned, isDone, projectQuarter } from '../domain/game';
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
/** calm：專注背景（不可點、場景往上推）；bubble：大廳的圓形泡泡（不可點、鏡頭拉近）。 */
export function HabitatScene({ habitatId, onSelect, calm = false, bubble = false }: { habitatId: HabitatId; onSelect?: (id: string) => void; calm?: boolean; bubble?: boolean }) {
  const { save, notify } = useSave();
  const [degraded, setDegraded] = useState(false);
  const done = useCallback((id: string) => isDone(save, id), [save]);
  const prog = useCallback((id: string) => projectQuarter(save, id), [save]);
  const pets = adoptedPets(save, habitatId).map((v) => ({ id: v.pet.id, typeId: v.def.id, art: v.def.art, stage: v.stage, face: v.face, grow: v.grow }));
  const facilities = FACILITIES.filter((f) => f.habitatId === habitatId && facilityOwned(save, f.id)).map((f) => f.id);
  const reducedMotion = save.settings.reducedMotion || prefersReducedMotion();
  const props = { habitatId, done, prog, pets, facilities, reducedMotion, onSelect: calm || bubble ? undefined : onSelect, backdrop: calm, bubble, lowPower: calm || bubble };
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
