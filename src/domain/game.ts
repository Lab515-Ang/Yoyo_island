// 經濟、工程、探索動物與統計：全部是對 SaveFile 的純函式
import { ANIMALS, HABITATS, MAX_FOCUS_MINUTES, MIN_FOCUS_MINUTES, PROJECTS, SOUNDS, TEST_TOOLS, TEST_UNLOCKED, animalDef, animalRegion, regionDef, growthFor, projectDef, stageOfGrowth, type AnimalDef, type ProjectDef, type SoundUnlock } from '../content/config';
import { addSegmentsByDay, createSession, isOpen, localDateKey, settle, shiftDateKey } from './focus';
import type { FocusSession, HabitatId, ID, SaveFile, TimerMode } from './types';

export const POINT_MS = 60_000;
const iso = (t: number) => new Date(t).toISOString();
const newId = () => crypto.randomUUID();

export const islandId = (save: SaveFile) => save.profile.activeIslandId;

// ---------- 專注與點數 ----------

/** 每有效專注滿 60 秒得 1 點與 1 金幣；只有 completed 給（倒數提前結束是 abandoned，什麼都沒有）。 */
export const rewardFor = (s: FocusSession) => (s.status === 'completed' ? Math.floor(s.accumulatedMs / POINT_MS) : 0);

const POINT_KINDS = new Set(['focus_reward', 'project_spend']);
const COIN_KINDS = new Set(['coin_reward', 'animal_unlock', 'quest_reward', 'shop_buy', 'coin_exchange']);
const GEM_KINDS = new Set(['gem_grant', 'gem_spend']);

function sumKinds(save: SaveFile, userId: ID, kinds: Set<string>) {
  const isl = islandId(save);
  return save.transactions.reduce((sum, t) => (t.userId === userId && t.islandId === isl && kinds.has(t.kind) ? sum + t.amount : sum), 0);
}
/** 成長點數錢包 */
export const balance = (save: SaveFile, userId: ID = save.profile.id) => sumKinds(save, userId, POINT_KINDS);
/** 金幣錢包 */
export const coins = (save: SaveFile, userId: ID = save.profile.id) => sumKinds(save, userId, COIN_KINDS);
/** 寶石錢包 */
export const gems = (save: SaveFile, userId: ID = save.profile.id) => sumKinds(save, userId, GEM_KINDS);

export const openSession = (save: SaveFile) => save.sessions.find(isOpen) ?? null;

export function putSession(save: SaveFile, s: FocusSession): SaveFile {
  const exists = save.sessions.some((x) => x.id === s.id);
  return { ...save, sessions: exists ? save.sessions.map((x) => (x.id === s.id ? s : x)) : [...save.sessions, s] };
}

/** 開始專注：同時最多一個未結算 session；只能選可進入的棲地、已解鎖的動物。 */
export function startFocus(save: SaveFile, p: { taskTitle: string; tag: string; habitatId: HabitatId; mode: TimerMode; targetSeconds: number | null; animalId?: string; deep?: boolean; extend?: boolean }, now: number): SaveFile {
  if (openSession(save) || !habitatOpen(save, p.habitatId)) return save;
  // 倒數 10～180 分鐘；示範存檔允許 10 秒快轉
  const t = p.targetSeconds ?? 0;
  const inRange = t >= MIN_FOCUS_MINUTES * 60 && t <= MAX_FOCUS_MINUTES * 60;
  if (p.mode === 'countdown' && !inRange && !(save.mode === 'demo' && t === 10)) return save;
  const want = ANIMALS.find((a) => a.id === p.animalId);
  const animalId = want && animalUnlocked(save, want) ? want.id : chosenAnimal(save).id;
  const s = createSession({ ...p, animalId, id: newId(), userId: save.profile.id, islandId: islandId(save) }, now);
  return {
    ...putSession(save, s),
    settings: { ...save.settings, lastTimerMode: p.mode, lastTargetSeconds: p.targetSeconds ?? save.settings.lastTargetSeconds, preferredHabitatId: p.habitatId, eggId: animalId },
  };
}

// ---------- 動物（每段專注是一次探索，完成就遇見一隻） ----------

