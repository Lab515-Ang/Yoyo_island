import { describe, expect, it } from 'vitest';
import { applyDeepFocus, dueAt, completeNow, createSession, elapsedMs, finish, pause, resume, settle, addSegmentsByDay, addSegmentsByHour, weekStartKey, wakeAt, watchWindow, setCalendar, localDateKey, nextLocalMidnight, targetReached } from './focus';
import { balance, closeSession, coins, contribute, grantReward, settleOpenSessions, minutesByDay, activeProject, habitatOpen, putSession, soundUnlocked, focusSoundFor, cancelSession, startFocus, editSessionNote, isDone, projectQuarter, remainingFor, applyFocusRewards, focusOutcome, animalUnlocked, chosenAnimal, endedSessions, hatchCounts, newAnimals, sceneAnimals, unlockAnimal, growthOf, sightings, weekRecap, communityRank, gems } from './game';
import { buyItem, dailyPicks, exchangeCoins } from './shop';
import { ANIMALS, CONTENT_VERSION, GROWTH_AT, SOUNDS, animalDef, projectDef, stageName } from '../content/config';
import { newSave, newDemoSave, validateSave, demoGrant } from './save';
import { npsDue } from './feedback';
import { claimQuest, dailyQuests, monthQuest, questPlan, questRewardOk, starterQuest, hasReward, MONTH_REWARD, STARTER_REWARD } from './quests';
import type { SaveFile } from './types';

const T0 = Date.parse('2026-10-22T01:00:00Z');
const MIN = 60_000;

/** 工程需要的點數（從設定讀，調整數值時測試不用跟著改） */
const need = (id: string) => projectDef(id)!.requiredPoints;

function fresh(): SaveFile {
  return newSave('personal', { nickname: '測試', islandName: '測試島', avatarId: 'leaf', timezone: 'Asia/Taipei' }, T0);
}
const quietId = () => crypto.randomUUID();
function session(save: SaveFile, mode: 'countdown' | 'stopwatch', targetMin: number | null, now = T0, id = quietId()) {
  return createSession({ id, userId: save.profile.id, islandId: save.profile.activeIslandId, taskTitle: '', tag: '讀書', habitatId: 'forest', mode, targetSeconds: targetMin && targetMin * 60 }, now);
}
/** 用 n 分鐘完成的專注給玩家點數（超過 180 分鐘就拆成好幾段，因為單段上限 180 分鐘） */
function focus(save: SaveFile, minutes: number, at = T0): SaveFile {
  const chunk = Math.min(minutes, 180);
  const s = finish(session(save, 'stopwatch', null, at), at + chunk * MIN, 'completed');
  const next = closeSession(save, s, at + chunk * MIN);
  return minutes > chunk ? focus(next, minutes - chunk, at + (chunk + 1) * MIN) : next;
}

describe('暫停上限（參考 Forest：最多 5 分鐘，時間到自動繼續）', () => {
  const LIMIT = 5 * MIN;
  it('玩家按的暫停超過上限，從上限那一刻自動繼續；之後照常計時、完成', () => {
    const s0 = session(fresh(), 'countdown', 25);
    const p = pause(s0, T0 + 10 * MIN, LIMIT);
    expect(p.status).toBe('paused');
    expect(wakeAt(p)).toBe(T0 + 15 * MIN);
    expect(settle(p, T0 + 14 * MIN).status).toBe('paused'); // 還在暫停時間內
    const r = settle(p, T0 + 20 * MIN);
    expect(r.status).toBe('running');
    expect(r.runningSince).toBe(new Date(T0 + 15 * MIN).toISOString());
    expect(elapsedMs(r, T0 + 20 * MIN)).toBe(15 * MIN); // 暫停的 5 分鐘不算，之後的 5 分鐘算
    const done = settle(p, T0 + 60 * MIN); // 背景很久才回來：自動繼續後倒數歸零
    expect(done.status).toBe('completed');
    expect(done.endedAt).toBe(new Date(T0 + 30 * MIN).toISOString());
  });

  it('手動恢復會清掉上限；接電話的暫停沒有上限', () => {
    const p = pause(session(fresh(), 'countdown', 25), T0 + 10 * MIN, LIMIT);
    const back = resume(p, T0 + 12 * MIN);
    expect(back.pauseLimitAt).toBeNull();
    const call = pause(session(fresh(), 'countdown', 25), T0 + 10 * MIN);
    expect(settle(call, T0 + 60 * MIN).status).toBe('paused');
    expect(wakeAt(call)).toBeNull();
    expect(watchWindow(call)).toBeNull(); // 接電話的暫停不用看守
  });

  it('深度專注在暫停中也看守：暫停期間可以離開，自動繼續後照常', () => {
    const p = pause(session(fresh(), 'countdown', 25), T0 + 10 * MIN, LIMIT);
    expect(watchWindow(p)).toEqual({ endAt: T0 + 30 * MIN, freeUntil: T0 + 15 * MIN, since: T0 + 5 * MIN });
    const run = session(fresh(), 'countdown', 25);
    expect(watchWindow(run)).toEqual({ endAt: dueAt(run)!, freeUntil: 0, since: T0 });
  });
});

