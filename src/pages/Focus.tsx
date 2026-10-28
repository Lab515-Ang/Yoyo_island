import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNow, useSave } from '../app/store';
import { APP_NAME, MIN_FOCUS_MINUTES, PAUSE_MINUTES, SOUNDS, TEST_TOOLS, animalDef } from '../content/config';
import { LEAVE_MS, Modal } from '../components/ui';
import { Scope } from '../components/Scope';
import { completeNow, elapsedMs, finish, pause, rawElapsedMs, remainingMs, resume, targetReached, watchWindow } from '../domain/focus';
import { applyFocusRewards, cancelSession, closeSession, focusSoundFor, graceLeftMs, growthOf, putSession } from '../domain/game';
import type { FocusSession, SaveFile } from '../domain/types';
import { useAmbient } from '../sound';
import { DEEP_GRACE_MS, TimeGuard, cancelFocusEnd, isAndroid, scheduleFocusEnd, tapHaptic } from '../platform';
import { Check, Lock, Pause, Play, Square, Volume2, VolumeX, Zap } from 'lucide-react';

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

// 靠近的三個小事件（25%、50%、75%）
const MOMENTS = [(n: string) => `地上出現了${n}的足跡`, (n: string) => `草叢沙沙作響……是${n}嗎？`, (n: string) => `${n}探出頭來了！`];
// 螢火蟲的位置（畫面百分比）
const FIREFLIES: [number, number][] = [
  [14, 38], [82, 30], [26, 58], [70, 52], [46, 26], [88, 64], [8, 70], [58, 40],
];

