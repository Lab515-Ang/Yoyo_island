// 專注狀態機：idle → running ↔ paused → completed | abandoned
// 一律以時間戳推算，不依賴 setInterval 累加次數。
import { MAX_FOCUS_MINUTES } from '../content/config';
import type { FocusSegment, FocusSession, HabitatId, ID, TimerMode } from './types';

/** 正向計時的上限：滿 180 分鐘自動完成。 */
const STOPWATCH_CAP_MS = MAX_FOCUS_MINUTES * 60_000;

const ms = (iso: string) => Date.parse(iso);
const iso = (t: number) => new Date(t).toISOString();

export const isOpen = (s: FocusSession) => s.status === 'running' || s.status === 'paused';

export function createSession(
  input: { id: ID; userId: ID; islandId: ID; taskTitle: string; tag: string; habitatId: HabitatId; mode: TimerMode; targetSeconds: number | null; animalId?: string; deep?: boolean; extend?: boolean },
  now: number,
): FocusSession {
  return {
    ...input,
    taskTitle: input.taskTitle.trim() || '一段專注',
    targetSeconds: input.mode === 'countdown' ? input.targetSeconds : null,
    status: 'running',
    accumulatedMs: 0,
    runningSince: iso(now),
    segments: [],
    startedAt: iso(now),
    endedAt: null,
    outcome: null,
  };
}

/** 這段最多算到多久：倒數＝目標（延長計時可以繼續到 180 分鐘）；正向計時＝180 分鐘。 */
function capMs(s: FocusSession) {
  if (s.mode !== 'countdown') return STOPWATCH_CAP_MS;
  const target = (s.targetSeconds ?? 0) * 1000;
  return s.extend && target ? Math.max(target, STOPWATCH_CAP_MS) : target;
}

/** 倒數的目標時間到了沒（延長計時用：到了之後按停止就是完成）。 */
export function targetReached(s: FocusSession, now: number) {
  return s.mode === 'countdown' && !!s.targetSeconds && rawElapsedMs(s, now) >= s.targetSeconds * 1000;
}

/** 未封頂的有效時間（暫停期間不計）。時鐘倒退時不會變成負值。 */
export function rawElapsedMs(s: FocusSession, now: number) {
  return s.accumulatedMs + (s.runningSince ? Math.max(0, now - ms(s.runningSince)) : 0);
}

export function elapsedMs(s: FocusSession, now: number) {
  const raw = rawElapsedMs(s, now);
  return Math.min(raw, capMs(s) || STOPWATCH_CAP_MS);
}

export function remainingMs(s: FocusSession, now: number) {
  return s.targetSeconds ? Math.max(0, s.targetSeconds * 1000 - elapsedMs(s, now)) : 0;
}

function closeRunning(s: FocusSession, endMs: number): FocusSession {
  if (!s.runningSince) return s;
  const start = ms(s.runningSince);
  const end = Math.max(start, endMs);
  return {
    ...s,
    accumulatedMs: s.accumulatedMs + (end - start),
    runningSince: null,
    segments: [...s.segments, { startedAt: s.runningSince, endedAt: iso(end) }],
  };
}

/**
 * 倒數歸零（或正向計時滿 180 分鐘）時，於那一刻結束；就算在背景也只記到上限。
 * 玩家按的暫停超過上限：從上限那一刻自動繼續（之後照常計時、可能直接完成）。
 */
export function settle(s: FocusSession, now: number): FocusSession {
  if (s.status === 'paused' && s.pauseLimitAt && now >= ms(s.pauseLimitAt)) s = resume(s, ms(s.pauseLimitAt));
  if (s.status !== 'running' || !s.runningSince) return s;
  const target = capMs(s);
  if (!target) return s;
  if (rawElapsedMs(s, now) < target) return s;
  const end = ms(s.runningSince) + (target - s.accumulatedMs);
  return { ...closeRunning(s, end), status: 'completed', endedAt: iso(end) };
}

