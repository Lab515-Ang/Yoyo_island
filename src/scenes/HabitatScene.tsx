import { Component, lazy, memo, Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useSave } from '../app/store';
import { isDone, projectQuarter, sceneAnimals } from '../domain/game';
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
export const WEBGL = typeof document !== 'undefined' && hasWebGL();
// 偵測到效能不足後，這次開啟 App 期間都用 2D（不然每換一頁都要再卡幾秒、再跳一次提示）
let slowDevice = false;

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
/** calm：專注背景（不可點、場景往上推）；bubble：大廳的圓形泡泡（不可點、鏡頭拉近）；hide：不放進場景的那段專注（結算畫面另外放大顯示）。 */
// 外層每秒會重繪好幾次（例如專注倒數）：用 memo 讓場景只在存檔或參數改變時才重繪
export const HabitatScene = memo(function HabitatScene({ habitatId, onSelect, calm = false, bubble = false, hide }: { habitatId: HabitatId; onSelect?: (id: string) => void; calm?: boolean; bubble?: boolean; hide?: string }) {
  const { save, notify } = useSave();
  const [degraded, setDegraded] = useState(slowDevice);
  const done = useCallback((id: string) => isDone(save, id), [save]);
  const prog = useCallback((id: string) => projectQuarter(save, id), [save]);
  const animals = useMemo(() => sceneAnimals(save).filter((a) => a.id !== hide), [save, hide]);
  // 專注背景（calm）一畫好就不動：專注最長 3 小時，持續重繪很耗電
  const reducedMotion = calm || save.settings.reducedMotion || prefersReducedMotion();
  const props = { habitatId, done, prog, animals, reducedMotion, onSelect: calm || bubble ? undefined : onSelect, backdrop: calm, bubble, lowPower: calm || bubble };
  const flat = <Scene2D {...props} />;
  const degrade = useCallback(() => {
    slowDevice = true;
    setDegraded(true);
    notify('裝置效能較吃緊，已切換為簡化 2D 場景。');
  }, [notify]);
  const use3D = WEBGL && save.settings.sceneMode === 'auto' && !degraded;
  return (
    <div className="scene">
      {use3D ? (
        <Boundary fallback={flat} onError={() => ((slowDevice = true), setDegraded(true))}>
          <Suspense fallback={<div className="scene-loading">場景載入中…</div>}>
            <Scene3D {...props} onSlow={degrade} />
          </Suspense>
        </Boundary>
      ) : (
        flat
      )}
    </div>
  );
});
