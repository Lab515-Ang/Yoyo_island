import { useEffect, useState } from 'react';
import { useNow, useSave } from '../app/store';
import { APP_NAME, MIN_FOCUS_MINUTES, SOUNDS } from '../content/config';
import { Modal } from '../components/ui';
import { elapsedMs, finish, pause, remainingMs, resume } from '../domain/focus';
import { cancelSession, closeSession, focusSoundFor, graceLeftMs, putSession } from '../domain/game';
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
  const { save, update, notify } = useSave();
  const now = useNow(250);
  const [ending, setEnding] = useState(false);
  const countdown = session.mode === 'countdown';
  const shown = countdown ? remainingMs(session, now) : elapsedMs(session, now);
  const paused = session.status === 'paused';
  useAmbient(save.settings.soundEnabled && !paused, save.settings.soundVolume, focusSoundFor(save, session.habitatId));

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
  // 正向計時未滿 10 分鐘就結束＝放棄；滿了才算完成
  const tooShort = !countdown && elapsedMin < MIN_FOCUS_MINUTES;
  const reduced = save.settings.reducedMotion || prefersReducedMotion();
  const grace = Math.ceil(graceLeftMs(session, now) / 1000);
  const soundOn = save.settings.soundEnabled;
  const soundName = SOUNDS.find((x) => x.id === focusSoundFor(save, session.habitatId))?.name;

  const cancel = () => {
    if (update((s) => cancelSession(s, session.id, Date.now()))) notify('已取消，這次不算數。');
  };
  const toggleSound = () => update((s) => ({ ...s, settings: { ...s.settings, soundEnabled: !s.settings.soundEnabled } }));

  return (
    <>
      <div className="focus">
        <div className="focus-bg" aria-hidden="true">
          <HabitatScene habitatId={session.habitatId} calm />
        </div>
        <div className="focus-top">
          {soundOn && <span className="small">正在播放：{soundName}</span>}
          <button className="icon-round" onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? '關閉環境音' : '開啟環境音'}>
            {soundOn ? '🔊' : '🔇'}
          </button>
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
        <div className="focus-controls">
          {grace > 0 && !paused ? (
            // 開始後 10 秒內：免費取消，不算放棄
            <button className="link-light" onClick={cancel}>
              取消（{grace}）
            </button>
          ) : (
            <>
              <button className="icon-round big" onClick={() => (countdown || tooShort ? setEnding(true) : end('completed'))} aria-label={countdown ? '提前結束' : '完成這段專注'}>
                ■
              </button>
              {paused ? (
                <button className="icon-round big on" onClick={() => update((s) => putSession(s, resume(cur(s), Date.now())))} aria-label="恢復">
                  ▶
                </button>
              ) : (
                <button className="icon-round big on" onClick={() => update((s) => putSession(s, pause(cur(s), Date.now())))} aria-label="暫停">
                  ❚❚
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {ending && (
        <Modal title="要放棄這次專注嗎？" onClose={() => setEnding(false)}>
          <p>
            {tooShort ? `還不到 ${MIN_FOCUS_MINUTES} 分鐘。` : ''}已專注的 {elapsedMin} 分鐘不會獲得成長點數、金幣和飼料，只會留下時間紀錄。
          </p>
          <div className="row">
            <button className="ghost wide" onClick={() => setEnding(false)}>
              取消
            </button>
            <button className="danger-fill wide" onClick={() => end('abandoned')}>
              放棄
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
