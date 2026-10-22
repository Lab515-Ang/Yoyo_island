// 經濟、工程、生物發現與統計：全部是對 SaveFile 的純函式
import { PROJECTS, SPECIES, HABITATS, PETS, SOUNDS, FEED_PER_MINUTES, COUNTDOWN_BONUS_PER_MINUTES, CHANCE, projectDef, type PetDef, type ProjectDef, type SoundUnlock, type SpeciesDef } from '../content/config';
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
const COIN_KINDS = new Set(['coin_reward', 'species_spend', 'pet_adopt']);
const FEED_KINDS = new Set(['feed_reward', 'feed_spend']);

/** 完成的專注每 5 分鐘 1 份飼料；倒數每撐完 25 分鐘再多 1 份（倒數提前結束是 abandoned，沒有）。 */
export function feedFor(s: FocusSession) {
  if (s.status !== 'completed') return 0;
  const min = Math.floor(s.accumulatedMs / POINT_MS);
  return Math.floor(min / FEED_PER_MINUTES) + (s.mode === 'countdown' ? Math.floor(min / COUNTDOWN_BONUS_PER_MINUTES) : 0);
}

function sumKinds(save: SaveFile, userId: ID, kinds: Set<string>) {
  const isl = islandId(save);
  return save.transactions.reduce((sum, t) => (t.userId === userId && t.islandId === isl && kinds.has(t.kind) ? sum + t.amount : sum), 0);
}
/** 成長點數錢包 */
export const balance = (save: SaveFile, userId: ID = save.profile.id) => sumKinds(save, userId, POINT_KINDS);
/** 金幣錢包 */
export const coins = (save: SaveFile, userId: ID = save.profile.id) => sumKinds(save, userId, COIN_KINDS);
/** 飼料存量 */
export const feed = (save: SaveFile, userId: ID = save.profile.id) => sumKinds(save, userId, FEED_KINDS);

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
  const add = (kind: 'focus_reward' | 'coin_reward' | 'feed_reward', key: string, n = amount) =>
    n <= 0 || save.transactions.some((t) => t.idempotencyKey === key) ? [] : [{ id: newId(), userId: s.userId, islandId: s.islandId, kind, amount: n, sessionId: s.id, idempotencyKey: key, createdAt: iso(now) }];
  const fresh = [...add('focus_reward', `reward:${s.id}`), ...add('coin_reward', `coin:${s.id}`), ...add('feed_reward', `feed:${s.id}`, feedFor(s))];
  return fresh.length ? { ...save, transactions: [...save.transactions, ...fresh] } : save;
}

/** 該 session 實際拿到的點數與金幣（結算畫面用）。 */
export function earnedFor(save: SaveFile, sessionId: ID) {
  const get = (key: string) => save.transactions.find((t) => t.idempotencyKey === key)?.amount ?? 0;
  return { points: get(`reward:${sessionId}`), coins: get(`coin:${sessionId}`), feed: get(`feed:${sessionId}`) };
}

/** 收尾 session 並結算（完成時發點），一次提交。 */
export function closeSession(save: SaveFile, s: FocusSession, now: number): SaveFile {
  return rollChance(grantReward(putSession(save, s), s.id, now), s, now);
}

/** FNV-1a 雜湊成 0～1：同一段專注永遠得到同一個結果，可以重算、不能重骰。 */
function hash01(str: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return h / 2 ** 32;
}

/** 這段專注的偶遇骰值（0～1，小於機率才算偶遇）。 */
export const sessionRoll = (sessionId: ID) => hash01(`${sessionId}:roll`);

/** 這段專注偶遇生物的機率。 */
export function chanceFor(s: FocusSession) {
  if (s.status !== 'completed') return 0;
  const min = Math.floor(s.accumulatedMs / POINT_MS);
  return min < CHANCE.minMinutes ? 0 : Math.min(CHANCE.max, min * CHANCE.perMinute);
}

/** 專注完成時的偶遇：從還沒發現的生物中挑一種，直接收進圖鑑並視為已入住（不用金幣）。 */
export function rollChance(save: SaveFile, s: FocusSession, now: number): SaveFile {
  if (save.discoveries.some((d) => d.sessionId === s.id)) return save;
  if (sessionRoll(s.id) >= chanceFor(s)) return save;
  const pool = SPECIES.filter((sp) => !discoveryOf(save, sp.id));
  if (!pool.length) return save;
  const sp = pool[Math.floor(hash01(`${s.id}:pick`) * pool.length)];
  return {
    ...save,
    discoveries: [...save.discoveries, { islandId: s.islandId, speciesId: sp.id, discoveredAt: iso(now), triggeredByProjectId: sp.requiredProjectId, sessionId: s.id }],
  };
}

/** 這段專注偶遇到的生物（結算畫面用）。 */
export const chanceFind = (save: SaveFile, sessionId: ID) => save.discoveries.find((d) => d.sessionId === sessionId) ?? null;

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

// ---------- 寵物 ----------

const petKey = (save: SaveFile, petTypeId: string) => `pet:${islandId(save)}:${petTypeId}`;
const adoptTx = (save: SaveFile, petTypeId: string) => save.transactions.find((t) => t.idempotencyKey === petKey(save, petTypeId));

