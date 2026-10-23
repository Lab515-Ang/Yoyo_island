import { useEffect, useState } from 'react';
import { useNow, useSave } from '../app/store';
import { APP_NAME, MIN_FOCUS_MINUTES, SOUNDS, TEST_TOOLS, plantTier, tagColor } from '../content/config';
import { Modal } from '../components/ui';
import { PlantArt } from '../components/Garden';
import { completeNow, elapsedMs, finish, pause, remainingMs, resume } from '../domain/focus';
import { applyFocusRewards, cancelSession, closeSession, focusSoundFor, graceLeftMs, putSession } from '../domain/game';
import type { FocusSession, SaveFile } from '../domain/types';
import { HabitatScene, prefersReducedMotion } from '../scenes/HabitatScene';
import { useAmbient } from '../sound';
import { cancelFocusEnd, scheduleFocusEnd } from '../platform';

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
  const [testing, setTesting] = useState(false);
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
    if (update((s) => applyFocusRewards(closeSession(s, finish(cur(s), t, status), t), session.id, t))) onFinished(session.id);
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

  // 保持螢幕開啟：鎖屏時網頁會暫停，開著螢幕倒數結束才能準時響鈴
  useEffect(() => {
    if (!save.settings.keepAwake || paused || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = () => {
      if (document.visibilityState === 'visible') navigator.wakeLock.request('screen').then((l) => (lock = l), () => undefined);
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, [save.settings.keepAwake, paused]);

  const endAt = countdown && !paused ? new Date(now + remainingMs(session, now)).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : null;

  // 倒數進行中：排定系統通知（App 版鎖屏也會準時跳出）；暫停、取消、放棄、結束時撤銷
  const notifyAt = countdown && session.status === 'running' && session.runningSince ? Date.parse(session.runningSince) + (session.targetSeconds ?? 0) * 1000 - session.accumulatedMs : null;
  useEffect(() => {
    if (!notifyAt || !save.settings.endNotify) return;
    const min = Math.round((session.targetSeconds ?? 0) / 60);
    void scheduleFocusEnd(notifyAt, `${APP_NAME}・專注完成`, `「${session.taskTitle}」完成了 ${min} 分鐘，回來看看小島吧。`);
    return () => void cancelFocusEnd();
  }, [notifyAt, save.settings.endNotify, session.taskTitle, session.targetSeconds]);

  // 測試工具：立刻以指定分鐘完成，正常結算
  const finishNow = (minutes: number) => {
    const t = Date.now();
    if (update((s) => applyFocusRewards(closeSession(s, completeNow(cur(s), t, minutes), t), session.id, t))) onFinished(session.id);
  };

  // 植物跟著專注長大：倒數依進度長到目標時間的大小；正向計時依已專注的分鐘
  const finalTier = plantTier(countdown ? (session.targetSeconds ?? 0) / 60 : elapsedMin);
  const progress = countdown && session.targetSeconds ? elapsedMs(session, now) / (session.targetSeconds * 1000) : 0;
  const growTier = countdown ? (progress < 0.15 ? -1 : Math.min(finalTier, Math.floor(progress * (finalTier + 1)))) : elapsedMin < MIN_FOCUS_MINUTES ? -1 : finalTier;

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
          {TEST_TOOLS && (
            <button className="test-btn" onClick={() => setTesting(true)}>
              ⚡ 測試：立即完成
            </button>
          )}
          {soundOn && <span className="small">正在播放：{soundName}</span>}
          <button className="icon-round" onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? '關閉環境音' : '開啟環境音'}>
            {soundOn ? '🔊' : '🔇'}
          </button>
        </div>
        <div className="focus-plant">
          <PlantArt id={session.plantId} tier={growTier} color={tagColor(session.tag)} size="100%" />
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
        {endAt && <p className="focus-endtime">預計 {endAt} 結束</p>}
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
      {testing && (
        <Modal title="測試：立即完成" onClose={() => setTesting(false)}>
          <p className="small muted">測試階段用：把這段專注當作已專注指定的分鐘並正常結算（點數、金幣、飼料、工程、植物都照算）。上線前會移除。</p>
          <div className="chips">
            {countdown && session.targetSeconds && session.targetSeconds >= 60 && (
              <button className="chip on" onClick={() => finishNow(Math.round(session.targetSeconds! / 60))}>
                目標 {Math.round(session.targetSeconds / 60)} 分
              </button>
            )}
            {[10, 25, 60, 120, 180].map((m) => (
              <button key={m} className="chip" onClick={() => finishNow(m)}>
                {m} 分
              </button>
            ))}
          </div>
        </Modal>
      )}
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
