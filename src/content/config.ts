import type { HabitatId } from '../domain/types';

// 產品名稱與儲存前綴集中於此
export const APP_NAME = '棲光小島';
export const STORAGE_PREFIX = 'qiguang-island';

export const TAGS = ['讀書', '工作', '閱讀', '創作', '其他'];
export const QUICK_MINUTES = [15, 25, 45, 60];
export const MAX_CUSTOM_MINUTES = 180;

export const AVATARS: { id: string; emoji: string; label: string }[] = [
  { id: 'leaf', emoji: '🌿', label: '葉子' },
  { id: 'flower', emoji: '🌼', label: '小花' },
  { id: 'shell', emoji: '🐚', label: '貝殼' },
  { id: 'sun', emoji: '☀️', label: '太陽' },
  { id: 'moon', emoji: '🌙', label: '月亮' },
  { id: 'drop', emoji: '💧', label: '水滴' },
  { id: 'mushroom', emoji: '🍄', label: '蘑菇' },
  { id: 'star', emoji: '⭐', label: '星星' },
];
export const avatarEmoji = (id: string) => AVATARS.find((a) => a.id === id)?.emoji ?? '🌿';

export interface HabitatDef {
  id: HabitatId;
  name: string;
  playable: boolean;
  unlockProjectId: string | null; // null = 開局即可進入
  blurb: string;
}

export const HABITATS: HabitatDef[] = [
  { id: 'greenhouse', name: '花園溫室', playable: true, unlockProjectId: null, blurb: '奶油白的溫室，噴泉、花圃與吊盆。' },
  { id: 'stream', name: '溪流濕地', playable: true, unlockProjectId: 'st_entrance', blurb: '淺淺的溪水、岸邊植物與木橋。' },
  { id: 'woodland', name: '林間草地', playable: false, unlockProjectId: null, blurb: '未來區域' },
  { id: 'coast', name: '潮間帶海岸', playable: false, unlockProjectId: null, blurb: '未來區域' },
  { id: 'bay', name: '海灣水下', playable: false, unlockProjectId: null, blurb: '未來區域' },
];
export const habitatName = (id: HabitatId) => HABITATS.find((h) => h.id === id)?.name ?? id;

export interface ProjectDef {
  id: string;
  habitatId: HabitatId;
  title: string;
  description: string;
  requiredPoints: number;
  prerequisiteProjectId: string | null;
  sceneChangeKey: string;
  promise: string; // 「再 12 點，{promise}。」
}

// 首版工程表：數值可在此集中調整（固定順序）
export const PROJECTS: ProjectDef[] = [
  { id: 'gh_entrance', habitatId: 'greenhouse', title: '整理溫室入口', description: '清出小徑、增加入口花盆', requiredPoints: 5, prerequisiteProjectId: null, sceneChangeKey: 'gh_entrance', promise: '溫室入口就會整理好' },
  { id: 'gh_flowers', habitatId: 'greenhouse', title: '恢復第一座花圃', description: '花圃開花、第一隻蝴蝶出現', requiredPoints: 20, prerequisiteProjectId: 'gh_entrance', sceneChangeKey: 'gh_flowers', promise: '花圃就會開花' },
  { id: 'gh_fountain', habitatId: 'greenhouse', title: '修好溫室噴泉', description: '噴泉開始流水、加入水聲', requiredPoints: 35, prerequisiteProjectId: 'gh_flowers', sceneChangeKey: 'gh_fountain', promise: '噴泉就能重新流水' },
  { id: 'gh_plants', habitatId: 'greenhouse', title: '增加食草與葉叢', description: '植物層次增加、更多昆蟲造訪', requiredPoints: 60, prerequisiteProjectId: 'gh_fountain', sceneChangeKey: 'gh_plants', promise: '溫室就會長出更多葉叢' },
  { id: 'st_entrance', habitatId: 'stream', title: '打開溪流步道', description: '溪流場景可進入', requiredPoints: 80, prerequisiteProjectId: 'gh_plants', sceneChangeKey: 'st_entrance', promise: '就能走到溪流濕地' },
  { id: 'st_bank', habitatId: 'stream', title: '恢復溪岸植被', description: '蘆葦、水邊植物、蜻蜓出現', requiredPoints: 100, prerequisiteProjectId: 'st_entrance', sceneChangeKey: 'st_bank', promise: '溪岸就會長回蘆葦' },
  { id: 'st_water', habitatId: 'stream', title: '整理淺水區', description: '水面更清楚、小魚活動', requiredPoints: 120, prerequisiteProjectId: 'st_bank', sceneChangeKey: 'st_water', promise: '淺水區就會變清澈' },
  { id: 'st_bridge', habitatId: 'stream', title: '修好溪流木橋', description: '木橋完成、青蛙與水鳥造訪', requiredPoints: 160, prerequisiteProjectId: 'st_water', sceneChangeKey: 'st_bridge', promise: '木橋就能修好' },
];
export const projectDef = (id: string) => PROJECTS.find((p) => p.id === id);

