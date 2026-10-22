// 邏輯模型，對應 model.md 第 12 節
export type ID = string;
export type ISODate = string;
export type AppMode = 'personal' | 'demo';
export type HabitatId = 'greenhouse' | 'stream' | 'woodland' | 'coast' | 'bay';
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
  reducedMotion: boolean;
  sceneMode: 'auto' | '2d';
  preferredHabitatId: HabitatId;
  lastTimerMode: TimerMode;
  lastTargetSeconds: number;
  customTags: string[];
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
  segments: FocusSegment[];
  startedAt: ISODate;
  endedAt: ISODate | null;
  outcome: Outcome | null;
}

export interface PointTransaction {
  id: ID;
  userId: ID;
  islandId: ID;
  // 成長點數：focus_reward / project_spend
  // 金幣：coin_reward / species_spend / pet_adopt
  // 飼料：feed_reward / feed_spend
  kind: 'focus_reward' | 'project_spend' | 'coin_reward' | 'species_spend' | 'pet_adopt' | 'feed_reward' | 'feed_spend';
  amount: number; // 獲得 > 0、花費 < 0
  sessionId?: ID;
  contributionId?: ID;
  speciesId?: ID;
  petTypeId?: ID; // 寵物狀態全部由 pet_adopt / feed_spend 交易推導，不另存
  idempotencyKey: string; // reward:/coin:{sessionId}、spend:{contributionId}、species:{islandId}:{speciesId}
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
  projectId: ID;
  points: number;
  createdAt: ISODate;
}

export interface Discovery {
  islandId: ID;
  speciesId: ID;
  discoveredAt: ISODate;
  triggeredByProjectId: ID;
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
  discoveries: Discovery[];
  weeklyGoals: WeeklyGoal[];
  savedAt: ISODate;
}
