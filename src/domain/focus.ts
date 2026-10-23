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
  input: { id: ID; userId: ID; islandId: ID; taskTitle: string; tag: string; habitatId: HabitatId; mode: TimerMode; targetSeconds: number | null; plantId?: string },
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

/** 未封頂的有效時間（暫停期間不計）。時鐘倒退時不會變成負值。 */
export function rawElapsedMs(s: FocusSession, now: number) {
  return s.accumulatedMs + (s.runningSince ? Math.max(0, now - ms(s.runningSince)) : 0);
}

export function elapsedMs(s: FocusSession, now: number) {
  const raw = rawElapsedMs(s, now);
  return Math.min(raw, s.mode === 'countdown' && s.targetSeconds ? s.targetSeconds * 1000 : STOPWATCH_CAP_MS);
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

/** 倒數歸零（或正向計時滿 180 分鐘）時，於那一刻結束；就算在背景也只記到上限。 */
export function settle(s: FocusSession, now: number): FocusSession {
  if (s.status !== 'running' || !s.runningSince) return s;
  const target = s.mode === 'countdown' ? (s.targetSeconds ?? 0) * 1000 : STOPWATCH_CAP_MS;
  if (!target) return s;
  if (rawElapsedMs(s, now) < target) return s;
  const end = ms(s.runningSince) + (target - s.accumulatedMs);
  return { ...closeRunning(s, end), status: 'completed', endedAt: iso(end) };
}

export function pause(s: FocusSession, now: number): FocusSession {
  s = settle(s, now);
  if (s.status !== 'running') return s;
  return { ...closeRunning(s, now), status: 'paused' };
}

export function resume(s: FocusSession, now: number): FocusSession {
  if (s.status !== 'paused') return s;
  return { ...s, status: 'running', runningSince: iso(now) };
}

export function finish(s: FocusSession, now: number, status: 'completed' | 'abandoned'): FocusSession {
  s = settle(s, now);
  if (!isOpen(s)) return s;
  return { ...closeRunning(s, now), status, endedAt: iso(now) };
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

export function localDateKey(t: number, tz: string) {
  const p = parts(t, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function offsetAt(t: number, tz: string) {
  const p = parts(t, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}

/** t 之後下一個本地午夜（UTC 毫秒），處理日光節約時間的位移。 */
export function nextLocalMidnight(t: number, tz: string) {
  const p = parts(t, tz);
  const midnightAsUtc = Date.UTC(p.year, p.month - 1, p.day + 1);
  let next = midnightAsUtc - offsetAt(t, tz);
  const off2 = offsetAt(next, tz);
  if (midnightAsUtc - off2 !== next) next = midnightAsUtc - off2;
  return next;
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

/** 週一為一週開始，回傳 YYYY-MM-DD。 */
export function weekStartKey(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  const s = new Date(t - dow * 86400000);
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`;
}

export function shiftDateKey(dateKey: string, days: number) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, d + days));
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`;
}
