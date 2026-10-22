// 存檔建立、驗證與示範資料
import { PROJECTS, HABITATS, SPECIES, PETS, petDef } from '../content/config';
import { contribute, balance, coins, feed, feedFor, petMaxFeed } from './game';
import type { AppMode, SaveFile, Settings } from './types';

const iso = (t: number) => new Date(t).toISOString();
const newId = () => crypto.randomUUID();

export const defaultSettings = (): Settings => ({
  soundEnabled: false,
  soundVolume: 0.5,
  endChime: false, // 音效預設關閉，玩家開啟後才播放
  endNotify: false,
  reducedMotion: false,
  sceneMode: 'auto',
  preferredHabitatId: 'greenhouse',
  lastTimerMode: 'countdown',
  lastTargetSeconds: 5 * 60, // 第一段建議 5 分鐘，剛好完成第一個工程
  customTags: [],
});

export const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export function newSave(mode: AppMode, who: { nickname: string; islandName: string; avatarId: string; timezone?: string }, now: number): SaveFile {
  const userId = newId();
  const isl = newId();
  return {
    schemaVersion: 1,
    mode,
    profile: { id: userId, nickname: who.nickname, avatarId: who.avatarId, activeIslandId: isl, timezone: who.timezone ?? deviceTimezone(), createdAt: iso(now) },
    settings: defaultSettings(),
    islands: [{ id: isl, name: who.islandName, ownerId: userId, activeProjectId: PROJECTS[0].id, createdAt: iso(now) }],
    memberships: [{ islandId: isl, userId, role: 'owner', joinedAt: iso(now) }],
    sessions: [],
    transactions: [],
    projects: PROJECTS.map((p) => ({ islandId: isl, projectId: p.id, contributedPoints: 0, completedAt: null })),
    contributions: [],
    discoveries: [],
    weeklyGoals: [],
    savedAt: iso(now),
  };
}

// ---------- 示範模式（獨立存檔） ----------

/** 示範專用贈點／贈幣：key 以 demo-grant: / demo-coin: 開頭，validateSave 拒絕出現在 personal 存檔。 */
const DEMO_GRANT = {
  points: { kind: 'focus_reward', prefix: 'demo-grant' },
  coins: { kind: 'coin_reward', prefix: 'demo-coin' },
  feed: { kind: 'feed_reward', prefix: 'demo-feed' },
} as const;

export function demoGrant(save: SaveFile, userId: string, amount: number, now: number, currency: keyof typeof DEMO_GRANT = 'points'): SaveFile {
  if (save.mode !== 'demo') throw new Error('demo only');
  const { kind, prefix } = DEMO_GRANT[currency];
  const key = `${prefix}:${newId()}`;
  return {
    ...save,
    transactions: [...save.transactions, { id: newId(), userId, islandId: save.profile.activeIslandId, kind, amount, idempotencyKey: key, createdAt: iso(now) }],
  };
}

export const DEMO_MEMBERS = [
  { nickname: '小林（示範）', avatarId: 'moon' },
  { nickname: '阿遙（示範）', avatarId: 'drop' },
];

export function newDemoSave(from: SaveFile | null, now: number): SaveFile {
  let s = newSave('demo', { nickname: from?.profile.nickname ?? '你', islandName: '示範小島', avatarId: from?.profile.avatarId ?? 'leaf', timezone: from?.profile.timezone }, now);
  s = { ...s, settings: { ...s.settings, ...(from ? { soundEnabled: from.settings.soundEnabled, soundVolume: from.settings.soundVolume, reducedMotion: from.settings.reducedMotion, sceneMode: from.settings.sceneMode } : {}) } };
  const ids = DEMO_MEMBERS.map(() => newId());
  s = {
    ...s,
    memberships: [
      ...s.memberships,
      ...DEMO_MEMBERS.map((m, i) => ({ islandId: s.profile.activeIslandId, userId: ids[i], role: 'member' as const, joinedAt: iso(now - (i + 1) * 86400000), demoNickname: m.nickname, demoAvatarId: m.avatarId })),
    ],
  };
  // 範例貢獻：小林完成入口，兩人一起把花圃推進到 18/20
  const plan: [number, string, number][] = [[0, 'gh_entrance', 5], [0, 'gh_flowers', 10], [1, 'gh_flowers', 8]];
  for (const [who, pid, pts] of plan) {
    s = demoGrant(s, ids[who], pts, now);
    const r = contribute(s, ids[who], pid, pts, now);
    if (r.ok) s = r.save;
  }
  return demoGrant(demoGrant(demoGrant(s, s.profile.id, 10, now), s.profile.id, 40, now, 'coins'), s.profile.id, 20, now, 'feed');
}

// ---------- 驗證 ----------

