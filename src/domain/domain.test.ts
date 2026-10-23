import { describe, expect, it } from 'vitest';
import { completeNow, createSession, elapsedMs, finish, pause, resume, settle, addSegmentsByDay, weekStartKey } from './focus';
import { balance, closeSession, coins, contribute, grantReward, settleOpenSessions, minutesByDay, activeProject, habitatOpen, putSession, feed, feedFor, adoptPet, feedPet, adoptedPets, fedByUser, buyEgg, buyFacility, eggOdds, grantStarter, habitatSlots, naturalFace, setFace, starterGiftDue, sessionRoll, chanceFor, chanceFind, soundUnlocked, focusSoundFor, cancelSession, startFocus, editSessionNote, isDone, projectQuarter, remainingFor, applyFocusRewards, focusOutcome, companionPet, chosenPlant, plantUnlocked, plantedSessions } from './game';
import { CHANCE, EGG_PRICE, PACING_VERSION, PLANTS, SOUNDS, petDef, plantTier, projectDef } from '../content/config';
import { newSave, newDemoSave, validateSave, demoGrant } from './save';
import type { SaveFile } from './types';

const T0 = Date.parse('2026-10-22T01:00:00Z');
const MIN = 60_000;

/** 工程需要的點數（從設定讀，調整數值時測試不用跟著改） */
const need = (id: string) => projectDef(id)!.requiredPoints;

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
/** 用 n 分鐘完成的專注給玩家點數（超過 180 分鐘就拆成好幾段，因為單段上限 180 分鐘） */
function focus(save: SaveFile, minutes: number, at = T0): SaveFile {
  const chunk = Math.min(minutes, 180);
  const s = finish(session(save, 'stopwatch', null, at), at + chunk * MIN, 'completed');
  const next = closeSession(save, s, at + chunk * MIN);
  return minutes > chunk ? focus(next, minutes - chunk, at + (chunk + 1) * MIN) : next;
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
    let save = focus(fresh(), need('gh_entrance') + 7);
    const r = contribute(save, save.profile.id, 'gh_entrance', 10_000, T0);
    expect(r.ok && r.spent).toBe(need('gh_entrance'));
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
    save = focus(r.save, 30);
    r = contribute(save, save.profile.id, 'gh_entrance', 'all', T0);
    if (!r.ok) throw new Error(r.error);
    expect(r.spent).toBe(need('gh_entrance') - 3);
    expect(r.completed?.id).toBe('gh_entrance');
    expect(balance(r.save)).toBe(33 - need('gh_entrance'));
    expect(validateSave(r.save).ok).toBe(true);
  });

  it('跨過 25%／50%／75% 會回報，讓場景先有一點變化', () => {
    const quarter = Math.ceil(need('gh_flowers') / 4);
    let save = focus(fresh(), need('gh_entrance') + need('gh_flowers'));
    save = (contribute(save, save.profile.id, 'gh_entrance', 'all', T0) as { save: SaveFile }).save;
    const r1 = contribute(save, save.profile.id, 'gh_flowers', quarter - 1, T0);
    expect(r1.ok && r1.quarter).toBeNull();
    const r2 = contribute((r1 as { save: SaveFile }).save, save.profile.id, 'gh_flowers', 1, T0);
    expect(r2.ok && r2.quarter).toBe(25);
    expect(projectQuarter((r2 as { save: SaveFile }).save, 'gh_flowers')).toBe(0.25);
  });
  it('工程完成會開放對應的寵物領養；工程完成不會自動把生物收進圖鑑；溪流需先打開步道', () => {
    let save = focus(fresh(), need('gh_entrance') + need('gh_flowers'));
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
    expect(balance(demo)).toBeGreaterThanOrEqual(remainingFor(demo, projectDef('gh_flowers')!)); // 示範玩家可以親手完成花圃
    expect(validateSave(demo).ok).toBe(true);
  });
});

