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
  focusSound: string; // 專注背景音：'auto' 跟著棲地，或已收集的環境音 id
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
  note?: string; // 專注筆記（只存在自己的裝置，不分享）
}

export interface PointTransaction {
  id: ID;
  userId: ID;
  islandId: ID;
  // 成長點數：focus_reward / project_spend
  // 金幣：coin_reward / species_spend / pet_adopt
  // 飼料：feed_reward / feed_spend；設施（金幣）：facility_buy
  kind: 'focus_reward' | 'project_spend' | 'coin_reward' | 'species_spend' | 'pet_adopt' | 'feed_reward' | 'feed_spend' | 'facility_buy';
  amount: number; // 獲得 > 0、花費 < 0
  sessionId?: ID;
  contributionId?: ID;
  speciesId?: ID;
  petTypeId?: ID;
  petId?: ID; // 寵物個體（pet_adopt / feed_spend）
  facilityId?: ID;
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
  sessionId?: ID; // 專注完成時偶遇（隨機解鎖）的那一段專注
}

export interface WeeklyGoal {
  islandId: ID;
  weekStartLocalDate: string;
  targetMinutes: number;
}

/** 寵物個體：同一種可以養很多隻；成長由 feed_spend 交易推導。 */
export interface PetInstance {
  id: ID;
  islandId: ID;
  typeId: ID;
  habitatId: HabitatId;
  adoptedBy: ID;
  adoptedAt: ISODate;
  source: 'gift' | 'buy' | 'egg';
  faceOverride: number | null; // 長大後在表情相簿選的表情；null = 孵化時隨機的表情
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
  pets: PetInstance[];
  savedAt: ISODate;
}
