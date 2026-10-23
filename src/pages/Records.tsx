import { useState } from 'react';
import { useSave } from '../app/store';
import { HABITATS, MAX_CUSTOM_MINUTES, QUICK_MINUTES, TAGS, habitatName } from '../content/config';
import { fmtDateTime, fmtMinutes } from '../components/ui';
import { localDateKey, shiftDateKey } from '../domain/focus';
import { feedFor, habitatOpen, minutesByDay, rewardFor } from '../domain/game';
import type { FocusSession, Settings } from '../domain/types';

export function sessionLine(s: FocusSession) {
  const min = Math.floor(s.accumulatedMs / 60000);
  return `${s.taskTitle} · ${s.tag} · ${min} 分鐘${s.status === 'abandoned' ? '（提前結束，無獎勵）' : ` · +${rewardFor(s)} 點 +${rewardFor(s)} 金幣 +${feedFor(s)} 飼料`}`;
}

/** 專注紀錄與專注計畫設置：大廳開始專注時的預設值，以及完整紀錄。 */
export function Records({ initialTag = null }: { initialTag?: string | null }) {
  const [tagFilter, setTagFilter] = useState<string | null>(initialTag);
  const { save, update } = useSave();
  const st = save.settings;
  const set = (patch: Partial<Settings>) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const [custom, setCustom] = useState('');
  const [newTag, setNewTag] = useState('');

  const tz = save.profile.timezone;
  const byDay = minutesByDay(save);
  const today = localDateKey(Date.now(), tz);
  const days = Array.from({ length: 7 }, (_, i) => shiftDateKey(today, -i));
  const maxMs = Math.max(1, ...days.map((d) => byDay.get(d) ?? 0));
  const weekMs = days.reduce((a, d) => a + (byDay.get(d) ?? 0), 0);
  const sessions = [...save.sessions].reverse().filter((s) => s.endedAt && s.userId === save.profile.id && (!tagFilter || s.tag === tagFilter));
  const customMin = Number(custom);
  const customValid = Number.isInteger(customMin) && customMin >= 1 && customMin <= MAX_CUSTOM_MINUTES;

  const addTag = () => {
    const t = newTag.trim();
    setNewTag('');
    if (t && ![...TAGS, ...st.customTags].includes(t)) set({ customTags: [...st.customTags, t].slice(-8) });
  };

  return (
    <div className="page">
      <h1>專注紀錄與專注計畫設置</h1>

      <section className="card">
        <h2>專注計畫設置</h2>
        <p className="muted small">大廳開始專注時預先帶入這些設定；在大廳改過的選擇也會被記住。</p>

        <div className="field-label">預設計時方式</div>
        <div className="segmented" role="radiogroup" aria-label="預設計時方式">
          {(
            [
              ['countdown', '倒數'],
              ['stopwatch', '正向計時'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} role="radio" aria-checked={st.lastTimerMode === k} className={st.lastTimerMode === k ? 'on' : ''} onClick={() => set({ lastTimerMode: k })}>
              {l}
            </button>
          ))}
        </div>

        <div className="field-label">預設倒數時間</div>
        <div className="chips" role="radiogroup" aria-label="預設倒數時間">
          {[5, ...QUICK_MINUTES].map((m) => (
            <button key={m} role="radio" aria-checked={st.lastTargetSeconds === m * 60} className={st.lastTargetSeconds === m * 60 ? 'chip on' : 'chip'} onClick={() => set({ lastTargetSeconds: m * 60 })}>
              {m} 分
            </button>
          ))}
          <form
            className="chip-add"
            onSubmit={(e) => {
              e.preventDefault();
              if (customValid) set({ lastTargetSeconds: customMin * 60 }), setCustom('');
            }}
          >
            <input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ''))} placeholder="自訂" aria-label={`自訂分鐘（1～${MAX_CUSTOM_MINUTES}）`} />
            <button className="chip" type="submit" disabled={!customValid}>
              設定
            </button>
          </form>
        </div>
        <p className="small muted">目前預設：{Math.round(st.lastTargetSeconds / 60) || '<1'} 分鐘</p>

        <div className="field-label">預設專注背景</div>
        <div className="chips" role="radiogroup" aria-label="預設專注背景">
          {HABITATS.filter((h) => habitatOpen(save, h.id)).map((h) => (
            <button key={h.id} role="radio" aria-checked={st.preferredHabitatId === h.id} className={st.preferredHabitatId === h.id ? 'chip on' : 'chip'} onClick={() => set({ preferredHabitatId: h.id })}>
              {h.name}
            </button>
          ))}
        </div>

        <div className="field-label">自訂標籤</div>
        <div className="chips">
          {st.customTags.map((t) => (
            <button key={t} className="chip" aria-label={`移除標籤 ${t}`} onClick={() => set({ customTags: st.customTags.filter((x) => x !== t) })}>
              {t} ✕
            </button>
          ))}
          <span className="chip-add">
            <input value={newTag} onChange={(e) => setNewTag(e.target.value)} maxLength={8} placeholder="新標籤" aria-label="新增自訂標籤" onKeyDown={(e) => e.key === 'Enter' && addTag()} />
            <button className="chip" onClick={addTag} disabled={!newTag.trim()} aria-label="加入標籤">
              ＋
            </button>
          </span>
        </div>
        <p className="small muted">內建標籤：{TAGS.join('、')}</p>
      </section>

      <section className="card">
        <h2>最近 7 天</h2>
        <p className="small">
          合計 <strong>{fmtMinutes(weekMs)}</strong>
        </p>
        <ul className="list days">
          {days.map((d) => (
            <li key={d}>
              <span className="small">{d.slice(5).replace('-', '/')}</span>
              <span className="day-bar">
                <span style={{ width: `${((byDay.get(d) ?? 0) / maxMs) * 100}%` }} />
              </span>
              <span className="small">{fmtMinutes(byDay.get(d) ?? 0)}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">依時區 {tz} 計算；暫停時間不計。</p>
      </section>

      <section className="card">
        <div className="row between">
          <h2>{tagFilter ? `專注紀錄：「${tagFilter}」` : '全部專注紀錄'}</h2>
          {tagFilter && (
            <button className="link" onClick={() => setTagFilter(null)}>
              顯示全部
            </button>
          )}
        </div>
        <ul className="list">
          {sessions.map((s) => (
            <li key={s.id}>
              <span className="small muted">
                {fmtDateTime(s.endedAt!)} · {habitatName(s.habitatId)}
              </span>
              <div>{sessionLine(s)}</div>
              {s.note && <div className="small note-line">✎ {s.note}</div>}
            </li>
          ))}
          {!sessions.length && <li className="muted">還沒有專注紀錄。回到大廳開始第一段吧。</li>}
        </ul>
      </section>
    </div>
  );
}