/** limitMs：玩家按的暫停最多多久，時間到自動繼續；接電話的暫停不傳（講多久都可以）。 */
export function pause(s: FocusSession, now: number, limitMs?: number): FocusSession {
  s = settle(s, now);
  if (s.status !== 'running') return s;
  return { ...closeRunning(s, now), status: 'paused', pauseLimitAt: limitMs ? iso(now + limitMs) : null };
}

export function resume(s: FocusSession, now: number): FocusSession {
  if (s.status !== 'paused') return s;
  return { ...s, status: 'running', runningSince: iso(now), pauseLimitAt: null };
}

/** 下一次需要結算的時間：進行中是倒數歸零（或正向計時上限），暫停中是自動繼續的時間。 */
export function wakeAt(s: FocusSession) {
  if (s.status === 'paused') return s.pauseLimitAt ? ms(s.pauseLimitAt) : null;
  return dueAt(s);
}

/**
 * 深度專注要看守的區間：進行中到 dueAt；玩家按的暫停期間也看守（暫停時可以離開，自動繼續後還在外面就算離開）。
 * 回傳 null＝不用看守（例如接電話的暫停）。
 */
export function watchWindow(s: FocusSession) {
  const target = capMs(s);
  if (s.status === 'running' && s.runningSince) return { endAt: dueAt(s)!, freeUntil: 0, since: ms(s.runningSince) - s.accumulatedMs };
  if (s.status === 'paused' && s.pauseLimitAt) {
    const limit = ms(s.pauseLimitAt);
    return { endAt: limit + target - s.accumulatedMs, freeUntil: limit, since: limit - s.accumulatedMs };
  }
  return null;
}

export function finish(s: FocusSession, now: number, status: 'completed' | 'abandoned'): FocusSession {
  s = settle(s, now);
  if (!isOpen(s)) return s;
  return { ...closeRunning(s, now), status, endedAt: iso(now) };
}

/** 深度專注要看守到什麼時候：倒數歸零或正向計時滿 180 分鐘（不含之後的通話時間）。 */
export function dueAt(s: FocusSession) {
  if (s.status !== 'running' || !s.runningSince) return null;
  return ms(s.runningSince) + capMs(s) - s.accumulatedMs;
}

/**
 * 深度專注：套用 App 在背景時原生端記下的事。
 * 通話區間當成暫停；通話還沒結束就停在暫停；離開太久就在離開的那一刻放棄（之前已經完成的照算完成）。
 */
export function applyDeepFocus(s: FocusSession, ev: { calls: [number, number][]; callStart: number | null; failedAt: number | null }): FocusSession {
  // 放棄之後才發生的通話不算（不然會把放棄後的時間也算進專注）
  const fail = ev.failedAt ?? Infinity;
  for (const [a, b] of [...ev.calls].filter(([a]) => a < fail).sort((x, y) => x[0] - y[0])) {
    if (s.status !== 'running') break;
    s = pause(s, a);
    s = resume(s, Math.min(b, fail));
  }
  if (ev.callStart && ev.callStart < fail && s.status === 'running') s = pause(s, ev.callStart);
  if (ev.failedAt && isOpen(s)) s = finish(s, ev.failedAt, 'abandoned');
  return s;
}

/** 測試工具：立刻以 minutes 分鐘完成。整段時間往前推，讓紀錄、每日分鐘數與獎勵都一致。 */
export function completeNow(s: FocusSession, now: number, minutes: number): FocusSession {
  if (!isOpen(s)) return s;
  const len = minutes * 60_000;
  const start = iso(now - len);
  return { ...s, status: 'completed', accumulatedMs: len, runningSince: null, segments: [{ startedAt: start, endedAt: iso(now) }], startedAt: start, endedAt: iso(now) };
}

// ---------- 本地時區日期 ----------

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(t: number, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    fmtCache.set(tz, f);
  }
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(t))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