const animalKey = (save: SaveFile, animalId: string) => `animal:${islandId(save)}:${animalId}`;
/** 商店用金幣或寶石解鎖過（或新手任務的寶箱送的）。 */
export function animalBought(save: SaveFile, animalId: string) {
  const key = animalKey(save, animalId);
  return save.transactions.some((t) => t.idempotencyKey === key || (t.kind === 'quest_reward' && t.animalId === animalId && t.islandId === islandId(save)));
}

/** 這種動物能不能當探索目標：一開始就有、工程完成、或商店解鎖過（真錢品種上架後才開放）。 */
export function animalUnlocked(save: SaveFile, a: AnimalDef) {
  if (TEST_TOOLS && TEST_UNLOCKED.includes(a.id)) return true;
  const u = a.unlock;
  if (u.kind === 'start') return true;
  // 工程的動物也可以在商店用寶石提早解鎖
  if (u.kind === 'project') return isDone(save, u.id) || animalBought(save, a.id);
  if (u.kind === 'coins' || u.kind === 'gems') return animalBought(save, a.id);
  return false;
}

/** 大廳預設的探索目標：上次選的；還沒解鎖或不是目前區域的，就用這個區域第一種解鎖的。 */
export const chosenAnimal = (save: SaveFile) => {
  const region = currentRegion(save);
  const a = animalDef(save.settings.eggId);
  return animalUnlocked(save, a) && animalRegion(a) === region ? a : (ANIMALS.find((x) => animalRegion(x) === region && animalUnlocked(save, x)) ?? ANIMALS[0]);
};

// ---------- 區域：修完前一個區域才開放（看該區主棲地的開放條件） ----------

export const regionOpen = (save: SaveFile, id: string) => habitatOpen(save, regionDef(id).habitatId);
/** 目前的區域（設定記的區域還沒開放，就回到台灣）。 */
export const currentRegion = (save: SaveFile) => (regionOpen(save, save.settings.regionId) ? regionDef(save.settings.regionId).id : 'tw');
export const currentHabitat = (save: SaveFile) => regionDef(currentRegion(save)).habitatId;

/** 自己的專注中，有結果（完成＝遇見、放棄＝被嚇跑）的探索。 */
export const endedSessions = (save: SaveFile) => save.sessions.filter((s) => s.userId === save.profile.id && s.endedAt && (s.status === 'completed' || s.status === 'abandoned'));

/**
 * 依存檔快取：存檔每次修改都是新的物件，所以同一份存檔算過一次就能直接重用
 * （畫面每次重繪、每種動物都會問一次，紀錄多了以後很耗時）。回傳的資料只能讀、不要修改。
 */
export function perSave<T>(fn: (save: SaveFile) => T) {
  const cache = new WeakMap<SaveFile, T>();
  return (save: SaveFile) => {
    if (!cache.has(save)) cache.set(save, fn(save));
    return cache.get(save)!;
  };
}

/** 每段結束的專注是本地哪一天（YYYY-MM-DD，依玩家時區；依存檔快取，時區換算很耗時）。 */
export const endedDayKeys = perSave((save) => {
  const m = new Map<ID, string>();
  for (const s of save.sessions) if (s.endedAt) m.set(s.id, localDateKey(Date.parse(s.endedAt), save.profile.timezone));
  return m;
});

/** 每種動物遇見幾次（完成的專注才算）。 */
export const hatchCounts = perSave((save) => {
  const m = new Map<string, number>();
  for (const s of endedSessions(save)) if (s.status === 'completed') m.set(animalDef(s.animalId).id, (m.get(animalDef(s.animalId).id) ?? 0) + 1);
  return m;
});

/** 可以去找、但還沒遇見過的動物（大廳標示「新」）。一開始就有的不算新。 */
export const newAnimals = (save: SaveFile) => {
  const counts = hatchCounts(save);
  return ANIMALS.filter((a) => a.unlock.kind !== 'start' && animalUnlocked(save, a) && !counts.get(a.id));
};

// ---------- 族群成長 ----------

/** 特別探索（真錢）的動物一遇見就是成年。 */
const alwaysAdult = (animalId: string) => animalDef(animalId).unlock.kind === 'iap';

