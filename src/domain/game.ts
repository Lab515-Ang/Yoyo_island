// 經濟、工程、生物發現與統計：全部是對 SaveFile 的純函式
import { PROJECTS, SPECIES, HABITATS, projectDef, type ProjectDef, type SpeciesDef } from '../content/config';
import { addSegmentsByDay, createSession, isOpen, settle } from './focus';
import type { FocusSession, HabitatId, ID, SaveFile, TimerMode } from './types';

export const POINT_MS = 60_000;
const iso = (t: number) => new Date(t).toISOString();
const newId = () => crypto.randomUUID();

export const islandId = (save: SaveFile) => save.profile.activeIslandId;

// ---------- 專注與點數 ----------

/** 每有效專注滿 60 秒得 1 點；只有 completed 給點。 */
export const rewardFor = (s: FocusSession) => (s.status === 'completed' ? Math.floor(s.accumulatedMs / POINT_MS) : 0);

export function balance(save: SaveFile, userId: ID = save.profile.id) {
  const isl = islandId(save);
  return save.transactions.reduce((sum, t) => (t.userId === userId && t.islandId === isl ? sum + t.amount : sum), 0);
}

export const openSession = (save: SaveFile) => save.sessions.find(isOpen) ?? null;

export function putSession(save: SaveFile, s: FocusSession): SaveFile {
  const exists = save.sessions.some((x) => x.id === s.id);
  return { ...save, sessions: exists ? save.sessions.map((x) => (x.id === s.id ? s : x)) : [...save.sessions, s] };
}

/** 開始專注：同時最多一個未結算 session；只能選可進入的棲地。 */
export function startFocus(save: SaveFile, p: { taskTitle: string; tag: string; habitatId: HabitatId; mode: TimerMode; targetSeconds: number | null }, now: number): SaveFile {
  if (openSession(save) || !habitatOpen(save, p.habitatId)) return save;
  const s = createSession({ ...p, id: newId(), userId: save.profile.id, islandId: islandId(save) }, now);
  return {
    ...putSession(save, s),
    settings: { ...save.settings, lastTimerMode: p.mode, lastTargetSeconds: p.targetSeconds ?? save.settings.lastTargetSeconds, preferredHabitatId: p.habitatId },
  };
}

/** 與 session ID 綁定的點數結算；重複呼叫不會重複發點。 */
export function grantReward(save: SaveFile, sessionId: ID, now: number): SaveFile {
  const s = save.sessions.find((x) => x.id === sessionId);
  if (!s || s.status !== 'completed') return save;
  const key = `reward:${s.id}`;
  if (save.transactions.some((t) => t.idempotencyKey === key)) return save;
  const amount = rewardFor(s);
  if (amount <= 0) return save;
  return {
    ...save,
    transactions: [...save.transactions, { id: newId(), userId: s.userId, islandId: s.islandId, kind: 'focus_reward', amount, sessionId: s.id, idempotencyKey: key, createdAt: iso(now) }],
  };
}

/** 收尾 session 並結算（完成時發點），一次提交。 */
export function closeSession(save: SaveFile, s: FocusSession, now: number): SaveFile {
  return grantReward(putSession(save, s), s.id, now);
}

/** 載入或每次 tick 時呼叫：處理在背景已歸零的倒數。 */
export function settleOpenSessions(save: SaveFile, now: number): { save: SaveFile; completed: FocusSession | null } {
  const open = openSession(save);
  if (!open) return { save, completed: null };
  const s = settle(open, now);
  if (s === open) return { save, completed: null };
  return { save: closeSession(save, s, now), completed: s };
}

// ---------- 工程 ----------

export const projectRow = (save: SaveFile, id: string) => save.projects.find((p) => p.projectId === id && p.islandId === islandId(save));
export const isDone = (save: SaveFile, id: string | null) => id === null || !!projectRow(save, id)?.completedAt;
export const remainingFor = (save: SaveFile, def: ProjectDef) => def.requiredPoints - (projectRow(save, def.id)?.contributedPoints ?? 0);

/** 固定順序：第一個尚未完成的工程。 */
export const activeProject = (save: SaveFile): ProjectDef | null => PROJECTS.find((p) => !isDone(save, p.id)) ?? null;

export type ContributeResult =
  | { ok: true; save: SaveFile; spent: number; completed: ProjectDef | null; unlocked: SpeciesDef[] }
  | { ok: false; error: string };