describe('寵物', () => {
  /** 完成到花圃（黃蝶可取得）；extra 是修完花圃後另外多專注的分鐘（決定金幣與飼料） */
  function withFlowers(extra = 600) {
    let save = focus(fresh(), need('gh_entrance') + need('gh_flowers') + extra);
    for (const id of ['gh_entrance', 'gh_flowers']) {
      const r = contribute(save, save.profile.id, id, 'all', T0);
      if (!r.ok) throw new Error(r.error);
      save = r.save;
    }
    return save;
  }
  const ok = <T extends { ok: boolean }>(r: T) => {
    if (!r.ok) throw new Error((r as unknown as { error: string }).error);
    return r as Extract<T, { ok: true }>;
  };

  it('飼料：每 5 分鐘 1 份，倒數每 25 分鐘再加 1；放棄沒有飼料', () => {
    const save = fresh();
    const cd = (min: number, status: 'completed' | 'abandoned') => finish(session(save, 'countdown', 60), T0 + min * MIN, status);
    expect(feedFor(cd(25, 'completed'))).toBe(6);
    expect(feedFor(cd(4, 'completed'))).toBe(0);
    expect(feedFor(finish(session(save, 'stopwatch', null), T0 + 25 * MIN, 'completed'))).toBe(5);
    expect(feedFor(cd(50, 'abandoned'))).toBe(0);
    const done = closeSession(save, cd(25, 'completed'), T0 + 25 * MIN);
    expect(feed(done)).toBe(6);
    expect(feed(grantReward(done, done.sessions[0].id, T0))).toBe(6);
  });

  it('新手禮物：完成第一個工程後送一顆黃蝶的卵，只送一次', () => {
    let save = focus(fresh(), 10);
    expect(starterGiftDue(save)).toBe(false);
    save = ok(contribute(save, save.profile.id, 'gh_entrance', 'all', T0)).save;
    expect(starterGiftDue(save)).toBe(true);
    save = ok(grantStarter(save, T0)).save;
    expect(adoptedPets(save).map((p) => [p.def.id, p.pet.source, p.stage])).toEqual([['pet_butterfly', 'gift', 0]]);
    expect(grantStarter(save, T0).ok).toBe(false);
    expect(validateSave(save).ok).toBe(true);
  });

  it('名額：每個場景先 1 隻，設施 +1，最多 5 隻；同種可以養多隻', () => {
    let save = withFlowers(20_000); // 金幣充足
    const uid = save.profile.id;
    expect(habitatSlots(save, 'greenhouse')).toBe(1);
    expect(habitatSlots(save, 'stream')).toBe(0); // 溪流未開
    save = ok(adoptPet(save, uid, 'pet_butterfly', T0)).save;
    expect(adoptPet(save, uid, 'pet_butterfly', T0).ok).toBe(false); // 名額已滿
    for (const f of ['gh_trellis', 'gh_nestbox', 'gh_basket', 'gh_planter']) save = ok(buyFacility(save, uid, f, T0)).save;
    expect(buyFacility(save, uid, 'gh_trellis', T0).ok).toBe(false); // 每種設施一個
    expect(buyFacility(save, uid, 'st_pond', T0).ok).toBe(false); // 溪流未開
    expect(habitatSlots(save, 'greenhouse')).toBe(5);
    for (let i = 0; i < 4; i++) save = ok(adoptPet(save, uid, 'pet_butterfly', T0)).save;
    expect(adoptedPets(save, 'greenhouse')).toHaveLength(5);
    expect(adoptPet(save, uid, 'pet_butterfly', T0).ok).toBe(false); // 最多 5 隻
    expect(adoptPet(save, uid, 'pet_frog', T0).ok).toBe(false); // 溪流未開
    expect(validateSave(save).ok).toBe(true);
  });
  it('驚喜蛋：只孵出可取得的種類，優先還沒養過的', () => {
    let save = withFlowers(need('gh_fountain') + need('gh_plants') + 2000);
    const uid = save.profile.id;
    expect(eggOdds(save, 'greenhouse').map((o) => o.def.id)).toEqual(['pet_butterfly']); // 綠繡眼還要葉叢工程
    save = ok(buyFacility(save, uid, 'gh_trellis', T0)).save;
    save = ok(contribute(save, uid, 'gh_fountain', 'all', T0)).save;
    save = ok(contribute(save, uid, 'gh_plants', 'all', T0)).save;
    save = ok(adoptPet(save, uid, 'pet_butterfly', T0)).save;
    expect(eggOdds(save, 'greenhouse').map((o) => o.def.id)).toEqual(['pet_whiteeye']); // 黃蝶已經養過
    const r = ok(buyEgg(save, uid, 'greenhouse', T0, 0.99));
    expect(r.pet.typeId).toBe('pet_whiteeye');
    expect(coins(r.save)).toBe(coins(save) - EGG_PRICE.greenhouse!);
    expect(buyEgg(r.save, uid, 'greenhouse', T0).ok).toBe(false); // 名額已滿
    expect(validateSave(r.save).ok).toBe(true);
  });
  it('餵食長大、表情孵化時固定、成體才能換表情', () => {
    const def = petDef('pet_butterfly')!;
    const max = def.thresholds[2];
    let save = withFlowers();
    const uid = save.profile.id;
    const r = ok(adoptPet(save, uid, 'pet_butterfly', T0));
    save = r.save;
    const id = r.pet.id;
    for (const bad of [0, -1, 1.5]) expect(feedPet(save, uid, id, bad, T0).ok).toBe(false);
    const face = adoptedPets(save)[0].face;
    expect(naturalFace(id)).toBe(face); // 同一隻永遠同一個表情
    expect(setFace(save, id, 2).ok).toBe(false); // 還沒長大
    let f = ok(feedPet(save, uid, id, def.thresholds[0], T0));
    expect([f.from, f.to]).toEqual([0, 1]);
    expect(adoptedPets(f.save)[0].grow).toBe(0); // 剛進入新階段
    save = focus(f.save, 6000, T0 + 6000 * MIN);
    f = ok(feedPet(save, uid, id, 'all', T0));
    expect(f.spent).toBe(max - def.thresholds[0]); // 只餵到成體
    expect(f.to).toBe(3);
    save = ok(setFace(f.save, id, 4)).save;
    expect(adoptedPets(save)[0].face).toBe(4);
    expect(setFace(save, id, 6).ok).toBe(false);
    expect(fedByUser(save, id).get(uid)).toBe(max);
    expect(validateSave(save).ok).toBe(true);
    const overfed = { ...save, transactions: save.transactions.map((t) => (t.kind === 'feed_spend' ? { ...t, amount: t.amount * 3 } : t)) };
    expect(validateSave(overfed).ok).toBe(false);
  });
  it('舊存檔（以種類記帳、沒有寵物個體）載入時自動轉換', () => {
    let save = withFlowers();
    const r = ok(adoptPet(save, save.profile.id, 'pet_butterfly', T0));
    save = ok(feedPet(r.save, save.profile.id, r.pet.id, 5, T0)).save;
    // 模擬舊格式：沒有 pets、交易只有 petTypeId、領養 key 以種類命名
    const legacy = {
      ...save,
      pets: undefined,
      transactions: save.transactions.map((t) =>
        t.kind === 'pet_adopt' ? { ...t, petId: undefined, idempotencyKey: `pet:${t.islandId}:pet_butterfly` } : t.kind === 'feed_spend' ? { ...t, petId: undefined } : t,
      ),
    };
    const v = validateSave(legacy);
    if (!v.ok) throw new Error(v.error);
    expect(v.save.pets.map((p) => p.id)).toEqual(['legacy-pet_butterfly']);
    expect(adoptedPets(v.save)[0].fed).toBe(5);
  });

  it('舊節奏存檔：已完成的工程維持完成，寵物成長按比例換算不倒退', () => {
    let save = withFlowers();
    const r = ok(adoptPet(save, save.profile.id, 'pet_butterfly', T0));
    save = ok(feedPet(r.save, save.profile.id, r.pet.id, 60, T0)).save; // 舊節奏常見寵物 60 份就是成體
    // 模擬舊節奏：入口只投入 5 點就完成、沒有節奏版本
    const old = {
      ...save,
      pacing: undefined,
      pets: save.pets.map((p) => ({ ...p, bonusFed: undefined })),
      projects: save.projects.map((p) => (p.projectId === 'gh_entrance' ? { ...p, contributedPoints: 5 } : p)),
      contributions: save.contributions.map((c) => (c.projectId === 'gh_entrance' ? { ...c, points: 5 } : c)),
      transactions: save.transactions.map((t) => (t.kind === 'project_spend' && save.contributions.find((c) => c.id === t.contributionId)?.projectId === 'gh_entrance' ? { ...t, amount: -5 } : t)),
    };
    const v = validateSave(old);
    if (!v.ok) throw new Error(v.error);
    expect(isDone(v.save, 'gh_entrance')).toBe(true);
    expect(adoptedPets(v.save)[0].stage).toBe(3); // 原本是成體，換算後仍是成體
    expect(v.save.pacing).toBe(PACING_VERSION);
  });
});