/** 每次遇見時的族群成長（依時間順序累計）：當下的階段、成長值，以及這次是否讓族群長大。 */
export const sightings = perSave((save: SaveFile) => {
  const growth = new Map<string, number>();
  const out = new Map<string, { stage: number; growth: number; grew: boolean }>();
  for (const s of [...endedSessions(save)].sort((a, b) => a.endedAt!.localeCompare(b.endedAt!))) {
    if (s.status !== 'completed') continue;
    const id = animalDef(s.animalId).id;
    const before = growth.get(id) ?? 0;
    const after = before + growthFor(Math.floor(s.accumulatedMs / POINT_MS));
    growth.set(id, after);
    const stage = alwaysAdult(id) ? 2 : stageOfGrowth(after);
    out.set(s.id, { stage, growth: after, grew: before > 0 && !alwaysAdult(id) && stage > stageOfGrowth(before) });
  }
  return out;
});

/** 這種動物目前的族群成長值與階段（森林裡同種的動物都用這個階段）。 */
const growthAll = perSave((save) => {
  const m = new Map<string, number>();
  for (const s of endedSessions(save)) if (s.status === 'completed') m.set(animalDef(s.animalId).id, (m.get(animalDef(s.animalId).id) ?? 0) + growthFor(Math.floor(s.accumulatedMs / POINT_MS)));
  return m;
});
export function growthOf(save: SaveFile, animalId: string) {
  const id = animalDef(animalId).id;
  const g = growthAll(save).get(id) ?? 0;
  return { growth: g, stage: alwaysAdult(id) ? 2 : stageOfGrowth(g) };
}

/** 場景裡出現的動物：最近遇見的，同一種只放一隻，最多 limit 隻；大小依族群目前的階段。 */
export function sceneAnimals(save: SaveFile, limit = 6) {
  const seen = new Set<string>();
  const out: { id: string; animalId: string; stage: number }[] = [];
  // 依結束時間由新到舊（不要依陣列順序：示範快轉等會插入較早的紀錄）
  for (const s of [...endedSessions(save)].sort((x, y) => y.endedAt!.localeCompare(x.endedAt!))) {
    const a = animalDef(s.animalId).id;
    if (s.status !== 'completed' || seen.has(a)) continue;
    seen.add(a);
    out.push({ id: s.id, animalId: a, stage: growthOf(save, a).stage });
    if (out.length >= limit) break;
  }
  return out;
}

export type ActionResult = { ok: true; save: SaveFile } | { ok: false; error: string };

/** 商店：用金幣解鎖一種動物的探索路線（之後每段專注都能選擇去找牠）。 */
export function unlockAnimal(save: SaveFile, userId: ID, animalId: string, now: number): ActionResult {
  const a = ANIMALS.find((x) => x.id === animalId);
  if (!a || a.unlock.kind !== 'coins') return { ok: false, error: '這種動物不能用金幣解鎖。' };
  if (animalBought(save, a.id)) return { ok: false, error: `已經解鎖${a.name}了。` };
  const price = a.unlock.price;
  const have = coins(save, userId);
  if (have < price) return { ok: false, error: `金幣不足，還差 ${price - have} 金幣。` };
  return {
    ok: true,
    save: { ...save, transactions: [...save.transactions, { id: newId(), userId, islandId: islandId(save), kind: 'animal_unlock', amount: -price, animalId: a.id, idempotencyKey: animalKey(save, a.id), createdAt: iso(now) }] },
  };
}

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
  // 暫停到上限自動繼續、但還沒結束：只更新狀態
  if (isOpen(s)) return { save: putSession(save, s), completed: null };
  return { save: closeSession(save, s, now), completed: s };
}

// ---------- 工程 ----------

export const projectRow = (save: SaveFile, id: string) => save.projects.find((p) => p.projectId === id && p.islandId === islandId(save));
export const isDone = (save: SaveFile, id: string | null) => id === null || !!projectRow(save, id)?.completedAt;
export const remainingFor = (save: SaveFile, def: ProjectDef) => def.requiredPoints - (projectRow(save, def.id)?.contributedPoints ?? 0);

/** 工程進度 0～1。 */
export function projectProgress(save: SaveFile, id: string) {
  const row = projectRow(save, id);
  const def = projectDef(id);
  if (!row || !def) return 0;
  return row.completedAt ? 1 : row.contributedPoints / def.requiredPoints;
}

/** 進度切成四段：0、25%、50%、75%、100%；每跨一段場景就有一點變化。 */
export const projectQuarter = (save: SaveFile, id: string) => Math.floor(projectProgress(save, id) * 4) / 4;

