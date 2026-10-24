import { useEffect, useState } from 'react';
import { useSave } from '../app/store';
import { AnimalArt } from '../components/Animal';
import { animalDef } from '../content/config';
import { localDateKey } from '../domain/focus';
import { openSession, sceneAnimals } from '../domain/game';
import type { SaveFile } from '../domain/types';
import { TimeGuard, defaultGuardConfig, isAndroid, onResume, type GuardApp, type GuardConfig } from '../platform';

const THINK_SECONDS = 5;
const UNLOCK_MINUTES = 5;
const DAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 每天「忍住／解鎖」次數：只是給玩家看的小統計，存在介面偏好，不進存檔
const LOG_KEY = 'qiguang-ui:guardLog';
type GuardLog = Record<string, { resisted: number; unlocked: number }>;
function readLog(): GuardLog {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? '{}') as GuardLog;
  } catch {
    return {};
  }
}
function logChoice(choice: 'resisted' | 'unlocked', tz: string) {
  const log = readLog();
  const k = localDateKey(Date.now(), tz);
  const d = (log[k] ??= { resisted: 0, unlocked: 0 });
  d[choice]++;
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    // 統計存不了不影響守護
  }
}

/** 攔截畫面的角色：最近孵出的動物；還沒孵過就沒有角色。 */
const guardPet = (save: SaveFile) => {
  const id = sceneAnimals(save, 1)[0]?.animalId;
  return id ? animalDef(id) : null;
};

const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const toMin = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
};