export interface SpeciesDef {
  id: string;
  name: string;
  category: 'insect' | 'fish' | 'amphibian' | 'bird';
  habitatId: HabitatId;
  requiredProjectId: string;
  description: string;
  behaviorLabel: string;
  price: number; // 邀請所需金幣
}

export const CATEGORY_LABEL = { insect: '昆蟲', fish: '魚類', amphibian: '兩棲類', bird: '鳥類' } as const;

// 介紹保持簡單、保守的觀察描述，不宣稱學名或精確生態
export const SPECIES: SpeciesDef[] = [
  { id: 'butterfly_yellow', name: '黃蝶', category: 'insect', habitatId: 'greenhouse', requiredProjectId: 'gh_flowers', description: '翅膀是明亮的黃色，常在開花的花圃附近慢慢飛。', behaviorLabel: '緩慢振翅、訪花、停棲', price: 30 },
  { id: 'bee', name: '訪花蜂', category: 'insect', habitatId: 'greenhouse', requiredProjectId: 'gh_fountain', description: '身上有黃黑相間的條紋，在花朵之間來回停留。', behaviorLabel: '花間移動、短暫懸停', price: 40 },
  { id: 'butterfly_green', name: '青綠鳳蝶', category: 'insect', habitatId: 'greenhouse', requiredProjectId: 'gh_plants', description: '黑色翅膀帶著青綠色的斑紋，喜歡在葉叢間繞圈。', behaviorLabel: '繞行、振翅、短暫停棲', price: 60 },
  { id: 'ladybird', name: '瓢蟲', category: 'insect', habitatId: 'greenhouse', requiredProjectId: 'gh_plants', description: '圓圓的紅色背殼上有黑點，常沿著葉片慢慢爬。', behaviorLabel: '沿葉片緩慢移動', price: 50 },
  { id: 'dragonfly', name: '蜻蜓', category: 'insect', habitatId: 'stream', requiredProjectId: 'st_bank', description: '細長的身體和透明的翅膀，常在水面上方巡飛，偶爾停在枝梢。', behaviorLabel: '水面飛行、停在枝梢', price: 70 },
  { id: 'minnow', name: '溪流小魚', category: 'fish', habitatId: 'stream', requiredProjectId: 'st_water', description: '小小的銀色身影，成群在清澈的淺水裡游動。', behaviorLabel: '小群緩慢游動', price: 80 },
  { id: 'frog', name: '青蛙', category: 'amphibian', habitatId: 'stream', requiredProjectId: 'st_bridge', description: '綠色的身體靜靜趴在岸邊，喉嚨隨著呼吸輕輕起伏。', behaviorLabel: '呼吸起伏、偶爾跳動', price: 100 },
  { id: 'waterside_bird', name: '水邊小鳥', category: 'bird', habitatId: 'stream', requiredProjectId: 'st_bridge', description: '在岸邊慢慢走動，不時低頭觀察水面。', behaviorLabel: '岸邊走動、低頭觀察', price: 120 },
];
export const speciesDef = (id: string) => SPECIES.find((s) => s.id === id);