/** 目前要修的工程：目前區域第一個還沒完成的；這個區域修完了，就接到其他已開放區域的工程（例如台灣修完接日本）。 */
export const activeProject = (save: SaveFile): ProjectDef | null =>
  PROJECTS.find((p) => !isDone(save, p.id) && p.habitatId === currentHabitat(save)) ?? PROJECTS.find((p) => !isDone(save, p.id) && habitatOpen(save, p.habitatId)) ?? null;

/** 這個工程完成後解鎖的動物。 */
export const animalsUnlockedBy = (projectId: string) => ANIMALS.filter((a) => a.unlock.kind === 'project' && a.unlock.id === projectId);

export type ContributeResult =
  | { ok: true; save: SaveFile; spent: number; completed: ProjectDef | null; unlocked: AnimalDef[]; quarter: number | null }
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
  // 跨過 25%／50%／75% 時回報，讓介面提示「森林有了一點變化」
  const before = Math.floor((row.contributedPoints / def.requiredPoints) * 4);
  const after = Math.floor((total / def.requiredPoints) * 4);
  const quarter = !completed && after > before ? after * 25 : null;
  return { ok: true, save: next, spent, completed: completed ? def : null, unlocked: completed ? animalsUnlockedBy(def.id) : [], quarter };
}

/** 把錢包裡的點數依序投入工程，直到用完或全部完成（專注完成後、舊存檔轉換時用）。 */
export function investAll(save: SaveFile, userId: ID, now: number, sessionId?: ID): SaveFile {
  let next = save;
  for (let p = activeProject(next); p && balance(next, userId) > 0; p = activeProject(next)) {
    const r = contribute(next, userId, p.id, 'all', now, sessionId);
    if (!r.ok) break;
    next = r.save;
    if (!r.completed) break;
  }
  return next;
}

// ---------- 棲地 ----------

export function habitatOpen(save: SaveFile, id: HabitatId) {
  const h = HABITATS.find((x) => x.id === id);
  // 測試工具：測試版預設先開放所有區域，可以在區域清單關掉（上架前 TEST_TOOLS 關掉就沒有作用）
  if (h?.playable && TEST_TOOLS && save.settings.testAllRegions !== false) return true;
  return !!h?.playable && isDone(save, h.unlockProjectId);
}

export function habitatProgress(save: SaveFile, habitatId: HabitatId) {
  const defs = PROJECTS.filter((p) => p.habitatId === habitatId);
  const need = defs.reduce((a, p) => a + p.requiredPoints, 0);
  const got = defs.reduce((a, p) => a + projectProgress(save, p.id) * p.requiredPoints, 0);
  return need ? got / need : 0;
}

// ---------- 統計 ----------

/** 今日/每日時間包含 completed 與 abandoned 的有效時間。 */
const byDayAll = perSave((save) => {
  const out = new Map<ID, Map<string, number>>();
  for (const s of save.sessions) {
    if (s.islandId !== islandId(save) || isOpen(s)) continue;
    if (!out.has(s.userId)) out.set(s.userId, new Map());
    addSegmentsByDay(out.get(s.userId)!, s.segments, save.profile.timezone);
  }
  return out;
});
/** 每天的專注時間（依存檔快取；回傳的資料只能讀）。 */
export function minutesByDay(save: SaveFile, userId: ID = save.profile.id) {
  return byDayAll(save).get(userId) ?? new Map<string, number>();
}

/**
 * 一週回顧（weekStart 是一週第一天的 YYYY-MM-DD）：每天專注時間、專注天數、最佳日、最常遇見的動物、探索收穫，
 * 以及和前一週比較。時間含提前結束的那幾段（和專注紀錄一致）；遇見只算完成的探索。
 */