describe('偶遇生物', () => {
  const lucky = () => {
    for (;;) {
      const id = crypto.randomUUID();
      if (sessionRoll(id) < 0.01) return id;
    }
  };

  it('機率：未滿 10 分鐘與放棄都是 0，隨時間增加，有上限', () => {
    const save = fresh();
    const at = (min: number, status: 'completed' | 'abandoned' = 'completed') => chanceFor(finish(session(save, 'stopwatch', null), T0 + min * MIN, status));
    expect(at(9)).toBe(0);
    expect(at(60)).toBeCloseTo(60 * CHANCE.perMinute);
    expect(at(180)).toBe(CHANCE.max);
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

describe('開始後 10 秒內取消', () => {
  it('10 秒內取消不留紀錄；超過 10 秒不能取消', () => {
    const p = { taskTitle: '', tag: '讀書', habitatId: 'greenhouse' as const, mode: 'countdown' as const, targetSeconds: 1500 };
    const save = startFocus(fresh(), p, T0);
    const id = save.sessions[0].id;
    expect(cancelSession(save, id, T0 + 9_000).sessions).toHaveLength(0);
    expect(cancelSession(save, id, T0 + 11_000).sessions).toHaveLength(1);
  });
});

describe('專注筆記', () => {
  it('結束後可以寫筆記、改標籤與標題；進行中不能改', () => {
    const p = { taskTitle: '', tag: '讀書', habitatId: 'greenhouse' as const, mode: 'stopwatch' as const, targetSeconds: null };
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
  const base = { taskTitle: '', tag: '讀書', habitatId: 'greenhouse' as const };
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
  it('點數自動投入工程（可連續完成）、飼料自動餵陪伴寵物，只執行一次', () => {
    let save = focus(fresh(), need('gh_entrance'));
    save = applyFocusRewards(save, save.sessions[0].id, T0);
    expect(isDone(save, 'gh_entrance')).toBe(true);
    expect(balance(save)).toBe(0);
    expect(adoptedPets(save).map((v) => v.pet.source)).toEqual(['gift']); // 修好入口就送卵
    expect(feed(save)).toBe(0); // 這段的飼料直接餵給剛送到的卵
    save = focus(save, 120, T0 + 200 * MIN);
    const id = save.sessions.at(-1)!.id;
    save = applyFocusRewards(save, id, T0 + 320 * MIN);
    const out = focusOutcome(save, id);
    expect(out.projects.map((p) => [p.def.id, p.points])).toEqual([['gh_flowers', 120]]);
    expect(out.pets).toHaveLength(1);
    expect(out.pets[0].amount).toBe(feedFor(save.sessions.at(-1)!));
    expect([out.pets[0].from, out.pets[0].to]).toEqual([0, 0]);
    expect(feed(save)).toBe(0);
    const again = applyFocusRewards(save, id, T0 + 321 * MIN);
    expect(again).toBe(save); // 不會重複
    expect(validateSave(save).ok).toBe(true);
  });

  it('陪伴寵物：選了就餵牠，長大後換最接近長大的那隻', () => {
    let save = focus(fresh(), need('gh_entrance'));
    save = applyFocusRewards(save, save.sessions[0].id, T0);
    const gift = adoptedPets(save)[0].pet.id;
    expect(companionPet(save)?.pet.id).toBe(gift);
    save = { ...save, settings: { ...save.settings, companionPetId: 'nope' } };
    expect(companionPet(save)?.pet.id).toBe(gift); // 選的不存在就自動挑
  });
});

describe('今日花圃', () => {
  it('開始時記下植物；工程完成才解鎖；測試用立即完成照常結算且存檔有效', () => {
    let save = fresh();
    const tulip = PLANTS.find((p) => p.id === 'tulip')!;
    expect(plantUnlocked(save, tulip)).toBe(false);
    save = { ...save, settings: { ...save.settings, plantId: 'tulip' } };
    expect(chosenPlant(save).id).toBe('daisy'); // 還沒解鎖的設定退回第一種

    save = startFocus(save, { taskTitle: '', tag: '讀書', habitatId: 'greenhouse', mode: 'countdown', targetSeconds: 25 * 60, plantId: 'clover' }, T0);
    const open = save.sessions[0];
    expect(open.plantId).toBe('clover');
    expect(save.settings.plantId).toBe('clover');

    const now = T0 + 2 * MIN;
    const done = completeNow(open, now, 25);
    save = applyFocusRewards(closeSession(save, done, now), done.id, now);
    expect(done.accumulatedMs).toBe(25 * MIN);
    expect(Date.parse(done.startedAt)).toBe(now - 25 * MIN);
    expect(coins(save)).toBe(25);
    expect(isDone(save, 'gh_entrance')).toBe(true);
    expect(plantUnlocked(save, tulip)).toBe(true);
    expect(plantedSessions(save)).toHaveLength(1);
    expect(validateSave(JSON.parse(JSON.stringify(save))).ok).toBe(true);
    expect(plantTier(10)).toBe(0);
    expect(plantTier(25)).toBe(1);
    expect(plantTier(60)).toBe(2);
    expect(plantTier(180)).toBe(3);
  });
});