/** 實際扣點 = min(輸入值, 錢包餘額, 工程剩餘需求)；交易、貢獻、工程進度一起提交。 */
export function contribute(save: SaveFile, userId: ID, projectId: string, input: number | 'all', now: number): ContributeResult {
  const def = projectDef(projectId);
  const row = projectRow(save, projectId);
  if (!def || !row) return { ok: false, error: '找不到這個工程。' };
  if (row.completedAt) return { ok: false, error: '這個工程已經完成了。' };
  if (!isDone(save, def.prerequisiteProjectId)) return { ok: false, error: `需要先完成「${projectDef(def.prerequisiteProjectId!)?.title}」。` };
  if (input !== 'all' && (typeof input !== 'number' || !Number.isInteger(input) || input <= 0)) return { ok: false, error: '請輸入大於 0 的整數點數。' };
  const bal = balance(save, userId);
  if (bal <= 0) return { ok: false, error: '目前沒有可投入的成長點數，完成一段專注就能獲得。' };
  const spent = Math.min(input === 'all' ? bal : input, bal, def.requiredPoints - row.contributedPoints);

  const isl = islandId(save);
  const contributionId = newId();
  const total = row.contributedPoints + spent;
  const completed = total >= def.requiredPoints;
  let next: SaveFile = {
    ...save,
    contributions: [...save.contributions, { id: contributionId, userId, islandId: isl, projectId, points: spent, createdAt: iso(now) }],
    transactions: [...save.transactions, { id: newId(), userId, islandId: isl, kind: 'project_spend', amount: -spent, contributionId, idempotencyKey: `spend:${contributionId}`, createdAt: iso(now) }],
    projects: save.projects.map((p) => (p === row ? { ...p, contributedPoints: total, completedAt: completed ? iso(now) : null } : p)),
  };
  if (completed) {
    const active = activeProject(next);
    next = { ...next, islands: next.islands.map((i) => (i.id === isl ? { ...i, activeProjectId: active?.id ?? null } : i)) };
  }
  return { ok: true, save: next, spent, completed: completed ? def : null, unlocked: completed ? SPECIES.filter((s) => s.requiredProjectId === def.id) : [] };
}

// ---------- 棲地與生物 ----------

export function habitatOpen(save: SaveFile, id: HabitatId) {
  const h = HABITATS.find((x) => x.id === id);
  return !!h?.playable && isDone(save, h.unlockProjectId);
}

/** 工程完成即可出現在棲地；場景由工程狀態推導。 */
export const speciesPresent = (save: SaveFile, habitatId: HabitatId) => SPECIES.filter((s) => s.habitatId === habitatId && isDone(save, s.requiredProjectId));

export const discoveryOf = (save: SaveFile, speciesId: string) => save.discoveries.find((d) => d.speciesId === speciesId && d.islandId === islandId(save));

/** 進入棲地時首次發現；同一 (島, 物種) 只記錄一次。 */
export function visitHabitat(save: SaveFile, habitatId: HabitatId, now: number): { save: SaveFile; discovered: SpeciesDef[] } {
  if (!habitatOpen(save, habitatId)) return { save, discovered: [] };
  const fresh = speciesPresent(save, habitatId).filter((s) => !discoveryOf(save, s.id));
  if (!fresh.length) return { save, discovered: [] };
  const isl = islandId(save);
  return {
    save: { ...save, discoveries: [...save.discoveries, ...fresh.map((s) => ({ islandId: isl, speciesId: s.id, discoveredAt: iso(now), triggeredByProjectId: s.requiredProjectId }))] },
    discovered: fresh,
  };
}

/** 尚未造訪棲地而未記錄的生物（條件已達成）。 */
export const pendingVisitors = (save: SaveFile) => SPECIES.filter((s) => isDone(save, s.requiredProjectId) && !discoveryOf(save, s.id));

export function habitatProgress(save: SaveFile, habitatId: HabitatId) {
  const defs = PROJECTS.filter((p) => p.habitatId === habitatId);
  const need = defs.reduce((a, p) => a + p.requiredPoints, 0);
  const got = defs.reduce((a, p) => a + (projectRow(save, p.id)?.contributedPoints ?? 0), 0);
  return need ? got / need : 0;
}

// ---------- 統計 ----------

/** 今日/每日時間包含 completed 與 abandoned 的有效時間。 */
export function minutesByDay(save: SaveFile, userId: ID = save.profile.id) {
  const totals = new Map<string, number>();
  for (const s of save.sessions) {
    if (s.userId === userId && s.islandId === islandId(save) && !isOpen(s)) addSegmentsByDay(totals, s.segments, save.profile.timezone);
  }
  return totals;
}

export function contributionsByUser(save: SaveFile) {
  const m = new Map<ID, number>();
  for (const c of save.contributions) if (c.islandId === islandId(save)) m.set(c.userId, (m.get(c.userId) ?? 0) + c.points);
  return m;
}
