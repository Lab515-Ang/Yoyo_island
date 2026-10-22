import { describe, expect, it } from 'vitest';
import { createSession, elapsedMs, finish, pause, resume, settle, addSegmentsByDay, weekStartKey } from './focus';
import { balance, closeSession, coins, contribute, grantReward, settleOpenSessions, minutesByDay, activeProject, habitatOpen, putSession, feed, feedFor, adoptPet, feedPet, petFed, adoptedPets, fedByUser, sessionRoll, chanceFor, chanceFind, soundUnlocked, focusSoundFor } from './game';
import { SOUNDS } from '../content/config';
import { newSave, newDemoSave, validateSave, demoGrant } from './save';
import type { SaveFile } from './types';

const T0 = Date.parse('2026-10-22T01:00:00Z');
const MIN = 60_000;

function fresh(): SaveFile {
  return newSave('personal', { nickname: '測試', islandName: '測試島', avatarId: 'leaf', timezone: 'Asia/Taipei' }, T0);
}
/** 一般測試用不會觸發偶遇的 session id，結果才穩定 */
function quietId() {
  for (;;) {
    const id = crypto.randomUUID();
    if (sessionRoll(id) >= 0.3) return id;
  }
}
function session(save: SaveFile, mode: 'countdown' | 'stopwatch', targetMin: number | null, now = T0, id = quietId()) {
  return createSession({ id, userId: save.profile.id, islandId: save.profile.activeIslandId, taskTitle: '', tag: '讀書', habitatId: 'greenhouse', mode, targetSeconds: targetMin && targetMin * 60 }, now);
}
/** 用一段 n 分鐘完成的專注給玩家點數 */
function focus(save: SaveFile, minutes: number, at = T0) {
  const s = finish(session(save, 'stopwatch', null, at), at + minutes * MIN, 'completed');
  return closeSession(save, s, at + minutes * MIN);
}

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
    let s = createSession({ id: 'x', userId: 'u', islandId: 'i', taskTitle: '', tag: '', habitatId: 'greenhouse', mode: 'stopwatch', targetSeconds: null }, start);
    s = pause(s, start + 10 * MIN);
    s = resume(s, start + 30 * MIN);
    s = finish(s, start + 40 * MIN, 'completed');
    const days = addSegmentsByDay(new Map(), s.segments, 'Asia/Taipei');
    expect(days.get('2026-10-22')).toBe(10 * MIN);
    expect(days.get('2026-10-23')).toBe(10 * MIN);
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
    expect(save.transactions).toHaveLength(3); // 點數、金幣、飼料各一筆
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
    let save = focus(fresh(), 12);
    const r = contribute(save, save.profile.id, 'gh_entrance', 100, T0);
    expect(r.ok && r.spent).toBe(5);
    if (!r.ok) return;
    save = r.save;
    expect(balance(save)).toBe(7);
    expect(r.completed?.id).toBe('gh_entrance');
    expect(activeProject(save)?.id).toBe('gh_flowers');
    expect(save.islands[0].activeProjectId).toBe('gh_flowers');
  });

  it('拒絕負數、小數、NaN、0、已完成、前置未完成與無點數', () => {
    let save = focus(fresh(), 30);
    const uid = save.profile.id;
    for (const bad of [-1, 1.5, NaN, 0]) expect(contribute(save, uid, 'gh_entrance', bad, T0).ok).toBe(false);
    expect(contribute(save, uid, 'gh_flowers', 5, T0).ok).toBe(false); // 前置未完成
    expect(contribute(save, uid, 'nope', 5, T0).ok).toBe(false);
    const r = contribute(save, uid, 'gh_entrance', 'all', T0);
    if (!r.ok) throw new Error(r.error);
    save = r.save;
    expect(contribute(save, uid, 'gh_entrance', 1, T0).ok).toBe(false); // 已完成
    expect(contribute(fresh(), fresh().profile.id, 'gh_entrance', 1, T0).ok).toBe(false); // 沒點數
  });

  it('全部投入時不超過工程剩餘需求，工程只完成一次', () => {
    let save = focus(fresh(), 3);
    let r = contribute(save, save.profile.id, 'gh_entrance', 'all', T0);
    if (!r.ok) throw new Error(r.error);
    expect(r.completed).toBeNull();
    save = focus(r.save, 10);
    r = contribute(save, save.profile.id, 'gh_entrance', 'all', T0);
    if (!r.ok) throw new Error(r.error);
    expect(r.spent).toBe(2);
    expect(r.completed?.id).toBe('gh_entrance');
    expect(balance(r.save)).toBe(8); // 3 + 10 - 5
    expect(validateSave(r.save).ok).toBe(true);
  });

  it('工程完成會開放對應的寵物領養；工程完成不會自動把生物收進圖鑑；溪流需先打開步道', () => {
    let save = focus(fresh(), 40);
    for (const id of ['gh_entrance', 'gh_flowers']) {
      const r = contribute(save, save.profile.id, id, 'all', T0);
      if (!r.ok) throw new Error(r.error);
      save = r.save;
      if (id === 'gh_flowers') expect(r.unlocked.map((p) => p.id)).toEqual(['pet_butterfly']);
    }
    expect(save.discoveries).toHaveLength(0);
    expect(habitatOpen(save, 'stream')).toBe(false);
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
    expect(activeProject(demo)?.id).toBe('gh_flowers');
    expect(balance(demo)).toBe(10);
    expect(coins(demo)).toBe(40);
  });
});