describe('專注計時', () => {
  it('暫停期間不計時，以時間戳推算', () => {
    let s = session(fresh(), 'stopwatch', null);
    s = pause(s, T0 + 10 * MIN);
    expect(elapsedMs(s, T0 + 30 * MIN)).toBe(10 * MIN);
    s = resume(s, T0 + 30 * MIN);
    expect(elapsedMs(s, T0 + 35 * MIN)).toBe(15 * MIN);
    s = finish(s, T0 + 35 * MIN, 'completed');
    expect(s.accumulatedMs).toBe(15 * MIN);
    expect(s.segments).toHaveLength(2);
  });

  it('倒數在背景歸零：結束於歸零那一刻，時間不超過目標', () => {
    let s = session(fresh(), 'countdown', 25);
    s = pause(s, T0 + 5 * MIN);
    s = resume(s, T0 + 10 * MIN);
    const done = settle(s, T0 + 3 * 60 * MIN); // 三小時後才回來
    expect(done.status).toBe('completed');
    expect(done.accumulatedMs).toBe(25 * MIN);
    expect(Date.parse(done.endedAt!)).toBe(T0 + 30 * MIN);
    expect(settle(done, T0 + 4 * 60 * MIN)).toBe(done); // 再結算不變
  });

  it('提前結束：只保留紀錄為 abandoned、不給點', () => {
    let save = fresh();
    const s = finish(session(save, 'countdown', 25), T0 + 12 * MIN, 'abandoned');
    save = closeSession(save, s, T0 + 12 * MIN);
    expect(s.accumulatedMs).toBe(12 * MIN);
    expect(balance(save)).toBe(0);
  });

  it('跨日依本地時區分配，暫停時間不計入', () => {
    // 台北 23:50 開始，00:00~00:20 暫停，00:30 結束
    const start = Date.parse('2026-10-22T15:50:00Z');
    let s = createSession({ id: 'x', userId: 'u', islandId: 'i', taskTitle: '', tag: '', habitatId: 'forest', mode: 'stopwatch', targetSeconds: null }, start);
    s = pause(s, start + 10 * MIN);
    s = resume(s, start + 30 * MIN);
    s = finish(s, start + 40 * MIN, 'completed');
    const days = addSegmentsByDay(new Map(), s.segments, 'Asia/Taipei');
    expect(days.get('2026-10-22')).toBe(10 * MIN);
    expect(days.get('2026-10-23')).toBe(10 * MIN);
  });

  it('依本地小時分配（專注紀錄分布圖）：跨小時、跨日、暫停不計；半小時時差的時區也正確', () => {
    const start = Date.parse('2026-10-22T15:50:00Z'); // 台北 23:50
    let s = createSession({ id: 'x', userId: 'u', islandId: 'i', taskTitle: '', tag: '', habitatId: 'forest', mode: 'stopwatch', targetSeconds: null }, start);
    s = pause(s, start + 10 * MIN);
    s = resume(s, start + 30 * MIN);
    s = finish(s, start + 75 * MIN, 'completed'); // 00:20～01:05
    const hours = addSegmentsByHour(new Map(), s.segments, 'Asia/Taipei');
    expect(hours.get('2026-10-22 23')).toBe(10 * MIN);
    expect(hours.get('2026-10-23 00')).toBe(40 * MIN);
    expect(hours.get('2026-10-23 01')).toBe(5 * MIN);
    const india = addSegmentsByHour(new Map(), [{ startedAt: '2026-10-22T04:00:00.000Z', endedAt: '2026-10-22T05:00:00.000Z' }], 'Asia/Kolkata'); // 09:30～10:30
    expect(india.get('2026-10-22 09')).toBe(30 * MIN);
    expect(india.get('2026-10-22 10')).toBe(30 * MIN);
  });

  it('跨日分配可處理日光節約時間（紐約 2026-03-08 只有 23 小時）', () => {
    const start = Date.parse('2026-03-08T04:30:00Z'); // 紐約 3/7 23:30
    const days = addSegmentsByDay(new Map(), [{ startedAt: new Date(start).toISOString(), endedAt: new Date(start + 25 * 60 * MIN).toISOString() }], 'America/New_York');
    expect(days.get('2026-03-07')).toBe(30 * MIN);
    expect(days.get('2026-03-08')).toBe(23 * 60 * MIN);
    expect(days.get('2026-03-09')).toBe(90 * MIN);
  });

  it('週一為一週開始', () => {
    expect(weekStartKey('2026-10-22')).toBe('2026-10-19');
    expect(weekStartKey('2026-10-19')).toBe('2026-10-19');
    expect(weekStartKey('2026-10-25')).toBe('2026-10-19');
  });

  it('設定可以改成週日開始、一天從凌晨 4 點開始', () => {
    setCalendar({ weekStart: 0, dayStartHour: 4 });
    try {
      expect(weekStartKey('2026-10-22')).toBe('2026-10-18');
      expect(weekStartKey('2026-10-25')).toBe('2026-10-25');
      // 台北凌晨 2 點還算前一天；4 點之後才換日
      expect(localDateKey(Date.parse('2026-10-22T18:00:00Z'), 'Asia/Taipei')).toBe('2026-10-22');
      expect(localDateKey(Date.parse('2026-10-22T20:00:00Z'), 'Asia/Taipei')).toBe('2026-10-23');
      expect(nextLocalMidnight(Date.parse('2026-10-22T18:00:00Z'), 'Asia/Taipei')).toBe(Date.parse('2026-10-22T20:00:00Z'));
    } finally {
      setCalendar({ weekStart: 1, dayStartHour: 0 });
    }
  });

  it('延長計時：倒數到了繼續累積，按停止才算完成', () => {
    const save = fresh();
    const s = { ...session(save, 'countdown', 25), extend: true };
    expect(settle(s, T0 + 30 * MIN).status).toBe('running');
    expect(targetReached(s, T0 + 30 * MIN)).toBe(true);
    const done = finish(s, T0 + 40 * MIN, 'completed');
    expect(done.accumulatedMs).toBe(40 * MIN);
    // 最多算到 180 分鐘
    expect(settle(s, T0 + 200 * MIN).accumulatedMs).toBe(180 * MIN);
  });
});

