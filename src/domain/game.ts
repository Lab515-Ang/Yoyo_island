// 經濟、工程、生物發現與統計：全部是對 SaveFile 的純函式
import { PROJECTS, SPECIES, HABITATS, PETS, SOUNDS, MIN_FOCUS_MINUTES, MAX_FOCUS_MINUTES, FACES, FACILITIES, EGG_PRICE, RARITY_WEIGHT, MAX_PETS_PER_HABITAT, STARTER, FEED_PER_MINUTES, COUNTDOWN_BONUS_PER_MINUTES, CHANCE, PLANTS, facilityDef, petDef, plantDef, projectDef, type PetDef, type PlantDef, type ProjectDef, type SoundUnlock } from '../content/config';
import { addSegmentsByDay, createSession, isOpen, settle } from './focus';
import type { FocusSession, HabitatId, ID, PetInstance, SaveFile, TimerMode } from './types';

export const POINT_MS = 60_000;
const iso = (t: number) => new Date(t).toISOString();
const newId = () => crypto.randomUUID();

export const islandId = (save: SaveFile) => save.profile.activeIslandId;

// ---------- 專注與點數 ----------

/** 每有效專注滿 60 秒得 1 點與 1 金幣；只有 completed 給（倒數提前結束是 abandoned，什麼都沒有）。 */
export const rewardFor = (s: FocusSession) => (s.status === 'completed' ? Math.floor(s.accumulatedMs / POINT_MS) : 0);

const POINT_KINDS = new Set(['focus_reward', 'project_spend']);
const COIN_KINDS = new Set(['coin_reward', 'species_spend', 'pet_adopt', 'facility_buy']);
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
export function startFocus(save: SaveFile, p: { taskTitle: string; tag: string; habitatId: HabitatId; mode: TimerMode; targetSeconds: number | null; plantId?: string; deep?: boolean }, now: number): SaveFile {
  if (openSession(save) || !habitatOpen(save, p.habitatId)) return save;
  // 倒數 10～180 分鐘；示範存檔允許 10 秒快轉
  const t = p.targetSeconds ?? 0;
  const inRange = t >= MIN_FOCUS_MINUTES * 60 && t <= MAX_FOCUS_MINUTES * 60;
  if (p.mode === 'countdown' && !inRange && !(save.mode === 'demo' && t === 10)) return save;
  const s = createSession({ ...p, id: newId(), userId: save.profile.id, islandId: islandId(save) }, now);
  return {
    ...putSession(save, s),
    settings: { ...save.settings, lastTimerMode: p.mode, lastTargetSeconds: p.targetSeconds ?? save.settings.lastTargetSeconds, preferredHabitatId: p.habitatId, plantId: p.plantId ?? save.settings.plantId },
  };
}

// ---------- 今日花圃 ----------

export const plantUnlocked = (save: SaveFile, p: PlantDef) => isDone(save, p.unlockProjectId);
/** 大廳預設的植物：上次選的；還沒解鎖（例如舊設定）就用第一種。 */
export const chosenPlant = (save: SaveFile) => {
  const p = plantDef(save.settings.plantId);
  return plantUnlocked(save, p) ? p : PLANTS[0];
};
/** 工程解鎖了、但還沒種過的植物（大廳標示「新」）。 */
export const newPlants = (save: SaveFile) => PLANTS.filter((p) => p.unlockProjectId && plantUnlocked(save, p) && !save.sessions.some((s) => s.plantId === p.id));
/** 自己的專注中，有結果（完成或放棄）的才算種下。 */
export const plantedSessions = (save: SaveFile) => save.sessions.filter((s) => s.userId === save.profile.id && s.endedAt && (s.status === 'completed' || s.status === 'abandoned'));

export const NOTE_MAX = 500;