/** 專注中是獨立畫面：不彈出生物、工程或其他通知。 */
export function Focus({ session, onFinished }: { session: FocusSession; onFinished: (id: string) => void }) {
  const { save, update, notify } = useSave();
  const now = useNow(250);
  const [ending, setEnding] = useState(false);
  const [testing, setTesting] = useState(false);
  const countdown = session.mode === 'countdown';
  // 延長計時：目標到了之後改成往上數超過的時間，按停止就是完成
  const reached = targetReached(session, now);
  const over = !!session.extend && reached;
  const shown = over ? rawElapsedMs(session, now) - (session.targetSeconds ?? 0) * 1000 : countdown ? remainingMs(session, now) : elapsedMs(session, now);
  const paused = session.status === 'paused';
  // 每 250ms 重繪一次：環境音只在存檔變了才重算
  const sound = useMemo(() => focusSoundFor(save, session.habitatId), [save, session.habitatId]);
  useAmbient(save.settings.soundEnabled && !paused, save.settings.soundVolume, sound);

  // 只在顯示的秒數變了才改分頁標題；離開專注畫面時還原
  const label = (over ? '+' : '') + clock(shown);
  useEffect(() => {
    document.title = `${label} · ${APP_NAME}`;
  }, [label]);
  useEffect(() => () => void (document.title = APP_NAME), []);

  // 結束一律依實際有效時間結算點數
  // 正向計時結束＝完成；倒數提前結束＝放棄（沒有點數與金幣）
  const [leaving, setLeaving] = useState(false);
  const leave = (commit: () => boolean) => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => commit() || setLeaving(false), LEAVE_MS);
  };
  const end = (status: 'completed' | 'abandoned') => {
    const t = Date.now();
    leave(() => {
      const ok = !!update((s) => applyFocusRewards(closeSession(s, finish(cur(s), t, status), t), session.id, t));
      if (ok) onFinished(session.id);
      return ok;
    });
  };
  // 一律以存檔中的最新狀態為準，重複點擊不會重複結算
  const cur = (s: SaveFile) => s.sessions.find((x) => x.id === session.id)!;
  // 暫停：剛好已經到時間的話，pause 會直接回傳「已完成」，這時要照常結算（給獎勵、遇見動物、進結算畫面）
  const pauseNow = () => {
    const t = Date.now();
    let finished = false;
    const ok = update((s) => {
      const n = pause(cur(s), t, PAUSE_MINUTES * 60_000);
      if (n.status !== 'completed') return putSession(s, n);
      finished = true;
      return applyFocusRewards(closeSession(s, n, t), n.id, t);
    });
    if (ok && finished) onFinished(session.id);
  };

  const elapsedMin = Math.floor(elapsedMs(session, now) / 60000);
  // 正向計時未滿 10 分鐘就結束＝放棄；滿了才算完成
  const tooShort = !countdown && elapsedMin < MIN_FOCUS_MINUTES;
  const grace = Math.ceil(graceLeftMs(session, now) / 1000);
  const soundOn = save.settings.soundEnabled;
  const soundName = SOUNDS.find((x) => x.id === sound)?.name;
  // 自訂鼓勵語句（設定裡加的）：每 30 秒換一句；沒設定就不顯示
  const quotes = save.settings.quotes;
  const quote = quotes.length ? quotes[Math.floor(now / 30_000) % quotes.length] : null;

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

  const endAt = countdown && !paused && !reached ? new Date(now + remainingMs(session, now)).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : null;

  // 倒數進行中：在目標時間排定系統通知（App 版鎖屏也會準時跳出）；暫停、取消、放棄、結束時撤銷
  // 延長計時的目標到了不會結算，通知改成「達成目標，可以繼續」
  const notifyAt = countdown && session.status === 'running' && session.runningSince && !reached ? Date.parse(session.runningSince) + (session.targetSeconds ?? 0) * 1000 - session.accumulatedMs : null;
  useEffect(() => {
    if (!notifyAt || !save.settings.endNotify) return;
    const min = Math.round((session.targetSeconds ?? 0) / 60);
    if (session.extend) void scheduleFocusEnd(notifyAt, `${APP_NAME}・達成目標`, `「${session.taskTitle}」達成 ${min} 分鐘目標了，想繼續就繼續專注吧。`);
    else void scheduleFocusEnd(notifyAt, `${APP_NAME}・專注完成`, `「${session.taskTitle}」完成了 ${min} 分鐘，回來看看小島吧。`);
    return () => void cancelFocusEnd();
  }, [notifyAt, save.settings.endNotify, session.taskTitle, session.targetSeconds, session.extend]);

  // 測試工具：立刻以指定分鐘完成，正常結算
  const finishNow = (minutes: number) => {
    const t = Date.now();
    leave(() => {
      const ok = !!update((s) => applyFocusRewards(closeSession(s, completeNow(cur(s), t, minutes), t), session.id, t));
      if (ok) onFinished(session.id);
      return ok;
    });
  };

  // 探索中：動物從剪影慢慢走近、現出顏色。倒數依進度；正向計時以 45 分鐘為一輪（分 20 段，避免每次重繪都變）
  const progress = Math.floor(Math.min(1, countdown && session.targetSeconds ? elapsedMs(session, now) / (session.targetSeconds * 1000) : elapsedMin / 45) * 20) / 20;
  const stage = useMemo(() => growthOf(save, session.animalId ?? '').stage, [save, session.animalId]);

  // 靠近的劇情：每 25% 一個小事件（足跡 → 草叢在晃 → 探出頭），跳一個小泡泡、輕輕震一下
  const step = Math.min(4, Math.floor(progress * 4));
  const prevStep = useRef(step);
  const [moment, setMoment] = useState<string | null>(null);
  useEffect(() => {
    const was = prevStep.current;
    prevStep.current = step;
    if (step <= was || step >= 4 || paused) return;
    setMoment(MOMENTS[step - 1](animalDef(session.animalId).name));
    tapHaptic();
    const t = window.setTimeout(() => setMoment(null), 5000);
    return () => clearTimeout(t);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // 當下就看得到修復進度：這次專注完成後，目前工程會到幾 %

  // 深度專注：進行中與玩家按的暫停都請原生端看守（暫停期間離開不算，自動繼續後還在外面就算離開）
  // key 相同（同一段、同一次開始計時）時原生端會保留背景期間的紀錄，App 重開也不會洗掉
  const win = session.deep && isAndroid ? watchWindow(session) : null;
  const watchUntil = win?.endAt ?? null;
  const watchKey = `${session.id}:${session.runningSince ?? `p${session.pauseLimitAt}`}`;
  const allow = save.settings.focusAllow.map((a) => a.pkg).join(',');
  // 延長計時的完成時間不固定：結束通知由上面的「達成目標」負責
  const notifyEnd = countdown && save.settings.endNotify && !session.extend;
  const doneText = `「${session.taskTitle}」完成了 ${Math.round((session.targetSeconds ?? 0) / 60)} 分鐘，回來看看小島吧。`;
  // 常駐通知（狀態列鎖頭）：倒數顯示剩下的時間，正向計時從已專注的時間往上數
  const watchText = `正在靠近${animalDef(session.animalId).name}・${session.tag}`;
  useEffect(() => {
    if (!watchUntil) return;
    const down = countdown && !session.extend;
    const chronoBase = down ? watchUntil : win!.since;
    void TimeGuard.startFocusWatch({ key: watchKey, endAt: watchUntil, graceMs: DEEP_GRACE_MS, allow: allow ? allow.split(',') : [], notifyEnd, doneTitle: `${APP_NAME}・專注完成`, doneText, title: '🔭 專注中', text: watchText, chronoBase, chronoDown: down, freeUntil: win!.freeUntil, progressFrom: countdown ? win!.since : 0, progressTo: countdown ? win!.since + (session.targetSeconds ?? 0) * 1000 : 0 });
    return () => void TimeGuard.stopFocusWatch();
  }, [watchUntil, watchKey, allow, notifyEnd, doneText, watchText]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = () => {
    const t = Date.now();
    leave(() => {
      const ok = !!update((s) => cancelSession(s, session.id, t));
      if (ok) notify('已取消，這次不算數。');
      return ok;
    });
  };
  const toggleSound = () => update((s) => ({ ...s, settings: { ...s.settings, soundEnabled: !s.settings.soundEnabled } }));

  return (
    <>
      <div className={leaving ? 'focus scoped leaving' : 'focus scoped'}>
        {/* 望遠鏡：在全景上左右搜尋，動物躲在草叢後面，越久探出越多 */}
        <Scope id={session.animalId} stage={stage} progress={progress} paused={paused} />
        {/* 時間越久光線越暖，森林裡的小生物（螢火蟲）越多 */}
        <div className="focus-light" style={{ opacity: progress * 0.45 }} aria-hidden="true" />
        <div className="focus-life" aria-hidden="true">
          {FIREFLIES.slice(0, Math.round(progress * FIREFLIES.length)).map(([x, y], i) => (
            <span key={i} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.7}s` } as CSSProperties} />
          ))}
        </div>
        <div className="focus-top">
          {TEST_TOOLS && (
            <button className="test-btn" onClick={() => setTesting(true)}>
              <Zap size={14} aria-hidden="true" /> 測試：立即完成
            </button>
          )}
          {session.deep && isAndroid && (
            <span className="focus-pill">
              <Lock size={13} aria-hidden="true" /> 深度專注
            </span>
          )}
          {soundOn && <span className="focus-pill">正在播放：{soundName}</span>}
          <button className="icon-round" onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? '關閉環境音' : '開啟環境音'}>
            {soundOn ? <Volume2 size={20} aria-hidden="true" /> : <VolumeX size={20} aria-hidden="true" />}
          </button>
        </div>
        {/* 鏡片下面只放三行：時間、一句狀態（有足跡提示時換成提示）、預計結束 */}
        <div className="focus-info">
          {quote && <p className="focus-quote">{quote}</p>}
          <div className="focus-time" role="timer" aria-live="off" aria-label={over ? '超過目標的時間' : countdown ? '剩餘時間' : '已專注時間'}>
            {label}
          </div>
          <p className={moment && !paused && progress < 1 ? 'focus-line moment' : 'focus-line'} key={paused ? 'paused' : moment ?? 'status'} aria-live="polite">
            {paused
              ? `已暫停${session.pauseLimitAt ? `・${clock(Math.max(0, Date.parse(session.pauseLimitAt) - now))} 後自動繼續` : ''}`
              : (progress < 1 && moment) || (over ? `找到${animalDef(session.animalId).name}了！想繼續就繼續，按 ■ 完成` : progress < 0.5 ? `正在靠近${animalDef(session.animalId).name}…` : progress < 1 ? `${animalDef(session.animalId).name}就在附近了…` : `找到${animalDef(session.animalId).name}了！`)}
          </p>
          {endAt && <p className="focus-endtime">預計 {endAt} {session.extend ? '達成目標' : '結束'}</p>}
        </div>
        <div className="focus-controls">
          {grace > 0 && !paused ? (
            // 開始後 10 秒內：免費取消，不算放棄
            <button className="link-light" onClick={cancel}>
              取消（{grace}）
            </button>
          ) : (
            <>
              <button className={over ? 'icon-round big done' : 'icon-round big'} onClick={() => (over ? end('completed') : countdown || tooShort ? setEnding(true) : end('completed'))} aria-label={over || !(countdown || tooShort) ? '完成這段專注' : '提前結束'}>
                {over ? <Check size={24} strokeWidth={3} aria-hidden="true" /> : <Square size={18} fill="currentColor" aria-hidden="true" />}
              </button>
              {paused ? (
                <button className="icon-round big on" onClick={() => update((s) => putSession(s, resume(cur(s), Date.now())))} aria-label="恢復">
                  <Play size={22} fill="currentColor" aria-hidden="true" />
                </button>
              ) : (
                <button className="icon-round big on" onClick={pauseNow} aria-label="暫停">
                  <Pause size={22} fill="currentColor" aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {testing && (
        <Modal title="測試：立即完成" onClose={() => setTesting(false)}>
          <p className="small muted">測試階段用：把這段專注當作已專注指定的分鐘並正常結算（點數、金幣、工程、遇見動物都照算）。上線前會移除。</p>
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
        <Modal title="要放棄這次專注嗎？" onClose={() => setEnding(false)} closing={leaving}>
          <p>
            {tooShort ? `還不到 ${MIN_FOCUS_MINUTES} 分鐘。` : ''}已專注的 {elapsedMin} 分鐘不會修復森林、也拿不到金幣，{animalDef(session.animalId).name}也會被嚇跑，只會留下時間紀錄。
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
