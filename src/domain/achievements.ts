// 成就：依存檔算進度，達成後可以領金幣（大的另外送寶石）。數值與清單都在這裡調。
import { ANIMALS, SOUNDS, regionAnimals, regionProjects } from '../content/config';
import { localHourKey } from './focus';
import { endedDayKeys, endedSessions, growthOf, hatchCounts, islandId, isDone, soundUnlocked } from './game';
import type { PointTransaction, SaveFile } from './types';

export interface AchievementDef {
  id: string;
  group: string;
  icon: string;
  title: string;
  desc: string;
  target: number;
  coins: number;
  gems?: number;
  /** 顯示進度的單位（per：數值要除多少，例如分鐘換小時）*/
  unit?: string;
  per?: number;
  value: (save: SaveFile) => number;
}

const done = (save: SaveFile) => endedSessions(save).filter((s) => s.status === 'completed');
const minutes = (save: SaveFile) => Math.floor(endedSessions(save).reduce((t, s) => t + s.accumulatedMs, 0) / 60000);
const longest = (save: SaveFile) => Math.max(0, ...done(save).map((s) => Math.floor(s.accumulatedMs / 60000)));
const hourOf = (save: SaveFile, iso: string) => Number(localHourKey(Date.parse(iso), save.profile.timezone).slice(11));

