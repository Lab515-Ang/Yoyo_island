import { useState } from 'react';
import { useSave } from '../app/store';
import { COPY, HABITATS, MAX_CUSTOM_MINUTES, QUICK_MINUTES, TAGS, habitatName } from '../content/config';
import { Progress } from '../components/ui';
import { localDateKey } from '../domain/focus';
import { activeProject, habitatOpen, minutesByDay, projectRow, startFocus } from '../domain/game';
import type { HabitatId, TimerMode } from '../domain/types';

function greeting(h: number) {
  if (h < 5) return '夜深了，慢慢來';
  if (h < 11) return '早安';
  if (h < 14) return '午安';
  if (h < 18) return '下午好';
  return '晚上好';
}

/** 首頁大廳：直接設定並開始專注。 */
export function Lobby({ onStarted, onGoIsland }: { onStarted: () => void; onGoIsland: () => void }) {
  const { save, update, mode } = useSave();
  const st = save.settings;
  const [task, setTask] = useState('');
  const [tag, setTag] = useState(TAGS[0]);
  const [newTag, setNewTag] = useState('');
  const [timerMode, setTimerMode] = useState<TimerMode>(st.lastTimerMode);
  const [seconds, setSeconds] = useState(st.lastTargetSeconds);
  const [custom, setCustom] = useState('');
  const [habitat, setHabitat] = useState<HabitatId>(habitatOpen(save, st.preferredHabitatId) ? st.preferredHabitatId : 'greenhouse');

  const now = Date.now();
  const tz = save.profile.timezone;
  const today = localDateKey(now, tz);
  const todayMs = minutesByDay(save).get(today) ?? 0;
  const finished = save.sessions.filter((s) => s.userId === save.profile.id && (s.status === 'completed' || s.status === 'abandoned'));
  const last = finished.at(-1)?.endedAt;
  const returning = last && now - Date.parse(last) > 8 * 3600_000;
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now));
  const project = activeProject(save);
  const tags = [...TAGS, ...st.customTags];
  const options = [...(finished.length === 0 || seconds === 300 ? [5] : []), ...QUICK_MINUTES];

  const customMin = Number(custom);
  const customValid = custom === '' || (Number.isInteger(customMin) && customMin >= 1 && customMin <= MAX_CUSTOM_MINUTES);

  const start = () => {
    if (!customValid) return;
    const target = timerMode === 'countdown' ? (custom ? customMin * 60 : seconds) : null;
    const next = update((s) => startFocus(s, { taskTitle: task, tag, habitatId: habitat, mode: timerMode, targetSeconds: target }, Date.now()));
    if (next) onStarted();
  };

  const addTag = () => {
    const t = newTag.trim();
    if (!t || tags.includes(t)) return setNewTag('');
    update((s) => ({ ...s, settings: { ...s.settings, customTags: [...s.settings.customTags, t].slice(-8) } }));
    setTag(t);
    setNewTag('');
  };

  return (
    <div className="page">
      <section className="hello">
        <p className="muted">{new Intl.DateTimeFormat('zh-TW', { timeZone: tz, month: 'long', day: 'numeric', weekday: 'long' }).format(now)}</p>
        <h1>
          {greeting(hour)}，{save.profile.nickname}
        </h1>
        <p className="muted">{returning ? COPY.welcomeBack : COPY.start}</p>
        <p className="today-total">
          今日已專注 <strong>{Math.floor(todayMs / 60000)}</strong> 分鐘
        </p>
      </section>

      <section className="card">
        <h2>開始一段專注</h2>
        <label>
          這段要做什麼？
          <input value={task} onChange={(e) => setTask(e.target.value)} maxLength={40} placeholder="例如：閱讀第三章（可不填）" />
        </label>

        <div className="field-label">標籤</div>
        <div className="chips" role="radiogroup" aria-label="標籤">
          {tags.map((t) => (
            <button key={t} role="radio" aria-checked={tag === t} className={tag === t ? 'chip on' : 'chip'} onClick={() => setTag(t)}>
              {t}
            </button>
          ))}
          <span className="chip-add">
            <input value={newTag} onChange={(e) => setNewTag(e.target.value)} maxLength={8} placeholder="自訂" aria-label="新增自訂標籤" onKeyDown={(e) => e.key === 'Enter' && addTag()} />
            <button className="chip" onClick={addTag} disabled={!newTag.trim()} aria-label="加入標籤">
              ＋
            </button>
          </span>
        </div>

        <div className="field-label">計時方式</div>
        <div className="segmented" role="radiogroup" aria-label="計時方式">
          <button role="radio" aria-checked={timerMode === 'countdown'} className={timerMode === 'countdown' ? 'on' : ''} onClick={() => setTimerMode('countdown')}>
            倒數
          </button>
          <button role="radio" aria-checked={timerMode === 'stopwatch'} className={timerMode === 'stopwatch' ? 'on' : ''} onClick={() => setTimerMode('stopwatch')}>
            正向計時
          </button>
        </div>

        {timerMode === 'countdown' && (
          <>
            <div className="field-label">時間</div>
            <div className="chips" role="radiogroup" aria-label="倒數時間">
              {mode === 'demo' && (
                <button role="radio" aria-checked={!custom && seconds === 10} className={!custom && seconds === 10 ? 'chip on demo' : 'chip demo'} onClick={() => (setSeconds(10), setCustom(''))}>
                  10 秒（示範）
                </button>
              )}
              {options.map((m) => (
                <button key={m} role="radio" aria-checked={!custom && seconds === m * 60} className={!custom && seconds === m * 60 ? 'chip on' : 'chip'} onClick={() => (setSeconds(m * 60), setCustom(''))}>
                  {m} 分{m === 5 ? '（新手）' : ''}
                </button>
              ))}
              <label className="chip-add">
                <input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ''))} placeholder="自訂" aria-label={`自訂分鐘（1～${MAX_CUSTOM_MINUTES}）`} />
                <span className="small">分</span>
              </label>
            </div>
            {!customValid && <p className="error">請輸入 1～{MAX_CUSTOM_MINUTES} 的整數分鐘。</p>}
          </>
        )}

        <div className="field-label">專注背景</div>
        <div className="chips" role="radiogroup" aria-label="專注背景">
          {HABITATS.filter((h) => habitatOpen(save, h.id)).map((h) => (
            <button key={h.id} role="radio" aria-checked={habitat === h.id} className={habitat === h.id ? 'chip on' : 'chip'} onClick={() => setHabitat(h.id)}>
              {h.name}
            </button>
          ))}
        </div>

        <button className="primary wide big" onClick={start} disabled={!customValid}>
          開始專注
        </button>
        <p className="small muted center-text">
          {timerMode === 'countdown' ? '倒數完成才會獲得點數、金幣與飼料（每 25 分鐘多 1 份）；提前結束將一無所獲。' : '正向計時結束時，依專注分鐘獲得點數、金幣與飼料。'}
        </p>
      </section>

      {project ? (
        <section className="card">
          <div className="row between">
            <h2>目前工程：{project.title}</h2>
            <span className="muted small">{habitatName(project.habitatId)}</span>
          </div>
          <Progress value={(projectRow(save, project.id)?.contributedPoints ?? 0) / project.requiredPoints} label="工程進度" />
          <p className="muted small">
            {projectRow(save, project.id)?.contributedPoints ?? 0} / {project.requiredPoints} 點 · {project.description}
          </p>
          <button className="ghost" onClick={onGoIsland}>
            前往小島投入點數
          </button>
        </section>
      ) : (
        <section className="card">
          <p>{COPY.allRestored}</p>
        </section>
      )}

    </div>
  );
}