const pad = (n: number) => String(n).padStart(2, '0');

// 一天、一週從什麼時候開始算（設定可改，預設午夜、週一）。存檔載入或設定改變時由 store 設定
const cal = { dayStartHour: 0, weekStart: 1 as 0 | 1 };
export function setCalendar(c: { dayStartHour: number; weekStart: 0 | 1 }) {
  cal.dayStartHour = c.dayStartHour;
  cal.weekStart = c.weekStart;
}
export const dayStartHour = () => cal.dayStartHour;
export const weekStartsOn = () => cal.weekStart;
const SHIFT = () => cal.dayStartHour * 3_600_000;

/** 本地日期；一天從 dayStartHour 點開始（例如設 4 點，凌晨 2 點還算前一天）。 */
export function localDateKey(t: number, tz: string) {
  const p = parts(t - SHIFT(), tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** `YYYY-MM-DD HH`（本地時區），和 addSegmentsByHour 的 key 一樣。 */
export function localHourKey(t: number, tz: string) {
  return `${localDateKey(t, tz)} ${pad(parts(t, tz).hour)}`;
}

function offsetAt(t: number, tz: string) {
  const p = parts(t, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}

/** t 之後下一次換日（本地午夜再加上一天的起始時間），處理日光節約時間的位移。 */
export function nextLocalMidnight(t: number, tz: string) {
  return nextMidnight(t - SHIFT(), tz) + SHIFT();
}

function nextMidnight(t: number, tz: string) {
  const p = parts(t, tz);
  const midnightAsUtc = Date.UTC(p.year, p.month - 1, p.day + 1);
  let next = midnightAsUtc - offsetAt(t, tz);
  const off2 = offsetAt(next, tz);
  if (midnightAsUtc - off2 !== next) next = midnightAsUtc - off2;
  if (next > t) return next;
  // 午夜被日光節約時間跳過（例如智利、古巴）：找第一個換日的整點
  const day = (x: number) => {
    const q = parts(x, tz);
    return q.year * 400 + q.month * 32 + q.day;
  };
  const today = day(t);
  let h = Math.floor(t / 3_600_000) * 3_600_000 + 3_600_000;
  while (day(h) === today) h += 3_600_000;
  return h;
}

/** 依本地日期分配有效時間；暫停時間不在任何 segment 內，所以不會被計入。 */
export function addSegmentsByDay(totals: Map<string, number>, segments: FocusSegment[], tz: string) {
  for (const seg of segments) {
    let a = ms(seg.startedAt);
    const b = ms(seg.endedAt);
    while (a < b) {
      const cut = Math.min(b, nextLocalMidnight(a, tz));
      const key = localDateKey(a, tz);
      totals.set(key, (totals.get(key) ?? 0) + (cut - a));
      a = cut;
    }
  }
  return totals;
}

/** 依本地「日期＋小時」分配有效時間，key 是 `YYYY-MM-DD HH`（專注紀錄的分布圖用）；暫停時間不計。 */
export function addSegmentsByHour(totals: Map<string, number>, segments: FocusSegment[], tz: string) {
  for (const seg of segments) {
    let a = ms(seg.startedAt);
    const b = ms(seg.endedAt);
    while (a < b) {
      const p = parts(a, tz);
      const cut = Math.min(b, a + ((59 - p.minute) * 60 + (60 - p.second)) * 1000 - (a % 1000));
      const key = `${localDateKey(a, tz)} ${pad(p.hour)}`;
      totals.set(key, (totals.get(key) ?? 0) + (cut - a));
      a = cut;
    }
  }
  return totals;
}

/** 這一週的第一天（設定可選週一或週日），回傳 YYYY-MM-DD。 */
export function weekStartKey(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = (new Date(t).getUTCDay() + 7 - cal.weekStart) % 7;
  const s = new Date(t - dow * 86400000);
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`;
}

export function shiftDateKey(dateKey: string, days: number) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, d + days));
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`;
}
