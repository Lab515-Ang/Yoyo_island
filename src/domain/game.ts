// 經濟、工程、生物發現與統計：全部是對 SaveFile 的純函式
import { PROJECTS, SPECIES, HABITATS, projectDef, type ProjectDef, type SpeciesDef } from '../content/config';
import { addSegmentsByDay, createSession, isOpen, settle } from './focus';
import type { FocusSession, HabitatId, ID, SaveFile, TimerMode } from './types';

export const POINT_MS = 60_000;
const iso = (t: number) => new Date(t).toISOString();
const newId = () => crypto.randomUUID();

export const islandId = (save: SaveFile) => save.profile.activeIslandId;

// ---------- 專注與點數 ----------

/** 每有效專注滿 60 秒得 1 點與 1 金幣；只有 completed 給（倒數提前結束是 abandoned，什麼都沒有）。 */
export const rewardFor = (s: FocusSession) => (s.status === 'completed' ? Math.floor(s.accumulatedMs / POINT_MS) : 0);

const POINT_KINDS = new Set(['focus_reward', 'project_spend']);
const COIN_KINDS = new Set(['coin_reward', 'species_spend']);

function sumKinds(save: SaveFile, userId: ID, kinds: Set<string>) {
  const isl = islandId(save);
  return save.transactions.reduce((sum, t) => (t.userId === userId && t.islandId === isl && kinds.has(t.kind) ? sum + t.amount : sum), 0);
}
/** 成長點數錢包 */
export const balance = (save: SaveFile, userId: ID = save.profile.id) => sumKinds(save, userId, POINT_KINDS);
/** 金幣錢包 */
export const coins = (save: SaveFile, userId: ID = save.profile.id) => sumKinds(save, userId, COIN_KINDS);

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

/** 與 session ID 綁定的結算（點數與金幣各一筆）；重複呼叫不會重複發。 */
export function grantReward(save: SaveFile, sessionId: ID, now: number): SaveFile {
  const s = save.sessions.find((x) => x.id === sessionId);
  if (!s || s.status !== 'completed') return save;
  const amount = rewardFor(s);
  if (amount <= 0) return save;
  const add = (kind: 'focus_reward' | 'coin_reward', key: string) =>
    save.transactions.some((t) => t.idempotencyKey === key) ? [] : [{ id: newId(), userId: s.userId, islandId: s.islandId, kind, amount, sessionId: s.id, idempotencyKey: key, createdAt: iso(now) }];
  const fresh = [...add('focus_reward', `reward:${s.id}`), ...add('coin_reward', `coin:${s.id}`)];
  return fresh.length ? { ...save, transactions: [...save.transactions, ...fresh] } : save;
}

/** 該 session 實際拿到的點數與金幣（結算畫面用）。 */
export function earnedFor(save: SaveFile, sessionId: ID) {
  const get = (key: string) => save.transactions.find((t) => t.idempotencyKey === key)?.amount ?? 0;
  return { points: get(`reward:${sessionId}`), coins: get(`coin:${sessionId}`) };
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

export const discoveryOf = (save: SaveFile, speciesId: string) => save.discoveries.find((d) => d.speciesId === speciesId && d.islandId === islandId(save));

const speciesKey = (save: SaveFile, speciesId: string) => `species:${islandId(save)}:${speciesId}`;

/** 已邀請入住：用金幣邀請過，或改版前就已發現（舊存檔不需要再付）。 */
export const isOwned = (save: SaveFile, speciesId: string) =>
  !!discoveryOf(save, speciesId) || save.transactions.some((t) => t.idempotencyKey === speciesKey(save, speciesId));

/** 棲地工程完成、還沒邀請的生物，可以在商店用金幣邀請。 */
export const isInvitable = (save: SaveFile, s: SpeciesDef) => isDone(save, s.requiredProjectId) && !isOwned(save, s.id);

export type InviteResult = { ok: true; save: SaveFile } | { ok: false; error: string };

/** 用金幣邀請生物入住；每個物種在一座島只能邀請一次。 */
export function inviteSpecies(save: SaveFile, userId: ID, speciesId: string, now: number): InviteResult {
  const s = SPECIES.find((x) => x.id === speciesId);
  if (!s) return { ok: false, error: '找不到這種生物。' };
  if (isOwned(save, s.id)) return { ok: false, error: `${s.name}已經住在島上了。` };
  if (!isDone(save, s.requiredProjectId)) return { ok: false, error: `需要先完成「${projectDef(s.requiredProjectId)?.title}」工程。` };
  const have = coins(save, userId);
  if (have < s.price) return { ok: false, error: `金幣不足，還差 ${s.price - have} 金幣。` };
  return {
    ok: true,
    save: {
      ...save,
      transactions: [...save.transactions, { id: newId(), userId, islandId: islandId(save), kind: 'species_spend', amount: -s.price, speciesId: s.id, idempotencyKey: speciesKey(save, s.id), createdAt: iso(now) }],
    },
  };
}

/** 已邀請入住的生物才會出現在棲地；場景由工程與邀請狀態推導。 */
export const speciesPresent = (save: SaveFile, habitatId: HabitatId) => SPECIES.filter((s) => s.habitatId === habitatId && isDone(save, s.requiredProjectId) && isOwned(save, s.id));

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

/** 已邀請、但還沒進棲地見過的生物。 */
export const pendingVisitors = (save: SaveFile) => SPECIES.filter((s) => isDone(save, s.requiredProjectId) && isOwned(save, s.id) && !discoveryOf(save, s.id));

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