describe('點數結算', () => {
  it('5 分鐘完成得 5 點；59 秒得 0 點但保留時間', () => {
    let save = focus(fresh(), 5);
    expect(balance(save)).toBe(5);
    const s = finish(session(save, 'stopwatch', null), T0 + 59_000, 'completed');
    save = closeSession(save, s, T0 + 59_000);
    expect(balance(save)).toBe(5);
    expect(save.sessions).toHaveLength(2);
  });

  it('同一 session 重複結算只發一次', () => {
    let save = focus(fresh(), 25);
    const id = save.sessions[0].id;
    save = grantReward(save, id, T0);
    save = grantReward(save, id, T0);
    expect(balance(save)).toBe(25);
    expect(coins(save)).toBe(25);
    expect(save.transactions).toHaveLength(2); // 點數、金幣各一筆
  });

  it('倒數提前結束（abandoned）點數與金幣都是 0', () => {
    let save = fresh();
    const s = finish(session(save, 'countdown', 25), T0 + 24 * MIN, 'abandoned');
    save = closeSession(save, s, T0 + 24 * MIN);
    expect(balance(save)).toBe(0);
    expect(coins(save)).toBe(0);
    expect(minutesByDay(save).get('2026-10-22')).toBe(24 * MIN); // 時間仍記錄
  });

  it('重新載入時背景歸零的倒數只結算一次', () => {
    let save = fresh();
    save = putSession(save, session(save, 'countdown', 25));
    const a = settleOpenSessions(save, T0 + 60 * MIN);
    expect(a.completed?.accumulatedMs).toBe(25 * MIN);
    const b = settleOpenSessions(a.save, T0 + 61 * MIN);
    expect(b.completed).toBeNull();
    expect(balance(b.save)).toBe(25);
  });
});

describe('工程投入', () => {
  it('扣點為 min(輸入, 餘額, 剩餘需求)，完成後開放下一工程', () => {
    let save = focus(fresh(), need('fo_trail') + 7);
    const r = contribute(save, save.profile.id, 'fo_trail', 10_000, T0);
    expect(r.ok && r.spent).toBe(need('fo_trail'));
    if (!r.ok) return;
    save = r.save;
    expect(balance(save)).toBe(7);
    expect(r.completed?.id).toBe('fo_trail');
    expect(activeProject(save)?.id).toBe('fo_saplings');
    expect(save.islands[0].activeProjectId).toBe('fo_saplings');
  });
  it('拒絕負數、小數、NaN、0、已完成、前置未完成與無點數', () => {
    let save = focus(fresh(), 30);
    const uid = save.profile.id;
    for (const bad of [-1, 1.5, NaN, 0]) expect(contribute(save, uid, 'fo_trail', bad, T0).ok).toBe(false);
    expect(contribute(save, uid, 'fo_saplings', 5, T0).ok).toBe(false); // 前置未完成
    expect(contribute(save, uid, 'nope', 5, T0).ok).toBe(false);
    const r = contribute(save, uid, 'fo_trail', 'all', T0);
    if (!r.ok) throw new Error(r.error);
    save = r.save;
    expect(contribute(save, uid, 'fo_trail', 1, T0).ok).toBe(false); // 已完成
    expect(contribute(fresh(), fresh().profile.id, 'fo_trail', 1, T0).ok).toBe(false); // 沒點數
  });

  it('全部投入時不超過工程剩餘需求，工程只完成一次', () => {
    let save = focus(fresh(), 3);
    let r = contribute(save, save.profile.id, 'fo_trail', 'all', T0);
    if (!r.ok) throw new Error(r.error);
    expect(r.completed).toBeNull();
    save = focus(r.save, 30);
    r = contribute(save, save.profile.id, 'fo_trail', 'all', T0);
    if (!r.ok) throw new Error(r.error);
    expect(r.spent).toBe(need('fo_trail') - 3);
    expect(r.completed?.id).toBe('fo_trail');
    expect(balance(r.save)).toBe(33 - need('fo_trail'));
    expect(validateSave(r.save).ok).toBe(true);
  });

  it('跨過 25%／50%／75% 會回報，讓場景先有一點變化', () => {
    const quarter = Math.ceil(need('fo_saplings') / 4);
    let save = focus(fresh(), need('fo_trail') + need('fo_saplings'));
    save = (contribute(save, save.profile.id, 'fo_trail', 'all', T0) as { save: SaveFile }).save;
    const r1 = contribute(save, save.profile.id, 'fo_saplings', quarter - 1, T0);
    expect(r1.ok && r1.quarter).toBeNull();
    const r2 = contribute((r1 as { save: SaveFile }).save, save.profile.id, 'fo_saplings', 1, T0);
    expect(r2.ok && r2.quarter).toBe(25);
    expect(projectQuarter((r2 as { save: SaveFile }).save, 'fo_saplings')).toBe(0.25);
  });
  it('工程完成會解鎖對應的動物；目前只開放森林', () => {
    let save = focus(fresh(), need('fo_trail') + need('fo_saplings'));
    for (const id of ['fo_trail', 'fo_saplings']) {
      const r = contribute(save, save.profile.id, id, 'all', T0);
      if (!r.ok) throw new Error(r.error);
      save = r.save;
      expect(r.unlocked.map((a) => a.id)).toEqual([id === 'fo_trail' ? 'pangolin' : 'pitta']);
    }
    expect(animalUnlocked(save, animalDef('pangolin'))).toBe(true);
    expect(habitatOpen(save, 'forest')).toBe(true);
    expect(habitatOpen(save, 'wetland')).toBe(false);
  });
});

