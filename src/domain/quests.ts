// 挑戰與寶箱（參考 Forest）：每天 3 個每日挑戰、本月挑戰、新手任務；完成後打開寶箱領金幣（新手任務另外解鎖一條探索路線）。
// 挑戰內容只由日期決定（不看存檔），所以同一天的挑戰不會因為解鎖或改筆記而變動；進度則由當天完成的探索算出。
import { ANIMALS } from '../content/config';
import { MONTH_GEMS, STARTER_GEMS } from '../content/shop';
import { animalBought, endedDayKeys, endedSessions, islandId } from './game';
import { localDateKey } from './focus';
import type { SaveFile } from './types';

export interface Quest {
  key: string; // 領取紀錄的 idempotencyKey
  title: string;
  target: number;
  progress: number;
  reward: number; // 金幣
  unit: string;
  claimed: boolean;
}

export const MONTH_TARGET = 30; // 本月完成幾個每日挑戰
export const MONTH_REWARD = 200;
export const STARTER_REWARD = 50;
const MIN = 60_000;

type Kind = 'minutes' | 'count' | 'long' | 'note';
const KINDS: Kind[] = ['minutes', 'count', 'long', 'note'];
const LEVELS: Record<Kind, number[]> = { minutes: [30, 60, 90], count: [1, 2, 3], long: [25, 45, 60], note: [1] };
const REWARDS = [10, 15, 20];

