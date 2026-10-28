import { useEffect, useState, type ReactNode } from 'react';
import { useSave } from '../app/store';
import { AVATARS, GROWTH_AT, GROWTH_MAX, MAX_FOCUS_MINUTES, MIN_FOCUS_MINUTES, PAUSE_MINUTES, animalDef, avatarEmoji } from '../content/config';
import { validateSave } from '../domain/save';
import { endedSessions, openSession } from '../domain/game';
import { dayStartNow, localDateKey, shiftDateKey } from '../domain/focus';
import { notifySupported, playChime } from '../sound';
import { DEEP_GRACE_MS, TimeGuard, defaultGuardConfig, isAndroid, isNative, onResume, requestNotifyPermission, setDailyReminder, shareFile, type GuardApp } from '../platform';
import { Modal } from '../components/ui';
import { Tour } from '../components/Tour';
import { FeedbackSheet } from '../components/Feedback';
import { AppPicker } from './Guard';
import { PrivacyNote } from './Onboarding';
import type { SaveFile } from '../domain/types';
import { BarChart3, Bell, ChevronLeft, ChevronRight, Clock, Database, Info, Monitor, PencilLine, Timer, X } from 'lucide-react';
import { version } from '../../package.json';

const TIMEZONES: string[] = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

type Sub = 'profile' | 'account' | 'data' | 'allow' | 'quotes' | 'faq' | 'terms' | null;

const PLAY_URL = 'https://play.google.com/store/apps/details?id=tw.qiguang.island';
const REMINDER_TEXT = '今天也來小島專注一下吧，森林裡的動物在等你。';
const QUOTES_MAX = 10;
const pad2 = (n: number) => String(n).padStart(2, '0');

const FAQ: [string, string][] = [
  ['怎麼遇見動物？', `在大廳點中間的圓圈選一隻想找的動物，設定時間後開始專注。專注越久牠越靠近，倒數結束就會遇見牠，留下一筆觀察紀錄。`],
  ['提前結束會怎樣？', `開始後 10 秒內可以免費取消。之後提前結束，動物會被嚇跑，專注過的時間會留在紀錄裡，但不會修復森林，也拿不到金幣。`],
  ['可以暫停嗎？', `可以，每次暫停最多 ${PAUSE_MINUTES} 分鐘，時間到會自動繼續。接電話會自動暫停，講多久都可以。`],
  ['什麼是深度專注？', `Android 專用。專注時離開棲光小島超過 ${DEEP_GRACE_MS / 1000} 秒，動物就會被嚇跑。鎖定螢幕、接電話、使用「可以用的 App」都不算離開。`],
  ['延長計時是什麼？', `開啟後，倒數到了不會自動結算，會繼續累積時間，等你按完成才結算，最多 ${MAX_FOCUS_MINUTES} 分鐘。`],
  ['金幣怎麼來、能做什麼？', '完成專注每分鐘得 1 金幣，可以在商店解鎖新的探索路線，之後就能去找那種動物。'],
  ['動物怎麼長大？', `同一種動物遇見越多次，族群越穩定，看到的就越成熟。每遇見一次成長 1 點（60 分鐘以上的探索算 2 點），${GROWTH_AT[0]} 點長大一階、${GROWTH_MAX} 點就看得到成年的牠。商店買的新物種和特別探索只有一種樣式，遇見就是成年的牠。`],
  ['專注時間有限制嗎？', `每段最少 ${MIN_FOCUS_MINUTES} 分鐘、最多 ${MAX_FOCUS_MINUTES} 分鐘。`],
  ['換手機資料會不見嗎？', '進度只存在這支手機裡。換手機或刪除 App 前，請到「設定 → 備份與還原」匯出存檔，在新手機匯入就能接著玩。'],
];