// ---------- 寵物（數值可集中調整） ----------

export type Rarity = 'common' | 'rare' | 'special';
export const RARITY_LABEL: Record<Rarity, string> = { common: '常見', rare: '稀有', special: '特殊' };

export interface PetDef {
  id: string;
  name: string;
  rarity: Rarity;
  habitatId: HabitatId;
  requiredProjectId: string; // 棲地條件
  adoptPrice: number; // 領養所需金幣
  stages: [string, string, string, string]; // 四個成長階段名稱
  thresholds: [number, number, number]; // 進入第 2、3、4 階段所需的累計飼料
  blurb: string;
}

const COMMON: PetDef['thresholds'] = [12, 30, 60];
const RARE: PetDef['thresholds'] = [20, 50, 100];
const SPECIAL: PetDef['thresholds'] = [30, 75, 150];

// 第一階段只放已開放棲地的 5 隻；林間草地、海岸、海灣開放後再加入其餘 5 隻
export const PETS: PetDef[] = [
  { id: 'pet_butterfly', name: '黃蝶', rarity: 'common', habitatId: 'greenhouse', requiredProjectId: 'gh_flowers', adoptPrice: 30, stages: ['卵', '毛毛蟲', '蛹', '黃蝶'], thresholds: COMMON, blurb: '從一顆小小的卵開始，慢慢變成在花間飛舞的蝴蝶。' },
  { id: 'pet_whiteeye', name: '綠繡眼', rarity: 'common', habitatId: 'greenhouse', requiredProjectId: 'gh_plants', adoptPrice: 40, stages: ['蛋', '雛鳥', '幼鳥', '綠繡眼'], thresholds: COMMON, blurb: '長大後眼睛周圍會出現一圈白色的羽毛。' },
  { id: 'pet_frog', name: '青蛙', rarity: 'common', habitatId: 'stream', requiredProjectId: 'st_entrance', adoptPrice: 40, stages: ['卵塊', '蝌蚪', '長腳蝌蚪', '青蛙'], thresholds: COMMON, blurb: '從水裡的蝌蚪，一點一點長出腳，最後跳上岸。' },
  { id: 'pet_firefly', name: '螢火蟲', rarity: 'rare', habitatId: 'stream', requiredProjectId: 'st_water', adoptPrice: 80, stages: ['卵', '水中幼蟲', '蛹', '螢火蟲'], thresholds: RARE, blurb: '幼蟲住在乾淨的水裡，長大後會發出柔和的光。' },
  { id: 'pet_axolotl', name: '六角恐龍', rarity: 'special', habitatId: 'stream', requiredProjectId: 'st_bridge', adoptPrice: 150, stages: ['卵', '幼體', '長出外鰓', '六角恐龍'], thresholds: SPECIAL, blurb: '長大後仍保留幼體的模樣，頭兩側有像羽毛的外鰓。' },
];
export const petDef = (id: string) => PETS.find((p) => p.id === id);

/** 專注每 5 分鐘 1 份飼料；倒數每撐完 25 分鐘再多 1 份。 */
export const FEED_PER_MINUTES = 5;
export const COUNTDOWN_BONUS_PER_MINUTES = 25;

export const COPY = {
  start: '為自己留一段時間。',
  complete: (min: number) => `這 ${min} 分鐘，讓小島更靠近春天。`,
  projectNeed: (pts: number, promise: string) => `再 ${pts} 點，${promise}。`,
  newVisitor: (habitat: string) => `有新朋友來訪。去${habitat}看看吧。`,
  canInvite: (names: string) => `${names}可以邀請了，到商店用金幣邀請吧。`,
  welcomeBack: '歡迎回來，小島一直在這裡。',
  allRestored: '這一階段的棲地已經恢復。今天也一起好好生活。',
  demoBanner: '本機合作示範，非即時連線',
  multiplayerOff: '多人連線尚未啟用',
};