describe('統計與存檔', () => {
  it('今日時間包含完成與只保留紀錄，點數只看完成', () => {
    let save = focus(fresh(), 10);
    const s = finish(session(save, 'stopwatch', null, T0 + 20 * MIN), T0 + 27 * MIN, 'abandoned');
    save = closeSession(save, s, T0 + 27 * MIN);
    expect(minutesByDay(save).get('2026-10-22')).toBe(17 * MIN);
    expect(balance(save)).toBe(10);
  });

  it('驗證拒絕竄改、未知版本與在個人存檔出現的示範贈點', () => {
    const save = focus(fresh(), 10);
    expect(validateSave(save).ok).toBe(true);
    expect(validateSave({ ...save, schemaVersion: 2 }).ok).toBe(false);
    expect(validateSave('{').ok).toBe(false);
    const tampered = { ...save, transactions: save.transactions.map((t) => ({ ...t, amount: 999 })) };
    expect(validateSave(tampered).ok).toBe(false);
    const overspent = { ...save, projects: save.projects.map((p) => ({ ...p, contributedPoints: 3 })) };
    expect(validateSave(overspent).ok).toBe(false);
    expect(() => demoGrant(save, save.profile.id, 10, T0)).toThrow();
    const demo = newDemoSave(save, T0);
    expect(validateSave(demo).ok).toBe(true);
    expect(validateSave({ ...demo, mode: 'personal' }).ok).toBe(false);
  });

  it('示範存檔包含虛構成員貢獻且與個人存檔不共用 ID', () => {
    const save = fresh();
    const demo = newDemoSave(save, T0);
    expect(demo.mode).toBe('demo');
    expect(demo.memberships).toHaveLength(3);
    expect(demo.profile.activeIslandId).not.toBe(save.profile.activeIslandId);
    expect(activeProject(demo)?.id).toBe('fo_saplings');
    expect(balance(demo)).toBeGreaterThanOrEqual(remainingFor(demo, projectDef('fo_saplings')!)); // 示範玩家可以親手完成花圃
    expect(validateSave(demo).ok).toBe(true);
  });
});

describe('環境音收集', () => {
  it('開局只有森林微風；選了沒收集的聲音時改回跟著棲地', () => {
    const save = fresh();
    expect(SOUNDS.filter((x) => soundUnlocked(save, x.unlock)).map((x) => x.id)).toEqual(['breeze']);
    const picked = { ...save, settings: { ...save.settings, focusSound: 'frogs' } };
    expect(focusSoundFor(picked, 'forest')).toBe('breeze');
    const breeze = { ...save, settings: { ...save.settings, focusSound: 'breeze' } };
    expect(focusSoundFor(breeze, 'forest')).toBe('breeze');
  });
});

describe('開始後 10 秒內取消', () => {
  it('10 秒內取消不留紀錄；超過 10 秒不能取消', () => {
    const p = { taskTitle: '', tag: '讀書', habitatId: 'forest' as const, mode: 'countdown' as const, targetSeconds: 1500 };
    const save = startFocus(fresh(), p, T0);
    const id = save.sessions[0].id;
    expect(cancelSession(save, id, T0 + 9_000).sessions).toHaveLength(0);
    expect(cancelSession(save, id, T0 + 11_000).sessions).toHaveLength(1);
  });
});

describe('專注筆記', () => {
  it('結束後可以寫筆記、改標籤與標題；進行中不能改', () => {
    const p = { taskTitle: '', tag: '讀書', habitatId: 'forest' as const, mode: 'stopwatch' as const, targetSeconds: null };
    let save = startFocus(fresh(), p, T0);
    const id = save.sessions[0].id;
    expect(editSessionNote(save, id, { note: 'x', tag: '工作', taskTitle: '' })).toBe(save);
    save = closeSession(save, finish(save.sessions[0], T0 + 30 * MIN, 'completed'), T0 + 30 * MIN);
    save = editSessionNote(save, id, { note: '  完成爬山  ', tag: '工作', taskTitle: '' });
    expect([save.sessions[0].note, save.sessions[0].tag, save.sessions[0].taskTitle]).toEqual(['完成爬山', '工作', '一段專注']);
    expect(validateSave(save).ok).toBe(true);
  });
});

describe('專注時間 10～180 分鐘', () => {
  const base = { taskTitle: '', tag: '讀書', habitatId: 'forest' as const };
  it('倒數只能設 10～180 分鐘（示範存檔可用 10 秒）', () => {
    const save = fresh();
    expect(startFocus(save, { ...base, mode: 'countdown', targetSeconds: 5 * 60 }, T0).sessions).toHaveLength(0);
    expect(startFocus(save, { ...base, mode: 'countdown', targetSeconds: 181 * 60 }, T0).sessions).toHaveLength(0);
    expect(startFocus(save, { ...base, mode: 'countdown', targetSeconds: 10 * 60 }, T0).sessions).toHaveLength(1);
    expect(startFocus(save, { ...base, mode: 'countdown', targetSeconds: 180 * 60 }, T0).sessions).toHaveLength(1);
    expect(startFocus(save, { ...base, mode: 'countdown', targetSeconds: 10 }, T0).sessions).toHaveLength(0);
    expect(startFocus(newDemoSave(save, T0), { ...base, mode: 'countdown', targetSeconds: 10 }, T0).sessions.filter((x) => x.status === 'running')).toHaveLength(1);
  });

  it('正向計時滿 180 分鐘自動完成，記錄剛好 180 分鐘', () => {
    let save = startFocus(fresh(), { ...base, mode: 'stopwatch', targetSeconds: null }, T0);
    const r = settleOpenSessions(save, T0 + 300 * MIN);
    expect(r.completed?.accumulatedMs).toBe(180 * MIN);
    save = r.save;
    expect(balance(save)).toBe(180);
  });
});

describe('專注完成後自動投入', () => {
  it('點數自動投入工程（可連續完成），只執行一次', () => {
    let save = focus(fresh(), need('fo_trail'));
    save = applyFocusRewards(save, save.sessions[0].id, T0);
    expect(isDone(save, 'fo_trail')).toBe(true);
    expect(balance(save)).toBe(0);
    save = focus(save, 120, T0 + 200 * MIN);
    const id = save.sessions.at(-1)!.id;
    save = applyFocusRewards(save, id, T0 + 320 * MIN);
    const out = focusOutcome(save, id);
    expect(out.projects.map((p) => [p.def.id, p.points])).toEqual([['fo_saplings', 120]]);
    const again = applyFocusRewards(save, id, T0 + 321 * MIN);
    expect(again).toBe(save); // 不會重複
    expect(validateSave(save).ok).toBe(true);
  });
});

