import { useEffect, useRef, useState } from 'react';
import { useSave } from '../app/store';
import { AnimalArt } from '../components/Animal';
import { Modal, fmtMinutes } from '../components/ui';
import { animalDef } from '../content/config';
import { localDateKey } from '../domain/focus';
import { growthOf, openSession, sceneAnimals } from '../domain/game';
import type { SaveFile } from '../domain/types';
import { TimeGuard, defaultGuardConfig, isAndroid, onResume, type GuardApp, type GuardConfig, type UsageReport } from '../platform';

const THINK_SECONDS = 5;
const UNLOCK_MINUTES = 5;
const DAYS = ['日', '一', '二', '三', '四', '五', '六']; // 索引同 Date.getDay()
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // 顯示從週一開始

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

/** 攔截畫面的角色：最近遇見的動物（目前的成長階段）；還沒遇見過就沒有角色。 */
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

  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    return () => d.close();
  }, []);

  return (
    <dialog ref={ref} className="guard-screen" aria-labelledby="guard-title" onCancel={(e) => e.preventDefault()}>
      <div className="guard-pet">{pet ? <AnimalArt id={pet.id} stage={growthOf(save, pet.id).stage} size={180} /> : <span aria-hidden="true">🌱</span>}</div>
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
    </dialog>
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

// ---------- 時間守護首頁（參考 Forest：使用時間統計＋守護計劃） ----------

const DAY_MS = 86_400_000;
const midnight = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
/** 第 offset 個天／週（0 = 這一天／這一週，週一開始）的起訖。依手機的時間計算，和系統的使用時間一致。 */
function period(range: 'day' | 'week', offset: number) {
  const today = new Date(midnight(Date.now()));
  const start =
    range === 'day'
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
      : new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7) + offset * 7);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (range === 'day' ? 1 : 7));
  return { start: start.getTime(), end: end.getTime() };
}
const md = (t: number) => `${new Date(t).getMonth() + 1}/${new Date(t).getDate()}`;
const periodLabel = (range: 'day' | 'week', offset: number, start: number, end: number) =>
  range === 'day' ? (offset === 0 ? `${md(start)}（今天）` : offset === -1 ? `${md(start)}（昨天）` : md(start)) : `${md(start)} – ${md(end - DAY_MS)}${offset === 0 ? '（這週）' : ''}`;

/** 和上一期同一段長度比（今天到現在 vs 昨天同一時間），不會拿半天和整天比。 */
function Change({ cur, prev, range }: { cur: number; prev: number; range: 'day' | 'week' }) {
  if (prev < 60_000) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return <span className="stat-change">和{range === 'day' ? '前一天' : '上週'}一樣</span>;
  return (
    <span className={pct < 0 ? 'stat-change good' : 'stat-change bad'}>
      {pct < 0 ? '↓' : '↑'} {Math.abs(pct)}%
    </span>
  );
}

function sumLog(start: number, end: number, tz: string) {
  const log = readLog();
  const out = { resisted: 0, unlocked: 0 };
  for (let t = start; t < end; t += DAY_MS) {
    const d = log[localDateKey(t + DAY_MS / 2, tz)];
    if (d) (out.resisted += d.resisted), (out.unlocked += d.unlocked);
  }
  return out;
}