describe('寵物', () => {
  /** 讓存檔完成到花圃（黃蝶可領養） */
  function withFlowers(minutes = 120) {
    let save = focus(fresh(), minutes);
    for (const id of ['gh_entrance', 'gh_flowers']) {
      const r = contribute(save, save.profile.id, id, 'all', T0);
      if (!r.ok) throw new Error(r.error);
      save = r.save;
    }
    return save;
  }

  it('飼料：每 5 分鐘 1 份，倒數每 25 分鐘再加 1；放棄沒有飼料', () => {
    const save = fresh();
    const cd = (min: number, status: 'completed' | 'abandoned') => finish(session(save, 'countdown', 60), T0 + min * MIN, status);
    expect(feedFor(cd(25, 'completed'))).toBe(6);
    expect(feedFor(cd(4, 'completed'))).toBe(0);
    expect(feedFor(finish(session(save, 'stopwatch', null), T0 + 25 * MIN, 'completed'))).toBe(5);
    expect(feedFor(cd(50, 'abandoned'))).toBe(0);
    const done = closeSession(save, cd(25, 'completed'), T0 + 25 * MIN);
    expect(feed(done)).toBe(6);
    expect(feed(grantReward(done, done.sessions[0].id, T0))).toBe(6); // 不重複發
  });

  it('領養需要棲地工程與金幣，每種只能領養一次', () => {
    const uid = fresh().profile.id;
    expect(adoptPet(focus(fresh(), 60), uid, 'pet_butterfly', T0).ok).toBe(false); // 花圃未完成
    let save = withFlowers();
    expect(adoptPet(save, save.profile.id, 'pet_frog', T0).ok).toBe(false); // 溪流未開
    const r = adoptPet(save, save.profile.id, 'pet_butterfly', T0);
    if (!r.ok) throw new Error(r.error);
    save = r.save;
    expect(coins(save)).toBe(90); // 120 - 30
    expect(adoptPet(save, save.profile.id, 'pet_butterfly', T0).ok).toBe(false);
    expect(adoptedPets(save).map((p) => p.stage)).toEqual([0]);
    expect(validateSave(save).ok).toBe(true);
  });

  it('餵食：用量不超過存量與成體所需，跨過門檻會長大，長大後不能再餵', () => {
    let save = withFlowers(); // 120 分鐘碼表 → 24 份飼料
    const uid = save.profile.id;
    expect(feedPet(save, uid, 'pet_butterfly', 5, T0).ok).toBe(false); // 還沒領養
    const a = adoptPet(save, uid, 'pet_butterfly', T0);
    if (!a.ok) throw new Error(a.error);
    save = a.save;
    for (const bad of [0, -1, 1.5]) expect(feedPet(save, uid, 'pet_butterfly', bad, T0).ok).toBe(false);
    let r = feedPet(save, uid, 'pet_butterfly', 12, T0);
    if (!r.ok) throw new Error(r.error);
    expect([r.from, r.to]).toEqual([0, 1]); // 卵 → 毛毛蟲
    save = r.save;
    save = focus(save, 300, T0 + 600 * MIN); // +60 份
    r = feedPet(save, uid, 'pet_butterfly', 'all', T0);
    if (!r.ok) throw new Error(r.error);
    expect(r.spent).toBe(48); // 只餵到成體門檻 60
    expect(r.to).toBe(3);
    save = r.save;
    expect(petFed(save, 'pet_butterfly')).toBe(60);
    expect(feedPet(save, uid, 'pet_butterfly', 1, T0).ok).toBe(false);
    expect(fedByUser(save, 'pet_butterfly').get(uid)).toBe(60);
    expect(validateSave(save).ok).toBe(true);
    const overfed = { ...save, transactions: save.transactions.map((t) => (t.kind === 'feed_spend' ? { ...t, amount: t.amount * 3 } : t)) };
    expect(validateSave(overfed).ok).toBe(false);
  });
});

