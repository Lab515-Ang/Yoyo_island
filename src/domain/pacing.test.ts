// 節奏模擬：用「一般玩家」的專注習慣跑完整條路線，檢查各里程碑落在目標時間內。
// 調整 config.ts 的數值後執行 npm test，就能看到節奏有沒有跑掉（結果也會印出來）。
import { describe, expect, it } from 'vitest';
import { ANIMALS, PROJECTS } from '../content/config';
import { activeProject, animalUnlocked, applyFocusRewards, coins, growthOf, hatchCounts, isDone, settleOpenSessions, startFocus, unlockAnimal } from './game';
import { newSave } from './save';
import type { SaveFile } from './types';

const DAY = 86_400_000;
const T0 = Date.parse('2026-01-05T00:00:00Z'); // 週一

interface Habit {
  sessionsPerDay: number;
  minutes: number; // 每段倒數長度
  daysPerWeek: number;
}

/** 模擬玩家：每段倒數都完成；點數自動投入工程；輪流探索已解鎖的動物；金幣夠就解鎖商店裡最便宜的動物。 */
function simulate(h: Habit, days: number) {
  let save: SaveFile = newSave('personal', { nickname: '模擬', islandName: '模擬島', avatarId: 'leaf', timezone: 'Asia/Taipei' }, T0);
  const firstDay: Record<string, number> = {};
  const mark = (key: string, day: number) => (firstDay[key] ??= day);
  for (let d = 0; d < days; d++) {
    if (d % 7 >= h.daysPerWeek) continue;
    for (let i = 0; i < h.sessionsPerDay; i++) {
      const start = T0 + d * DAY + (9 + i * 2) * 3_600_000;
      const pool = ANIMALS.filter((a) => animalUnlocked(save, a));
      const egg = pool[(d * h.sessionsPerDay + i) % pool.length].id;
      save = startFocus(save, { taskTitle: '', tag: '讀書', habitatId: 'forest', mode: 'countdown', targetSeconds: h.minutes * 60, animalId: egg }, start);
      const end = start + h.minutes * 60_000;
      const r = settleOpenSessions(save, end);
      save = applyFocusRewards(r.save, r.completed!.id, end);
      for (const a of ANIMALS.filter((x) => x.unlock.kind === 'coins').sort((x, y) => (x.unlock.kind === 'coins' && y.unlock.kind === 'coins' ? x.unlock.price - y.unlock.price : 0))) {
        if (animalUnlocked(save, a)) continue;
        const u = unlockAnimal(save, save.profile.id, a.id, end);
        if (u.ok) {
          save = u.save;
          mark(`商店解鎖 ${a.name}`, d + 1);
        }
        break;
      }
    }
    for (const p of PROJECTS) if (isDone(save, p.id)) mark(`完成 ${p.title}`, d + 1);
    if (!activeProject(save)) mark('全部工程完成', d + 1);
    const free = ANIMALS.filter((a) => a.unlock.kind !== 'iap');
    if (free.every((a) => hatchCounts(save).get(a.id))) mark('遇見所有可取得的動物', d + 1);
    if (free.every((a) => growthOf(save, a.id).stage === 2)) mark('所有可取得的動物都看到成年', d + 1);
  }
  return { save, firstDay };
}

describe('節奏模擬', () => {
  it('每天 2.5 小時：第一天就有步道與第一隻動物；約 3 個月修完森林；動物收集與族群成長跟得上', () => {
    const { save, firstDay } = simulate({ sessionsPerDay: 5, minutes: 30, daysPerWeek: 7 }, 150);
    console.table(firstDay);
    expect(firstDay['完成 清出林間步道']).toBe(1);
    expect(firstDay['全部工程完成']).toBeGreaterThanOrEqual(80);
    expect(firstDay['全部工程完成']).toBeLessThanOrEqual(100);
    expect(firstDay['遇見所有可取得的動物']).toBeLessThanOrEqual(100);
    // 族群成長要和修復森林差不多同時走完，後期才有事可做
    expect(firstDay['所有可取得的動物都看到成年']).toBeGreaterThanOrEqual(70);
    expect(firstDay['所有可取得的動物都看到成年']).toBeLessThanOrEqual(130);
    expect(coins(save)).toBeGreaterThanOrEqual(0);
  });

  it('每天 1 小時：森林大約 7～8 個月修完，仍會持續解鎖新動物', () => {
    const { firstDay } = simulate({ sessionsPerDay: 2, minutes: 30, daysPerWeek: 7 }, 260);
    console.table(firstDay);
    expect(firstDay['全部工程完成']).toBeGreaterThanOrEqual(200);
    expect(firstDay['全部工程完成']).toBeLessThanOrEqual(250);
    expect(firstDay['商店解鎖 小麝香貓']).toBeLessThanOrEqual(30);
  });
});