export function weekRecap(save: SaveFile, weekStart: string) {
  const byDay = minutesByDay(save);
  const week = (from: number) => Array.from({ length: 7 }, (_, i) => byDay.get(shiftDateKey(weekStart, from + i)) ?? 0);
  const days = week(0);
  const total = days.reduce((a, b) => a + b, 0);
  const prevTotal = week(-7).reduce((a, b) => a + b, 0);
  const end = shiftDateKey(weekStart, 6);
  const dayKeys = endedDayKeys(save);
  const sights = sightings(save);
  const firstMet = new Map<string, string>(); // 每種動物第一次遇見是哪天
  const met = new Map<string, { count: number; ms: number }>();
  let grew = 0;
  for (const s of endedSessions(save)) {
    if (s.status !== 'completed') continue;
    const day = dayKeys.get(s.id)!;
    const a = animalDef(s.animalId).id;
    if (!(firstMet.get(a)! <= day)) firstMet.set(a, day);
    if (day < weekStart || day > end) continue;
    const m = met.get(a) ?? { count: 0, ms: 0 };
    met.set(a, { count: m.count + 1, ms: m.ms + s.accumulatedMs });
    if (sights.get(s.id)?.grew) grew++;
  }
  const ranked = [...met].sort((x, y) => y[1].ms - x[1].ms || y[1].count - x[1].count); // 陪你最久的在前面
  const top = ranked[0];
  return {
    weekStart,
    days,
    total,
    prevTotal,
    focusDays: days.filter(Boolean).length,
    best: total ? days.indexOf(Math.max(...days)) : -1, // 0 = 一週的第一天
    top: top ? { id: top[0], ...top[1] } : null,
    animals: ranked.map(([id]) => id),
    species: met.size,
    newSpecies: [...met.keys()].filter((a) => firstMet.get(a)! >= weekStart).length,
    grew,
  };
}

/**
 * 一週專注時間在所有玩家中的排名（超越幾 % 的玩家、前幾 %）。
 * ponytail: 假資料——還沒有伺服器，先用固定的分布表（每週分鐘數 → 超越的百分比）內插；
 * 之後由伺服器回傳真正的排名，只要換掉這個函式。
 */
const FAKE_WEEK_CURVE: [number, number][] = [
  [0, 0],
  [30, 15],
  [120, 40],
  [300, 60],
  [600, 72],
  [960, 80],
  [1500, 90],
  [2400, 97],
  [4000, 99],
];
export function communityRank(weekMs: number) {
  const min = weekMs / 60000;
  let beat = 99;
  for (let i = 1; i < FAKE_WEEK_CURVE.length; i++) {
    const [m0, p0] = FAKE_WEEK_CURVE[i - 1];
    const [m1, p1] = FAKE_WEEK_CURVE[i];
    if (min <= m1) {
      beat = Math.floor(p0 + ((p1 - p0) * (min - m0)) / (m1 - m0));
      break;
    }
  }
  return { beat, top: Math.max(1, 100 - beat) };
}

export function contributionsByUser(save: SaveFile) {
  const m = new Map<ID, number>();
  for (const c of save.contributions) if (c.islandId === islandId(save)) m.set(c.userId, (m.get(c.userId) ?? 0) + c.points);
  return m;
}

// ---------- 環境音收集 ----------

/** id 有給的話也看商店有沒有買過。 */
export function soundUnlocked(save: SaveFile, u: SoundUnlock, id?: string) {
  if (u.kind === 'start') return true;
  if (id && save.transactions.some((t) => t.idempotencyKey === `shop:${islandId(save)}:sound:${id}`)) return true;
  if (u.kind === 'project') return isDone(save, u.id);
  return (hatchCounts(save).get(u.id) ?? 0) > 0;
}

/** 棲地預設的環境音：水源地修好後是泉水聲，之前是微風。 */
export const habitatSound = (save: SaveFile, _habitatId: HabitatId) => (isDone(save, 'fo_spring') ? 'stream' : 'breeze');

/** 專注時播放的環境音：玩家選的（且已收集），否則跟著棲地。 */
export function focusSoundFor(save: SaveFile, habitatId: HabitatId) {
  const pick = SOUNDS.find((x) => x.id === save.settings.focusSound);
  return pick && soundUnlocked(save, pick.unlock, pick.id) ? pick.id : habitatSound(save, habitatId);
}

// ---------- 專注完成後的自動流程 ----------

/** 專注完成後：成長點數全部投入目前的工程（可連續完成好幾個）。每段專注只執行一次（session.applied）。 */
export function applyFocusRewards(save: SaveFile, sessionId: ID, now: number): SaveFile {
  const s = save.sessions.find((x) => x.id === sessionId);
  if (!s || s.status !== 'completed' || s.applied) return save;
  return investAll(putSession(save, { ...s, applied: true }), s.userId, now, s.id);
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
  return { projects };
}
