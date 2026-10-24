import { useEffect, useRef, useState } from 'react';
import { useSave } from '../app/store';
import { HABITATS, MAX_FOCUS_MINUTES, MIN_FOCUS_MINUTES, QUICK_MINUTES, TAGS, animalDef, habitatName } from '../content/config';
import { fmtDateTime, fmtMinutes } from '../components/ui';
import { HatchPlot } from '../components/Animal';
import { localDateKey, shiftDateKey, weekStartKey } from '../domain/focus';
import { endedSessions, habitatOpen, minutesByDay, rewardFor } from '../domain/game';
import type { FocusSession, Settings } from '../domain/types';

export function sessionLine(s: FocusSession) {
  const min = Math.floor(s.accumulatedMs / 60000);
  return `${s.taskTitle} · ${s.tag} · ${min} 分鐘${s.status === 'abandoned' ? '（提前結束，蛋沒有孵化）' : ` · 孵出${animalDef(s.animalId).name} · +${rewardFor(s)} 點 +${rewardFor(s)} 金幣`}`;
}

type Range = 'day' | 'week' | 'month' | 'year';
const RANGES: [Range, string][] = [
  ['day', '天'],
  ['week', '週'],
  ['month', '月'],
  ['year', '年'],
];
// 每種範圍的紀錄：幾欄、至少幾格
const PLOT: Record<Range, { cols: number; min: number }> = { day: { cols: 4, min: 8 }, week: { cols: 6, min: 12 }, month: { cols: 8, min: 24 }, year: { cols: 12, min: 48 } };

const shiftMonth = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};
const md = (key: string) => `${Number(key.slice(5, 7))}/${Number(key.slice(8))}`;

/** 孵化紀錄：每段專注一隻（天／週／月／年）。每天都從空的草地開始。 */
function HatchView() {
  const { save } = useSave();
  const tz = save.profile.timezone;
  const today = localDateKey(Date.now(), tz);
  const [range, setRange] = useState<Range>('day');
  const [cursor, setCursor] = useState(today);

  const inRange = (key: string) =>
    range === 'day' ? key === cursor : range === 'week' ? weekStartKey(key) === weekStartKey(cursor) : range === 'month' ? key.slice(0, 7) === cursor.slice(0, 7) : key.slice(0, 4) === cursor.slice(0, 4);
  const shown = endedSessions(save)
    .filter((s) => inRange(localDateKey(Date.parse(s.endedAt!), tz)))
    .sort((a, b) => a.endedAt!.localeCompare(b.endedAt!));
  const grown = shown.filter((s) => s.status === 'completed');
  const totalMs = grown.reduce((a, s) => a + s.accumulatedMs, 0);

  const move = (n: number) => setCursor(range === 'day' ? shiftDateKey(cursor, n) : range === 'week' ? shiftDateKey(cursor, 7 * n) : range === 'month' ? shiftMonth(cursor, n) : shiftMonth(cursor, 12 * n));
  const isNow = inRange(today);
  const label =
    range === 'day'
      ? cursor === today
        ? '今天'
        : `${Number(cursor.slice(0, 4)) === Number(today.slice(0, 4)) ? '' : `${cursor.slice(0, 4)}/`}${md(cursor)}`
      : range === 'week'
        ? `${md(weekStartKey(cursor))} – ${md(shiftDateKey(weekStartKey(cursor), 6))}`
        : range === 'month'
          ? `${cursor.slice(0, 4)} 年 ${Number(cursor.slice(5, 7))} 月`
          : `${cursor.slice(0, 4)} 年`;

  return (
    <section className="card garden-card">
      <div className="segmented" role="radiogroup" aria-label="紀錄範圍">
        {RANGES.map(([k, l]) => (
          <button key={k} role="radio" aria-checked={range === k} className={range === k ? 'on' : ''} onClick={() => (setRange(k), setCursor(today))}>
            {l}
          </button>
        ))}
      </div>
      <div className="garden-nav">
        <button className="time-step" onClick={() => move(-1)} aria-label="上一段">
          ‹
        </button>
        <strong>{label}</strong>
        <button className="time-step" onClick={() => move(1)} disabled={isNow} aria-label="下一段">
          ›
        </button>
      </div>
      <HatchPlot sessions={shown} cols={PLOT[range].cols} minCells={PLOT[range].min} />
      <p className="small center-text">
        {shown.length ? (
          <>
            孵出 <strong>{grown.length}</strong> 隻 · 專注 {fmtMinutes(totalMs)}
            {shown.length > grown.length && ` · ${shown.length - grown.length} 顆蛋沒孵化`}
          </>
        ) : isNow ? (
          '還是空的草地。完成一段專注，就會孵出第一隻。'
        ) : (
          '這段時間沒有孵出動物。'
        )}
      </p>
    </section>
  );
}

