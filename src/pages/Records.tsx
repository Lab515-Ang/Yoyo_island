import { useMemo, useState } from 'react';
import { useSave } from '../app/store';
import { TAGS, animalDef, tagColor } from '../content/config';
import { fmtMinutes, Modal } from '../components/ui';
import { renderShareCard, ShareModal } from '../components/ShareCard';
import { AnimalArt, HatchPlot } from '../components/Animal';
import { addSegmentsByHour, localDateKey, localHourKey, shiftDateKey, weekStartKey } from '../domain/focus';
import { endedSessions } from '../domain/game';
import type { SaveFile } from '../domain/types';

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
function useHourly(save: SaveFile, tags: string[] | null) {
  const key = tags?.join('|') ?? '';
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const s of endedSessions(save)) if (!tags || tags.includes(s.tag)) addSegmentsByHour(m, s.segments, save.profile.timezone);
    return m;
  }, [save, key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** 標籤篩選（多選，可搜尋）：按確認才套用。全部勾選＝總覽。 */
function TagPicker({ all, selected, onApply, onClose }: { all: string[]; selected: string[] | null; onApply: (t: string[] | null) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>(selected ?? all);
  const [q, setQ] = useState('');
  const shown = all.filter((t) => t.toLowerCase().includes(q.trim().toLowerCase()));
  const allOn = picked.length === all.length;
  const toggle = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  return (
    <Modal title="標籤" onClose={onClose}>
      <div className="row between">
        <input type="search" className="tag-search" placeholder="尋找標籤" value={q} onChange={(e) => setQ(e.target.value)} aria-label="尋找標籤" />
        <button className="link" onClick={() => setPicked(allOn ? [] : all)}>
          {allOn ? '取消全選' : '全選'}
        </button>
      </div>
      <ul className="tag-pick">
        {shown.map((t) => (
          <li key={t}>
            <label className="toggle">
              <span className="tag-dot" style={{ background: tagColor(t) }} aria-hidden="true" />
              <span className="tag-pick-name">{t}</span>
              <input type="checkbox" checked={picked.includes(t)} onChange={() => toggle(t)} />
            </label>
          </li>
        ))}
        {!shown.length && <li className="muted small">找不到這個標籤。</li>}
      </ul>
      <p className="small muted center-text">已選取 {picked.length} 項</p>
      <div className="row editor-actions">
        <button onClick={onClose}>取消</button>
        <button className="primary" disabled={!picked.length} onClick={() => onApply(allOn ? null : picked)}>
          確認
        </button>
      </div>
    </Modal>
  );
}

/** 長條圖：點一下顯示那一格的時間。 */
function Bars({ values, labels, names }: { values: number[]; labels: string[]; names: (i: number) => string }) {
  const [sel, setSel] = useState<number | null>(null);
  const peak = Math.max(1, ...values);
  return (
    <>
      <p className="small muted bar-pick">{sel !== null ? `${names(sel)}：${shortTime(values[sel])}` : '點長條看時間'}</p>
      <div className="focus-chart" role="img" aria-label="專注時間分布">
        <span className="focus-grid top" aria-hidden="true">
          {values.some(Boolean) ? shortTime(peak) : ''}
        </span>
        <span className="focus-grid mid" aria-hidden="true" />
        {!values.some(Boolean) && <span className="focus-empty">無資料</span>}
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
function Overview({ tags: picked, onTags }: { tags: string[] | null; onTags: (t: string[] | null) => void }) {
  const { save } = useSave();
  const tz = save.profile.timezone;
  const today = localDateKey(Date.now(), tz);
  const [range, setRange] = useState<Range>('day');
  const [cursor, setCursor] = useState(today);
  const [info, setInfo] = useState(false);
  const [picking, setPicking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const hourly = useHourly(save, picked);
  const inTags = (t: string) => !picked || picked.includes(t);
  // 選單：內建、自訂，加上紀錄裡出現過的標籤（自訂標籤刪掉後，舊紀錄還是篩得到）
  const tags = [...new Set([...TAGS, ...save.settings.customTags, ...endedSessions(save).map((s) => s.tag)])].filter(Boolean);

  const shown = endedSessions(save)
    .filter((s) => inTags(s.tag) && inRange(range, cursor, localDateKey(Date.parse(s.endedAt!), tz)))
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
      ? `${cursor.slice(0, 4) === today.slice(0, 4) ? '' : `${cursor.slice(0, 4)}/`}${md(cursor)}${cursor === today ? '（今天）' : cursor === shiftDateKey(today, -1) ? '（昨天）' : ''}`
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
  const tagLabel = !picked ? '總覽' : picked.length === 1 ? picked[0] : `${picked.length} 個標籤`;
  const makeCard = () =>
    renderShareCard({
      title: label,
      subtitle: !picked ? '全部標籤' : picked.join('、'),
      total: fmtMinutes(total),
      counts: `孵出 ${hatched.length} 隻・沒孵化 ${shown.length - hatched.length} 顆`,
      sessions: shown,
      cols: PLOT[range].cols,
      bars: buckets,
      axis,
    });
  const fileName = `棲光小島-${cursor}`;
  const names = (i: number) => (range === 'day' ? hourName(i) : range === 'week' ? dayName(i) : range === 'month' ? `${i + 1} 日` : `${i + 1} 月`);

  return (
    <>
      <section className="card garden-card">
        <div className="row between">
          <button className="tag-select" onClick={() => setPicking(true)} aria-label={`標籤篩選：${tagLabel}`}>
            {tagLabel} ▾
          </button>
          <button className="icon-btn" onClick={() => setSharing(true)} aria-label="分享專注成果統計圖">
            ⤴
          </button>
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
          <strong>
            {label}
            {!isNow && (
              <button className="back-today" onClick={() => setCursor(today)} aria-label="回到今天">
                ↺
              </button>
            )}
          </strong>
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
          {tagRows.length > 1 && (
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

      {picking && <TagPicker all={tags} selected={picked} onApply={(t) => (onTags(t), setPicking(false))} onClose={() => setPicking(false)} />}
      {sharing && <ShareModal title="專注成果統計圖" fileName={fileName} make={makeCard} onClose={() => setSharing(false)} />}
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

/** 專注紀錄：孵化格子與統計。從結算頁「查看專注紀錄」進來時先篩選那個標籤。 */
export function Records({ initialTag = null }: { initialTag?: string | null }) {
  const [tagFilter, setTagFilter] = useState<string[] | null>(initialTag ? [initialTag] : null);
  return (
    <div className="page">
      <h1>專注紀錄</h1>
      <Overview tags={tagFilter} onTags={setTagFilter} />
    </div>
  );
}