describe('深度專注', () => {
  it('通話當成暫停；離開太久從離開那一刻放棄；已經完成的照算完成', () => {
    const s0 = session(fresh(), 'countdown', 25);
    expect(dueAt(s0)).toBe(T0 + 25 * MIN);

    // 第 5～8 分鐘接電話：不計時，倒數順延 3 分鐘
    const called = applyDeepFocus(s0, { calls: [[T0 + 5 * MIN, T0 + 8 * MIN]], callStart: null, failedAt: null });
    expect(called.status).toBe('running');
    expect(dueAt(called)).toBe(T0 + 28 * MIN);
    expect(elapsedMs(called, T0 + 20 * MIN)).toBe(17 * MIN);

    // 通話還沒結束：停在暫停
    const ringing = applyDeepFocus(s0, { calls: [], callStart: T0 + 12 * MIN, failedAt: null });
    expect(ringing.status).toBe('paused');
    expect(ringing.accumulatedMs).toBe(12 * MIN);

    // 第 10 分鐘離開沒回來：放棄，只記到第 10 分鐘
    const left = applyDeepFocus(s0, { calls: [], callStart: null, failedAt: T0 + 10 * MIN });
    expect(left.status).toBe('abandoned');
    expect(left.accumulatedMs).toBe(10 * MIN);
    // 放棄之後才接的電話不會把時間加回來
    const leftThenCall = applyDeepFocus(s0, { calls: [[T0 + 15 * MIN, T0 + 20 * MIN]], callStart: null, failedAt: T0 + 10 * MIN });
    expect(leftThenCall.status).toBe('abandoned');
    expect(leftThenCall.accumulatedMs).toBe(10 * MIN);

    // 倒數已經在第 25 分鐘完成，之後才離開：仍然算完成
    const late = applyDeepFocus(s0, { calls: [], callStart: null, failedAt: T0 + 30 * MIN });
    expect(late.status).toBe('completed');
    expect(late.accumulatedMs).toBe(25 * MIN);

    // 通話後才離開：先順延再放棄
    const both = applyDeepFocus(s0, { calls: [[T0 + 5 * MIN, T0 + 8 * MIN]], callStart: null, failedAt: T0 + 20 * MIN });
    expect(both.status).toBe('abandoned');
    expect(both.accumulatedMs).toBe(17 * MIN);
  });
});

describe('存檔設定欄位', () => {
  it('新設定欄位型別不對時用預設值，不讓畫面當掉', () => {
    const raw = JSON.parse(JSON.stringify(fresh()));
    raw.settings.focusAllow = null;
    raw.settings.deepFocus = 'yes';
    delete raw.settings.eggId;
    const r = validateSave(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.settings.focusAllow).toEqual([]);
    expect(r.save.settings.deepFocus).toBe(true);
    expect(r.save.settings.eggId).toBe(ANIMALS[0].id);
  });
});

describe('第二輪審查修正', () => {

  it('午夜被日光節約時間跳過的時區不會卡住（智利 2026-09-06）', () => {
    const totals = addSegmentsByDay(new Map(), [{ startedAt: '2026-09-06T03:30:00Z', endedAt: '2026-09-06T04:30:00Z' }], 'America/Santiago');
    expect([...totals.values()].reduce((a, b) => a + b, 0)).toBe(60 * MIN);
    expect(totals.size).toBe(2);
  });
});

describe('族群成長（探索）', () => {
  /** 完成一次探索：遇見 animalId，專注 minutes 分鐘。 */
  const meet = (save: SaveFile, animalId: string, minutes: number, at: number) => {
    const started = startFocus(save, { taskTitle: '', tag: '讀書', habitatId: 'forest', mode: 'countdown', targetSeconds: minutes * 60, animalId }, at);
    const done = completeNow(started.sessions[started.sessions.length - 1], at + minutes * MIN, minutes);
    return applyFocusRewards(closeSession(started, done, at + minutes * MIN), done.id, at + minutes * MIN);
  };

  it('同一種遇見越多次越成熟：幼年 → 亞成年 → 成年；60 分鐘以上算 2 點；放棄不算', () => {
    let save = fresh();
    save = meet(save, 'blue_magpie', 25, T0); // 1
    expect(growthOf(save, 'blue_magpie')).toEqual({ growth: 1, stage: 0 });
    save = meet(save, 'blue_magpie', 60, T0 + 60 * MIN); // 3 → 亞成年
    const last = save.sessions[save.sessions.length - 1].id;
    expect(sightings(save).get(last)).toEqual({ stage: 1, growth: 3, grew: true });
    const quit = finish(session(save, 'countdown', 25, T0 + 200 * MIN), T0 + 210 * MIN, 'abandoned');
    save = closeSession(save, { ...quit, animalId: 'blue_magpie' }, T0 + 210 * MIN);
    expect(growthOf(save, 'blue_magpie').growth).toBe(3); // 被嚇跑不算
    for (let i = 0; i < GROWTH_AT[1] - 3; i++) save = meet(save, 'blue_magpie', 25, T0 + (300 + i * 40) * MIN);
    expect(growthOf(save, 'blue_magpie').stage).toBe(2);
    expect(sceneAnimals(save)[0].stage).toBe(2); // 場景裡的同種動物跟著長大
    expect(growthOf(save, 'scops_owl')).toEqual({ growth: 0, stage: 0 }); // 各物種分開算
    expect(stageName(animalDef('blue_magpie'), 0)).toBe('雛鳥');
    expect(stageName(animalDef('black_bear'), 2)).toBe('成獸');
    expect(validateSave(JSON.parse(JSON.stringify(save))).ok).toBe(true);
  });
});

