import { useEffect, useState } from 'react';
import { useSave } from '../app/store';
import { AVATARS } from '../content/config';
import { validateSave } from '../domain/save';
import { openSession } from '../domain/game';
import { notifySupported, playChime } from '../sound';
import { TimeGuard, defaultGuardConfig, isAndroid, isNative, onResume, requestNotifyPermission } from '../platform';
import { Modal } from '../components/ui';
import { Tour } from '../components/Tour';
import { FeedbackSheet } from '../components/Feedback';
import type { SaveFile } from '../domain/types';

const TIMEZONES: string[] = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

export function SettingsPage() {
  const { save, update, replace, resetAll, mode, notify } = useSave();
  const [nickname, setNickname] = useState(save.profile.nickname);
  const [island, setIsland] = useState(save.islands[0]?.name ?? '');
  const [preview, setPreview] = useState<SaveFile | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
  const [touring, setTouring] = useState(false);
  const [feedback, setFeedback] = useState(false);
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

  return (
    <div className="page">
      <h1>{mode === 'demo' ? '設定（示範存檔）' : '設定'}</h1>
      <section className="card">
      <section className="sheet-section">
        <h3>個人</h3>
        <label>
          暱稱
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} />
        </label>
        <label>
          島名
          <input value={island} onChange={(e) => setIsland(e.target.value)} maxLength={20} />
        </label>
        <button onClick={saveNames}>儲存名稱</button>
        <div className="avatar-grid">
          {AVATARS.map((a) => (
            <button key={a.id} className={a.id === save.profile.avatarId ? 'avatar-opt selected' : 'avatar-opt'} aria-pressed={a.id === save.profile.avatarId} aria-label={a.label} onClick={() => update((s) => ({ ...s, profile: { ...s.profile, avatarId: a.id } }))}>
              {a.emoji}
            </button>
          ))}
        </div>
        {TIMEZONES.length > 0 && (
          <label>
            時區（每日統計依此計算）
            <select value={save.profile.timezone} onChange={(e) => update((s) => ({ ...s, profile: { ...s.profile, timezone: e.target.value } }))}>
              {TIMEZONES.map((tz) => (
                <option key={tz}>{tz}</option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className="sheet-section">
        <h3>導覽</h3>
        <button onClick={() => setTouring(true)}>再看一次新手導覽</button>
        <button onClick={() => setFeedback(true)}>給我們回饋</button>
        {feedback && <FeedbackSheet onClose={() => setFeedback(false)} />}
        {touring && (
          <Modal title="新手導覽" onClose={() => setTouring(false)}>
            <Tour onDone={() => setTouring(false)} doneLabel="知道了" />
          </Modal>
        )}
      </section>

      <section className="sheet-section">
        <h3>聲音</h3>
        <label className="toggle">
          <input type="checkbox" checked={st.soundEnabled} onChange={(e) => set({ soundEnabled: e.target.checked })} />
          專注與棲地中播放環境音
        </label>
        <label>
          音量
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVol(Number(e.target.value))} onPointerUp={commitVol} onKeyUp={commitVol} onBlur={commitVol} />
        </label>
        <label className="toggle">
          <input type="checkbox" checked={st.endChime} onChange={(e) => set({ endChime: e.target.checked })} />
          倒數結束提示音（柔和鐘聲）
        </label>
        <button onClick={() => playChime(volume)} disabled={volume <= 0}>
          🔔 試聽鐘聲
        </button>
        <label className="toggle">
          <input type="checkbox" checked={st.endNotify} onChange={(e) => void toggleNotify(e.target.checked)} />
          倒數結束系統通知（鎖定螢幕時也會提醒）
        </label>
        {notifyMsg && <p className="error">{notifyMsg}</p>}
        {st.endNotify && !exactAlarm && (
          <p className="small muted">
            目前通知可能會晚幾分鐘跳出。
            <button className="link" onClick={() => void TimeGuard.openExactAlarmSettings()}>
              開啟「鬧鐘與提醒」讓它準時
            </button>
          </p>
        )}
        <label className="toggle">
          <input type="checkbox" checked={st.keepAwake} onChange={(e) => set({ keepAwake: e.target.checked })} />
          專注時保持螢幕開啟（比較耗電）
        </label>
        {!isNative && (
          <p className="small muted">
            網頁版在 iPhone 鎖定螢幕時會暫停，倒數結束要等回到頁面才會響鈴；App 版會用系統通知準時提醒。
          </p>
        )}
        <p className="small muted">要聽哪一種環境音，可以在「大自然交響樂」挑選已收集的聲音。</p>
      </section>

      <section className="sheet-section">
        <h3>畫面</h3>
        <label className="toggle">
          <input type="checkbox" checked={st.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} />
          低動態效果（生物與水面靜止）
        </label>
        <label className="toggle">
          <input type="checkbox" checked={st.sceneMode === '2d'} onChange={(e) => set({ sceneMode: e.target.checked ? '2d' : 'auto' })} />
          使用簡化 2D 場景（較省電）
        </label>
      </section>

      <section className="sheet-section">
        <h3>資料</h3>
        <p className="small muted">{isNative ? '進度只保存在這支手機裡。換手機或刪除 App 前，請先匯出備份。' : '進度只保存在這台裝置的瀏覽器裡。換裝置或清除瀏覽器資料前，請先匯出。'}</p>
        <div className="row wrap">
          <button onClick={exportSave}>匯出存檔</button>
          <label className="button-like">
            匯入存檔
            <input type="file" accept="application/json,.json" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
        </div>
        {importError && <p className="error" role="alert">{importError}</p>}
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

      <section className="sheet-section">
        <h3>重設</h3>
        {confirmReset ? (
          <div className="notice">
            <p>這會清除這台裝置上棲光小島的所有資料（包含示範存檔），無法復原。建議先匯出。</p>
            <div className="row">
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
              <button className="ghost" onClick={() => setConfirmReset(false)}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <button className="danger" onClick={() => setConfirmReset(true)}>
            重設全部資料…
          </button>
        )}
      </section>
      </section>
    </div>
  );
}