/** 專注紀錄與專注計畫設置：大廳開始專注時的預設值，以及完整紀錄。 */
export function Records({ initialTag = null }: { initialTag?: string | null }) {
  const [tagFilter, setTagFilter] = useState<string | null>(initialTag);
  // 從結算頁「查看專注紀錄」進來時，捲到紀錄清單（只在進來時捲一次）
  const listHead = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (initialTag) listHead.current?.scrollIntoView();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { save, update } = useSave();
  const st = save.settings;
  const set = (patch: Partial<Settings>) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const [custom, setCustom] = useState('');
  const [newTag, setNewTag] = useState('');
  const [limit, setLimit] = useState(50); // 紀錄多了一次只畫 50 筆

  const tz = save.profile.timezone;
  const byDay = minutesByDay(save);
  const today = localDateKey(Date.now(), tz);
  const days = Array.from({ length: 7 }, (_, i) => shiftDateKey(today, -i));
  const maxMs = Math.max(1, ...days.map((d) => byDay.get(d) ?? 0));
  const weekMs = days.reduce((a, d) => a + (byDay.get(d) ?? 0), 0);
  const sessions = [...save.sessions].reverse().filter((s) => s.endedAt && s.userId === save.profile.id && (!tagFilter || s.tag === tagFilter));
  const customMin = Number(custom);
  const customValid = Number.isInteger(customMin) && customMin >= MIN_FOCUS_MINUTES && customMin <= MAX_FOCUS_MINUTES;

  const addTag = () => {
    const t = newTag.trim();
    setNewTag('');
    if (t && ![...TAGS, ...st.customTags].includes(t)) set({ customTags: [...st.customTags, t].slice(-8) });
  };

  return (
    <div className="page">
      <h1>專注紀錄與專注計畫設置</h1>

      <HatchView />

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
          {QUICK_MINUTES.map((m) => (
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
            <input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ''))} placeholder="自訂" aria-label={`自訂分鐘（${MIN_FOCUS_MINUTES}～${MAX_FOCUS_MINUTES}）`} />
            <button className="chip" type="submit" disabled={!customValid}>
              設定
            </button>
          </form>
        </div>
        <p className="small muted">目前預設：{Math.round(st.lastTargetSeconds / 60) || '<1'} 分鐘</p>

        {/* 開放兩個以上的場景才需要選預設背景 */}
        {HABITATS.filter((h) => habitatOpen(save, h.id)).length > 1 && (
          <>
            <div className="field-label">預設專注背景</div>
            <div className="chips" role="radiogroup" aria-label="預設專注背景">
              {HABITATS.filter((h) => habitatOpen(save, h.id)).map((h) => (
                <button key={h.id} role="radio" aria-checked={st.preferredHabitatId === h.id} className={st.preferredHabitatId === h.id ? 'chip on' : 'chip'} onClick={() => set({ preferredHabitatId: h.id })}>
                  {h.name}
                </button>
              ))}
            </div>
          </>
        )}

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
          <h2 ref={listHead}>{tagFilter ? `專注紀錄：「${tagFilter}」` : '全部專注紀錄'}</h2>
          {tagFilter && (
            <button className="link" onClick={() => setTagFilter(null)}>
              顯示全部
            </button>
          )}
        </div>
        <ul className="list">
          {sessions.slice(0, limit).map((s) => (
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
        {sessions.length > limit && (
          <button className="link" onClick={() => setLimit((n) => n + 50)}>
            顯示更多（還有 {sessions.length - limit} 筆）
          </button>
        )}
      </section>
    </div>
  );
}