/** 由日期得到固定的亂數（同一天每次算都一樣）。 */
function seeded(day: string) {
  let h = 2166136261;
  for (const c of day) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

/** 某天的 3 個每日挑戰（種類、難度、金幣），只看日期。 */
export function questPlan(day: string) {
  const rnd = seeded(day);
  const kinds = [...KINDS];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  kinds.length = 3;
  return kinds.map((kind, i) => {
    const level = Math.floor(rnd() * LEVELS[kind].length);
    return { key: `quest:${day}:${i}`, kind, target: LEVELS[kind][level], reward: kind === 'note' ? 10 : REWARDS[level] };
  });
}

const claimedKeys = (save: SaveFile) => new Set(save.transactions.filter((t) => t.kind === 'quest_reward' && t.userId === save.profile.id).map((t) => t.idempotencyKey));

/** 某天的每日挑戰與進度。 */
export function dailyQuests(save: SaveFile, day: string): Quest[] {
  const keys = endedDayKeys(save);
  const done = endedSessions(save).filter((s) => s.status === 'completed' && keys.get(s.id) === day);
  const claimed = claimedKeys(save);
  return questPlan(day).map((q) => {
    const [title, unit, progress] =
      q.kind === 'minutes'
        ? [`今天完成的探索合計 ${q.target} 分鐘`, '分', Math.floor(done.reduce((a, s) => a + s.accumulatedMs, 0) / MIN)]
        : q.kind === 'count'
          ? [`今天完成 ${q.target} 次探索`, '次', done.length]
          : q.kind === 'long'
            ? [`完成一次 ${q.target} 分鐘以上的探索`, '分', Math.floor(Math.max(0, ...done.map((s) => s.accumulatedMs)) / MIN)]
            : ['幫今天的探索寫一則筆記', '則', done.filter((s) => s.note?.trim()).length];
    return { key: q.key, title, target: q.target, progress: Math.min(progress, q.target), reward: q.reward, unit, claimed: claimed.has(q.key) };
  });
}

/** 本月挑戰：這個月領過幾個每日挑戰。 */
export function monthQuest(save: SaveFile, month: string): Quest {
  const claimed = claimedKeys(save);
  const n = [...claimed].filter((k) => k.startsWith(`quest:${month}-`)).length;
  const key = `quest:month:${month}`;
  return { key, title: `完成 ${MONTH_TARGET} 個每日挑戰`, target: MONTH_TARGET, progress: Math.min(n, MONTH_TARGET), reward: MONTH_REWARD, unit: '個', claimed: claimed.has(key) };
}

/** 新手任務：三個步驟，全部完成後打開寶箱。 */
export function starterQuest(save: SaveFile) {
  const done = endedSessions(save).filter((s) => s.status === 'completed');
  const min = Math.floor(done.reduce((a, s) => a + s.accumulatedMs, 0) / MIN);
  // have／need：進度條；go：點這一步要帶玩家去哪裡完成
  const steps = [
    { title: '完成第一次探索', have: Math.min(done.length, 1), need: 1, go: 'lobby' as const },
    { title: '幫探索寫一則筆記', have: done.some((s) => s.note?.trim()) ? 1 : 0, need: 1, go: 'records' as const },
    { title: '累積專注 60 分鐘', have: Math.min(min, 60), need: 60, go: 'lobby' as const },
  ].map((st) => ({ ...st, ok: st.have >= st.need }));
  return { key: 'quest:starter', steps, ready: steps.every((s) => s.ok), claimed: claimedKeys(save).has('quest:starter'), animal: starterAnimal(save) };
}

/** 新手任務送的探索路線：商店裡第一種還沒解鎖的（都解鎖過就只給金幣）。 */
const starterAnimal = (save: SaveFile) => ANIMALS.find((a) => a.unlock.kind === 'coins' && !animalBought(save, a.id)) ?? null;

export const today = (save: SaveFile, now: number) => localDateKey(now, save.profile.timezone);

/** 現在有沒有可以打開的寶箱（選單上的小紅點）。 */
export function hasReward(save: SaveFile, now: number) {
  const day = today(save, now);
  const st = starterQuest(save);
  const m = monthQuest(save, day.slice(0, 7));
  return (st.ready && !st.claimed) || (m.progress >= m.target && !m.claimed) || dailyQuests(save, day).some((q) => q.progress >= q.target && !q.claimed);
}

type Claim = { ok: true; save: SaveFile; coins: number; gems: number; animalId?: string } | { ok: false; error: string };

/** 打開寶箱：今天的每日挑戰、本月挑戰或新手任務，完成且還沒領過才行。 */
export function claimQuest(save: SaveFile, key: string, now: number): Claim {
  const day = today(save, now);
  let coins = 0;
  let animalId: string | undefined;
  if (key === 'quest:starter') {
    const st = starterQuest(save);
    if (!st.ready || st.claimed) return { ok: false, error: '新手任務還沒完成。' };
    coins = STARTER_REWARD;
    animalId = st.animal?.id;
  } else {
    if (/^quest:\d{4}-\d{2}-\d{2}:/.test(key) && !key.startsWith(`quest:${day}:`)) return { ok: false, error: '已經過午夜，每日挑戰換新了。' };
    const q = [monthQuest(save, day.slice(0, 7)), ...dailyQuests(save, day)].find((x) => x.key === key);
    if (!q || q.claimed || q.progress < q.target) return { ok: false, error: '這個挑戰還沒完成。' };
    coins = q.reward;
  }
  const t = { id: crypto.randomUUID(), userId: save.profile.id, islandId: islandId(save), kind: 'quest_reward' as const, amount: coins, idempotencyKey: key, createdAt: new Date(now).toISOString(), ...(animalId ? { animalId } : {}) };
  // 新手任務和本月挑戰的寶箱另外送寶石（每日挑戰不送）
  const gems = key === 'quest:starter' ? STARTER_GEMS : key.startsWith('quest:month:') ? MONTH_GEMS : 0;
  const g = gems ? [{ ...t, id: crypto.randomUUID(), kind: 'gem_grant' as const, amount: gems, idempotencyKey: `${key}:gems`, animalId: undefined }] : [];
  return { ok: true, save: { ...save, transactions: [...save.transactions, t, ...g] }, coins, gems, animalId };
}

/**
 * 存檔檢查用：只看格式與合理範圍，不比對目前的獎勵數值與進度
 * （之後調整挑戰獎勵、或筆記被刪掉，舊存檔都還要讀得到；同一個挑戰重複領取由 idempotencyKey 擋下）。
 */
/** 存檔檢查用：寶箱送的寶石（只有新手任務、本月挑戰）。 */
export function questGemOk(key: string, amount: number) {
  return Number.isInteger(amount) && amount > 0 && amount <= 1000 && (key === 'quest:starter:gems' || /^quest:month:\d{4}-\d{2}:gems$/.test(key) || /^ach:[a-z0-9_]+:gems$/.test(key)); // ach：成就的大獎
}

export function questRewardOk(key: string, amount: number, animalId?: string) {
  if (!Number.isInteger(amount) || amount <= 0 || amount > 1000) return false;
  if (key === 'quest:starter') return !animalId || ANIMALS.some((a) => a.id === animalId);
  if (animalId) return false;
  if (/^ach:[a-z0-9_]+$/.test(key)) return true; // 成就獎勵（見 achievements.ts）
  return /^quest:month:\d{4}-\d{2}$/.test(key) || /^quest:\d{4}-\d{2}-\d{2}:[0-2]$/.test(key);
}
