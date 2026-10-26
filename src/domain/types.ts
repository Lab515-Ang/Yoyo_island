// 邏輯模型，對應 model.md 第 12 節
export type ID = string;
export type ISODate = string;
export type AppMode = 'personal' | 'demo';
export type HabitatId = 'forest' | 'wetland' | 'coast' | 'bay';
export type TimerMode = 'countdown' | 'stopwatch';
export type Outcome = 'done' | 'partial' | 'continue';

export interface Profile {
  id: ID;
  nickname: string;
  avatarId: string;
  activeIslandId: ID;
  timezone: string;
  createdAt: ISODate;
}

export interface Settings {
  soundEnabled: boolean;
  soundVolume: number;
  endChime: boolean; // 倒數歸零提示音
  endNotify: boolean; // 倒數歸零系統通知
  focusSound: string; // 專注背景音：'auto' 跟著棲地，或已收集的環境音 id
  reducedMotion: boolean;
  sceneMode: 'auto' | '2d';
  preferredHabitatId: HabitatId;
  lastTimerMode: TimerMode;
  lastTargetSeconds: number;
  customTags: string[];
  keepAwake: boolean; // 專注時保持螢幕開啟（讓倒數結束能準時提醒）
  eggId: string; // 上次選的探索目標（要找的動物；欄位名沿用舊稱）
  deepFocus: boolean; // 深度專注：專注中離開小島超過 10 秒動物就會被嚇跑（Android）
  focusAllow: { pkg: string; label: string }[]; // 深度專注時可以使用的 App
}

export interface Island {
  id: ID;
  name: string;
  ownerId: ID;
  activeProjectId: ID | null;
  createdAt: ISODate;
}

export interface Membership {
  islandId: ID;
  userId: ID;
  role: 'owner' | 'member';
  joinedAt: ISODate;
  // 僅示範存檔使用：虛構成員的顯示資料
  demoNickname?: string;
  demoAvatarId?: string;
}

export interface FocusSegment {
  startedAt: ISODate;
  endedAt: ISODate;
}

export interface FocusSession {
  id: ID;
  userId: ID;
  islandId: ID;
  taskTitle: string;
  tag: string;
  habitatId: HabitatId;
  mode: TimerMode;
  status: 'running' | 'paused' | 'completed' | 'abandoned';
  targetSeconds: number | null;
  accumulatedMs: number;
  runningSince: ISODate | null;
  pauseLimitAt?: ISODate | null; // 玩家按的暫停：最晚這個時間自動繼續（接電話的暫停沒有）
  segments: FocusSegment[];
  startedAt: ISODate;
  endedAt: ISODate | null;
  outcome: Outcome | null;
  animalId?: string; // 這段專注要找（遇見）的動物；舊紀錄（植物時代）沒有時當作第一種
  deep?: boolean; // 深度專注（離開太久會放棄）
  note?: string; // 專注筆記（只存在自己的裝置，不分享）
  applied?: boolean; // 已經把這段的點數自動投入工程（避免重複）
}

export interface PointTransaction {
  id: ID;
  userId: ID;
  islandId: ID;
  // 成長點數：focus_reward / project_spend；金幣：coin_reward / animal_unlock（商店解鎖動物）/ quest_reward（挑戰寶箱，新手任務另送 animalId）
  kind: 'focus_reward' | 'project_spend' | 'coin_reward' | 'animal_unlock' | 'quest_reward';
  amount: number; // 獲得 > 0、花費 < 0
  sessionId?: ID;
  contributionId?: ID;
  animalId?: ID;
  idempotencyKey: string; // reward:/coin:{sessionId}、spend:{contributionId}、animal:{islandId}:{animalId}、quest:…（見 quests.ts）
  createdAt: ISODate;
}

export interface IslandProject {
  islandId: ID;
  projectId: ID;
  contributedPoints: number;
  completedAt: ISODate | null;
}

export interface Contribution {
  id: ID;
  userId: ID;
  islandId: ID;
  sessionId?: ID; // 專注完成後自動投入時，記錄是哪一段專注
  projectId: ID;
  points: number;
  createdAt: ISODate;
}

export interface WeeklyGoal {
  islandId: ID;
  weekStartLocalDate: string;
  targetMinutes: number;
}

export interface SaveFile {
  schemaVersion: 1;
  mode: AppMode;
  profile: Profile;
  settings: Settings;
  islands: Island[];
  memberships: Membership[];
  sessions: FocusSession[];
  transactions: PointTransaction[];
  projects: IslandProject[];
  contributions: Contribution[];
  weeklyGoals: WeeklyGoal[];
  content?: number; // 內容版本（CONTENT_VERSION）：3 = 陸地森林＋探索動物
  savedAt: ISODate;
}
