// 存檔建立、驗證、示範資料與舊存檔轉換
import { ANIMALS, CONTENT_VERSION, HABITATS, PROJECTS } from '../content/config';
import { balance, coins, contribute, investAll } from './game';
import { questRewardOk } from './quests';
import type { AppMode, SaveFile, Settings } from './types';

const iso = (t: number) => new Date(t).toISOString();
const newId = () => crypto.randomUUID();

export const defaultSettings = (): Settings => ({
  soundEnabled: false,
  soundVolume: 0.5,
  endChime: false, // 音效預設關閉，玩家開啟後才播放
  endNotify: true, // App 版：倒數結束時跳出系統通知
  focusSound: 'auto',
  reducedMotion: false,
  sceneMode: 'auto',
  preferredHabitatId: 'forest',
  lastTimerMode: 'countdown',
  lastTargetSeconds: 10 * 60, // 第一段建議 10 分鐘（最低時間），完成後足夠修好第一個工程
  customTags: [],
  keepAwake: false,
  eggId: ANIMALS[0].id,
  deepFocus: true,
  focusAllow: [],
});

export const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const freshProjects = (isl: string) => PROJECTS.map((p) => ({ islandId: isl, projectId: p.id, contributedPoints: 0, completedAt: null }));

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
    projects: freshProjects(isl),
    contributions: [],
    weeklyGoals: [],
    content: CONTENT_VERSION,
    savedAt: iso(now),
  };
}

// ---------- 示範模式（獨立存檔） ----------

/** 示範專用贈點／贈幣：key 以 demo-grant: / demo-coin: 開頭，validateSave 拒絕出現在 personal 存檔。 */
const DEMO_GRANT = {
  points: { kind: 'focus_reward', prefix: 'demo-grant' },
  coins: { kind: 'coin_reward', prefix: 'demo-coin' },
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
  // 範例貢獻：小林清出步道，兩人一起把樹苗推進到 270/300
  const plan: [number, string, number][] = [[0, 'fo_trail', 10], [0, 'fo_saplings', 150], [1, 'fo_saplings', 120]];
  for (const [who, pid, pts] of plan) {
    s = demoGrant(s, ids[who], pts, now);
    const r = contribute(s, ids[who], pid, pts, now);
    if (r.ok) s = r.save;
  }
  return demoGrant(demoGrant(s, s.profile.id, 40, now), s.profile.id, 500, now, 'coins');
}

// ---------- 舊存檔轉換 ----------

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';

/**
 * 內容 v3（陸地森林＋探索動物）以前的存檔：溫室／溪流、植物、寵物、設施、飼料、偶遇。
 * - 專注紀錄、點數與金幣的獲得保留；場景一律改成森林；植物紀錄不保留（當作第一種動物）。
 * - 寵物、設施、驚喜蛋花掉的金幣全部退回（刪掉那些花費紀錄）；飼料、圖鑑偶遇移除。
 * - 舊工程進度改成新的森林工程：把累積的點數重新依序投入。
 */
export function migrateForest(raw: Record<string, unknown>, now: number): Record<string, unknown> {
  if (typeof raw.content === 'number' && raw.content >= CONTENT_VERSION) return raw;
  const isl = raw.profile && isObj(raw.profile) ? String(raw.profile.activeIslandId) : '';
  const sessions = (raw.sessions as Record<string, unknown>[]).map((s) => {
    if (!isObj(s)) return s;
    const { plantId: _plant, ...rest } = s;
    return { ...rest, habitatId: 'forest' };
  });
  // 只留點數與金幣的獲得（飼料、示範飼料、寵物、設施、生物邀請、舊工程投入都拿掉）
  const transactions = (raw.transactions as Record<string, unknown>[]).filter((t) => isObj(t) && (t.kind === 'focus_reward' || t.kind === 'coin_reward'));
  const settings = isObj(raw.settings) ? { ...raw.settings } : {};
  delete settings.plantId;
  delete settings.companionPetId;
  settings.preferredHabitatId = 'forest';
  settings.eggId = ANIMALS[0].id;
  let save = {
    ...raw,
    sessions,
    transactions,
    settings,
    projects: freshProjects(isl),
    contributions: [],
    islands: (raw.islands as Record<string, unknown>[]).map((i) => (isObj(i) && i.id === isl ? { ...i, activeProjectId: PROJECTS[0].id } : i)),
    content: CONTENT_VERSION,
  } as unknown as SaveFile;
  delete (save as unknown as Record<string, unknown>).pets;
  delete (save as unknown as Record<string, unknown>).discoveries;
  delete (save as unknown as Record<string, unknown>).pacing;
  for (const m of save.memberships) if (isObj(m)) save = investAll(save, m.userId, now);
  return save as unknown as Record<string, unknown>;
}

// ---------- 驗證 ----------

export type Validation = { ok: true; save: SaveFile } | { ok: false; error: string };

const ARRAYS = ['islands', 'memberships', 'sessions', 'transactions', 'projects', 'contributions', 'weeklyGoals'] as const;
const HABITAT_IDS = HABITATS.map((h) => h.id) as string[];