describe('上週回顧', () => {
  const meet = (save: SaveFile, animalId: string, minutes: number, at: number) => {
    const started = startFocus(save, { taskTitle: '', tag: '讀書', habitatId: 'forest', mode: 'countdown', targetSeconds: minutes * 60, animalId }, at);
    const done = completeNow(started.sessions[started.sessions.length - 1], at + minutes * MIN, minutes);
    return applyFocusRewards(closeSession(started, done, at + minutes * MIN), done.id, at + minutes * MIN);
  };
  const DAY = 24 * 60 * MIN;

  it('每天時間、專注天數、最佳日、最常遇見、第一次遇見、和前一週比較', () => {
    // T0 = 2026-10-22（週四）台北 09:00；那週從 10/19 週一開始
    let save = fresh();
    save = meet(save, 'blue_magpie', 30, T0 - 7 * DAY); // 前一週
    save = meet(save, 'blue_magpie', 25, T0 - 2 * DAY); // 週二
    save = meet(save, 'pangolin', 60, T0); // 週四
    save = meet(save, 'pangolin', 40, T0 + 3 * 60 * MIN); // 週四
    const quit = finish(session(save, 'countdown', 25, T0 + DAY), T0 + DAY + 15 * MIN, 'abandoned'); // 週五放棄 15 分
    save = closeSession(save, { ...quit, animalId: 'scops_owl' }, T0 + DAY + 15 * MIN);
    save = meet(save, 'scops_owl', 25, T0 + 7 * DAY); // 下一週，不算

    const r = weekRecap(save, weekStartKey('2026-10-22'));
    expect(r.weekStart).toBe('2026-10-19');
    expect(r.days.map((ms) => ms / MIN)).toEqual([0, 25, 0, 100, 15, 0, 0]);
    expect(r.total).toBe(140 * MIN);
    expect(r.prevTotal).toBe(30 * MIN);
    expect(r.focusDays).toBe(3);
    expect(r.best).toBe(3); // 週四
    expect(r.top).toEqual({ id: 'pangolin', count: 2, ms: 100 * MIN });
    expect(r.species).toBe(2);
    expect(r.newSpecies).toBe(1); // 藍鵲前一週就遇過
    expect(weekRecap(save, '2026-09-07')).toMatchObject({ total: 0, best: -1, top: null });
  });

  it('玩家排名（假資料）：時間越多排名越前面，前幾 % 最少是 1', () => {
    expect(communityRank(0)).toEqual({ beat: 0, top: 100 });
    expect(communityRank(961 * MIN).top).toBe(20); // 和 Forest 錄影裡 961 分鐘差不多（前 19%）
    expect(communityRank(300 * MIN).beat).toBeGreaterThan(communityRank(120 * MIN).beat);
    expect(communityRank(99999 * MIN)).toEqual({ beat: 99, top: 1 });
  });
});

describe('挑戰與寶箱', () => {
  const meet = (save: SaveFile, minutes: number, at: number, note = '') => {
    const started = startFocus(save, { taskTitle: '', tag: '讀書', habitatId: 'forest', mode: 'countdown', targetSeconds: minutes * 60, animalId: 'blue_magpie' }, at);
    const done = completeNow(started.sessions[started.sessions.length - 1], at + minutes * MIN, minutes);
    let next = applyFocusRewards(closeSession(started, done, at + minutes * MIN), done.id, at + minutes * MIN);
    if (note) next = editSessionNote(next, done.id, { note, tag: '讀書', taskTitle: '' });
    return next;
  };

  it('每日挑戰只由日期決定：3 個不同種類，同一天每次都一樣', () => {
    const plan = questPlan('2026-10-22');
    expect(plan).toHaveLength(3);
    expect(new Set(plan.map((q) => q.kind)).size).toBe(3);
    expect(questPlan('2026-10-22')).toEqual(plan);
    expect(plan.every((q) => q.reward > 0 && q.target > 0)).toBe(true);
  });

  it('完成才能開寶箱、只能開一次；金幣入帳，存檔檢查通過', () => {
    let save = fresh();
    const day = '2026-10-22';
    expect(dailyQuests(save, day).every((q) => q.progress === 0 && !q.claimed)).toBe(true);
    const first = dailyQuests(save, day)[0];
    expect(claimQuest(save, first.key, T0).ok).toBe(false); // 還沒完成
    for (let i = 0; i < 3; i++) save = meet(save, 60, T0 + i * 70 * MIN, '筆記');
    const qs = dailyQuests(save, day);
    expect(qs.every((q) => q.progress >= q.target)).toBe(true); // 3 次 60 分鐘、都有筆記：每種挑戰都達成
    expect(hasReward(save, T0 + 300 * MIN)).toBe(true);
    const before = coins(save);
    let total = 0;
    for (const q of qs) {
      const r = claimQuest(save, q.key, T0 + 300 * MIN);
      if (!r.ok) throw new Error(r.error);
      save = r.save;
      total += r.coins;
    }
    expect(coins(save)).toBe(before + total);
    expect(claimQuest(save, qs[0].key, T0 + 300 * MIN).ok).toBe(false); // 不能重複開
    expect(claimQuest(save, qs[0].key.replace('2026-10-22', '2026-10-21'), T0 + 300 * MIN).ok).toBe(false); // 只能開今天的
    expect(monthQuest(save, '2026-10').progress).toBe(3);
    expect(dailyQuests(save, day).every((q) => q.claimed)).toBe(true);
    expect(validateSave(JSON.parse(JSON.stringify(save))).ok).toBe(true);
  });

  it('新手任務：三步都完成才能開，送商店第一條探索路線＋金幣', () => {
    let save = meet(fresh(), 30, T0);
    expect(starterQuest(save).ready).toBe(false); // 還沒寫筆記、還沒滿 60 分鐘
    save = meet(save, 30, T0 + 60 * MIN, '第一次的筆記');
    const st = starterQuest(save);
    expect(st.ready).toBe(true);
    expect(st.animal?.id).toBe('civet');
    const r = claimQuest(save, 'quest:starter', T0 + 120 * MIN);
    if (!r.ok) throw new Error(r.error);
    expect(r.coins).toBe(STARTER_REWARD);
    expect(animalUnlocked(r.save, animalDef('civet'))).toBe(true);
    expect(unlockAnimal(r.save, r.save.profile.id, 'civet', T0).ok).toBe(false); // 已經有了，不能再買
    expect(starterQuest(r.save).claimed).toBe(true);
    expect(validateSave(JSON.parse(JSON.stringify(r.save))).ok).toBe(true);
  });

  it('存檔檢查：只看格式與合理範圍（之後調整獎勵，舊存檔仍讀得到）', () => {
    const q = questPlan('2026-10-22')[1];
    expect(questRewardOk(q.key, q.reward)).toBe(true);
    expect(questRewardOk(q.key, q.reward + 7)).toBe(true); // 獎勵改過也接受
    expect(questRewardOk(q.key, 0)).toBe(false);
    expect(questRewardOk(q.key, 999999)).toBe(false);
    expect(questRewardOk('quest:month:2026-10', MONTH_REWARD)).toBe(true);
    expect(questRewardOk('quest:starter', STARTER_REWARD, 'civet')).toBe(true);
    expect(questRewardOk('quest:starter', STARTER_REWARD, 'no_such_animal')).toBe(false);
    expect(questRewardOk('quest:2026-10-22:5', 10)).toBe(false);
  });
});