/** 最長連續幾天都有完成專注。 */
function bestStreak(save: SaveFile) {
  const keys = endedDayKeys(save);
  const days = [...new Set(done(save).map((s) => keys.get(s.id)!))].sort();
  let best = 0;
  let run = 0;
  let prev = 0;
  for (const d of days) {
    const t = Date.parse(`${d}T00:00:00Z`);
    run = t - prev === 86_400_000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

const met = (save: SaveFile, ids = ANIMALS) => ids.filter((a) => hatchCounts(save).get(a.id)).length;
const fixed = (save: SaveFile, region: string) => regionProjects(region).filter((p) => isDone(save, p.id)).length;

export const ACHIEVEMENTS: AchievementDef[] = [
  // 專注時間
  { id: 'first_focus', group: '專注時間', icon: '🌱', title: '第一次探索', desc: '完成第一段專注', target: 1, coins: 20, value: (s) => done(s).length },
  { id: 'hours_10', group: '專注時間', icon: '⏳', title: '十小時的觀察者', desc: '累積專注 10 小時', target: 600, coins: 100, unit: '小時', per: 60, value: minutes },
  { id: 'hours_50', group: '專注時間', icon: '🕰️', title: '森林的常客', desc: '累積專注 50 小時', target: 3000, coins: 300, unit: '小時', per: 60, value: minutes },
  { id: 'hours_100', group: '專注時間', icon: '🏞️', title: '百小時的守護者', desc: '累積專注 100 小時', target: 6000, coins: 500, gems: 20, unit: '小時', per: 60, value: minutes },
  { id: 'hours_300', group: '專注時間', icon: '🌳', title: '森林的一部分', desc: '累積專注 300 小時', target: 18000, coins: 1000, gems: 50, unit: '小時', per: 60, value: minutes },
  // 專注習慣
  { id: 'streak_3', group: '專注習慣', icon: '🔥', title: '三天不間斷', desc: '連續 3 天都完成專注', target: 3, coins: 50, unit: '天', value: bestStreak },
  { id: 'streak_7', group: '專注習慣', icon: '📅', title: '一週好習慣', desc: '連續 7 天都完成專注', target: 7, coins: 150, unit: '天', value: bestStreak },
  { id: 'streak_30', group: '專注習慣', icon: '🗓️', title: '一個月的堅持', desc: '連續 30 天都完成專注', target: 30, coins: 600, gems: 30, unit: '天', value: bestStreak },
  { id: 'long_60', group: '專注習慣', icon: '🧘', title: '沉浸一小時', desc: '完成一段 60 分鐘以上的專注', target: 60, coins: 60, unit: '分鐘', value: longest },
  { id: 'long_120', group: '專注習慣', icon: '🏔️', title: '兩小時的深潛', desc: '完成一段 120 分鐘以上的專注', target: 120, coins: 150, unit: '分鐘', value: longest },
  { id: 'early_bird', group: '專注習慣', icon: '🌅', title: '早起的鳥兒', desc: '早上 7 點前開始專注，完成 5 次', target: 5, coins: 80, value: (s) => done(s).filter((x) => hourOf(s, x.startedAt) < 7).length },
  { id: 'night_owl', group: '專注習慣', icon: '🌙', title: '夜裡的貓頭鷹', desc: '晚上 10 點後開始專注，完成 5 次', target: 5, coins: 80, value: (s) => done(s).filter((x) => hourOf(s, x.startedAt) >= 22).length },
  { id: 'deep_10', group: '專注習慣', icon: '🔒', title: '心無旁騖', desc: '完成 10 次深度專注', target: 10, coins: 120, value: (s) => done(s).filter((x) => x.deep).length },
  { id: 'notes_10', group: '專注習慣', icon: '📝', title: '野外筆記', desc: '幫 10 次探索寫下筆記', target: 10, coins: 60, value: (s) => endedSessions(s).filter((x) => x.note?.trim()).length },
  // 探索與圖鑑
  { id: 'species_5', group: '探索與圖鑑', icon: '🔭', title: '初見森林', desc: '遇見 5 種不同的動物', target: 5, coins: 80, value: (s) => met(s) },
  { id: 'species_10', group: '探索與圖鑑', icon: '📖', title: '圖鑑漸漸豐富', desc: '遇見 10 種不同的動物', target: 10, coins: 200, value: (s) => met(s) },
  { id: 'species_tw', group: '探索與圖鑑', icon: '🏝️', title: '台灣森林全紀錄', desc: '遇見台灣所有的動物', target: regionAnimals('tw').length, coins: 800, gems: 40, value: (s) => met(s, regionAnimals('tw')) },
  { id: 'adult_1', group: '探索與圖鑑', icon: '🦉', title: '看見成年的牠', desc: '第一次看到成年的動物', target: 1, coins: 50, value: (s) => ANIMALS.filter((a) => growthOf(s, a.id).stage === 2).length },
  { id: 'adult_5', group: '探索與圖鑑', icon: '🐾', title: '穩定的族群', desc: '5 種動物都看到成年', target: 5, coins: 250, value: (s) => ANIMALS.filter((a) => growthOf(s, a.id).stage === 2).length },
  // 修復與收集
  { id: 'project_1', group: '修復與收集', icon: '🛠️', title: '第一個工程', desc: '完成第一個修復工程', target: 1, coins: 40, value: (s) => fixed(s, 'tw') + fixed(s, 'jp') },
  { id: 'forest_done', group: '修復與收集', icon: '🌲', title: '森林回來了', desc: '修完台灣森林的所有工程', target: regionProjects('tw').length, coins: 600, gems: 30, value: (s) => fixed(s, 'tw') },
  { id: 'japan_arrive', group: '修復與收集', icon: '🗾', title: '前往日本', desc: '在日本里山完成一段專注', target: 1, coins: 100, value: (s) => done(s).filter((x) => x.habitatId === 'satoyama').length },
  { id: 'satoyama_done', group: '修復與收集', icon: '🌸', title: '里山的春天', desc: '修完日本里山的所有工程', target: regionProjects('jp').length, coins: 600, gems: 30, value: (s) => fixed(s, 'jp') },
  { id: 'sounds_all', group: '修復與收集', icon: '🎶', title: '大自然交響樂', desc: '收集所有環境音', target: SOUNDS.length, coins: 300, value: (s) => SOUNDS.filter((x) => soundUnlocked(s, x.unlock, x.id)).length },
  { id: 'daily_30', group: '修復與收集', icon: '🎁', title: '挑戰達人', desc: '領取 30 個每日挑戰寶箱', target: 30, coins: 300, value: (s) => s.transactions.filter((t) => t.kind === 'quest_reward' && /^quest:\d{4}-\d{2}-\d{2}:/.test(t.idempotencyKey)).length },
];

const key = (id: string) => `ach:${id}`;
export const claimed = (save: SaveFile, id: string) => save.transactions.some((t) => t.idempotencyKey === key(id));

export function achievementState(save: SaveFile) {
  return ACHIEVEMENTS.map((a) => {
    const v = a.value(save);
    return { a, value: Math.min(v, a.target), ready: v >= a.target && !claimed(save, a.id), claimed: claimed(save, a.id) };
  });
}
export const achievementReady = (save: SaveFile) => achievementState(save).some((x) => x.ready);

/** 領取成就獎勵：金幣（quest_reward）＋寶石（gem_grant）。 */
export function claimAchievement(save: SaveFile, id: string, now: number) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a || claimed(save, id) || a.value(save) < a.target) return null;
  const base = { userId: save.profile.id, islandId: islandId(save), createdAt: new Date(now).toISOString() };
  const tx: PointTransaction[] = [{ ...base, id: crypto.randomUUID(), kind: 'quest_reward', amount: a.coins, idempotencyKey: key(id) }];
  if (a.gems) tx.push({ ...base, id: crypto.randomUUID(), kind: 'gem_grant', amount: a.gems, idempotencyKey: `${key(id)}:gems` });
  return { ...save, transactions: [...save.transactions, ...tx] };
}