export type Validation = { ok: true; save: SaveFile } | { ok: false; error: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const ARRAYS = ['islands', 'memberships', 'sessions', 'transactions', 'projects', 'contributions', 'discoveries', 'weeklyGoals'] as const;
const HABITAT_IDS = HABITATS.map((h) => h.id) as string[];

/** 結構與不變條件檢查；任何不符都整份拒絕，不悄悄匯入。 */
export function validateSave(raw: unknown): Validation {
  const fail = (error: string): Validation => ({ ok: false, error });
  if (!isObj(raw)) return fail('檔案內容不是有效的存檔。');
  if (raw.schemaVersion !== 1) return fail(`不支援的存檔版本（${String(raw.schemaVersion)}）。`);
  if (raw.mode !== 'personal' && raw.mode !== 'demo') return fail('存檔模式不正確。');
  const p = raw.profile;
  if (!isObj(p) || !isStr(p.id) || !isStr(p.nickname) || !isStr(p.activeIslandId) || !isStr(p.timezone)) return fail('個人資料不完整。');
  for (const k of ARRAYS) if (!Array.isArray(raw[k])) return fail('存檔缺少必要的紀錄。');
  const save = { ...raw, settings: { ...defaultSettings(), ...(isObj(raw.settings) ? raw.settings : {}) } } as unknown as SaveFile;

  if (!save.islands.some((i) => isObj(i) && i.id === save.profile.activeIslandId)) return fail('找不到目前的島嶼。');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: save.profile.timezone });
  } catch {
    return fail('時區設定無效。');
  }

  const sessions = new Map(save.sessions.map((s) => [s.id, s]));
  if (sessions.size !== save.sessions.length) return fail('專注紀錄重複。');
  let open = 0;
  for (const s of save.sessions) {
    if (!isObj(s) || !isStr(s.id) || !['running', 'paused', 'completed', 'abandoned'].includes(s.status) || !Array.isArray(s.segments)) return fail('專注紀錄格式不正確。');
    if (typeof s.accumulatedMs !== 'number' || s.accumulatedMs < 0 || !HABITAT_IDS.includes(s.habitatId)) return fail('專注紀錄數值不正確。');
    if (s.status === 'running' || s.status === 'paused') open++;
  }
  if (open > 1) return fail('存檔中有多個未結算的專注。');

  const keys = new Set<string>();
  const rewarded = { focus_reward: new Set<string>(), coin_reward: new Set<string>(), feed_reward: new Set<string>() };
  const invited: string[] = []; // 邀請生物或領養寵物時要求的工程
  const fedTotal = new Map<string, number>();
  for (const t of save.transactions) {
    if (!isObj(t) || !Number.isInteger(t.amount) || t.amount === 0 || !isStr(t.idempotencyKey)) return fail('點數紀錄格式不正確。');
    if (keys.has(t.idempotencyKey)) return fail('點數紀錄重複。');
    keys.add(t.idempotencyKey);
    if (t.kind === 'focus_reward' || t.kind === 'coin_reward' || t.kind === 'feed_reward') {
      if (t.amount < 0) return fail('點數紀錄數值不正確。');
      if (t.idempotencyKey.startsWith('demo-')) {
        if (save.mode !== 'demo') return fail('個人存檔中含有示範贈點。');
      } else {
        // 每個完成的 session 最多各一筆點數、金幣、飼料
        const s = t.sessionId ? sessions.get(t.sessionId) : undefined;
        const seen = rewarded[t.kind];
        const expected = s && (t.kind === 'feed_reward' ? feedFor(s) : Math.floor(s.accumulatedMs / 60000));
        if (!s || s.status !== 'completed' || seen.has(s.id) || t.amount !== expected) return fail('專注獎勵與紀錄不符。');
        seen.add(s.id);
      }
    } else if (t.kind === 'pet_adopt') {
      const pet = petDef(t.petTypeId ?? '');
      if (!pet || t.amount !== -pet.adoptPrice || t.idempotencyKey !== `pet:${t.islandId}:${pet.id}`) return fail('寵物領養紀錄不符。');
      invited.push(pet.requiredProjectId);
    } else if (t.kind === 'feed_spend') {
      if (t.amount > 0 || !petDef(t.petTypeId ?? '')) return fail('餵食紀錄不符。');
      fedTotal.set(t.petTypeId!, (fedTotal.get(t.petTypeId!) ?? 0) - t.amount);
    } else if (t.kind === 'species_spend') {
      const sp = SPECIES.find((x) => x.id === t.speciesId);
      if (!sp || t.amount !== -sp.price || t.idempotencyKey !== `species:${t.islandId}:${sp.id}`) return fail('生物邀請紀錄不符。');
      invited.push(sp.requiredProjectId);
    } else if (t.kind === 'project_spend') {
      if (t.amount > 0) return fail('點數紀錄數值不正確。');
      const c = save.contributions.find((c) => c.id === t.contributionId);
      if (!c || c.points !== -t.amount) return fail('工程投入與點數紀錄不符。');
    } else return fail('未知的點數紀錄類型。');
  }
  for (const c of save.contributions) {
    if (!save.transactions.some((t) => t.contributionId === c.id)) return fail('工程投入缺少對應的點數紀錄。');
  }
  for (const m of save.memberships) {
    if (balance(save, m.userId) < 0 || coins(save, m.userId) < 0 || feed(save, m.userId) < 0) return fail('錢包餘額不可小於 0。');
  }
  for (const def of PROJECTS) {
    const row = save.projects.find((r) => r.projectId === def.id && r.islandId === save.profile.activeIslandId);
    if (!row) return fail('工程紀錄不完整。');
    const sum = save.contributions.filter((c) => c.projectId === def.id && c.islandId === row.islandId).reduce((a, c) => a + c.points, 0);
    if (sum !== row.contributedPoints || sum > def.requiredPoints) return fail('工程進度與投入紀錄不符。');
    if (!!row.completedAt !== (sum === def.requiredPoints)) return fail('工程完成狀態不正確。');
  }
  for (const [petId, total] of fedTotal) {
    const pet = PETS.find((p) => p.id === petId)!;
    if (!keys.has(`pet:${save.profile.activeIslandId}:${petId}`) || total > petMaxFeed(pet)) return fail('寵物餵食紀錄不符。');
  }
  for (const pid of invited) {
    if (!save.projects.some((r) => r.projectId === pid && r.completedAt)) return fail('生物邀請早於棲地工程完成。');
  }
  const disc = new Set(save.discoveries.map((d) => `${d.islandId}:${d.speciesId}`));
  if (disc.size !== save.discoveries.length) return fail('圖鑑紀錄重複。');
  return { ok: true, save };
}