/** 結束後補寫筆記、修改標籤與標題（進行中的專注不能改）。 */
export function editSessionNote(save: SaveFile, sessionId: ID, patch: { note: string; tag: string; taskTitle: string }): SaveFile {
  const s = save.sessions.find((x) => x.id === sessionId);
  if (!s || isOpen(s)) return save;
  const next = { ...s, note: patch.note.trim().slice(0, NOTE_MAX), tag: patch.tag.trim() || s.tag, taskTitle: patch.taskTitle.trim() || '一段專注' };
  return putSession(save, next);
}

/** 開始後 10 秒內可以直接取消：不算放棄、不留紀錄（避免誤觸開始被懲罰）。 */
export const CANCEL_GRACE_MS = 10_000;
export const graceLeftMs = (s: FocusSession, now: number) => Math.max(0, CANCEL_GRACE_MS - (now - Date.parse(s.startedAt)));

export function cancelSession(save: SaveFile, sessionId: ID, now: number): SaveFile {
  const s = save.sessions.find((x) => x.id === sessionId);
  if (!s || !isOpen(s) || graceLeftMs(s, now) <= 0) return save;
  return { ...save, sessions: save.sessions.filter((x) => x.id !== sessionId) };
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

/** 專注完成時的偶遇：從還沒發現的生物中挑一種，收進圖鑑。 */
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

/** 工程進度 0～1（已完成＝1，舊存檔用舊數值完成的也算完成）。 */
export function projectProgress(save: SaveFile, id: string) {
  const row = projectRow(save, id);
  const def = projectDef(id);
  if (!row || !def) return 0;
  return row.completedAt ? 1 : row.contributedPoints / def.requiredPoints;
}

/** 進度切成四段：0、25%、50%、75%、100%；每跨一段場景就有一點變化。 */
export const projectQuarter = (save: SaveFile, id: string) => Math.floor(projectProgress(save, id) * 4) / 4;

/** 固定順序：第一個尚未完成的工程。 */
export const activeProject = (save: SaveFile): ProjectDef | null => PROJECTS.find((p) => !isDone(save, p.id)) ?? null;

export type ContributeResult =
  | { ok: true; save: SaveFile; spent: number; completed: ProjectDef | null; unlocked: PetDef[]; quarter: number | null }
  | { ok: false; error: string };

/** 實際扣點 = min(輸入值, 錢包餘額, 工程剩餘需求)；交易、貢獻、工程進度一起提交。 */
export function contribute(save: SaveFile, userId: ID, projectId: string, input: number | 'all', now: number, sessionId?: ID): ContributeResult {
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
    contributions: [...save.contributions, { id: contributionId, userId, islandId: isl, projectId, points: spent, createdAt: iso(now), ...(sessionId ? { sessionId } : {}) }],
    transactions: [...save.transactions, { id: newId(), userId, islandId: isl, kind: 'project_spend', amount: -spent, contributionId, idempotencyKey: `spend:${contributionId}`, createdAt: iso(now) }],
    projects: save.projects.map((p) => (p === row ? { ...p, contributedPoints: total, completedAt: completed ? iso(now) : null } : p)),
  };
  if (completed) {
    const active = activeProject(next);
    next = { ...next, islands: next.islands.map((i) => (i.id === isl ? { ...i, activeProjectId: active?.id ?? null } : i)) };
  }
  // 跨過 25%／50%／75% 時回報，讓介面提示「小島有了一點變化」
  const before = Math.floor((row.contributedPoints / def.requiredPoints) * 4);
  const after = Math.floor((total / def.requiredPoints) * 4);
  const quarter = !completed && after > before ? after * 25 : null;
  return { ok: true, save: next, spent, completed: completed ? def : null, unlocked: completed ? PETS.filter((p) => p.requiredProjectId === def.id) : [], quarter }; // 工程完成後可領養的寵物
}

// ---------- 棲地與生物 ----------

export function habitatOpen(save: SaveFile, id: HabitatId) {
  const h = HABITATS.find((x) => x.id === id);
  return !!h?.playable && isDone(save, h.unlockProjectId);
}

