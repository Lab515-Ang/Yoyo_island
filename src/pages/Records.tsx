import { useEffect, useMemo, useRef, useState } from 'react';
import { useSave } from '../app/store';
import { HABITATS, MAX_FOCUS_MINUTES, MIN_FOCUS_MINUTES, QUICK_MINUTES, TAGS, animalDef, habitatName, tagColor } from '../content/config';
import { fmtDateTime, fmtMinutes, Modal } from '../components/ui';
import { AnimalArt, HatchPlot } from '../components/Animal';
import { addSegmentsByHour, localDateKey, localHourKey, shiftDateKey, weekStartKey } from '../domain/focus';
import { endedSessions, habitatOpen, rewardFor } from '../domain/game';
import type { FocusSession, SaveFile, Settings } from '../domain/types';

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
// 每種範圍的孵化格子：幾欄、至少幾格
const PLOT: Record<Range, { cols: number; min: number }> = { day: { cols: 4, min: 8 }, week: { cols: 6, min: 12 }, month: { cols: 8, min: 24 }, year: { cols: 12, min: 48 } };
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const RANGE_NAME: Record<Range, string> = { day: '前一天', week: '上一週', month: '上個月', year: '去年' };

const shiftMonth = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};
const md = (key: string) => `${Number(key.slice(5, 7))}/${Number(key.slice(8))}`;
const daysInMonth = (key: string) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
const weekdayOf = (key: string) => (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = 週一
const shiftRange = (range: Range, key: string, n: number) => (range === 'day' ? shiftDateKey(key, n) : range === 'week' ? shiftDateKey(key, 7 * n) : range === 'month' ? shiftMonth(key, n) : shiftMonth(key, 12 * n));
const inRange = (range: Range, cursor: string, key: string) =>
  range === 'day' ? key === cursor : range === 'week' ? weekStartKey(key) === weekStartKey(cursor) : range === 'month' ? key.slice(0, 7) === cursor.slice(0, 7) : key.slice(0, 4) === cursor.slice(0, 4);
/** 分布圖的第幾格：天＝小時、週＝星期、月＝日期、年＝月份 */
const bucketOf = (range: Range, dateKey: string, hour: number) =>
  range === 'day' ? hour : range === 'week' ? weekdayOf(dateKey) : range === 'month' ? Number(dateKey.slice(8)) - 1 : Number(dateKey.slice(5, 7)) - 1;
const hourName = (i: number) => `${String(i).padStart(2, '0')}:00–${String(i + 1).padStart(2, '0')}:00`;
const dayName = (i: number) => `週${WEEKDAYS[i]}`;
/** 在這一期裡的位置（用來和上一期「同一段時間」比較，例如今天到現在 vs 昨天同一時間）。 */
const posIn = (range: Range, dateKey: string, hour: number) =>
  range === 'day' ? hour : range === 'week' ? weekdayOf(dateKey) * 24 + hour : range === 'month' ? (Number(dateKey.slice(8)) - 1) * 24 + hour : (Number(dateKey.slice(5, 7)) * 32 + Number(dateKey.slice(8))) * 24 + hour;
const shortTime = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} 時 ${m % 60} 分` : `${m} 分`;
};

/** 每小時的有效專注時間（含提前結束的那幾段；暫停不算），可依標籤篩選。 */
function useHourly(save: SaveFile, tag: string | null) {
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const s of endedSessions(save)) if (!tag || s.tag === tag) addSegmentsByHour(m, s.segments, save.profile.timezone);
    return m;
  }, [save, tag]);
}

/** 長條圖：點一下顯示那一格的時間。 */
function Bars({ values, labels, names }: { values: number[]; labels: string[]; names: (i: number) => string }) {
  const [sel, setSel] = useState<number | null>(null);
  const peak = Math.max(1, ...values);
  return (
    <>
      <p className="small muted bar-pick">{sel !== null ? `${names(sel)}：${shortTime(values[sel])}` : '點長條看時間'}</p>
      <div className="focus-chart" role="img" aria-label="專注時間分布">
        {values.map((v, i) => (
          <button key={i} className={sel === i ? 'focus-bar on' : 'focus-bar'} onClick={() => setSel(sel === i ? null : i)} aria-label={`${names(i)} ${shortTime(v)}`}>
            <span style={{ height: `${(v / peak) * 100}%` }} />
          </button>
        ))}
      </div>
      <div className="focus-axis" aria-hidden="true">
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </>
  );
}

/** 專注紀錄（參考 Forest）：孵化格子、專注時間統計、項目分布、最常孵出的動物、專注習慣。 */
function Overview({ tag, onTag }: { tag: string | null; onTag: (t: string | null) => void }) {
  const { save } = useSave();
  const tz = save.profile.timezone;
  const today = localDateKey(Date.now(), tz);
  const [range, setRange] = useState<Range>('day');
  const [cursor, setCursor] = useState(today);
  const [info, setInfo] = useState(false);
  const hourly = useHourly(save, tag);
  // 選單：內建、自訂，加上紀錄裡出現過的標籤（自訂標籤刪掉後，舊紀錄還是篩得到）
  const tags = [...new Set([...TAGS, ...save.settings.customTags, ...endedSessions(save).map((s) => s.tag)])].filter(Boolean);

  const shown = endedSessions(save)
    .filter((s) => (!tag || s.tag === tag) && inRange(range, cursor, localDateKey(Date.parse(s.endedAt!), tz)))
    .sort((a, b) => a.endedAt!.localeCompare(b.endedAt!));
  const hatched = shown.filter((s) => s.status === 'completed');
  const isNow = inRange(range, cursor, today);
  const prev = shiftRange(range, cursor, -1);

  // 依範圍彙總：分布圖、上一期總計、每天的時段、星期
  const n = range === 'day' ? 24 : range === 'week' ? 7 : range === 'month' ? daysInMonth(cursor) : 12;
  const buckets = Array<number>(n).fill(0);
  const byHour = Array<number>(24).fill(0);
  const byWeekday = Array<number>(7).fill(0);
  let total = 0;
  let prevTotal = 0;
  const nowPos = posIn(range, today, Number(localHourKey(Date.now(), tz).slice(11)));
  for (const [k, v] of hourly) {
    const dateKey = k.slice(0, 10);
    const hour = Number(k.slice(11));
    if (inRange(range, cursor, dateKey)) {
      total += v;
      buckets[bucketOf(range, dateKey, hour)] += v;
      byHour[hour] += v;
      byWeekday[weekdayOf(dateKey)] += v;
    } else if (inRange(range, prev, dateKey) && (!isNow || posIn(range, dateKey, hour) <= nowPos)) prevTotal += v;
  }

  // 專注項目分布（看全部標籤時才有意義）
  const byTag = new Map<string, number>();
  for (const s of shown) byTag.set(s.tag, (byTag.get(s.tag) ?? 0) + s.accumulatedMs);
  const tagRows = [...byTag].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const tagSum = tagRows.reduce((a, [, v]) => a + v, 0);
  let acc = 0;
  const donut = tagRows.map(([t, v]) => `${tagColor(t)} ${(acc / tagSum) * 360}deg ${((acc += v) / tagSum) * 360}deg`).join(', ');

  // 最常孵出的動物
  const byAnimal = new Map<string, number>();
  for (const s of hatched) byAnimal.set(animalDef(s.animalId).id, (byAnimal.get(animalDef(s.animalId).id) ?? 0) + 1);
  const animalRows = [...byAnimal].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const bestHour = byHour.indexOf(Math.max(...byHour));
  const bestDay = byWeekday.indexOf(Math.max(...byWeekday));
  const diff = total - prevTotal;

  const label =
    range === 'day'
      ? cursor === today
        ? '今天'
        : `${cursor.slice(0, 4) === today.slice(0, 4) ? '' : `${cursor.slice(0, 4)}/`}${md(cursor)}`
      : range === 'week'
        ? `${md(weekStartKey(cursor))} – ${md(shiftDateKey(weekStartKey(cursor), 6))}`
        : range === 'month'
          ? `${cursor.slice(0, 4)} 年 ${Number(cursor.slice(5, 7))} 月`
          : `${cursor.slice(0, 4)} 年`;
  const axis =
    range === 'day'
      ? ['0', '6', '12', '18', '23']
      : range === 'week'
        ? WEEKDAYS
        : range === 'month'
          ? ['1', '10', '20', String(n)]
          : ['1', '3', '6', '9', '12'];
  const names = (i: number) => (range === 'day' ? hourName(i) : range === 'week' ? dayName(i) : range === 'month' ? `${i + 1} 日` : `${i + 1} 月`);

  return (
    <>
      <section className="card garden-card">
        <div className="row between">
          <label className="tag-select">
            <span className="sr-only">只看某個標籤</span>
            <select value={tag ?? ''} onChange={(e) => onTag(e.target.value || null)}>
              <option value="">總覽（全部標籤）</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {!isNow && (
            <button className="link" onClick={() => setCursor(today)}>
              ↺ 回到今天
            </button>
          )}
        </div>
        <div className="segmented" role="radiogroup" aria-label="紀錄範圍">
          {RANGES.map(([k, l]) => (
            <button key={k} role="radio" aria-checked={range === k} className={range === k ? 'on' : ''} onClick={() => (setRange(k), setCursor(today))}>
              {l}
            </button>
          ))}
        </div>
        <div className="garden-nav">
          <button className="time-step" onClick={() => setCursor(shiftRange(range, cursor, -1))} aria-label="上一段">
            ‹
          </button>
          <strong>{label}</strong>
          <button className="time-step" onClick={() => setCursor(shiftRange(range, cursor, 1))} disabled={isNow} aria-label="下一段">
            ›
          </button>
        </div>
        <HatchPlot sessions={shown} cols={PLOT[range].cols} minCells={PLOT[range].min} />
        <p className="small center-text">
          {shown.length ? (
            <>
              🐣 孵出 <strong>{hatched.length}</strong> 隻{shown.length > hatched.length && ` · 🥚 ${shown.length - hatched.length} 顆沒孵化`}
            </>
          ) : isNow ? (
            '還是空的草地。完成一段專注，就會孵出第一隻。'
          ) : (
            '這段時間沒有孵出動物。'
          )}
        </p>
      </section>

      <section className="card">
        <div className="row between">
          <h2>專注時間統計</h2>
          <button className="icon-btn" onClick={() => setInfo(true)} aria-label="說明">
            ⓘ
          </button>
        </div>
        <p>
          累積專注時長：<strong>{fmtMinutes(total)}</strong>
        </p>
        {prevTotal > 0 ? (
          <p className="small muted">
            {diff === 0 ? `和${RANGE_NAME[range]}一樣` : `比${RANGE_NAME[range]}${diff > 0 ? '多' : '少'} ${fmtMinutes(Math.abs(diff))}`}
            {isNow ? '（和同一段時間比）' : ''}
          </p>
        ) : null}
        <Bars key={`${range}${cursor}`} values={buckets} labels={axis} names={names} />
      </section>

      {total > 0 && (
        <>
          {!tag && tagRows.length > 0 && (
            <section className="card">
              <h2>專注項目分布</h2>
              <div className="tag-donut" style={{ background: `conic-gradient(${donut})` }} role="img" aria-label="各標籤的專注時間比例" />
              <ul className="tag-rows">
                {tagRows.map(([t, v]) => (
                  <li key={t}>
                    <span className="tag-dot" style={{ background: tagColor(t) }} aria-hidden="true" />
                    <span>{t}</span>
                    <span className="muted">{Math.round((v / tagSum) * 100)}%</span>
                    <span className="small muted">{fmtMinutes(v)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {animalRows.length > 0 && (
            <section className="card">
              <h2>最常孵出的動物</h2>
              <ul className="rank-list">
                {animalRows.map(([id, c], i) => (
                  <li key={id} className="row">
                    <span className="small muted">{i + 1}.</span>
                    <AnimalArt id={id} size={40} />
                    <span className="rank-main">
                      <span className="row between">
                        <span>{animalDef(id).name}</span>
                        <span className="small muted">{c} 隻</span>
                      </span>
                      <span className="rank-bar" style={{ width: `${(c / animalRows[0][1]) * 100}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {range !== 'day' && (
            <section className="card">
              <h2>專注習慣</h2>
              <p className="small">
                最常在 <strong>{String(bestHour).padStart(2, '0')}:00</strong> 左右專注
                {range !== 'week' && (
                  <>
                    ，一週裡最常在 <strong>週{WEEKDAYS[bestDay]}</strong>
                  </>
                )}
                。
              </p>
              <Bars key={`h${range}${cursor}`} values={byHour} labels={['0', '6', '12', '18', '23']} names={hourName} />
              {range !== 'week' && <Bars key={`w${range}${cursor}`} values={byWeekday} labels={WEEKDAYS} names={dayName} />}
            </section>
          )}
        </>
      )}

      {info && (
        <Modal title="累積專注時長" onClose={() => setInfo(false)}>
          <p>只計算真正在專注的時間：暫停的時間不算；提前結束的那幾段，專注過的時間會算進來，但蛋不會孵化。</p>
          <button className="primary wide" onClick={() => setInfo(false)}>
            知道了
          </button>
        </Modal>
      )}
    </>
  );
}

/** 專注紀錄與專注計畫設置：統計、完整紀錄、大廳開始專注時的預設值。 */
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

      <Overview tag={tagFilter} onTag={setTagFilter} />

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
    </div>
  );
}
