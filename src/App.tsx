import { useEffect, useRef, useState } from 'react';
import { useGame, useSave } from './app/store';
import { APP_NAME, COPY, avatarEmoji } from './content/config';
import { applyFocusRewards, closeSession, coins, openSession, putSession, settleOpenSessions } from './domain/game';
import * as storage from './data/storage';
import { applyDeepFocus, dueAt } from './domain/focus';
import { notifyEnd, playChime } from './sound';
import { TimeGuard, buzz, isAndroid, isNative, minimizeApp, onBack, onGuard, onPause, onResume, type GuardApp } from './platform';
import type { HabitatId } from './domain/types';
import { Onboarding } from './pages/Onboarding';
import { Lobby } from './pages/Lobby';
import { Focus } from './pages/Focus';
import { Summary } from './pages/Summary';
import { Break } from './pages/Break';
import { IslandPage } from './pages/Island';
import { Quests } from './pages/Quests';
import { Records } from './pages/Records';
import { Sounds } from './pages/Sounds';
import { Journey } from './pages/Journey';
import { Together } from './pages/Together';
import { SettingsPage } from './pages/Settings';
import { Shop } from './pages/Shop';
import { GuardPage, GuardScreen } from './pages/Guard';
import { Coin, Modal } from './components/ui';
import { Tour } from './components/Tour';

type View = 'lobby' | 'island' | 'quests' | 'records' | 'guard' | 'sounds' | 'journey' | 'friends' | 'achievements' | 'shop' | 'news' | 'settings';
// 左側選單順序
const NAV: { id: View; label: string; icon: string; soon?: boolean }[] = [
  { id: 'island', label: '我的小島', icon: '🏝️' },
  { id: 'quests', label: '任務', icon: '📋' },
  { id: 'records', label: '專注紀錄', icon: '⏱️' },
  { id: 'guard', label: '時間守護', icon: '🛡️' },
  { id: 'sounds', label: '大自然交響樂', icon: '🎵' },
  { id: 'journey', label: '我的歷程', icon: '📖' },
  { id: 'friends', label: '好友', icon: '🤝' },
  { id: 'achievements', label: '成就', icon: '🏅', soon: true },
  { id: 'shop', label: '商店', icon: '🛍️' },
  { id: 'news', label: '活動消息', icon: '📣', soon: true },
  { id: 'settings', label: '設定', icon: '⚙️' },
];

// 介面偏好，不屬於存檔：key 不用存檔前綴，避免觸發其他分頁的「存檔已更新」
const NAV_KEY = 'qiguang-ui:navCollapsed';
const TOUR_KEY = 'qiguang-ui:tourSeen';

/** 新手導覽：完成第一段專注、第一次回到大廳時看一次（之後在設定可以再看）。 */
function FirstTour() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(TOUR_KEY) !== '1';
    } catch {
      return false;
    }
  });
  if (!open) return null;
  const done = () => {
    try {
      localStorage.setItem(TOUR_KEY, '1');
    } catch {
      // 只影響導覽會不會再出現
    }
    setOpen(false);
  };
  return (
    <Modal title="歡迎來到棲光小島" onClose={done}>
      <Tour onDone={done} doneLabel="知道了" />
    </Modal>
  );
}
function readCollapsed() {
  try {
    return localStorage.getItem(NAV_KEY) === '1';
  } catch {
    return false;
  }
}

/** 尚未實作的區塊：清楚標示，不放假內容。 */
function NotYet({ title }: { title: string }) {
  return (
    <div className="page">
      <h1>{title}</h1>
      <section className="card center">
        <p className="eyebrow">尚未開放</p>
        <p className="muted">這個區塊還在規劃中，目前沒有任何內容或功能。</p>
      </section>
    </div>
  );
}

export default function App() {
  const g = useGame();
  if (g.loaded.status === 'corrupt') return <Corrupt error={g.loaded.error} raw={g.loaded.raw} />;
  if (!g.save) return <Onboarding />;
  return <Main />;
}