const TERMS: [string, string][] = [
  ['使用方式', '棲光小島是幫助你專注的工具。請依照一般合理的方式使用，不要用來從事違法或傷害他人的行為。'],
  ['你的資料', '專注紀錄、筆記與設定都保存在你的裝置上，我們不會收集或上傳。刪除 App 前請先自行匯出備份。'],
  ['付費內容', '特別探索等付費內容會透過 Google Play 付款，退款依 Google Play 的規定辦理。'],
  ['內容與著作權', 'App 中的插圖、動物資料與聲音屬於棲光小島或授權人所有，請勿另作商業使用。'],
  ['服務變更', '我們可能更新功能或條款；重大變更會在 App 內通知。'],
];

/** 一組設定（參考 Forest：小標題＋圓角清單）。 */
function Group({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="set-group">
      <h2 className="set-title">
        {icon}
        {title}
      </h2>
      <div className="set-list">{children}</div>
    </section>
  );
}

/** 點了會進子頁面或做一件事的列：左邊名稱、右邊目前的值和箭頭。 */
function LinkRow({ label, value, onClick, danger }: { label: string; value?: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button className={danger ? 'set-row danger-text' : 'set-row'} onClick={onClick}>
      <span>{label}</span>
      <span className="set-value">
        {value}
        {!danger && <ChevronRight size={18} aria-hidden="true" />}
      </span>
    </button>
  );
}

