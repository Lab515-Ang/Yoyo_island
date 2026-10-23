// 節奏模擬：用「一般玩家」的專注習慣跑完整條路線，檢查各里程碑落在目標時間內。
// 調整 config.ts 的數值後執行 npm test，就能看到節奏有沒有跑掉（結果也會印出來）。
import { describe, expect, it } from 'vitest';
import { EGG_PRICE, FACILITIES, PETS, PROJECTS } from '../content/config';
import {
  activeProject,
  adoptedPets,
  buyEgg,
  buyFacility,
  coins,
  contribute,
  facilityOwned,
  feed,
  feedPet,
  grantStarter,
  habitatFree,
  habitatOpen,
  isDone,
  settleOpenSessions,
  starterGiftDue,
  startFocus,
} from './game';
import { newSave } from './save';
import type { HabitatId, SaveFile } from './types';

const DAY = 86_400_000;
const T0 = Date.parse('2026-01-05T00:00:00Z'); // 週一

interface Habit {
  sessionsPerDay: number;
  minutes: number; // 每段倒數長度
  daysPerWeek: number;
}

/** 模擬玩家：每段倒數都完成；點數全投工程；金幣優先買蛋填滿名額、再買設施；飼料都餵給最接近長大的寵物。 */
function simulate(habit: Habit, maxDays = 400) {
  let save: SaveFile = newSave('personal', { nickname: '模擬', islandName: '模擬島', avatarId: 'leaf', timezone: 'UTC' }, T0);
  const uid = save.profile.id;
  const at: Record<string, number> = {};
  const mark = (key: string, day: number) => (at[key] ??= day);

  for (let day = 1; day <= maxDays; day++) {
    if ((day - 1) % 7 >= habit.daysPerWeek) continue;
    for (let n = 0; n < habit.sessionsPerDay; n++) {
      const start = T0 + (day - 1) * DAY + (9 + n * 3) * 3_600_000;
      save = startFocus(save, { taskTitle: '', tag: '讀書', habitatId: 'greenhouse', mode: 'countdown', targetSeconds: habit.minutes * 60 }, start);
      save = settleOpenSessions(save, start + habit.minutes * 60_000).save;

      // 點數全投進目前的工程
      for (let p = activeProject(save); p; p = activeProject(save)) {
        const r = contribute(save, uid, p.id, 'all', start);
        if (!r.ok) break;
        save = r.save;
        if (!r.completed) break;
      }
      if (starterGiftDue(save)) {
        const g = grantStarter(save, start);
        if (g.ok) save = g.save;
      }

      // 金幣：有空位就買蛋，否則買下一個設施
      for (const h of ['greenhouse', 'stream'] as HabitatId[]) {
        if (!habitatOpen(save, h)) continue;
        if (habitatFree(save, h) > 0 && coins(save) >= (EGG_PRICE[h] ?? Infinity)) {
          const e = buyEgg(save, uid, h, start, 0.5);
          if (e.ok) save = e.save;
        }
        const next = FACILITIES.find((f) => f.habitatId === h && !facilityOwned(save, f.id));
        if (next && habitatFree(save, h) <= 0 && coins(save) >= next.price) {
          const f = buyFacility(save, uid, next.id, start);
          if (f.ok) save = f.save;
        }
      }

      // 飼料：餵給最接近下一階段的寵物
      const growing = adoptedPets(save)
        .filter((v) => v.stage < 3)
        .sort((a, b) => a.def.thresholds[a.stage] - a.fed - (b.def.thresholds[b.stage] - b.fed));
      for (const v of growing) {
        if (feed(save) <= 0) break;
        const r = feedPet(save, uid, v.pet.id, 'all', start);
        if (r.ok) save = r.save;
      }
    }

    if (isDone(save, 'gh_entrance')) mark('修好溫室入口（收到卵）', day);
    if (adoptedPets(save).some((v) => v.stage >= 1)) mark('第一次孵化', day);
    if (adoptedPets(save).some((v) => v.stage === 3)) mark('第一隻寵物長大', day);
    if (isDone(save, 'gh_plants')) mark('溫室全部修好', day);
    if (isDone(save, 'st_entrance')) mark('溪流開放', day);
    if (PROJECTS.every((p) => isDone(save, p.id))) mark('所有工程完成', day);
    if (adoptedPets(save).some((v) => v.def.rarity === 'rare' && v.stage === 3)) mark('稀有寵物長大', day);
    if (FACILITIES.every((f) => facilityOwned(save, f.id))) mark('設施全部買齊', day);
    if (at['所有工程完成'] && PETS.every((p) => adoptedPets(save).some((v) => v.def.id === p.id))) mark('五種寵物都養過', day);
  }
  return at;
}

const report = (title: string, at: Record<string, number>) =>
  console.log(`\n${title}\n` + Object.entries(at).map(([k, d]) => `  ${k.padEnd(14, '　')} 第 ${d} 天（約 ${(d / 7).toFixed(1)} 週）`).join('\n'));

describe('長期節奏（每天 1～3 小時，溫室＋溪流約 3 個月）', () => {
  it('基準玩家：每天 2 小時（兩段 60 分鐘）、每週 6 天', () => {
    const at = simulate({ sessionsPerDay: 2, minutes: 60, daysPerWeek: 6 });
    report('基準玩家：每天 2 小時、每週 6 天', at);
    expect(at['修好溫室入口（收到卵）']).toBe(1); // 第一天就有收穫
    expect(at['第一次孵化']).toBeLessThanOrEqual(3);
    expect(at['第一隻寵物長大']).toBeGreaterThanOrEqual(10);
    expect(at['第一隻寵物長大']).toBeLessThanOrEqual(25);
    expect(at['溫室全部修好']).toBeGreaterThanOrEqual(21);
    expect(at['溫室全部修好']).toBeLessThanOrEqual(42);
    expect(at['所有工程完成']).toBeGreaterThanOrEqual(75);
    expect(at['所有工程完成']).toBeLessThanOrEqual(110);
  });

  it('輕度玩家每天 1 小時、重度玩家每天 3 小時，也落在合理範圍', () => {
    const light = simulate({ sessionsPerDay: 2, minutes: 30, daysPerWeek: 6 });
    const heavy = simulate({ sessionsPerDay: 3, minutes: 60, daysPerWeek: 6 });
    report('輕度玩家：每天 1 小時', light);
    report('重度玩家：每天 3 小時', heavy);
    expect(light['所有工程完成']).toBeGreaterThan(150); // 約 5 個月以上
    expect(heavy['所有工程完成']).toBeGreaterThan(50); // 至少約 2 個月
  });
});