export const isAdopted = (save: SaveFile, petTypeId: string) => !!adoptTx(save, petTypeId);
export const adoptedAt = (save: SaveFile, petTypeId: string) => adoptTx(save, petTypeId)?.createdAt ?? null;
export const canAdopt = (save: SaveFile, p: PetDef) => isDone(save, p.requiredProjectId) && !isAdopted(save, p.id);

/** 寵物累計吃了多少飼料（全體成員合計）。 */
export const petFed = (save: SaveFile, petTypeId: string) =>
  -save.transactions.reduce((sum, t) => (t.kind === 'feed_spend' && t.petTypeId === petTypeId && t.islandId === islandId(save) ? sum + t.amount : sum), 0);

/** 0～3：由累計飼料推導，不另存。 */
export const petStage = (p: PetDef, fed: number) => p.thresholds.filter((n) => fed >= n).length;
export const petMaxFeed = (p: PetDef) => p.thresholds[p.thresholds.length - 1];

export const adoptedPets = (save: SaveFile, habitatId?: HabitatId) =>
  PETS.filter((p) => isAdopted(save, p.id) && (!habitatId || p.habitatId === habitatId)).map((p) => ({ def: p, fed: petFed(save, p.id), stage: petStage(p, petFed(save, p.id)) }));

/** 每位成員餵了這隻寵物多少。 */
export function fedByUser(save: SaveFile, petTypeId: string) {
  const m = new Map<ID, number>();
  for (const t of save.transactions) if (t.kind === 'feed_spend' && t.petTypeId === petTypeId && t.islandId === islandId(save)) m.set(t.userId, (m.get(t.userId) ?? 0) - t.amount);
  return m;
}

export type PetResult = { ok: true; save: SaveFile } | { ok: false; error: string };

/** 用金幣領養；每種寵物在一座島只能領養一次，且棲地工程要先完成。 */
export function adoptPet(save: SaveFile, userId: ID, petTypeId: string, now: number): PetResult {
  const p = PETS.find((x) => x.id === petTypeId);
  if (!p) return { ok: false, error: '找不到這種寵物。' };
  if (isAdopted(save, p.id)) return { ok: false, error: `${p.name}已經在島上了。` };
  if (!isDone(save, p.requiredProjectId)) return { ok: false, error: `需要先完成「${projectDef(p.requiredProjectId)?.title}」工程。` };
  const have = coins(save, userId);
  if (have < p.adoptPrice) return { ok: false, error: `金幣不足，還差 ${p.adoptPrice - have} 金幣。` };
  return {
    ok: true,
    save: { ...save, transactions: [...save.transactions, { id: newId(), userId, islandId: islandId(save), kind: 'pet_adopt', amount: -p.adoptPrice, petTypeId: p.id, idempotencyKey: petKey(save, p.id), createdAt: iso(now) }] },
  };
}

export type FeedResult = { ok: true; save: SaveFile; spent: number; from: number; to: number } | { ok: false; error: string };

/** 餵食：實際用量 = min(輸入, 飼料存量, 長到成體還需要的量)。 */
export function feedPet(save: SaveFile, userId: ID, petTypeId: string, input: number | 'all', now: number): FeedResult {
  const p = PETS.find((x) => x.id === petTypeId);
  if (!p || !isAdopted(save, p.id)) return { ok: false, error: '還沒有領養這隻寵物。' };
  if (input !== 'all' && (!Number.isInteger(input) || input <= 0)) return { ok: false, error: '請輸入大於 0 的整數。' };
  const fed = petFed(save, p.id);
  const left = petMaxFeed(p) - fed;
  if (left <= 0) return { ok: false, error: `${p.name}已經長大了。` };
  const have = feed(save, userId);
  if (have <= 0) return { ok: false, error: '沒有飼料了。完成專注，每 5 分鐘得 1 份飼料。' };
  const spent = Math.min(input === 'all' ? have : input, have, left);
  const next: SaveFile = {
    ...save,
    transactions: [...save.transactions, { id: newId(), userId, islandId: islandId(save), kind: 'feed_spend', amount: -spent, petTypeId: p.id, idempotencyKey: `feedspend:${newId()}`, createdAt: iso(now) }],
  };
  return { ok: true, save: next, spent, from: petStage(p, fed), to: petStage(p, fed + spent) };
}

// ---------- 環境音收集 ----------

export function soundUnlocked(save: SaveFile, u: SoundUnlock) {
  if (u.kind === 'start') return true;
  if (u.kind === 'project') return isDone(save, u.id);
  if (u.kind === 'species') return !!discoveryOf(save, u.id);
  const p = PETS.find((x) => x.id === u.id);
  return !!p && isAdopted(save, p.id) && petStage(p, petFed(save, p.id)) === 3;
}

/** 棲地預設的環境音。 */
export const habitatSound = (save: SaveFile, habitatId: HabitatId) => (habitatId === 'stream' ? 'stream' : isDone(save, 'gh_fountain') ? 'fountain' : 'breeze');

/** 專注時播放的環境音：玩家選的（且已收集），否則跟著棲地。 */
export function focusSoundFor(save: SaveFile, habitatId: HabitatId) {
  const pick = SOUNDS.find((x) => x.id === save.settings.focusSound);
  return pick && soundUnlocked(save, pick.unlock) ? pick.id : habitatSound(save, habitatId);
}