/** 使用時間：受干擾時間、總螢幕使用時間、分布圖、最常使用。 */
function UsageDashboard({ cfg, tz }: { cfg: GuardConfig; tz: string }) {
  const [range, setRange] = useState<'day' | 'week'>('day');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ cur: UsageReport; prev: UsageReport } | null>(null);
  const [error, setError] = useState(false);
  const [wake, setWake] = useState(0);
  useEffect(() => onResume(() => setWake((w) => w + 1)), []); // 從其他 App 回來時更新
  const { start, end } = period(range, offset);
  const guarded = cfg.apps.map((a) => a.pkg);
  const key = guarded.join(',');
  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    const len = Math.min(Date.now(), end) - start;
    const prevStart = period(range, offset - 1).start;
    Promise.all([
      TimeGuard.usage({ start, end, bucketMs: range === 'day' ? 3_600_000 : DAY_MS, guarded }),
      TimeGuard.usage({ start: prevStart, end: prevStart + len, bucketMs: DAY_MS * 7, guarded }),
    ])
      .then(([cur, prev]) => alive && setData({ cur, prev }))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [range, offset, key, wake]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = sumLog(start, end, tz);
  const peak = data ? Math.max(1, ...data.cur.buckets.map((b) => b.guarded + b.other)) : 1;
  const days = Math.max(1, Math.ceil((Math.min(Date.now(), end) - start) / DAY_MS));
  const top = data?.cur.apps[0]?.ms ?? 1;
  return (
    <>
      <div className="segmented" role="tablist">
        {(['day', 'week'] as const).map((r) => (
          <button key={r} role="tab" aria-selected={range === r} className={range === r ? 'on' : ''} onClick={() => (setRange(r), setOffset(0))}>
            {r === 'day' ? '天' : '週'}
          </button>
        ))}
      </div>
      <div className="row between date-nav">
        <button className="icon-btn" onClick={() => setOffset((o) => o - 1)} aria-label={range === 'day' ? '前一天' : '上一週'}>
          ‹
        </button>
        <strong>{periodLabel(range, offset, start, end)}</strong>
        <button className="icon-btn" onClick={() => setOffset((o) => o + 1)} disabled={offset >= 0} aria-label={range === 'day' ? '後一天' : '下一週'}>
          ›
        </button>
      </div>

      {error && <p className="card muted small">讀不到使用時間。請確認「使用情況存取權」已開啟。</p>}
      {!data && !error && <p className="card muted small">讀取使用時間…</p>}
      {data && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-icon" aria-hidden="true">🛡️</span>
              <span className="small muted">受干擾時間</span>
              <strong>{fmtMinutes(data.cur.guardedMs)}</strong>
              <Change cur={data.cur.guardedMs} prev={data.prev.guardedMs} range={range} />
            </div>
            <div className="stat-card">
              <span className="stat-icon" aria-hidden="true">⏳</span>
              <span className="small muted">總螢幕使用時間</span>
              <strong>{fmtMinutes(data.cur.totalMs)}</strong>
              <Change cur={data.cur.totalMs} prev={data.prev.totalMs} range={range} />
            </div>
          </div>
          {(counts.resisted > 0 || counts.unlocked > 0) && (
            <p className="small guard-counts">
              被攔下來後：忍住了 <strong>{counts.resisted}</strong> 次 · 解鎖 {counts.unlocked} 次
            </p>
          )}

          <section className="card">
            <div className="row between wrap">
              <h2>{range === 'day' ? '使用時間分布' : '每天的使用時間'}</h2>
              <span className="usage-legend small">
                <i className="seg-guarded" /> 想減少的 App <i className="seg-other" /> 其他
              </span>
            </div>
            {range === 'week' && <p className="small muted">每日平均 {fmtMinutes(data.cur.totalMs / days)}</p>}
            <div className="usage-chart" role="img" aria-label={`${range === 'day' ? '每小時' : '每天'}的使用時間`}>
              {data.cur.buckets.map((b, i) => (
                <div key={i} className="usage-bar">
                  <span className="seg-other" style={{ height: `${(b.other / peak) * 100}%` }} />
                  <span className="seg-guarded" style={{ height: `${(b.guarded / peak) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className={`usage-axis ${range}`} aria-hidden="true">
              {range === 'day' ? ['0', '6', '12', '18', '24'].map((h) => <span key={h}>{h}</span>) : ['一', '二', '三', '四', '五', '六', '日'].map((d) => <span key={d}>{d}</span>)}
            </div>
          </section>

          <section className="card">
            <h2>最常使用</h2>
            {data.cur.apps.length ? (
              <ul className="rank-list">
                {data.cur.apps.map((a) => (
                  <li key={a.pkg}>
                    <div className="row between">
                      <span className="row">
                        {a.icon && <img src={a.icon} alt="" width={28} height={28} />}
                        {a.label}
                        {guarded.includes(a.pkg) && <span className="tag-guarded">想減少</span>}
                      </span>
                      <span className="small muted">{fmtMinutes(a.ms)}</span>
                    </div>
                    <span className={guarded.includes(a.pkg) ? 'rank-bar guarded' : 'rank-bar'} style={{ width: `${(a.ms / top) * 100}%` }} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">這段時間還沒有使用超過 1 分鐘的 App。</p>
            )}
          </section>
        </>
      )}
    </>
  );
}

const dayList = (days: boolean[]) => (days.every(Boolean) ? '每天' : WEEK.filter((i) => days[i]).map((i) => DAYS[i]).join('、') || '沒有選星期');

/** 守護計劃摘要：狀態、時段、App；點了編輯。 */
function PlanCard({ cfg, onEdit }: { cfg: GuardConfig; onEdit: () => void }) {
  const empty = !cfg.apps.length;
  const status = empty ? '還沒有守護計劃' : !cfg.enabled ? '已暫停' : cfg.always ? '全天守護中' : `已排程 ${hm(cfg.from)}–${hm(cfg.to)}`;
  const names = cfg.apps.map((a) => a.label);
  return (
    <button className="card plan-card" onClick={onEdit}>
      <span className="row between">
        <span className="row">
          <i className={!empty && cfg.enabled ? 'dot on' : 'dot'} aria-hidden="true" />
          <strong>{status}</strong>
        </span>
        <span className="plan-edit">{empty ? '建立計劃' : '編輯'} ›</span>
      </span>
      <span className="small muted">
        {empty
          ? '選好想減少使用的 App 和時段，打開它們時小島會先請你停一下。'
          : `${names.slice(0, 3).join('、')}${names.length > 3 ? ` 等 ${names.length} 個` : ''} · ${cfg.always ? '每天全天' : dayList(cfg.days)}`}
      </span>
    </button>
  );
}

/** 時間守護計劃：改完按儲存才生效。 */
function PlanEditor({ cfg, ready, onSave, onClose }: { cfg: GuardConfig; ready: boolean; onSave: (c: GuardConfig) => void; onClose: () => void }) {
  // 第一次建立：預設就是開啟的
  const [d, setD] = useState<GuardConfig>(() => ({ ...cfg, enabled: cfg.apps.length ? cfg.enabled : true }));
  const [picking, setPicking] = useState(!cfg.apps.length);
  const set = (patch: Partial<GuardConfig>) => setD((x) => ({ ...x, ...patch }));
  const toggleApp = (a: GuardApp) => set({ apps: d.apps.some((x) => x.pkg === a.pkg) ? d.apps.filter((x) => x.pkg !== a.pkg) : [...d.apps, { pkg: a.pkg, label: a.label }] });
  const sameTime = !d.always && d.from === d.to;
  const noDays = !d.always && !d.days.some(Boolean);
  const paused = !d.enabled;
  return (
    <Modal title="時間守護計劃" onClose={onClose}>
      {/* 暫停時上面的設定全部變灰、不能改（設定會保留，關掉暫停就恢復） */}
      <fieldset className={paused ? 'plan-fields paused' : 'plan-fields'} disabled={paused} aria-describedby={paused ? 'plan-paused-note' : undefined}>
      <h3>我想要減少使用…</h3>
      <div className="row wrap">
        {d.apps.map((a) => (
          <button key={a.pkg} className="chip on" onClick={() => toggleApp(a)} aria-label={`移除 ${a.label}`}>
            {a.label} ✕
          </button>
        ))}
        <button className="chip" onClick={() => setPicking((p) => !p)} aria-expanded={picking}>
          {picking ? '收起清單' : '＋ 選擇 App'}
        </button>
      </div>
      {picking && !paused && <AppPicker selected={d.apps} onToggle={toggleApp} />}

      <h3>排程</h3>
      <label className="toggle">
        <input type="checkbox" checked={d.always} onChange={(e) => set({ always: e.target.checked })} />
        總是啟用（每天全天）
      </label>
      {!d.always && (
        <>
          <div className="row wrap">
            <label>
              從 <input type="time" value={hm(d.from)} onChange={(e) => e.target.value && set({ from: toMin(e.target.value) })} />
            </label>
            <label>
              到 <input type="time" value={hm(d.to)} onChange={(e) => e.target.value && set({ to: toMin(e.target.value) })} />
            </label>
          </div>
          {sameTime && <p className="error small">開始和結束時間不能一樣。</p>}
          {d.from > d.to && <p className="small muted">跨過午夜，到隔天 {hm(d.to)} 結束。</p>}
          <div className="row wrap" role="group" aria-label="星期">
            {WEEK.map((i) => (
              <button key={i} className={d.days[i] ? 'chip on' : 'chip'} aria-pressed={d.days[i]} onClick={() => set({ days: d.days.map((v, j) => (j === i ? !v : v)) })}>
                {DAYS[i]}
              </button>
            ))}
          </div>
          {noDays && <p className="error small">至少選一天。</p>}
        </>
      )}
      </fieldset>

      <h3>暫停</h3>
      <label className="toggle switch-row">
        暫停計劃
        <input type="checkbox" role="switch" className="switch" checked={paused} onChange={(e) => set({ enabled: !e.target.checked })} />
      </label>
      {paused && (
        <p id="plan-paused-note" className="small muted">
          計劃暫停中：打開這些 App 不會被攔下。上面的設定都會保留，關掉暫停就恢復。
        </p>
      )}
      {d.enabled && !ready && <p className="small muted">還需要開啟兩個權限，計劃才會開始運作。</p>}
      {d.enabled && !d.apps.length && <p className="small muted">還沒選 App：先挑幾個想減少使用的 App 吧。</p>}

      <div className="row editor-actions">
        <button onClick={onClose}>取消</button>
        <button className="primary" disabled={!paused && (sameTime || noDays)} onClick={() => onSave(d)}>
          儲存
        </button>
      </div>
    </Modal>
  );
}

/** 時間守護首頁：守護計劃＋使用時間統計。 */
export function GuardPage() {
  const { save } = useSave();
  const [cfg, setCfg] = useState<GuardConfig | null>(null);
  const [perm, setPerm] = useState({ usage: false, overlay: false });
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const pet = guardPet(save);

  useEffect(() => {
    if (!isAndroid) return;
    void TimeGuard.getConfig()
      .then((r) => setCfg(r.config ?? defaultGuardConfig()))
      .catch(() => setCfg(defaultGuardConfig()));
    const refresh = () => void TimeGuard.status().then(setPerm).catch(() => {});
    refresh();
    return onResume(refresh); // 從系統設定開好權限回來
  }, []);

  const saveCfg = (next: GuardConfig) => {
    setCfg(next);
    setEditing(false);
    void TimeGuard.setConfig({ config: next });
  };

  const hero = (
    <div className="guard-hero">
      <div className="guard-hero-pet" aria-hidden="true">
        {pet ? <AnimalArt id={pet.id} stage={growthOf(save, pet.id).stage} size={88} /> : '🌱'}
      </div>
      <div>
        <h1>時間守護</h1>
        <p className="muted">讓我們一起把時間留給更重要的事。</p>
      </div>
    </div>
  );
  const previewBtn = (
    <button className="link" onClick={() => setPreview(true)}>
      預覽攔截畫面
    </button>
  );
  const previewScreen = preview && <GuardScreen app={{ pkg: 'preview', label: '社群 App' }} onClose={() => setPreview(false)} />;

  if (!isAndroid)
    return (
      <div className="page">
        {hero}
        <section className="card">
          <p>選好想減少使用的 App，打開它們時小島會先請你停一下、深呼吸幾秒，再決定要不要解鎖 {UNLOCK_MINUTES} 分鐘。這裡也會顯示每天的手機使用時間。</p>
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
      {hero}

      {!ready && (
        <section className="card">
          <h2>需要兩個權限</h2>
          <p className="small muted">只用來知道你打開了哪個 App、用了多久，並把小島叫到前面。不會讀取 App 裡的內容，資料也不會離開手機。</p>
          <div className="row wrap">
            {perm.usage ? <span className="cond">✓ 使用情況存取權</span> : <button onClick={() => void TimeGuard.openUsageSettings()}>開啟「使用情況存取權」</button>}
            {perm.overlay ? <span className="cond">✓ 顯示在其他應用程式上層</span> : <button onClick={() => void TimeGuard.openOverlaySettings()}>開啟「顯示在其他應用程式上層」</button>}
          </div>
        </section>
      )}

      <PlanCard cfg={cfg} onEdit={() => setEditing(true)} />
      <p className="small muted">
        打開計劃裡的 App 時，小島會先請你停一下、深呼吸 {THINK_SECONDS} 秒，再決定要不要解鎖 {UNLOCK_MINUTES} 分鐘。{previewBtn}
      </p>

      {perm.usage ? <UsageDashboard cfg={cfg} tz={save.profile.timezone} /> : <p className="card muted small">開啟「使用情況存取權」後，這裡會顯示每天的手機使用時間。</p>}

      {editing && <PlanEditor cfg={cfg} ready={ready} onSave={saveCfg} onClose={() => setEditing(false)} />}
      {previewScreen}
    </div>
  );
}