describe('推薦意願問卷', () => {
  it('完成 5 次、用滿 3 天才問；略過隔 30 天、送出隔 120 天', () => {
    const DAY = 86_400_000;
    let save = fresh();
    for (let i = 0; i < 5; i++) save = focus(save, 25, T0 + i * 40 * MIN);
    const none = { askedAt: null, answeredAt: null };
    expect(npsDue(save, none, T0 + DAY)).toBe(false); // 還不到 3 天
    expect(npsDue(focus(fresh(), 25), none, T0 + 10 * DAY)).toBe(false); // 才完成 1 次
    const now = T0 + 4 * DAY;
    expect(npsDue(save, none, now)).toBe(true);
    expect(npsDue(save, { askedAt: now, answeredAt: null }, now + 29 * DAY)).toBe(false);
    expect(npsDue(save, { askedAt: now, answeredAt: null }, now + 30 * DAY)).toBe(true);
    expect(npsDue(save, { askedAt: now, answeredAt: now + 1000 }, now + 60 * DAY)).toBe(false);
    expect(npsDue(save, { askedAt: now, answeredAt: now + 1000 }, now + 120 * DAY)).toBe(true);
  });
});

describe('孵化動物', () => {
  it('開始時記下要孵的蛋；沒解鎖的蛋改用預設；完成才算孵出，放棄的蛋不算', () => {
    let save = startFocus(fresh(), { taskTitle: '', tag: '讀書', habitatId: 'forest', mode: 'countdown', targetSeconds: 25 * 60, animalId: 'black_bear' }, T0);
    expect(save.sessions[0].animalId).toBe(ANIMALS[0].id); // 黑熊還沒解鎖
    save = { ...save, sessions: [] };
    save = startFocus(save, { taskTitle: '', tag: '讀書', habitatId: 'forest', mode: 'countdown', targetSeconds: 25 * 60, animalId: 'scops_owl' }, T0);
    expect(save.settings.eggId).toBe('scops_owl');
    const done = completeNow(save.sessions[0], T0 + 2 * MIN, 25);
    save = applyFocusRewards(closeSession(save, done, T0 + 2 * MIN), done.id, T0 + 2 * MIN);
    expect(hatchCounts(save).get('scops_owl')).toBe(1);
    expect(isDone(save, 'fo_trail')).toBe(true);
    expect(newAnimals(save).map((a) => a.id)).toEqual(['pangolin']); // 步道修好解鎖穿山甲，還沒孵過
    const quit = finish(session(save, 'countdown', 25, T0 + 60 * MIN), T0 + 70 * MIN, 'abandoned');
    save = closeSession(save, quit, T0 + 70 * MIN);
    expect(endedSessions(save)).toHaveLength(2);
    expect([...hatchCounts(save).values()].reduce((a, b) => a + b, 0)).toBe(1);
    expect(sceneAnimals(save)).toEqual([{ id: done.id, animalId: 'scops_owl', stage: 0 }]); // 第一次遇見：幼年
    expect(validateSave(JSON.parse(JSON.stringify(save))).ok).toBe(true);
  });

  it('商店：金幣解鎖動物只扣一次；真錢品種不能用金幣解鎖', () => {
    let save = focus(fresh(), 900);
    const civet = animalDef('civet');
    expect(animalUnlocked(save, civet)).toBe(false);
    const r = unlockAnimal(save, save.profile.id, 'civet', T0 + 1000 * MIN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    save = r.save;
    expect(coins(save)).toBe(900 - 800);
    expect(animalUnlocked(save, civet)).toBe(true);
    expect(unlockAnimal(save, save.profile.id, 'civet', T0).ok).toBe(false);
    expect(unlockAnimal(save, save.profile.id, 'clouded_leopard', T0).ok).toBe(false);
    expect(animalUnlocked(save, animalDef('clouded_leopard'))).toBe(false);
    expect(validateSave(JSON.parse(JSON.stringify(save))).ok).toBe(true);
    const tampered = JSON.parse(JSON.stringify(save));
    tampered.transactions.find((t: { kind: string }) => t.kind === 'animal_unlock').animalId = 'dragon';
    expect(validateSave(tampered).ok).toBe(false);
  });

  it('之後調整工程點數或價格，舊存檔仍讀得到（已完成的維持完成，達到新門檻的補記完成）', () => {
    let save = startFocus(fresh(), { taskTitle: '', tag: '讀書', habitatId: 'forest', mode: 'countdown', targetSeconds: 25 * 60 }, T0);
    const done = completeNow(save.sessions[0], T0 + MIN, 25);
    save = applyFocusRewards(closeSession(save, done, T0 + MIN), done.id, T0 + MIN);
    const base = JSON.parse(JSON.stringify(save));
    const row = base.projects.find((r: { projectId: string }) => r.projectId === 'fo_trail');
    row.completedAt = null; // 模擬「門檻調低後，投入已經夠了但當時還沒完成」
    const r = validateSave(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.save.projects.find((x) => x.projectId === 'fo_trail')!.completedAt).not.toBeNull();
    const nulls = JSON.parse(JSON.stringify(save));
    nulls.sessions.push(null);
    expect(validateSave(nulls).ok).toBe(false); // 格式壞掉回報錯誤，不會當掉
  });

  it('預設的蛋還沒解鎖（例如從示範帶來）就用第一種', () => {
    const save = { ...fresh(), settings: { ...fresh().settings, eggId: 'serow' } };
    expect(chosenAnimal(save).id).toBe(ANIMALS[0].id);
  });
});

describe('舊存檔轉換（溫室／溪流、植物、寵物 → 陸地森林）', () => {
  it('專注紀錄與獲得保留、花在寵物設施的金幣退回、點數重新投入森林工程', () => {
    const save = focus(fresh(), 400);
    const old = JSON.parse(JSON.stringify(save));
    delete old.content;
    old.pacing = 2;
    old.sessions = old.sessions.map((s: Record<string, unknown>) => ({ ...s, habitatId: 'greenhouse', plantId: 'daisy' }));
    old.settings.plantId = 'tulip';
    old.settings.companionPetId = 'x';
    old.settings.preferredHabitatId = 'stream';
    old.pets = [{ id: 'p1', islandId: old.profile.activeIslandId, typeId: 'pet_butterfly', habitatId: 'greenhouse', adoptedBy: old.profile.id, adoptedAt: old.savedAt, source: 'buy', faceOverride: null }];
    old.discoveries = [{ islandId: old.profile.activeIslandId, speciesId: 'bee', discoveredAt: old.savedAt, triggeredByProjectId: 'gh_flowers' }];
    old.transactions.push({ id: 't1', userId: old.profile.id, islandId: old.profile.activeIslandId, kind: 'pet_adopt', amount: -300, petId: 'p1', idempotencyKey: 'pet:p1', createdAt: old.savedAt });
    old.transactions.push({ id: 't2', userId: old.profile.id, islandId: old.profile.activeIslandId, kind: 'feed_reward', amount: 80, sessionId: old.sessions[0].id, idempotencyKey: 'feed:x', createdAt: old.savedAt });
    old.projects = [{ islandId: old.profile.activeIslandId, projectId: 'gh_entrance', contributedPoints: 0, completedAt: null }];
    const r = validateSave(old, T0 + 600 * MIN);
    expect(r.ok ? 'ok' : r.error).toBe('ok');
    if (!r.ok) return;
    const s = r.save;
    expect(s.content).toBe(CONTENT_VERSION);
    expect(s.sessions.every((x) => x.habitatId === 'forest' && !('plantId' in x))).toBe(true);
    expect(coins(s)).toBe(400); // 買寵物的 300 退回
    expect(balance(s)).toBe(0); // 點數全部投入森林工程
    expect(isDone(s, 'fo_trail')).toBe(true);
    expect(s.projects.find((p) => p.projectId === 'fo_saplings')?.contributedPoints).toBe(390); // 400 分鐘：步道 10，其餘投入樹苗
    expect(s.settings.eggId).toBe(ANIMALS[0].id);
    expect(s.settings.preferredHabitatId).toBe('forest');
    expect('pets' in s || 'discoveries' in s).toBe(false);
    expect(validateSave(JSON.parse(JSON.stringify(s))).ok).toBe(true); // 轉換後再存再讀也正常
  });
});

describe('商店與寶石', () => {
  it('每日精選 6 個、寶石 2～3 個；寶石換金幣；寶石不足不能買；存檔檢查通過', () => {
    let save = focus(fresh(), 600);
    const { picks } = dailyPicks(save, T0);
    expect(picks).toHaveLength(6);
    const nGem = picks.filter((it) => 'gems' in it.price).length;
    expect(nGem).toBeGreaterThanOrEqual(2);
    expect(nGem).toBeLessThanOrEqual(3);
    const gemItem = picks.find((it) => 'gems' in it.price)!;
    expect(buyItem(save, gemItem.id, T0).ok).toBe(false);
    // 寶箱送的寶石（示範用 key 不行，用本月挑戰的 key）
    save = { ...save, transactions: [...save.transactions, { id: 'g', userId: save.profile.id, islandId: save.profile.activeIslandId, kind: 'gem_grant', amount: 120, idempotencyKey: 'quest:month:2026-10:gems', createdAt: new Date(T0).toISOString() }] };
    const ex = exchangeCoins(save, 'bag', T0);
    expect(ex.ok).toBe(true);
    if (!ex.ok) return;
    expect(gems(ex.save)).toBe(70);
    const bought = buyItem(ex.save, gemItem.id, T0);
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(validateSave(JSON.parse(JSON.stringify(bought.save)), T0).ok).toBe(true);
  });
});