/** 開關列：說明文字放在名稱下方。 */
function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="toggle set-row">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** 子頁面：從右邊滑進來，左上角返回。 */
function SubPage({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="page slide-in">
      <div className="sub-head">
        <button className="icon-btn" data-back onClick={onBack} aria-label="返回設定">
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function SettingsPage({ onSounds }: { onSounds?: () => void }) {
  const { save, update, replace, resetAll, mode, notify } = useSave();
  const [sub, setSub] = useState<Sub>(null);
  const [nickname, setNickname] = useState(save.profile.nickname);
  const [island, setIsland] = useState(save.islands[0]?.name ?? '');
  const [preview, setPreview] = useState<SaveFile | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
  const [touring, setTouring] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [picking, setPicking] = useState<'avatar' | 'name' | null>(null);
  const [quoteDraft, setQuoteDraft] = useState('');
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);
  // Android：沒有「鬧鐘與提醒」權限時，倒數結束通知可能晚一點跳出
  const [exactAlarm, setExactAlarm] = useState(true);
  useEffect(() => {
    if (!isAndroid) return;
    const check = () => void TimeGuard.status().then((r) => setExactAlarm(r.exactAlarm), () => undefined);
    check();
    return onResume(check);
  }, []);

  const toggleNotify = async (on: boolean) => {
    setNotifyMsg(null);
    if (!on) return set({ endNotify: false });
    if (!isNative && !notifySupported()) return setNotifyMsg('這個瀏覽器不支援系統通知。');
    if (await requestNotifyPermission()) set({ endNotify: true });
    else setNotifyMsg(isNative ? '通知被關閉了。請到手機的「設定 → 通知 → 棲光小島」允許通知後再開啟。' : '瀏覽器封鎖了通知。請到瀏覽器的網站設定允許「通知」後再開啟。');
  };
  const st = save.settings;
  // 拖動音量時只改畫面，放開才存檔（不然每移動一格就整份存檔寫一次）
  const [vol, setVol] = useState<number | null>(null);
  const volume = vol ?? st.soundVolume;
  const commitVol = () => {
    if (vol !== null) set({ soundVolume: vol });
    setVol(null);
  };
  const set = (patch: Partial<SaveFile['settings']>) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const toggleAllow = (a: GuardApp) =>
    update((s) => {
      const cur = s.settings.focusAllow;
      return { ...s, settings: { ...s.settings, focusAllow: cur.some((x) => x.pkg === a.pkg) ? cur.filter((x) => x.pkg !== a.pkg) : [...cur, { pkg: a.pkg, label: a.label }] } };
    });

  // 每日專注提醒：存設定，再請系統排程（被拒絕就關回去並說明）
  const setReminder = async (r: SaveFile['settings']['dailyReminder']) => {
    setReminderMsg(null);
    set({ dailyReminder: r });
    if (await setDailyReminder(r, REMINDER_TEXT)) return;
    set({ dailyReminder: { ...r, on: false } });
    setReminderMsg('通知被關閉了。請到手機的「設定 → 通知 → 棲光小島」允許通知後再開啟。');
  };
  const addQuote = () => {
    const q = quoteDraft.trim();
    setQuoteDraft('');
    if (!q || st.quotes.includes(q)) return;
    set({ quotes: [...st.quotes, q].slice(-QUOTES_MAX) });
  };

  const saveNames = () => {
    const n = nickname.trim();
    const i = island.trim();
    if (!n || !i) {
      notify('暱稱與島名不能空白。');
      return false;
    }
    update((s) => ({ ...s, profile: { ...s.profile, nickname: n }, islands: s.islands.map((x) => (x.id === s.profile.activeIslandId ? { ...x, name: i } : x)) }));
    notify('已更新名稱。');
    return true;
  };

  const day = new Date().toISOString().slice(0, 10);
  // App 版用系統分享選單（存到雲端硬碟、傳給自己）；網頁版下載
  const exportSave = () => void shareFile(JSON.stringify(save, null, 2), `qiguang-island-${mode}-${day}.json`, 'application/json', '備份棲光小島存檔').catch(() => notify('無法匯出，請再試一次。'));
  // 輸出你的資料（參考 Forest）：每段專注一列，Excel 打得開（加 BOM 才不會亂碼）
  const exportCsv = async () => {
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const when = (iso: string) => new Date(iso).toLocaleString('zh-TW', { hour12: false, timeZone: save.profile.timezone });
    const rows = endedSessions(save)
      .filter((x) => x.userId === save.profile.id)
      .map((x) => [when(x.startedAt), when(x.endedAt!), Math.floor(x.accumulatedMs / 60000), x.status === 'completed' ? '遇見' : '被嚇跑', animalDef(x.animalId).name, x.tag, x.taskTitle, x.note ?? ''].map(q).join(','));
    const csv = '\uFEFF' + ['開始時間,結束時間,專注分鐘,結果,動物,標籤,標題,筆記', ...rows].join('\r\n');
    await shareFile(csv, `棲光小島-專注紀錄-${day}.csv`, 'text/csv', '輸出專注紀錄').catch(() => notify('無法輸出，請再試一次。'));
  };

  const pickFile = async (file: File | undefined) => {
    setPreview(null);
    setImportError(null);
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return setImportError('這個檔案不是棲光小島的存檔檔案。');
    }
    const v = validateSave(parsed);
    if (!v.ok) return setImportError(`無法匯入：${v.error}`);
    if (v.save.mode !== mode) return setImportError(v.save.mode === 'demo' ? '這是示範存檔，請先開啟本機合作示範再匯入。' : '這是個人存檔，請先回到你的小島再匯入。');
    setPreview(v.save);
  };

  // 重設全部資料的確認（設定首頁、帳號管理共用）
  const resetModal = (
    <Modal title="重設全部資料" onClose={() => setConfirmReset(false)}>
      <p>這會清除這台裝置上棲光小島的所有資料（包含示範存檔），無法復原。建議先到「備份與還原」匯出。</p>
      <div className="row editor-actions">
        <button onClick={() => setConfirmReset(false)}>取消</button>
        <button
          className="danger"
          onClick={() => {
            // 原生端的時間守護與深度專注設定也要清掉，不然重設後還會繼續攔截 App
            if (isAndroid) void TimeGuard.setConfig({ config: defaultGuardConfig() }).then(() => TimeGuard.stopFocusWatch(), () => undefined);
            resetAll();
          }}
        >
          確認全部重設
        </button>
      </div>
    </Modal>
  );

  if (sub === 'profile') {
    // 參考 Forest 的帳戶頁：頭像、名字、總專注時間、三個數字；下面是帳號管理和輸出資料
    const ended = endedSessions(save).filter((x) => x.userId === save.profile.id);
    const met = ended.filter((x) => x.status === 'completed').length;
    const fled = ended.length - met;
    const totalMin = Math.floor(ended.reduce((t, x) => t + x.accumulatedMs, 0) / 60000);
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    return (
      <SubPage title="個人資料" onBack={() => setSub(null)}>
        <section className="card profile-card">
          <button className="profile-avatar" onClick={() => setPicking('avatar')} aria-label="更換頭像">
            {avatarEmoji(save.profile.avatarId)}
          </button>
          <button className="profile-name" onClick={() => setPicking('name')} aria-label="更改暱稱與島名">
            {save.profile.nickname}
            <PencilLine size={16} aria-hidden="true" />
          </button>
          <span className="small muted">{save.islands[0]?.name}</span>
          <span className="profile-total">
            <Clock size={15} aria-hidden="true" /> {d ? `${d} 天 ` : ''}
            {h ? `${h} 小時 ` : ''}
            {totalMin % 60} 分鐘
          </span>
          <div className="profile-stats">
            <span>
              <strong>{ended.length ? Math.round((met / ended.length) * 100) : 0}%</strong>
              <small>成功率</small>
            </span>
            <span>
              <strong>{met}</strong>
              <small>遇見</small>
            </span>
            <span>
              <strong>{fled}</strong>
              <small>被嚇跑</small>
            </span>
          </div>
        </section>
        <div className="set-list">
          <LinkRow label="帳號管理" onClick={() => setSub('account')} />
          <LinkRow label="輸出你的資料" value="專注紀錄 CSV" onClick={() => void exportCsv()} />
        </div>
        <p className="small muted center-text">ID {save.profile.id.slice(0, 8)}・資料只存在這支手機</p>
        {picking === 'avatar' && (
          <Modal title="更換頭像" onClose={() => setPicking(null)}>
            <div className="avatar-grid">
              {AVATARS.map((av) => (
                <button
                  key={av.id}
                  className={av.id === save.profile.avatarId ? 'avatar-opt selected' : 'avatar-opt'}
                  aria-pressed={av.id === save.profile.avatarId}
                  aria-label={av.label}
                  onClick={() => (update((x) => ({ ...x, profile: { ...x.profile, avatarId: av.id } })), setPicking(null))}
                >
                  {av.emoji}
                </button>
              ))}
            </div>
          </Modal>
        )}
        {picking === 'name' && (
          <Modal title="暱稱與島名" onClose={() => setPicking(null)}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (saveNames()) setPicking(null);
              }}
            >
              <label>
                暱稱
                <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} data-autofocus />
              </label>
              <label>
                島名
                <input value={island} onChange={(e) => setIsland(e.target.value)} maxLength={20} />
              </label>
              <button className="primary wide" type="submit">
                儲存
              </button>
            </form>
          </Modal>
        )}
      </SubPage>
    );
  }

  if (sub === 'account')
    return (
      <SubPage title="帳號管理" onBack={() => setSub('profile')}>
        <div className="set-list">
          <LinkRow label="暱稱與島名" value={save.profile.nickname} onClick={() => (setSub('profile'), setPicking('name'))} />
          <LinkRow label="頭像" value={avatarEmoji(save.profile.avatarId)} onClick={() => (setSub('profile'), setPicking('avatar'))} />
          {TIMEZONES.length > 0 && (
            <label className="set-row">
              <span>
                時區
                <small>每日統計依此計算</small>
              </span>
              <select className="set-select" value={save.profile.timezone} onChange={(e) => update((x) => ({ ...x, profile: { ...x.profile, timezone: e.target.value } }))}>
                {TIMEZONES.map((tz) => (
                  <option key={tz}>{tz}</option>
                ))}
              </select>
            </label>
          )}
          <LinkRow label="備份與還原" onClick={() => setSub('data')} />
        </div>
        <p className="small muted">目前不需要註冊帳號，進度只存在這支手機。之後開放雲端同步時，會在這裡登入。</p>
        <div className="set-list">
          <LinkRow label="刪除所有資料…" danger onClick={() => setConfirmReset(true)} />
        </div>
        {confirmReset && resetModal}
      </SubPage>
    );

  if (sub === 'allow')
    return (
      <SubPage title="深度專注時可以用的 App" onBack={() => setSub(null)}>
        <section className="card">
          <p className="small muted">例如字典、計算機、音樂。打開這些 App 不算離開小島。</p>
          <AppPicker selected={st.focusAllow} onToggle={toggleAllow} />
        </section>
      </SubPage>
    );

  if (sub === 'quotes')
    return (
      <SubPage title="自訂鼓勵語句" onBack={() => setSub(null)}>
        <section className="card">
          <p className="small muted">專注時畫面上方會每 30 秒換一句，最多 {QUOTES_MAX} 句。</p>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              addQuote();
            }}
          >
            <input value={quoteDraft} onChange={(e) => setQuoteDraft(e.target.value)} maxLength={30} placeholder="例：再撐一下，你做得到！" aria-label="新增鼓勵語句" />
            <button type="submit" disabled={!quoteDraft.trim()}>
              新增
            </button>
          </form>
        </section>
        {st.quotes.length > 0 && (
          <div className="set-list">
            {st.quotes.map((q) => (
              <div key={q} className="set-row">
                <span>{q}</span>
                <button className="icon-btn" onClick={() => set({ quotes: st.quotes.filter((x) => x !== q) })} aria-label={`刪除「${q}」`}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </SubPage>
    );

  if (sub === 'faq')
    return (
      <SubPage title="常見問題" onBack={() => setSub(null)}>
        <div className="faq">
          {FAQ.map(([q, a]) => (
            <details key={q} className="card">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </SubPage>
    );

  if (sub === 'terms')
    return (
      <SubPage title="服務條款" onBack={() => setSub(null)}>
        <section className="card terms">
          {/* ponytail: 草稿，上架前換成律師看過的正式條款網址 */}
          <p className="small muted">草稿版本，正式上架前會更新。</p>
          {TERMS.map(([h, p]) => (
            <div key={h}>
              <h3>{h}</h3>
              <p>{p}</p>
            </div>
          ))}
        </section>
      </SubPage>
    );

  if (sub === 'data')
    return (
      <SubPage title="備份與還原" onBack={() => setSub(null)}>
        <section className="card">
          <p className="small muted">{isNative ? '進度只保存在這支手機裡。換手機或刪除 App 前，請先匯出備份。' : '進度只保存在這台裝置的瀏覽器裡。換裝置或清除瀏覽器資料前，請先匯出。'}</p>
          <div className="row wrap">
            <button className="primary" onClick={exportSave}>
              匯出存檔
            </button>
            <label className="button-like">
              匯入存檔
              <input type="file" accept="application/json,.json" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
            </label>
          </div>
          {importError && (
            <p className="error" role="alert">
              {importError}
            </p>
          )}
          {preview && (
            <div className="notice">
              <p>
                <strong>匯入預覽</strong>（{preview.mode === 'demo' ? '示範存檔' : '個人存檔'}）
              </p>
              <ul className="small">
                <li>
                  {preview.profile.nickname} 的「{preview.islands[0]?.name}」
                </li>
                <li>
                  專注 {preview.sessions.length} 筆 · 工程投入 {preview.contributions.length} 筆
                </li>
                <li>存檔時間 {new Date(preview.savedAt).toLocaleString('zh-TW')}</li>
              </ul>
              <p className="small">確認後會取代目前的{mode === 'demo' ? '示範' : ''}存檔。</p>
              <div className="row">
                <button
                  className="primary"
                  disabled={!!openSession(save)}
                  onClick={() => {
                    if (replace(preview)) {
                      notify('已匯入存檔。');
                      setPreview(null);
                    }
                  }}
                >
                  確認取代
                </button>
                <button className="ghost" onClick={() => setPreview(null)}>
                  取消
                </button>
              </div>
            </div>
          )}
        </section>
      </SubPage>
    );

  return (
    <div className="page settings">
      <h1>{mode === 'demo' ? '設定（示範存檔）' : '設定'}</h1>

      <button className="set-profile" onClick={() => setSub('profile')}>
        <span className="avatar-sm" aria-hidden="true">
          {avatarEmoji(save.profile.avatarId)}
        </span>
        <span>
          <strong>{save.profile.nickname}</strong>
          <small>{save.islands[0]?.name}</small>
        </span>
        <ChevronRight size={20} aria-hidden="true" />
      </button>

      <Group icon={<Timer size={18} aria-hidden="true" />} title="專注">
        {isAndroid && <SwitchRow label="深度專注" hint="離開棲光小島太久，動物會被嚇跑" checked={st.deepFocus} onChange={(on) => set({ deepFocus: on })} />}
        {isAndroid && st.deepFocus && <LinkRow label="可以用的 App" value={st.focusAllow.length ? `${st.focusAllow.length} 個` : '沒有'} onClick={() => setSub('allow')} />}
        <SwitchRow label="保持螢幕開啟" hint="比較耗電" checked={st.keepAwake} onChange={(on) => set({ keepAwake: on })} />
        <SwitchRow label="延長計時" hint="倒數到了繼續累積，按完成才結算（最多 180 分鐘）" checked={st.extendTimer} onChange={(on) => set({ extendTimer: on })} />
        <LinkRow label="自訂鼓勵語句" value={st.quotes.length ? `${st.quotes.length} 句` : '還沒有'} onClick={() => setSub('quotes')} />
      </Group>

      <Group icon={<Bell size={18} aria-hidden="true" />} title="提醒與聲音">
        <SwitchRow label="每日專注提醒" hint="每天固定時間提醒你來專注" checked={st.dailyReminder.on} onChange={(on) => void setReminder({ ...st.dailyReminder, on })} />
        {st.dailyReminder.on && (
          <label className="set-row">
            <span>提醒時間</span>
            <input
              type="time"
              className="set-time"
              value={`${pad2(st.dailyReminder.hour)}:${pad2(st.dailyReminder.minute)}`}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number);
                if (Number.isInteger(h) && Number.isInteger(m)) void setReminder({ on: true, hour: h, minute: m });
              }}
            />
          </label>
        )}
        {reminderMsg && <p className="error set-note">{reminderMsg}</p>}
        <SwitchRow label="倒數結束系統通知" hint="鎖定螢幕時也會提醒" checked={st.endNotify} onChange={(on) => void toggleNotify(on)} />
        {notifyMsg && <p className="error set-note">{notifyMsg}</p>}
        {st.endNotify && !exactAlarm && <LinkRow label="通知可能晚幾分鐘" value="讓它準時" onClick={() => void TimeGuard.openExactAlarmSettings()} />}
        <SwitchRow label="倒數結束提示音" hint="柔和鐘聲" checked={st.endChime} onChange={(on) => set({ endChime: on })} />
        <LinkRow label="試聽鐘聲" onClick={() => playChime(volume)} />
        {/* 大自然交響樂併進設定：在這裡挑選、試聽收集到的環境音 */}
        {onSounds && <LinkRow label="大自然交響樂" value="挑選環境音" onClick={onSounds} />}
        <SwitchRow label="專注時播放環境音" hint="在「大自然交響樂」挑選聲音" checked={st.soundEnabled} onChange={(on) => set({ soundEnabled: on })} />
        <label className="set-row set-slider">
          <span>音量</span>
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVol(Number(e.target.value))} onPointerUp={commitVol} onKeyUp={commitVol} onBlur={commitVol} />
        </label>
      </Group>

      <Group icon={<Monitor size={18} aria-hidden="true" />} title="畫面">
        <SwitchRow label="低動態效果" hint="動物、水面與換頁動畫靜止" checked={st.reducedMotion} onChange={(on) => set({ reducedMotion: on })} />
        <SwitchRow label="簡化 2D 場景" hint="比較省電" checked={st.sceneMode === '2d'} onChange={(on) => set({ sceneMode: on ? '2d' : 'auto' })} />
      </Group>

      <Group icon={<BarChart3 size={18} aria-hidden="true" />} title="紀錄與統計">
        <div className="set-row">
          <span>每週起始日</span>
          <div className="segmented mini" role="radiogroup" aria-label="每週起始日">
            {(
              [
                [1, '週一'],
                [0, '週日'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} role="radio" aria-checked={st.weekStart === v} className={st.weekStart === v ? 'on' : ''} onClick={() => set({ weekStart: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <label className="set-row">
          <span>
            每日起始時間
            <small>{st.dayStartNext && dayStartNow(st, Date.now(), save.profile.timezone) !== st.dayStartNext.hour ? '明天開始生效' : '夜貓子可以把凌晨算進前一天'}</small>
          </span>
          <select
            className="set-select"
            value={st.dayStartNext?.hour ?? st.dayStartHour}
            onChange={(e) => {
              // 從明天才生效（今天的統計、每日挑戰照原本的算法）
              const h = Number(e.target.value);
              const now = dayStartNow(st, Date.now(), save.profile.timezone);
              set({ dayStartHour: now, dayStartNext: h === now ? null : { hour: h, from: shiftDateKey(localDateKey(Date.now(), save.profile.timezone), 1) } });
            }}
          >
            {[0, 1, 2, 3, 4, 5, 6].map((h) => (
              <option key={h} value={h}>
                {pad2(h)}:00{h === 0 ? '（午夜）' : ''}
              </option>
            ))}
          </select>
        </label>
      </Group>

      <Group icon={<Database size={18} aria-hidden="true" />} title="資料">
        <LinkRow label="備份與還原" value="匯出／匯入存檔" onClick={() => setSub('data')} />
        <LinkRow label="時區" value={save.profile.timezone} onClick={() => setSub('account')} />
      </Group>

      <Group icon={<Info size={18} aria-hidden="true" />} title="關於棲光小島">
        <LinkRow label="常見問題" onClick={() => setSub('faq')} />
        <LinkRow label="再看一次新手導覽" onClick={() => setTouring(true)} />
        <LinkRow label="給我們回饋" onClick={() => setFeedback(true)} />
        <LinkRow label="給我們評分" value="Google Play" onClick={() => window.open(PLAY_URL, '_blank')} />
        <LinkRow label="服務條款" onClick={() => setSub('terms')} />
        <LinkRow label="隱私權說明" onClick={() => setPrivacy(true)} />
        <div className="set-row">
          <span>版本</span>
          <span className="set-value">v{version}</span>
        </div>
      </Group>

      <div className="set-list">
        <LinkRow label="重設全部資料…" danger onClick={() => setConfirmReset(true)} />
      </div>

      {feedback && <FeedbackSheet onClose={() => setFeedback(false)} />}
      {privacy && <PrivacyNote onClose={() => setPrivacy(false)} />}
      {touring && (
        <Modal title="新手導覽" onClose={() => setTouring(false)}>
          <Tour onDone={() => setTouring(false)} doneLabel="知道了" />
        </Modal>
      )}
      {confirmReset && resetModal}
    </div>
  );
}
