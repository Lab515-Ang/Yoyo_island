import { useState } from 'react';
import { useSave } from '../app/store';
import { HABITATS, MAX_FOCUS_MINUTES, MIN_FOCUS_MINUTES, QUICK_MINUTES, TAGS, clampMinutes, habitatName, tagColor } from '../content/config';
import { Modal } from '../components/ui';
import { habitatOpen, startFocus } from '../domain/game';
import type { HabitatId, TimerMode } from '../domain/types';
import { HabitatScene } from '../scenes/HabitatScene';
import { isNative } from '../platform';

type Sheet = 'tag' | 'title' | 'time' | 'habitat' | null;

/** 首頁大廳（參考 Forest 構圖）：左上標籤與標題、中央棲地泡泡、大字時間、開始按鈕；細項點了才展開。 */
export function Lobby({ onStarted }: { onStarted: () => void }) {
  const { save, update, mode } = useSave();
  const st = save.settings;
  const [task, setTask] = useState('');
  const [tag, setTag] = useState(TAGS[0]);
  const [timerMode, setTimerMode] = useState<TimerMode>(st.lastTimerMode);
  // 舊存檔可能記著 5 分鐘：收進 10～180 分鐘（示範的 10 秒例外）
  const [seconds, setSeconds] = useState(mode === 'demo' && st.lastTargetSeconds === 10 ? 10 : clampMinutes(st.lastTargetSeconds / 60) * 60);
  const [habitat, setHabitat] = useState<HabitatId>(habitatOpen(save, st.preferredHabitatId) ? st.preferredHabitatId : 'greenhouse');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [draft, setDraft] = useState('');
  const [custom, setCustom] = useState('');
  const [newTag, setNewTag] = useState('');

  const tags = [...TAGS, ...st.customTags];
  const firstTime = !save.sessions.some((s) => s.userId === save.profile.id && s.endedAt);
  const customMin = Number(custom);
  const customValid = Number.isInteger(customMin) && customMin >= MIN_FOCUS_MINUTES && customMin <= MAX_FOCUS_MINUTES;
  const shown = timerMode === 'stopwatch' ? '00:00' : seconds < 60 ? `00:${String(seconds).padStart(2, '0')}` : `${Math.round(seconds / 60)}:00`;

  // 左右箭頭：在常用時間之間切換
  const step = (d: 1 | -1) => {
    const cur = seconds / 60;
    const next = d > 0 ? QUICK_MINUTES.find((m) => m > cur) : [...QUICK_MINUTES].reverse().find((m) => m < cur);
    if (next) setSeconds(next * 60);
  };

  const start = () => {
    const next = update((s) => startFocus(s, { taskTitle: task, tag, habitatId: habitat, mode: timerMode, targetSeconds: timerMode === 'countdown' ? seconds : null }, Date.now()));
    if (next) onStarted();
  };

  const addTag = () => {
    const t = newTag.trim();
    setNewTag('');
    if (!t || tags.includes(t)) return;
    update((s) => ({ ...s, settings: { ...s.settings, customTags: [...s.settings.customTags, t].slice(-8) } }));
    setTag(t);
  };

  return (
    <div className="lobby">
      <div className="lobby-head">
        <button className="tag-chip" onClick={() => setSheet('tag')}>
          <span className="tag-dot" style={{ background: tagColor(tag) }} aria-hidden="true" />
          {tag} ›
        </button>
        <button
          className="title-chip"
          onClick={() => {
            setDraft(task);
            setSheet('title');
          }}
        >
          {task || '新增專注標題'}
        </button>
      </div>

      <div className="lobby-bubble">
        <HabitatScene habitatId={habitat} bubble />
      </div>
      <button className="habitat-chip" onClick={() => setSheet('habitat')}>
        {habitatName(habitat)} ›
      </button>

      <div className="lobby-time-row">
        {timerMode === 'countdown' && (
          <button className="time-step" onClick={() => step(-1)} aria-label="減少時間" disabled={seconds <= QUICK_MINUTES[0] * 60}>
            ‹
          </button>
        )}
        <button className="lobby-time" onClick={() => setSheet('time')} aria-label={`專注時間 ${shown}，點一下調整`}>
          {shown}
        </button>
        {timerMode === 'countdown' && (
          <button className="time-step" onClick={() => step(1)} aria-label="增加時間" disabled={seconds >= QUICK_MINUTES[QUICK_MINUTES.length - 1] * 60}>
            ›
          </button>
        )}
      </div>
      <button className="lobby-mode" onClick={() => setSheet('time')}>
        {timerMode === 'countdown' ? '倒數' : '正向計時'} · 點時間或左右箭頭調整 ▾
      </button>

      <button className="pill start" onClick={start}>
        開始專注
      </button>
      <InstallHint />
      <p className="lobby-hint">{timerMode === 'countdown' ? '開始後 10 秒內可以取消；之後提前結束將一無所獲。' : `至少 ${MIN_FOCUS_MINUTES} 分鐘才算完成，最多 ${MAX_FOCUS_MINUTES} 分鐘。`}</p>

      {sheet === 'tag' && (
        <Modal title="標籤" onClose={() => setSheet(null)}>
          <div className="sheet-list" role="radiogroup" aria-label="標籤">
            {tags.map((t) => (
              <button
                key={t}
                role="radio"
                aria-checked={tag === t}
                className={tag === t ? 'sheet-row on' : 'sheet-row'}
                onClick={() => {
                  setTag(t);
                  setSheet(null);
                }}
              >
                <span className="tag-dot" style={{ background: tagColor(t) }} aria-hidden="true" />
                {t}
              </button>
            ))}
          </div>
          <div className="row">
            <input value={newTag} onChange={(e) => setNewTag(e.target.value)} maxLength={8} placeholder="新增標籤" aria-label="新增標籤" onKeyDown={(e) => e.key === 'Enter' && addTag()} />
            <button onClick={addTag} disabled={!newTag.trim()}>
              ＋ 新增
            </button>
          </div>
        </Modal>
      )}

      {sheet === 'title' && (
        <Modal title="專注標題" onClose={() => setSheet(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setTask(draft.trim());
              setSheet(null);
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={40} placeholder="例：數學第二章" autoFocus aria-label="專注標題" />
            <button className="primary wide" type="submit">
              完成
            </button>
          </form>
        </Modal>
      )}

      {sheet === 'time' && (
        <Modal title="專注時間" onClose={() => setSheet(null)}>
          <div className="segmented" role="radiogroup" aria-label="計時方式">
            {(
              [
                ['countdown', '倒數'],
                ['stopwatch', '正向計時'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} role="radio" aria-checked={timerMode === k} className={timerMode === k ? 'on' : ''} onClick={() => setTimerMode(k)}>
                {l}
              </button>
            ))}
          </div>
          {timerMode === 'countdown' ? (
            <>
              <div className="chips" role="radiogroup" aria-label="倒數時間">
                {mode === 'demo' && (
                  <button role="radio" aria-checked={seconds === 10} className={seconds === 10 ? 'chip on demo' : 'chip demo'} onClick={() => (setSeconds(10), setSheet(null))}>
                    10 秒（示範）
                  </button>
                )}
                {QUICK_MINUTES.map((m) => (
                  <button key={m} role="radio" aria-checked={seconds === m * 60} className={seconds === m * 60 ? 'chip on' : 'chip'} onClick={() => (setSeconds(m * 60), setSheet(null))}>
                    {m} 分{m === MIN_FOCUS_MINUTES && firstTime ? '（新手）' : ''}
                  </button>
                ))}
              </div>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!customValid) return;
                  setSeconds(customMin * 60);
                  setCustom('');
                  setSheet(null);
                }}
              >
                <input className="short" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ''))} placeholder="自訂" aria-label={`自訂分鐘（${MIN_FOCUS_MINUTES}～${MAX_FOCUS_MINUTES}）`} />
                <span className="small">分鐘（{MIN_FOCUS_MINUTES}～{MAX_FOCUS_MINUTES}）</span>
                <button type="submit" disabled={!customValid}>
                  設定
                </button>
              </form>
            </>
          ) : (
            <p className="small muted">正向計時沒有目標時間：至少 {MIN_FOCUS_MINUTES} 分鐘才算完成，滿 {MAX_FOCUS_MINUTES} 分鐘會自動完成。</p>
          )}
          {timerMode === 'stopwatch' && (
            <button className="primary wide" onClick={() => setSheet(null)}>
              完成
            </button>
          )}
        </Modal>
      )}

      {sheet === 'habitat' && (
        <Modal title="專注背景" onClose={() => setSheet(null)}>
          <div className="sheet-list" role="radiogroup" aria-label="專注背景">
            {HABITATS.filter((h) => habitatOpen(save, h.id)).map((h) => (
              <button
                key={h.id}
                role="radio"
                aria-checked={habitat === h.id}
                className={habitat === h.id ? 'sheet-row on' : 'sheet-row'}
                onClick={() => {
                  setHabitat(h.id);
                  setSheet(null);
                }}
              >
                {h.name}
              </button>
            ))}
          </div>
          <p className="small muted">修好更多棲地，就能選更多地方當專注背景。</p>
        </Modal>
      )}
    </div>
  );
}

const HINT_KEY = 'qiguang-ui:installHintDismissed';
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** 還沒加到主畫面時提醒：瀏覽器可能清掉網站資料，安裝後比較安全。 */
function InstallHint() {
  const [hidden, setHidden] = useState(() => {
    try {
      return isNative || standalone() || localStorage.getItem(HINT_KEY) === '1';
    } catch {
      return true;
    }
  });
  const [how, setHow] = useState(false);
  if (hidden) return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return (
    <div className="install-hint">
      <p className="small">
        把棲光小島加到主畫面：可以全螢幕使用，進度也比較不會被瀏覽器清掉。
        <button className="link" onClick={() => setHow(!how)}>
          怎麼加？
        </button>
      </p>
      {how && <p className="small">{ios ? 'iPhone：用 Safari 打開 → 下方分享按鈕 □↑ → 「加入主畫面」。' : 'Android：Chrome 右上角 ⋮ → 「安裝應用程式」或「加到主畫面」。'}</p>}
      <button
        className="link"
        onClick={() => {
          try {
            localStorage.setItem(HINT_KEY, '1');
          } catch {
            // 只影響提示是否再出現
          }
          setHidden(true);
        }}
      >
        知道了
      </button>
    </div>
  );
}
