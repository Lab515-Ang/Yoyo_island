import { useEffect, useState, type ReactNode } from 'react';
import { useSave } from '../app/store';
import { AVATARS, avatarEmoji } from '../content/config';
import { validateSave } from '../domain/save';
import { openSession } from '../domain/game';
import { notifySupported, playChime } from '../sound';
import { TimeGuard, defaultGuardConfig, isAndroid, isNative, onResume, requestNotifyPermission, type GuardApp } from '../platform';
import { Modal } from '../components/ui';
import { Tour } from '../components/Tour';
import { FeedbackSheet } from '../components/Feedback';
import { AppPicker } from './Guard';
import { PrivacyNote } from './Onboarding';
import type { SaveFile } from '../domain/types';
import { Bell, ChevronLeft, ChevronRight, Database, Info, Monitor, Timer } from 'lucide-react';
import { version } from '../../package.json';

const TIMEZONES: string[] = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

type Sub = 'profile' | 'data' | 'allow' | null;

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
  useEffect(() => window.scrollTo(0, 0), []);
  return (
    <div className="page slide-in">
      <div className="sub-head">
        <button className="icon-btn" onClick={onBack} aria-label="返回設定">
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function SettingsPage() {
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

  const saveNames = () => {
    const n = nickname.trim();
    const i = island.trim();
    if (!n || !i) return notify('暱稱與島名不能空白。');
    update((s) => ({ ...s, profile: { ...s.profile, nickname: n }, islands: s.islands.map((x) => (x.id === s.profile.activeIslandId ? { ...x, name: i } : x)) }));
    notify('已更新名稱。');
  };

  const exportSave = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' }));
    a.download = `qiguang-island-${mode}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
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

  if (sub === 'profile')
    return (
      <SubPage title="個人資料" onBack={() => setSub(null)}>
        <section className="card">
          <label>
            暱稱
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} />
          </label>
          <label>
            島名
            <input value={island} onChange={(e) => setIsland(e.target.value)} maxLength={20} />
          </label>
          <button className="primary" onClick={saveNames}>
            儲存名稱
          </button>
        </section>
        <section className="card">
          <h2>頭像</h2>
          <div className="avatar-grid">
            {AVATARS.map((a) => (
              <button key={a.id} className={a.id === save.profile.avatarId ? 'avatar-opt selected' : 'avatar-opt'} aria-pressed={a.id === save.profile.avatarId} aria-label={a.label} onClick={() => update((s) => ({ ...s, profile: { ...s.profile, avatarId: a.id } }))}>
                {a.emoji}
              </button>
            ))}
          </div>
        </section>
        {TIMEZONES.length > 0 && (
          <section className="card">
            <label>
              時區（每日統計依此計算）
              <select value={save.profile.timezone} onChange={(e) => update((s) => ({ ...s, profile: { ...s.profile, timezone: e.target.value } }))}>
                {TIMEZONES.map((tz) => (
                  <option key={tz}>{tz}</option>
                ))}
              </select>
            </label>
          </section>
        )}
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
      </Group>

      <Group icon={<Bell size={18} aria-hidden="true" />} title="提醒與聲音">
        <SwitchRow label="倒數結束系統通知" hint="鎖定螢幕時也會提醒" checked={st.endNotify} onChange={(on) => void toggleNotify(on)} />
        {notifyMsg && <p className="error set-note">{notifyMsg}</p>}
        {st.endNotify && !exactAlarm && <LinkRow label="通知可能晚幾分鐘" value="讓它準時" onClick={() => void TimeGuard.openExactAlarmSettings()} />}
        <SwitchRow label="倒數結束提示音" hint="柔和鐘聲" checked={st.endChime} onChange={(on) => set({ endChime: on })} />
        <LinkRow label="試聽鐘聲" onClick={() => playChime(volume)} />
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

      <Group icon={<Database size={18} aria-hidden="true" />} title="資料">
        <LinkRow label="備份與還原" value="匯出／匯入存檔" onClick={() => setSub('data')} />
        <LinkRow label="時區" value={save.profile.timezone} onClick={() => setSub('profile')} />
      </Group>

      <Group icon={<Info size={18} aria-hidden="true" />} title="關於棲光小島">
        <LinkRow label="再看一次新手導覽" onClick={() => setTouring(true)} />
        <LinkRow label="給我們回饋" onClick={() => setFeedback(true)} />
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
      {confirmReset && (
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
      )}
    </div>
  );
}