function Main() {
  const { save, mode, update, stale, writeError, toast, switchMode, notify } = useSave();
  const [view, setView] = useState<View>('lobby');
  const [habitat, setHabitat] = useState<HabitatId | null>(null);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [resting, setResting] = useState(false);
  const [recordsTag, setRecordsTag] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false); // 手機：抽屜
  const [collapsed, setCollapsedState] = useState(readCollapsed); // 桌面：收合成圖示列
  const setCollapsed = (fn: (c: boolean) => boolean) =>
    setCollapsedState((c) => {
      const next = fn(c);
      try {
        localStorage.setItem(NAV_KEY, next ? '1' : '0');
      } catch {
        // 無法保存只影響下次開啟的選單狀態
      }
      return next;
    });
  const wide = () => matchMedia('(min-width: 900px)').matches;
  const open = openSession(save);

  // 深度專注（Android）：App 在背景時網頁不會執行，離開、接電話都由原生端記下；
  // 回到前景或快結束時先套用這些事，確認過了才結算，避免離開太久還被算成完成
  const deepChecked = useRef(0);
  const deepChecking = useRef(false);
  const deepWatched = !!open && open.deep === true && open.status === 'running' && isAndroid;
  const syncDeep = async () => {
    if (deepChecking.current) return;
    deepChecking.current = true;
    const at = Date.now();
    try {
      const st = await TimeGuard.focusWatchStatus();
      if (st.failedAt || st.callStart || st.calls.length) {
        await TimeGuard.clearFocusEvents();
        let ended: string | null = null;
        let withered = false;
        update((s) => {
          const o = openSession(s);
          if (!o?.deep) return s;
          const n = applyDeepFocus(o, { calls: st.calls, callStart: st.callStart || null, failedAt: st.failedAt || null });
          if (n.status === 'abandoned' || n.status === 'completed') ended = n.id;
          withered = n.status === 'abandoned';
          if (n.status === 'abandoned') return closeSession(s, n, Date.now());
          // 離開前就已經完成：照常結算
          if (n.status === 'completed') return applyFocusRewards(closeSession(s, n, Date.now()), n.id, Date.now());
          return putSession(s, n);
        });
        if (ended) {
          setSummaryId(ended);
          if (withered) notify('離開棲光小島超過 10 秒，這顆蛋沒有孵化。');
        }
      }
      deepChecked.current = at;
    } catch {
      deepChecked.current = at; // 讀不到原生狀態時照一般方式結算
    } finally {
      deepChecking.current = false;
      setWake((w) => w + 1);
    }
  };

  // 倒數在背景或重新整理時歸零：結算一次並顯示結算畫面
  const [wake, setWake] = useState(0);
  useEffect(() => {
    if (deepWatched && open) {
      const due = dueAt(open);
      // 該結算了但還沒確認過背景期間的事：先確認
      if (due !== null && Date.now() >= due && deepChecked.current < due) return void syncDeep();
    }
    const r = settleOpenSessions(save, Date.now());
    if (!r.completed) return;
    const id = r.completed.id;
    // 點數自動投入工程；在最新的存檔上結算（別的流程可能剛改過，例如深度專注判定放棄）
    let settled = false;
    if (
      !update((s) => {
        const x = settleOpenSessions(s, Date.now());
        if (x.completed?.id !== id) return s;
        settled = true;
        return applyFocusRewards(x.save, id, Date.now());
      }) ||
      !settled
    )
      return;
    setSummaryId(id);
    // App 版鎖屏時系統通知已經提醒過，回來只在剛結束時響鈴；網頁版 30 分鐘內回來都補提醒
    if (Date.now() - Date.parse(r.completed.endedAt!) < (isNative ? 60_000 : 30 * 60_000)) {
      const st = save.settings;
      if (st.endChime) playChime(st.soundVolume);
      buzz();
      if (st.endNotify && !isNative) void notifyEnd(`${APP_NAME}・專注完成`, `「${r.completed.taskTitle}」完成了 ${Math.floor(r.completed.accumulatedMs / 60000)} 分鐘，回來看看小島吧。`);
    }
  }, [wake, save, update]);

  // 時間守護：背景服務在玩家打開想減少使用的 App 時把小島叫到前面
  // 每次攔截都是新的畫面（同一個 App 再被攔也重新倒數）；App 進到背景就收掉，不會留到下次打開
  const [guardApp, setGuardApp] = useState<(GuardApp & { at: number }) | null>(null);
  useEffect(() => onGuard((a) => setGuardApp({ ...a, at: Date.now() })), []);
  useEffect(() => onPause(() => setGuardApp(null)), []);

  // 回到前景（解鎖、從其他 App 切回來）時立刻結算；深度專注先確認有沒有離開太久
  const syncRef = useRef(syncDeep);
  syncRef.current = syncDeep;
  const deepRef = useRef(deepWatched);
  deepRef.current = deepWatched;
  useEffect(() => onResume(() => (deepRef.current ? void syncRef.current() : setWake((w) => w + 1))), []);
  // App 重開（被系統關掉後再打開）時也先確認背景期間有沒有離開太久
  useEffect(() => {
    if (deepRef.current) void syncRef.current();
  }, []);

  // 剛好在該結算時（倒數歸零、正向計時滿 180 分鐘）觸發一次結算；不用每秒重繪整個畫面
  useEffect(() => {
    const due = open ? dueAt(open) : null;
    if (due === null) return;
    const id = window.setTimeout(() => setWake((w) => w + 1), Math.max(0, due - Date.now()) + 50);
    return () => clearTimeout(id);
  }, [open]);

  // Android 返回鍵：先關彈窗，再回上一層，最後才回到桌面；專注中不做事（避免誤觸離開）
  const backRef = useRef(() => {});
  backRef.current = () => {
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (dialog) return void dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    if (guardApp) return; // 攔截畫面要等倒數，不能用返回鍵跳過
    if (open) return;
    if (navOpen) return setNavOpen(false);
    if (resting || summaryId) return (setResting(false), go('lobby'));
    if (habitat) return setHabitat(null);
    if (view !== 'lobby') return go('lobby');
    minimizeApp();
  };
  useEffect(() => onBack(() => backRef.current()), []);

  // 換模式時回到大廳（首次掛載不算，避免清掉重新載入後的結算畫面）
  const lastMode = useRef(mode);
  useEffect(() => {
    if (lastMode.current === mode) return;
    lastMode.current = mode;
    setSummaryId(null);
    setHabitat(null);
    setView('lobby');
  }, [mode]);

  const go = (v: View, h: HabitatId | null = null) => {
    setSummaryId(null);
    setRecordsTag(null);
    setView(v);
    setHabitat(h);
    setNavOpen(false);
    window.scrollTo(0, 0);
  };
  const enter = (h: HabitatId) => go('island', h);

  let body;
  if (open) body = <Focus session={open} onFinished={setSummaryId} />;
  else if (resting) body = <Break onDone={() => (setResting(false), go('lobby'))} />;
  else if (summaryId)
    body = (
      <Summary
        sessionId={summaryId}
        onDone={() => go('lobby')}
        onProject={() => go('island')}
        onShop={() => go('shop')}
        onRecords={(tag) => {
          go('records');
          setRecordsTag(tag);
        }}
        onBreak={() => {
          setSummaryId(null);
          setResting(true);
        }}
      />
    );
  else
    body = (
      <div className={collapsed ? 'shell nav-collapsed' : 'shell'}>
        <header className="topbar">
          <button
            className="menu-btn"
            onClick={() => (wide() ? setCollapsed((c) => !c) : setNavOpen(true))}
            aria-label={wide() ? (collapsed ? '展開選單' : '收合選單') : '開啟選單'}
            aria-expanded={wide() ? !collapsed : navOpen}
            aria-controls="sidenav"
          >
            ☰
          </button>
          <button className="brand" onClick={() => go('lobby')} aria-label="回到大廳">
            <span className="brand-name">🏠 {APP_NAME}</span>
            <span className="muted small">{save.islands[0]?.name}</span>
          </button>
          <button className="wallet" title="金幣：在商店解鎖動物" onClick={() => go('shop')} aria-label={`金幣 ${coins(save)}，前往商店`}>
            <Coin /> <strong>{coins(save)}</strong>
          </button>
          <button className="avatar-btn" onClick={() => go('settings')} aria-label="設定">
            {avatarEmoji(save.profile.avatarId)}
          </button>
        </header>
        {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} />}
        <nav id="sidenav" className={navOpen ? 'sidenav open' : 'sidenav'} aria-label="主要選單">
          {NAV.map((n) => (
            <button key={n.id} className={view === n.id ? 'nav-item active' : 'nav-item'} aria-current={view === n.id ? 'page' : undefined} onClick={() => go(n.id)} title={n.label}>
              <span aria-hidden="true">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
              {n.soon && <span className="soon">未開放</span>}
            </button>
          ))}
        </nav>
        <main className="content" key={mode}>
          {view === 'lobby' && <Lobby onStarted={() => setSummaryId(null)} onShop={() => go('shop')} />}
          {view === 'lobby' && save.sessions.filter((s) => s.endedAt).length === 1 && <FirstTour />}
          {view === 'island' && <IslandPage habitat={habitat} setHabitat={setHabitat} />}
          {view === 'quests' && <Quests onIsland={() => go('island')} onShop={() => go('shop')} />}
          {view === 'records' && <Records key={recordsTag ?? 'all'} initialTag={recordsTag} />}
          {view === 'guard' && <GuardPage />}
          {view === 'sounds' && <Sounds onSettings={() => go('settings')} />}
          {view === 'journey' && <Journey />}
          {view === 'friends' && <Together />}
          {view === 'achievements' && <NotYet title="成就" />}
          {view === 'shop' && <Shop onLobby={() => go('lobby')} />}
          {view === 'news' && <NotYet title="活動消息" />}
          {view === 'settings' && <SettingsPage />}
        </main>
      </div>
    );

  return (
    <div className={`app mode-${mode}`}>
      {mode === 'demo' && (
        <div className="demo-banner" role="note">
          <span>🧪 {COPY.demoBanner} · 示範資料與你的小島分開保存</span>
          {!open && (
            <button className="link" onClick={() => switchMode('personal')}>
              退出示範
            </button>
          )}
        </div>
      )}
      {writeError && <div className="error-bar" role="alert">{writeError}</div>}
      {body}
      {guardApp && <GuardScreen key={guardApp.at} app={guardApp} onClose={() => setGuardApp(null)} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {stale && (
        <div className="overlay">
          <div className="card center">
            <h2>小島在其他分頁更新了</h2>
            <p className="muted">為了避免兩個分頁互相覆寫，這個分頁已暫停保存。請重新載入以取得最新進度。</p>
            <button className="primary" onClick={() => location.reload()}>
              重新載入
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Corrupt({ error, raw }: { error: string; raw: string }) {
  const { mode, resetDemo } = useGame();
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    a.download = `qiguang-island-${mode}-backup.json`;
    a.click();
  };
  return (
    <div className="app">
      <div className="card center narrow">
        <h1>存檔讀取不到</h1>
        <p>{error}</p>
        <p className="muted">原始資料沒有被改動。你可以先下載備份，再決定要不要重設這份存檔。</p>
        <div className="row wrap">
          <button onClick={download}>下載原始資料</button>
          <button
            className="danger"
            onClick={() => {
              if (!confirm('確定要清除這份無法讀取的存檔嗎？')) return;
              if (mode === 'demo') resetDemo();
              else {
                storage.remove('personal');
                location.reload();
              }
            }}
          >
            清除這份存檔
          </button>
        </div>
      </div>
    </div>
  );
}