/** 結構與不變條件檢查；任何不符都整份拒絕，不悄悄匯入。舊內容版本先轉換再檢查。 */
export function validateSave(input: unknown, now = Date.now()): Validation {
  const fail = (error: string): Validation => ({ ok: false, error });
  if (!isObj(input)) return fail('檔案內容不是有效的存檔。');
  if (input.schemaVersion === undefined) return fail('這不是棲光小島的存檔檔案。');
  if (input.schemaVersion !== 1) return fail(`這份存檔來自不同版本的棲光小島（版本 ${String(input.schemaVersion)}），目前無法讀取。`);
  if (input.mode !== 'personal' && input.mode !== 'demo') return fail('存檔模式不正確。');
  const p = input.profile;
  if (!isObj(p) || !isStr(p.id) || !isStr(p.nickname) || !isStr(p.activeIslandId) || !isStr(p.timezone)) return fail('個人資料不完整。');
  for (const k of ARRAYS) if (!Array.isArray(input[k]) || !(input[k] as unknown[]).every(isObj)) return fail('存檔缺少必要的紀錄。');
  if (!input.memberships || !(input.memberships as unknown[]).every(isObj)) return fail('成員紀錄不正確。');
  const raw = migrateForest(input, now);
  const settings = { ...defaultSettings(), ...(isObj(raw.settings) ? raw.settings : {}) };
  // 設定欄位型別不對（匯入的檔案、舊版本）就用預設值，避免畫面當掉
  if (!Array.isArray(settings.focusAllow) || !settings.focusAllow.every((a: unknown) => isObj(a) && isStr((a as { pkg?: unknown }).pkg))) settings.focusAllow = [];
  if (typeof settings.deepFocus !== 'boolean') settings.deepFocus = true;
  if (!isStr(settings.eggId)) settings.eggId = defaultSettings().eggId;
  if (!HABITAT_IDS.includes(settings.preferredHabitatId)) settings.preferredHabitatId = 'forest';
  const save = { ...raw, settings } as unknown as SaveFile;

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
    if (s.animalId !== undefined && !isStr(s.animalId)) return fail('專注紀錄的動物不正確。');
    if (s.deep !== undefined && typeof s.deep !== 'boolean') return fail('專注紀錄的深度專注設定不正確。');
    if (s.status === 'running' || s.status === 'paused') open++;
  }
  if (open > 1) return fail('存檔中有多個未結算的專注。');

  const contribById = new Map(save.contributions.map((c) => [c.id, c]));
  const spentFor = new Set(save.transactions.map((t) => t.contributionId).filter(isStr));
  const keys = new Set<string>();
  const rewarded = { focus_reward: new Set<string>(), coin_reward: new Set<string>() };
  for (const t of save.transactions) {
    if (!isObj(t) || !Number.isInteger(t.amount) || t.amount === 0 || !isStr(t.idempotencyKey)) return fail('點數紀錄格式不正確。');
    if (keys.has(t.idempotencyKey)) return fail('點數紀錄重複。');
    keys.add(t.idempotencyKey);
    if (t.kind === 'focus_reward' || t.kind === 'coin_reward') {
      if (t.amount < 0) return fail('點數紀錄數值不正確。');
      if (t.idempotencyKey.startsWith('demo-')) {
        if (save.mode !== 'demo') return fail('個人存檔中含有示範贈點。');
      } else {
        // 每個完成的 session 最多各一筆點數、金幣
        const s = t.sessionId ? sessions.get(t.sessionId) : undefined;
        const seen = rewarded[t.kind];
        if (!s || s.status !== 'completed' || seen.has(s.id) || t.amount !== Math.floor(s.accumulatedMs / 60000)) return fail('專注獎勵與紀錄不符。');
        seen.add(s.id);
      }
    } else if (t.kind === 'animal_unlock') {
      const a = ANIMALS.find((x) => x.id === t.animalId);
      // 價格之後可能調整：只要是認得的動物、扣的是金幣就接受（不比對當時的價格）
      if (!a || t.amount >= 0 || t.idempotencyKey !== `animal:${t.islandId}:${a.id}`) return fail('動物解鎖紀錄不符。');
    } else if (t.kind === 'quest_reward') {
      if (!questRewardOk(t.idempotencyKey, t.amount, t.animalId)) return fail('挑戰獎勵紀錄不符。');
    } else if (t.kind === 'project_spend') {
      if (t.amount > 0) return fail('點數紀錄數值不正確。');
      const c = isStr(t.contributionId) ? contribById.get(t.contributionId) : undefined;
      if (!c || c.points !== -t.amount) return fail('工程投入與點數紀錄不符。');
    } else return fail('未知的點數紀錄類型。');
  }
  for (const c of save.contributions) {
    if (!spentFor.has(c.id)) return fail('工程投入缺少對應的點數紀錄。');
  }
  for (const m of save.memberships) {
    if (balance(save, m.userId) < 0 || coins(save, m.userId) < 0) return fail('錢包餘額不可小於 0。');
  }
  const sums = new Map<string, number>();
  for (const c of save.contributions) if (c.islandId === save.profile.activeIslandId) sums.set(c.projectId, (sums.get(c.projectId) ?? 0) + c.points);
  // 工程需要的點數之後可能調整：已完成的維持完成；投入已經達到新門檻的補記完成（不因為調數值就讀不到存檔）
  const projects = save.projects.map((r) => {
    const def = PROJECTS.find((d) => d.id === r.projectId);
    return def && r.islandId === save.profile.activeIslandId && !r.completedAt && r.contributedPoints >= def.requiredPoints ? { ...r, completedAt: new Date(now).toISOString() } : r;
  });
  for (const def of PROJECTS) {
    const row = projects.find((r) => r.projectId === def.id && r.islandId === save.profile.activeIslandId);
    if (!row) return fail('工程紀錄不完整。');
    if ((sums.get(def.id) ?? 0) !== row.contributedPoints) return fail('工程進度與投入紀錄不符。');
  }
  return { ok: true, save: { ...save, projects } };
}