/** 圖鑑：生物只會在專注時偶遇而收進圖鑑，不會住進小島（住在島上的只有商店領養的寵物）。 */
export const discoveryOf = (save: SaveFile, speciesId: string) => save.discoveries.find((d) => d.speciesId === speciesId && d.islandId === islandId(save));

export function habitatProgress(save: SaveFile, habitatId: HabitatId) {
  const defs = PROJECTS.filter((p) => p.habitatId === habitatId);
  const need = defs.reduce((a, p) => a + p.requiredPoints, 0);
  const got = defs.reduce((a, p) => a + projectProgress(save, p.id) * p.requiredPoints, 0);
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

// ---------- 寵物（個體、名額、設施、表情） ----------

export interface PetView {
  pet: PetInstance;
  def: PetDef;
  fed: number;
  stage: number;
  face: number;
  grow: number; // 0～1：在目前階段裡長大了多少（場景中會慢慢變大）
}

export const islandPets = (save: SaveFile) => save.pets.filter((p) => p.islandId === islandId(save));
export const petById = (save: SaveFile, petId: string) => save.pets.find((p) => p.id === petId);

/** 這隻寵物累計吃了多少飼料（全體成員合計，含舊節奏換算的成長量）。 */
export const petFed = (save: SaveFile, petId: string) =>
  (petById(save, petId)?.bonusFed ?? 0) - save.transactions.reduce((sum, t) => (t.kind === 'feed_spend' && t.petId === petId ? sum + t.amount : sum), 0);

/** 0～3：由累計飼料推導，不另存。 */
export const petStage = (p: PetDef, fed: number) => p.thresholds.filter((n) => fed >= n).length;
export const petMaxFeed = (p: PetDef) => p.thresholds[p.thresholds.length - 1];

/** 孵化時隨機的表情：由寵物 id 雜湊決定，重新整理不會變。 */
export const naturalFace = (petId: string) => Math.floor(hash01(`${petId}:face`) * FACES.length);

export function petView(save: SaveFile, pet: PetInstance): PetView {
  const def = petDef(pet.typeId)!;
  const fed = petFed(save, pet.id);
  const stage = petStage(def, fed);
  const prev = stage === 0 ? 0 : def.thresholds[stage - 1];
  const grow = stage === 3 ? 1 : (fed - prev) / (def.thresholds[stage] - prev);
  return { pet, def, fed, stage, face: pet.faceOverride ?? naturalFace(pet.id), grow };
}

export const adoptedPets = (save: SaveFile, habitatId?: HabitatId) =>
  islandPets(save).filter((p) => !habitatId || p.habitatId === habitatId).map((p) => petView(save, p));

/** 每位成員餵了這隻寵物多少。 */
export function fedByUser(save: SaveFile, petId: string) {
  const m = new Map<ID, number>();
  for (const t of save.transactions) if (t.kind === 'feed_spend' && t.petId === petId) m.set(t.userId, (m.get(t.userId) ?? 0) - t.amount);
  return m;
}

// 名額與設施

const facilityKey = (save: SaveFile, facilityId: string) => `facility:${islandId(save)}:${facilityId}`;
export const facilityOwned = (save: SaveFile, facilityId: string) => save.transactions.some((t) => t.idempotencyKey === facilityKey(save, facilityId));

export function habitatSlots(save: SaveFile, habitatId: HabitatId) {
  if (!habitatOpen(save, habitatId)) return 0;
  const bought = FACILITIES.filter((f) => f.habitatId === habitatId && facilityOwned(save, f.id)).length;
  return Math.min(MAX_PETS_PER_HABITAT, 1 + bought);
}
export const habitatPetCount = (save: SaveFile, habitatId: HabitatId) => islandPets(save).filter((p) => p.habitatId === habitatId).length;
export const habitatFree = (save: SaveFile, habitatId: HabitatId) => habitatSlots(save, habitatId) - habitatPetCount(save, habitatId);

/** 這種寵物目前能不能取得（棲地工程完成）。 */
export const petAvailable = (save: SaveFile, p: PetDef) => isDone(save, p.requiredProjectId);

export type ActionResult = { ok: true; save: SaveFile } | { ok: false; error: string };
export type PetResult = { ok: true; save: SaveFile; pet: PetInstance } | { ok: false; error: string };

export function buyFacility(save: SaveFile, userId: ID, facilityId: string, now: number): ActionResult {
  const f = facilityDef(facilityId);
  if (!f) return { ok: false, error: '找不到這個設施。' };
  if (!habitatOpen(save, f.habitatId)) return { ok: false, error: `${HABITATS.find((h) => h.id === f.habitatId)?.name}還沒開放。` };
  if (facilityOwned(save, f.id)) return { ok: false, error: `已經有${f.name}了。` };
  const have = coins(save, userId);
  if (have < f.price) return { ok: false, error: `金幣不足，還差 ${f.price - have} 金幣。` };
  return {
    ok: true,
    save: { ...save, transactions: [...save.transactions, { id: newId(), userId, islandId: islandId(save), kind: 'facility_buy', amount: -f.price, facilityId: f.id, idempotencyKey: facilityKey(save, f.id), createdAt: iso(now) }] },
  };
}

function addPet(save: SaveFile, userId: ID, def: PetDef, source: PetInstance['source'], price: number, now: number): { save: SaveFile; pet: PetInstance } {
  const pet: PetInstance = { id: newId(), islandId: islandId(save), typeId: def.id, habitatId: def.habitatId, adoptedBy: userId, adoptedAt: iso(now), source, faceOverride: null };
  const tx =
    price > 0
      ? [{ id: newId(), userId, islandId: pet.islandId, kind: 'pet_adopt' as const, amount: -price, petId: pet.id, petTypeId: def.id, idempotencyKey: `pet:${pet.id}`, createdAt: iso(now) }]
      : [];
  return { save: { ...save, pets: [...save.pets, pet], transactions: [...save.transactions, ...tx] }, pet };
}

function slotError(save: SaveFile, habitatId: HabitatId) {
  const name = HABITATS.find((h) => h.id === habitatId)?.name;
  if (!habitatOpen(save, habitatId)) return `${name}還沒開放。`;
  if (habitatFree(save, habitatId) <= 0)
    return habitatSlots(save, habitatId) >= MAX_PETS_PER_HABITAT ? `${name}已經住滿 ${MAX_PETS_PER_HABITAT} 隻了。` : `${name}的名額已滿，到商店買設施就能多養一隻。`;
  return null;
}

/** 指定購買：選好種類，表情在孵化時隨機揭曉。 */
export function adoptPet(save: SaveFile, userId: ID, petTypeId: string, now: number): PetResult {
  const def = petDef(petTypeId);
  if (!def) return { ok: false, error: '找不到這種寵物。' };
  if (!petAvailable(save, def)) return { ok: false, error: `需要先完成「${projectDef(def.requiredProjectId)?.title}」工程。` };
  const full = slotError(save, def.habitatId);
  if (full) return { ok: false, error: full };
  const have = coins(save, userId);
  if (have < def.adoptPrice) return { ok: false, error: `金幣不足，還差 ${def.adoptPrice - have} 金幣。` };
  return { ok: true, ...addPet(save, userId, def, 'buy', def.adoptPrice, now) };
}

/** 驚喜蛋的機率：依稀有度加權；島上還沒養過的種類優先（養齊了才會重複）。 */
export function eggOdds(save: SaveFile, habitatId: HabitatId) {
  const pool = PETS.filter((p) => p.habitatId === habitatId && petAvailable(save, p));
  const fresh = pool.filter((p) => !islandPets(save).some((x) => x.typeId === p.id));
  const base = fresh.length ? fresh : pool;
  const total = base.reduce((a, p) => a + RARITY_WEIGHT[p.rarity], 0);
  return base.map((def) => ({ def, p: RARITY_WEIGHT[def.rarity] / total }));
}

export function buyEgg(save: SaveFile, userId: ID, habitatId: HabitatId, now: number, rand = Math.random()): PetResult {
  const price = EGG_PRICE[habitatId];
  if (!price) return { ok: false, error: '這個場景還沒有驚喜蛋。' };
  const full = slotError(save, habitatId);
  if (full) return { ok: false, error: full };
  const odds = eggOdds(save, habitatId);
  if (!odds.length) return { ok: false, error: '這個場景還沒有可以孵化的寵物，先修好棲地工程吧。' };
  const have = coins(save, userId);
  if (have < price) return { ok: false, error: `金幣不足，還差 ${price - have} 金幣。` };
  let acc = 0;
  const pick = odds.find((o) => (acc += o.p) > rand) ?? odds[odds.length - 1];
  return { ok: true, ...addPet(save, userId, pick.def, 'egg', price, now) };
}

/** 新手禮物：完成第一個工程、島上還沒有任何寵物時，送一顆黃蝶的卵（只送一次）。 */
export const starterGiftDue = (save: SaveFile) => isDone(save, STARTER.projectId) && islandPets(save).length === 0 && !save.pets.some((p) => p.source === 'gift');

export function grantStarter(save: SaveFile, now: number): PetResult {
  if (!starterGiftDue(save)) return { ok: false, error: '已經領過新手禮物了。' };
  return { ok: true, ...addPet(save, save.profile.id, petDef(STARTER.petTypeId)!, 'gift', 0, now) };
}

/** 表情相簿：長大後才能自由切換。 */
export function setFace(save: SaveFile, petId: string, face: number): ActionResult {
  const pet = petById(save, petId);
  if (!pet) return { ok: false, error: '找不到這隻寵物。' };
  if (petView(save, pet).stage < 3) return { ok: false, error: '養到成體後才能換表情。' };
  if (!Number.isInteger(face) || face < 0 || face >= FACES.length) return { ok: false, error: '沒有這個表情。' };
  return { ok: true, save: { ...save, pets: save.pets.map((p) => (p.id === petId ? { ...p, faceOverride: face } : p)) } };
}

export type FeedResult = { ok: true; save: SaveFile; spent: number; from: number; to: number } | { ok: false; error: string };

/** 餵食：實際用量 = min(輸入, 飼料存量, 長到成體還需要的量)。 */
export function feedPet(save: SaveFile, userId: ID, petId: string, input: number | 'all', now: number, sessionId?: ID): FeedResult {
  const pet = petById(save, petId);
  if (!pet || pet.islandId !== islandId(save)) return { ok: false, error: '找不到這隻寵物。' };
  const def = petDef(pet.typeId)!;
  if (input !== 'all' && (!Number.isInteger(input) || input <= 0)) return { ok: false, error: '請輸入大於 0 的整數。' };
  const fed = petFed(save, pet.id);
  const left = petMaxFeed(def) - fed;
  if (left <= 0) return { ok: false, error: `${def.name}已經長大了。` };
  const have = feed(save, userId);
  if (have <= 0) return { ok: false, error: '沒有飼料了。完成專注，每 5 分鐘得 1 份飼料。' };
  const spent = Math.min(input === 'all' ? have : input, have, left);
  const next: SaveFile = {
    ...save,
    transactions: [...save.transactions, { id: newId(), userId, islandId: pet.islandId, kind: 'feed_spend', amount: -spent, petId: pet.id, petTypeId: def.id, idempotencyKey: `feedspend:${newId()}`, createdAt: iso(now), ...(sessionId ? { sessionId } : {}) }],
  };
  return { ok: true, save: next, spent, from: petStage(def, fed), to: petStage(def, fed + spent) };
}

// ---------- 環境音收集 ----------

export function soundUnlocked(save: SaveFile, u: SoundUnlock) {
  if (u.kind === 'start') return true;
  if (u.kind === 'project') return isDone(save, u.id);
  if (u.kind === 'species') return !!discoveryOf(save, u.id);
  return adoptedPets(save).some((v) => v.def.id === u.id && v.stage === 3);
}

/** 棲地預設的環境音。 */
export const habitatSound = (save: SaveFile, habitatId: HabitatId) => (habitatId === 'stream' ? 'stream' : isDone(save, 'gh_fountain') ? 'fountain' : 'breeze');

/** 專注時播放的環境音：玩家選的（且已收集），否則跟著棲地。 */
export function focusSoundFor(save: SaveFile, habitatId: HabitatId) {
  const pick = SOUNDS.find((x) => x.id === save.settings.focusSound);
  return pick && soundUnlocked(save, pick.unlock) ? pick.id : habitatSound(save, habitatId);
}

// ---------- 專注完成後的自動流程（不需要再手動投入、餵食） ----------

/** 陪伴寵物：玩家選的那隻（還沒長大時）；沒選就挑最接近下一階段的寵物。 */
export function companionPet(save: SaveFile) {
  const growing = adoptedPets(save).filter((v) => v.stage < 3);
  const chosen = growing.find((v) => v.pet.id === save.settings.companionPetId);
  if (chosen) return chosen;
  return [...growing].sort((a, b) => a.def.thresholds[a.stage] - a.fed - (b.def.thresholds[b.stage] - b.fed))[0] ?? null;
}

/**
 * 專注完成後：成長點數全部投入目前的工程（可連續完成好幾個）、飼料全部餵給陪伴寵物（長大了就換下一隻）。
 * 每段專注只執行一次（session.applied）。
 */
export function applyFocusRewards(save: SaveFile, sessionId: ID, now: number): SaveFile {
  const s = save.sessions.find((x) => x.id === sessionId);
  if (!s || s.status !== 'completed' || s.applied) return save;
  let next = putSession(save, { ...s, applied: true });
  const uid = s.userId;
  for (let p = activeProject(next); p && balance(next, uid) > 0; p = activeProject(next)) {
    const r = contribute(next, uid, p.id, 'all', now, s.id);
    if (!r.ok) break;
    next = r.save;
    if (!r.completed) break;
  }
  // 修好第一個工程時，新手禮物的卵在這裡就送到，這段的飼料可以直接餵牠
  if (starterGiftDue(next)) {
    const g = grantStarter(next, now);
    if (g.ok) next = g.save;
  }
  for (let v = companionPet(next); v && feed(next, uid) > 0; v = companionPet(next)) {
    const r = feedPet(next, uid, v.pet.id, 'all', now, s.id);
    if (!r.ok) break;
    next = r.save;
  }
  return next;
}

/** 這段專注自動投入的成果（結算畫面用）。 */
export function focusOutcome(save: SaveFile, sessionId: ID) {
  const projects = save.contributions
    .filter((c) => c.sessionId === sessionId)
    .map((c) => {
      const def = projectDef(c.projectId)!;
      const row = projectRow(save, c.projectId)!;
      const later = save.contributions.filter((x) => x.projectId === c.projectId && x.createdAt > c.createdAt).reduce((a, x) => a + x.points, 0);
      const after = row.contributedPoints - later;
      return { def, points: c.points, from: (after - c.points) / def.requiredPoints, to: after / def.requiredPoints, completed: after >= def.requiredPoints };
    });
  const pets = save.transactions
    .filter((t) => t.kind === 'feed_spend' && t.sessionId === sessionId)
    .map((t) => {
      const pet = petById(save, t.petId!)!;
      const def = petDef(pet.typeId)!;
      const later = save.transactions.filter((x) => x.kind === 'feed_spend' && x.petId === pet.id && x.createdAt > t.createdAt).reduce((a, x) => a - x.amount, 0);
      const after = petFed(save, pet.id) - later;
      return { pet, def, amount: -t.amount, from: petStage(def, after + t.amount), to: petStage(def, after) };
    });
  return { projects, pets };
}