/** 打開想減少使用的 App 時跳出的畫面：先深呼吸幾秒，再決定要不要解鎖。 */
export function GuardScreen({ app, onClose }: { app: GuardApp; onClose: () => void }) {
  const { save } = useSave();
  const [left, setLeft] = useState(THINK_SECONDS);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  const pet = guardPet(save);
  // 專注中被攔下：留在小島回到專注（回桌面或解鎖都會被深度專注算成離開）
  const focusing = !!openSession(save);

  const choose = (choice: 'resisted' | 'unlocked') => {
    logChoice(choice, save.profile.timezone);
    onClose();
    if (!isAndroid || focusing) return; // 網頁版只是預覽
    if (choice === 'unlocked') void TimeGuard.unlock({ pkg: app.pkg, minutes: UNLOCK_MINUTES });
    else void TimeGuard.goHome();
  };

  return (
    <div className="guard-screen" role="dialog" aria-modal="true" aria-labelledby="guard-title">
      <div className="guard-pet">{pet ? <AnimalArt id={pet.id} size={180} /> : <span aria-hidden="true">🌱</span>}</div>
      <h1 id="guard-title">先停一下</h1>
      <p>
        嘿，{save.profile.nickname}！<strong>{app.label}</strong> 是你想減少使用的 App。
      </p>
      {focusing ? (
        <>
          <p className="muted">你正在專注中，先把這段完成，再決定要不要打開它吧。</p>
          <div className="guard-actions">
            <button className="primary" onClick={() => choose('resisted')}>
              回到專注
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">{left > 0 ? `${pet ? pet.name : '小島'}陪你深呼吸 ${left} 秒，想想現在真的需要打開它嗎？` : '想好了嗎？不管選哪一個，都是你有意識的選擇。'}</p>
          <div className="guard-actions">
            <button className="primary" onClick={() => choose('resisted')}>
              其實不需要
            </button>
            <button disabled={left > 0} onClick={() => choose('unlocked')}>
              {left > 0 ? `想一想…${left}` : `解鎖 ${UNLOCK_MINUTES} 分鐘`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** 手機上的 App 清單（可搜尋、勾選）：時間守護與深度專注共用。 */
export function AppPicker({ selected, onToggle }: { selected: GuardApp[]; onToggle: (a: GuardApp) => void }) {
  const [apps, setApps] = useState<GuardApp[] | null>(null);
  const [query, setQuery] = useState('');
  useEffect(() => {
    void TimeGuard.listApps()
      .then((r) => setApps(r.apps.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))))
      .catch(() => setApps([])); // 讀不到 App 清單時顯示空清單，不要一直停在讀取中
  }, []);
  const shown = (apps ?? []).filter((a) => a.label.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="app-picker">
      <input type="search" placeholder="搜尋 App" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="搜尋 App" />
      {!apps && <p className="muted small">讀取手機上的 App…</p>}
      <ul>
        {shown.map((a) => (
          <li key={a.pkg}>
            <label className="toggle">
              <input type="checkbox" checked={selected.some((x) => x.pkg === a.pkg)} onChange={() => onToggle(a)} />
              {a.icon && <img src={a.icon} alt="" width={32} height={32} />}
              {a.label}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 時間守護設定頁：挑 App、設時段、看今天忍住幾次。 */
export function GuardPage() {
  const { save } = useSave();
  const [cfg, setCfg] = useState<GuardConfig | null>(null);
  const [perm, setPerm] = useState({ usage: false, overlay: false });
  const [picking, setPicking] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!isAndroid) return;
    void TimeGuard.getConfig()
      .then((r) => setCfg(r.config ?? defaultGuardConfig()))
      .catch(() => setCfg(defaultGuardConfig()));
    const refresh = () => void TimeGuard.status().then(setPerm);
    refresh();
    return onResume(refresh); // 從系統設定開好權限回來
  }, []);

  const change = (patch: Partial<GuardConfig>) => {
    if (!cfg) return;
    const next = { ...cfg, ...patch };
    setCfg(next);
    void TimeGuard.setConfig({ config: next });
  };
  const toggleApp = (a: GuardApp) =>
    change({ apps: cfg!.apps.some((x) => x.pkg === a.pkg) ? cfg!.apps.filter((x) => x.pkg !== a.pkg) : [...cfg!.apps, { pkg: a.pkg, label: a.label }] });

  const today = readLog()[localDateKey(Date.now(), save.profile.timezone)] ?? { resisted: 0, unlocked: 0 };
  const previewBtn = (
    <button onClick={() => setPreview(true)}>預覽攔截畫面</button>
  );
  const previewScreen = preview && <GuardScreen app={{ pkg: 'preview', label: '社群 App' }} onClose={() => setPreview(false)} />;

  if (!isAndroid)
    return (
      <div className="page">
        <h1>時間守護</h1>
        <section className="card">
          <p>選好想減少使用的 App，打開它們時小島會先請你停一下、深呼吸幾秒，再決定要不要解鎖 {UNLOCK_MINUTES} 分鐘。</p>
          <p className="muted small">目前只有 Android App 版可以使用；iPhone 版需要 Apple 的特別權限，之後推出。</p>
          {previewBtn}
        </section>
        {previewScreen}
      </div>
    );
  if (!cfg) return <div className="page muted">讀取中…</div>;

  const ready = perm.usage && perm.overlay;

  return (
    <div className="page">
      <h1>時間守護</h1>
      <p className="muted">打開下面選的 App 時，小島會先請你停一下、深呼吸 {THINK_SECONDS} 秒，再決定要不要解鎖 {UNLOCK_MINUTES} 分鐘。</p>

      <section className="card">
        <h2>今天</h2>
        <p>
          忍住了 <strong>{today.resisted}</strong> 次 · 解鎖 {today.unlocked} 次
        </p>
      </section>

      {!ready && (
        <section className="card">
          <h2>需要兩個權限</h2>
          <p className="small muted">只用來知道你打開了哪個 App、並把小島叫到前面。不會讀取 App 裡的內容，資料也不會離開手機。</p>
          <div className="row wrap">
            {perm.usage ? <span className="cond">✓ 使用情況存取權</span> : <button onClick={() => void TimeGuard.openUsageSettings()}>開啟「使用情況存取權」</button>}
            {perm.overlay ? <span className="cond">✓ 顯示在其他應用程式上層</span> : <button onClick={() => void TimeGuard.openOverlaySettings()}>開啟「顯示在其他應用程式上層」</button>}
          </div>
        </section>
      )}

      <section className="card">
        <label className="toggle">
          <input type="checkbox" checked={cfg.enabled} disabled={!ready && !cfg.enabled} onChange={(e) => change({ enabled: e.target.checked })} />
          開啟時間守護
        </label>
        {cfg.enabled && !cfg.apps.length && <p className="small muted">還沒選 App，先在下面挑幾個吧。</p>}
      </section>

      <section className="card">
        <h2>我想要減少使用…</h2>
        <div className="row wrap">
          {cfg.apps.map((a) => (
            <button key={a.pkg} className="chip on" onClick={() => toggleApp(a)} aria-label={`移除 ${a.label}`}>
              {a.label} ✕
            </button>
          ))}
          <button className="chip" onClick={() => setPicking((p) => !p)} aria-expanded={picking}>
            {picking ? '完成' : '＋ 選擇 App'}
          </button>
        </div>
        {picking && <AppPicker selected={cfg.apps} onToggle={toggleApp} />}
      </section>

      <section className="card">
        <h2>時段</h2>
        <label className="toggle">
          <input type="checkbox" checked={cfg.always} onChange={(e) => change({ always: e.target.checked })} />
          全天候守護
        </label>
        {!cfg.always && (
          <>
            <div className="row wrap">
              <label>
                從 <input type="time" value={hm(cfg.from)} onChange={(e) => e.target.value && change({ from: toMin(e.target.value) })} />
              </label>
              <label>
                到 <input type="time" value={hm(cfg.to)} onChange={(e) => e.target.value && change({ to: toMin(e.target.value) })} />
              </label>
            </div>
            {cfg.from === cfg.to && <p className="error small">開始和結束時間不能一樣。</p>}
            {cfg.from > cfg.to && <p className="small muted">跨過午夜，到隔天 {hm(cfg.to)} 結束。</p>}
            <div className="row wrap" role="group" aria-label="星期">
              {DAYS.map((d, i) => (
                <button key={d} className={cfg.days[i] ? 'chip on' : 'chip'} aria-pressed={cfg.days[i]} onClick={() => change({ days: cfg.days.map((v, j) => (j === i ? !v : v)) })}>
                  {d}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {previewBtn}
      {previewScreen}
    </div>
  );
}
