import { useEffect, useRef, useState } from 'react';
import { useGame, useNow, useSave } from './app/store';
import { APP_NAME, COPY, avatarEmoji } from './content/config';
import { balance, coins, feed, openSession, settleOpenSessions } from './domain/game';
import * as storage from './data/storage';
import { remainingMs } from './domain/focus';
import { notifyEnd, playChime } from './sound';
import type { HabitatId } from './domain/types';
import { Onboarding } from './pages/Onboarding';
import { Lobby } from './pages/Lobby';
import { Focus } from './pages/Focus';
import { Summary } from './pages/Summary';
import { IslandPage } from './pages/Island';
import { Quests } from './pages/Quests';
import { Records } from './pages/Records';
import { Sounds } from './pages/Sounds';
import { Journey } from './pages/Journey';
import { Together } from './pages/Together';
import { SettingsPage } from './pages/Settings';
import { Shop } from './pages/Shop';
import { Coin } from './components/ui';

type View = 'lobby' | 'island' | 'quests' | 'records' | 'sounds' | 'journey' | 'friends' | 'achievements' | 'shop' | 'news' | 'settings';
// 左側選單順序
const NAV: { id: View; label: string; icon: string; soon?: boolean }[] = [
  { id: 'island', label: '我的小島', icon: '🏝️' },
  { id: 'quests', label: '任務', icon: '📋' },
  { id: 'records', label: '專注紀錄與專注計畫設置', icon: '⏱️' },
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
  const { save, mode, update, stale, writeError, toast, switchMode } = useSave();
  const [view, setView] = useState<View>('lobby');
  const [habitat, setHabitat] = useState<HabitatId | null>(null);
  const [summaryId, setSummaryId] = useState<string | null>(null);
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
  const now = useNow(500, !!open);

  // 倒數在背景或重新整理時歸零：結算一次並顯示結算畫面
  const [wake, setWake] = useState(0);
  useEffect(() => {
    const r = settleOpenSessions(save, Date.now());
    if (!r.completed || !update(() => r.save)) return;
    setSummaryId(r.completed.id);
    // 剛歸零才提醒；隔很久重新開啟時不補響
    if (Date.now() - Date.parse(r.completed.endedAt!) < 60_000) {
      const st = save.settings;
      if (st.endChime) playChime(st.soundVolume);
      if (st.endNotify) void notifyEnd(`${APP_NAME}・專注完成`, `「${r.completed.taskTitle}」完成了 ${Math.floor(r.completed.accumulatedMs / 60000)} 分鐘，回來看看小島吧。`);
    }
  }, [now, wake, save, update]);

  // 背景分頁的 interval 會被節流，另排一個剛好在歸零時觸發的 timeout
  useEffect(() => {
    if (!open || open.status !== 'running' || open.mode !== 'countdown') return;
    const id = window.setTimeout(() => setWake((w) => w + 1), remainingMs(open, Date.now()) + 50);
    return () => clearTimeout(id);
  }, [open]);

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
    setView(v);
    setHabitat(h);
    setNavOpen(false);
    window.scrollTo(0, 0);
  };
  const enter = (h: HabitatId) => go('island', h);

  let body;
  if (open) body = <Focus session={open} onFinished={setSummaryId} />;
  else if (summaryId) body = <Summary sessionId={summaryId} onDone={() => go('lobby')} onProject={() => go('island')} />;
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
          <div className="wallet" title="成長點數、金幣與飼料">
            <span title="成長點數">
              🌱 <strong>{balance(save)}</strong>
            </span>
            <span title="金幣">
              <Coin /> <strong>{coins(save)}</strong>
            </span>
            <span title="飼料">
              🌾 <strong>{feed(save)}</strong>
            </span>
          </div>
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
        <main className="content">
          {view === 'lobby' && <Lobby onStarted={() => setSummaryId(null)} onGoIsland={() => go('island')} />}
          {view === 'island' && <IslandPage habitat={habitat} setHabitat={setHabitat} onShop={() => go('shop')} />}
          {view === 'quests' && <Quests onIsland={() => go('island')} onEnter={enter} onShop={() => go('shop')} />}
          {view === 'records' && <Records />}
          {view === 'sounds' && <Sounds onSettings={() => go('settings')} />}
          {view === 'journey' && <Journey onEnter={enter} />}
          {view === 'friends' && <Together />}
          {view === 'achievements' && <NotYet title="成就" />}
          {view === 'shop' && <Shop onEnter={enter} />}
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
