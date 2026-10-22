import { useEffect, useState } from 'react';
import { useNow, useSave } from '../app/store';
import { APP_NAME, habitatName } from '../content/config';
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
  const end = () => {
    const t = Date.now();
    if (update((s) => closeSession(s, finish(cur(s), t, 'completed'), t))) onFinished(session.id);
  };
  // 一律以存檔中的最新狀態為準，重複點擊不會重複結算
  const cur = (s: SaveFile) => s.sessions.find((x) => x.id === session.id)!;

  const elapsedMin = Math.floor(elapsedMs(session, now) / 60000);
  const reduced = save.settings.reducedMotion || prefersReducedMotion();

  return (
    <div className="focus">
      <div className="focus-scene" aria-hidden="true">
        <HabitatScene habitatId={session.habitatId} calm />
      </div>
      <div className="focus-panel">
        <p className="muted">
          {session.tag} · {habitatName(session.habitatId)}
        </p>
        <h1 className="focus-task">{session.taskTitle}</h1>
        <div className="focus-time" role="timer" aria-live="off" aria-label={countdown ? '剩餘時間' : '已專注時間'}>
          {clock(shown)}
        </div>
        <p className="muted small">{countdown ? `目標 ${Math.round((session.targetSeconds ?? 0) / 60) || '<1'} 分鐘` : '正向計時'}</p>
        {countdown && (
          <button
            className="link small"
            aria-pressed={save.settings.endChime}
            onClick={() => update((s) => ({ ...s, settings: { ...s.settings, endChime: !s.settings.endChime } }))}
          >
            {save.settings.endChime ? '🔔 結束時響鈴：開' : '🔕 結束時響鈴：關'}
          </button>
        )}
        {paused && (
          <div className="breath">
            <span className={reduced ? 'breath-dot still' : 'breath-dot'} aria-hidden="true" />
            <p className="small">暫停中。吸氣四拍，吐氣六拍，準備好再回來。</p>
          </div>
        )}
        <div className="row center">
          {paused ? (
            <button className="primary" onClick={() => update((s) => putSession(s, resume(cur(s), Date.now())))}>
              恢復
            </button>
          ) : (
            <button className="primary" onClick={() => update((s) => putSession(s, pause(cur(s), Date.now())))}>
              暫停
            </button>
          )}
          {countdown ? (
            <button className="ghost" onClick={() => setEnding(true)}>
              提前結束
            </button>
          ) : (
            <button className="ghost" onClick={end}>
              完成這段專注
            </button>
          )}
        </div>
        <p className="muted small note">計時代表你自己記錄的投入時間；切到其他 App 不會被當成分心。</p>
      </div>
      {ending && (
        <Modal title="要提前結束這段專注嗎？" onClose={() => setEnding(false)}>
          <p className="muted">目前已專注 {elapsedMin} 分鐘。</p>
          <div className="stack">
            <button className="primary wide" onClick={end}>
              結束並結算
              <span className="small block">依實際時間取得 {elapsedMin} 點</span>
            </button>
            <button className="link" onClick={() => setEnding(false)}>
              繼續專注
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