describe('偶遇生物', () => {
  const lucky = () => {
    for (;;) {
      const id = crypto.randomUUID();
      if (sessionRoll(id) < 0.05) return id;
    }
  };

  it('機率：未滿 10 分鐘與放棄都是 0，25 分鐘 10%，上限 25%', () => {
    const save = fresh();
    const at = (min: number, status: 'completed' | 'abandoned' = 'completed') => chanceFor(finish(session(save, 'stopwatch', null), T0 + min * MIN, status));
    expect(at(9)).toBe(0);
    expect(at(25)).toBeCloseTo(0.1);
    expect(at(120)).toBe(0.25);
    expect(at(60, 'abandoned')).toBe(0);
  });

  it('骰中時收進圖鑑，同一段專注重複結算不會再抽', () => {
    let save = fresh();
    const s = finish(session(save, 'stopwatch', null, T0, lucky()), T0 + 30 * MIN, 'completed');
    save = closeSession(save, s, T0 + 30 * MIN);
    const found = chanceFind(save, s.id);
    expect(found).not.toBeNull();
    expect(save.discoveries).toHaveLength(1);
    expect(closeSession(save, s, T0 + 31 * MIN).discoveries).toHaveLength(1);
    expect(validateSave(save).ok).toBe(true);
  });

  it('太短的專注就算骰值很小也不會偶遇', () => {
    const save = fresh();
    const s = finish(session(save, 'stopwatch', null, T0, lucky()), T0 + 5 * MIN, 'completed');
    expect(closeSession(save, s, T0 + 5 * MIN).discoveries).toHaveLength(0);
  });
});

describe('環境音收集', () => {
  it('開局只有溫室微風；選了沒收集的聲音時改回跟著棲地', () => {
    const save = fresh();
    expect(SOUNDS.filter((x) => soundUnlocked(save, x.unlock)).map((x) => x.id)).toEqual(['breeze']);
    const picked = { ...save, settings: { ...save.settings, focusSound: 'frogs' } };
    expect(focusSoundFor(picked, 'greenhouse')).toBe('breeze');
    const breeze = { ...save, settings: { ...save.settings, focusSound: 'breeze' } };
    expect(focusSoundFor(breeze, 'greenhouse')).toBe('breeze');
  });
});
