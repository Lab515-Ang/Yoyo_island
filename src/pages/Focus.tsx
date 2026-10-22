import { useEffect, useState, type MouseEvent } from 'react';
import { useNow, useSave } from '../app/store';
import { APP_NAME } from '../content/config';
import { Modal } from '../components/ui';
import { elapsedMs, finish, pause, remainingMs, resume } from '../domain/focus';
import { closeSession, isDone, putSession } from '../domain/game';
import type { FocusSession, SaveFile } from '../domain/types';
import { HabitatScene, prefersReducedMotion } from '../scenes/HabitatScene';
import { useAmbient } from '../sound';

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/** 專注中是獨立畫面：不彈出生物、工程或其他通知。 */
export function Focus({ session, onFinished }: { session: FocusSession; onFinished: (id: string) => void }) {
  const { save, update } = useSave();
  const now = useNow(250);
  const [ending, setEnding] = useState(false);
  const countdown = session.mode === 'countdown';
  const shown = countdown ? remainingMs(session, now) : elapsedMs(session, now);
  const paused = session.status === 'paused';
  const water = session.habitatId === 'stream' || isDone(save, 'gh_fountain');
  useAmbient(save.settings.soundEnabled && !paused, save.settings.soundVolume, water);

  useEffect(() => {
    document.title = `${clock(shown)} · ${APP_NAME}`;
    return () => void (document.title = APP_NAME);
  }, [shown]);

  // 結束一律依實際有效時間結算點數
  // 正向計時結束＝完成；倒數提前結束＝放棄（沒有點數與金幣）
  const end = (status: 'completed' | 'abandoned') => {
    const t = Date.now();
    if (update((s) => closeSession(s, finish(cur(s), t, status), t))) onFinished(session.id);
  };
  // 一律以存檔中的最新狀態為準，重複點擊不會重複結算
  const cur = (s: SaveFile) => s.sessions.find((x) => x.id === session.id)!;

  const elapsedMin = Math.floor(elapsedMs(session, now) / 60000);
  const reduced = save.settings.reducedMotion || prefersReducedMotion();

  // 控制鈕平常隱藏，輕觸畫面才出現；進行中 4 秒後自動收起，暫停時常駐
  const [showControls, setShowControls] = useState(false);
  useEffect(() => {
    if (!showControls || paused || ending) return;
    const id = window.setTimeout(() => setShowControls(false), 4000);
    return () => clearTimeout(id);
  }, [showControls, paused, ending]);
  const act = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <>
    <div className={showControls || paused ? 'focus show-controls' : 'focus'} onClick={() => setShowControls((v) => !v)}>
      <div className="focus-bg" aria-hidden="true">
        <HabitatScene habitatId={session.habitatId} calm />
      </div>
      <div className="focus-controls">
        {paused ? (
          <button className="pill" onClick={act(() => update((s) => putSession(s, resume(cur(s), Date.now()))))}>
            恢復
          </button>
        ) : (
          <button className="pill" onClick={act(() => update((s) => putSession(s, pause(cur(s), Date.now()))))}>
            暫停
          </button>
        )}
        {countdown ? (
          <button className="pill ghost-light" onClick={act(() => setEnding(true))}>
            提前結束
          </button>
        ) : (
          <button className="pill ghost-light" onClick={act(() => end('completed'))}>
            完成這段專注
          </button>
        )}
      </div>
      <div className={reduced ? 'focus-bubble still' : 'focus-bubble'}>
        <div className="focus-time" role="timer" aria-live="off" aria-label={countdown ? '剩餘時間' : '已專注時間'}>
          {clock(shown)}
        </div>
        {paused && (
          <p className="focus-status" aria-live="polite">
            已暫停
          </p>
        )}
      </div>
    </div>
      {ending && (
        <Modal title="要放棄這段專注嗎？" onClose={() => setEnding(false)}>
          <p>倒數還沒結束。現在放棄，已專注的 {elapsedMin} 分鐘不會獲得任何成長點數和金幣，只會留下時間紀錄。</p>
          <div className="stack">
            <button className="primary wide" onClick={() => setEnding(false)}>
              繼續專注
            </button>
            <button className="danger wide" onClick={() => end('abandoned')}>
              放棄這段專注
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
