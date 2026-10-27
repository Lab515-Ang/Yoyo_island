import type { HabitatId } from '../domain/types';

// 產品名稱與儲存前綴集中於此
export const APP_NAME = '棲光小島';
export const STORAGE_PREFIX = 'qiguang-island';

export const TAGS = ['讀書', '工作', '閱讀', '創作', '其他'];
const TAG_COLORS: Record<string, string> = { 讀書: '#6fa8dc', 工作: '#e98a6b', 閱讀: '#e8b85a', 創作: '#c9a0dc', 其他: '#ee9fb3' };
const CUSTOM_TAG_COLORS = ['#8fb38a', '#f2a7a0', '#8fd0d8', '#d39a77', '#b9c94a'];
/** 標籤的顏色圓點：內建固定顏色，自訂標籤依名稱挑一個穩定的顏色。 */
export const tagColor = (tag: string) => TAG_COLORS[tag] ?? CUSTOM_TAG_COLORS[[...tag].reduce((a, c) => a + c.charCodeAt(0), 0) % CUSTOM_TAG_COLORS.length];
/** 專注時間：最低 10 分鐘、最高 180 分鐘（示範模式另有 10 秒快轉，只用來測試）。 */
export const MIN_FOCUS_MINUTES = 10;
export const MAX_FOCUS_MINUTES = 180;
/** 暫停最多幾分鐘，時間到自動繼續（參考 Forest；接電話的暫停不算）。 */
export const PAUSE_MINUTES = 5;
export const QUICK_MINUTES = [10, 15, 25, 45, 60, 90, 120, 180];
/** 把舊存檔的時間（例如 5 分鐘）收進範圍內。 */
export const clampMinutes = (min: number) => Math.min(MAX_FOCUS_MINUTES, Math.max(MIN_FOCUS_MINUTES, Math.round(min)));

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
  playable: boolean; // false = 日後改版才開放
  unlockProjectId: string | null; // null = 開局即可進入
  blurb: string;
}

// 目前只開放陸地的「棲光森林」；水域與海岸留待日後改版
export const HABITATS: HabitatDef[] = [
  { id: 'forest', name: '棲光森林', playable: true, unlockProjectId: null, blurb: '台灣低海拔到中海拔的森林：步道、樹林、草叢與水源。' },
  { id: 'wetland', name: '溪流濕地', playable: false, unlockProjectId: null, blurb: '日後改版開放' },
  { id: 'coast', name: '潮間帶海岸', playable: false, unlockProjectId: null, blurb: '日後改版開放' },
  { id: 'bay', name: '海灣水下', playable: false, unlockProjectId: null, blurb: '日後改版開放' },
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

// 森林修復工程（固定順序）。節奏目標：每天專注約 1～3 小時，約 3 個月修完（共 9,410 點）；pacing.test.ts 會模擬檢查
export const PROJECTS: ProjectDef[] = [
  { id: 'fo_trail', habitatId: 'forest', title: '清出林間步道', description: '搬開倒木與落石，步道可以走了', requiredPoints: 10, prerequisiteProjectId: null, sceneChangeKey: 'fo_trail', promise: '林間步道就會清出來' },
  { id: 'fo_saplings', habitatId: 'forest', title: '種回原生樹苗', description: '一排排小樹苗冒出新芽', requiredPoints: 430, prerequisiteProjectId: 'fo_trail', sceneChangeKey: 'fo_saplings', promise: '原生樹苗就會種下' },
  { id: 'fo_cabin', habitatId: 'forest', title: '修好森林觀察小屋', description: '小屋亮起燈，可以安靜地觀察森林', requiredPoints: 1300, prerequisiteProjectId: 'fo_saplings', sceneChangeKey: 'fo_cabin', promise: '觀察小屋就能修好' },
  { id: 'fo_undergrowth', habitatId: 'forest', title: '恢復林下草叢', description: '蕨類與草叢長回來，小動物有地方躲', requiredPoints: 1850, prerequisiteProjectId: 'fo_cabin', sceneChangeKey: 'fo_undergrowth', promise: '林下草叢就會長回來' },
  { id: 'fo_corridor', habitatId: 'forest', title: '架設生態廊道', description: '動物可以安全穿越的綠色通道', requiredPoints: 2150, prerequisiteProjectId: 'fo_undergrowth', sceneChangeKey: 'fo_corridor', promise: '生態廊道就會架好' },
  { id: 'fo_spring', habitatId: 'forest', title: '整理森林水源地', description: '清澈的泉水流進小水池', requiredPoints: 2450, prerequisiteProjectId: 'fo_corridor', sceneChangeKey: 'fo_spring', promise: '水源地就會恢復清澈' },
  { id: 'fo_canopy', habitatId: 'forest', title: '搭建樹冠步道', description: '高處的木棧道，看得到整片樹海', requiredPoints: 2600, prerequisiteProjectId: 'fo_spring', sceneChangeKey: 'fo_canopy', promise: '樹冠步道就能完成' },
  { id: 'fo_rescue', habitatId: 'forest', title: '設立保育救傷站', description: '受傷的動物在這裡被好好照顧', requiredPoints: 2700, prerequisiteProjectId: 'fo_canopy', sceneChangeKey: 'fo_rescue', promise: '保育救傷站就會設立' },
];
export const projectDef = (id: string) => PROJECTS.find((p) => p.id === id);

// ---------- 動物：每段專注是一次探索，完成就遇見一隻（台灣陸地保育類動物） ----------

/**
 * 開始前選要找的動物，專注時牠慢慢靠近，完成就遇見牠（族群成長見下方）；放棄的話牠被嚇跑了。
 * 取得方式：一開始就有、修好工程解鎖、商店用金幣解鎖、商店特別品種（真錢，上架後開放）。
 * 介紹保持簡單、保守，不宣稱保育等級或精確生態；上線前請內容夥伴再核對。
 */
export type AnimalShape = 'bird' | 'owl' | 'raptor' | 'pheasant' | 'pangolin' | 'cat' | 'mustelid' | 'bear' | 'goat';
// gems：只在商店用寶石解鎖的物種；project 的動物也可以在商店用寶石提早解鎖（見 content/shop.ts）
export type AnimalUnlock = { kind: 'start' } | { kind: 'project'; id: string } | { kind: 'coins'; price: number } | { kind: 'gems'; price: number } | { kind: 'iap'; price: string };
export interface AnimalDef {
  id: string;
  name: string;
  shape: AnimalShape; // 臨時圖用的外形
  color: string; // 臨時圖主色
  accent: string;
  unlock: AnimalUnlock;
  blurb: string;
  habitat: Habitat;
}

/**
 * 棲息地（觀察圖鑑的立體台灣地圖用）：只標大致地區與海拔帶，不標精確地點（避免打擾稀有動物）。
 * level：陸域保育類等級（1 瀕臨絕種、2 珍貴稀有、3 其他應予保育），依 2019 年修正名錄與林業及自然保育署資料整理，上架前再對照現行名錄。
 */
export interface Habitat {
  zone: 'low' | 'mid' | 'high' | 'legend'; // 低海拔、中海拔、中高海拔、傳說（沒有確切紀錄）
  region: string;
  elevation: string;
  level: 1 | 2 | 3;
  lon: number; // 地圖上的代表位置（經緯度，只是大致地區）
  lat: number;
}
export const ZONE_NAME: Record<Habitat['zone'], string> = { low: '低海拔', mid: '中海拔', high: '中高海拔', legend: '傳說' };
export const LEVEL_NAME: Record<Habitat['level'], string> = { 1: '一級・瀕臨絕種', 2: '二級・珍貴稀有', 3: '三級・其他應予保育' };
export const ANIMALS: AnimalDef[] = [
  { id: 'blue_magpie', name: '台灣藍鵲', shape: 'bird', color: '#2f6fd6', accent: '#e23b2e', unlock: { kind: 'start' }, blurb: '一身寶藍色的羽毛和長長的尾巴，常成群在樹林間穿梭。', habitat: { zone: 'low', region: '全島低至中海拔山區的闊葉林', elevation: '約 300～1,200 公尺', level: 3, lon: 121.55, lat: 25.12 } },
  { id: 'scops_owl', name: '領角鴞', shape: 'owl', color: '#9a7b5a', accent: '#f0c869', unlock: { kind: 'start' }, blurb: '夜裡活動的小型貓頭鷹，頭上有一對像耳朵的羽毛。', habitat: { zone: 'low', region: '全島平地到低海拔，都市公園也看得到', elevation: '約 1,200 公尺以下', level: 2, lon: 120.3, lat: 23.05 } },
  { id: 'pangolin', name: '穿山甲', shape: 'pangolin', color: '#a8865c', accent: '#6e5233', unlock: { kind: 'project', id: 'fo_trail' }, blurb: '全身覆蓋鱗片，遇到危險會捲成一顆球。', habitat: { zone: 'low', region: '全島低海拔淺山', elevation: '多在 1,000 公尺以下', level: 2, lon: 121.18, lat: 22.92 } },
  { id: 'pitta', name: '八色鳥', shape: 'bird', color: '#3fae5a', accent: '#f2c230', unlock: { kind: 'project', id: 'fo_saplings' }, blurb: '色彩繽紛的夏候鳥，常在森林底層的落葉間覓食。', habitat: { zone: 'low', region: '低海拔淺山闊葉林，例如雲林湖本（夏候鳥，約 4～9 月）', elevation: '低海拔', level: 2, lon: 120.62, lat: 23.72 } },
  { id: 'leopard_cat', name: '石虎', shape: 'cat', color: '#c99a5b', accent: '#5a4026', unlock: { kind: 'project', id: 'fo_cabin' }, blurb: '和家貓差不多大，額頭上有兩條明顯的白色斑紋。', habitat: { zone: 'low', region: '淺山地區，以苗栗、台中、南投為主', elevation: '多在 1,500 公尺以下', level: 1, lon: 120.85, lat: 24.48 } },
  { id: 'swinhoe_pheasant', name: '藍腹鷴', shape: 'pheasant', color: '#2b3f8c', accent: '#d8392f', unlock: { kind: 'project', id: 'fo_undergrowth' }, blurb: '雄鳥有深藍色的身體和白色的尾羽，常在清晨的林道上出現。', habitat: { zone: 'mid', region: '中低海拔原始闊葉林', elevation: '約 300～2,300 公尺', level: 2, lon: 121.4, lat: 24.68 } },
  { id: 'crab_mongoose', name: '食蟹獴', shape: 'mustelid', color: '#8a7a66', accent: '#efe6d6', unlock: { kind: 'project', id: 'fo_corridor' }, blurb: '喜歡在溪邊翻找食物，臉頰兩側有白色的條紋。', habitat: { zone: 'mid', region: '低至中海拔的溪流旁森林', elevation: '約 2,000 公尺以下', level: 3, lon: 120.82, lat: 23.85 } },
  { id: 'marten', name: '黃喉貂', shape: 'mustelid', color: '#3b2e25', accent: '#f2c230', unlock: { kind: 'project', id: 'fo_spring' }, blurb: '喉嚨是亮黃色的，動作靈活，能在樹上快速移動。', habitat: { zone: 'mid', region: '全島原始林，中海拔最常見', elevation: '約 300～3,900 公尺', level: 3, lon: 121.12, lat: 24.3 } },
  { id: 'hawk_eagle', name: '熊鷹', shape: 'raptor', color: '#6b4b30', accent: '#efe2c8', unlock: { kind: 'project', id: 'fo_canopy' }, blurb: '大型的猛禽，在森林上空盤旋，翅膀寬大有力。', habitat: { zone: 'mid', region: '中海拔原始林', elevation: '約 300～2,800 公尺', level: 1, lon: 120.78, lat: 22.62 } },
  { id: 'black_bear', name: '台灣黑熊', shape: 'bear', color: '#2a2622', accent: '#f1ecdf', unlock: { kind: 'project', id: 'fo_rescue' }, blurb: '胸前有一道白色的 V 字形斑紋，是台灣森林的代表動物。', habitat: { zone: 'high', region: '中央山脈、玉山、雪霸、大武山一帶', elevation: '主要約 1,000～3,500 公尺', level: 1, lon: 121.02, lat: 23.42 } },
  { id: 'civet', name: '小麝香貓', shape: 'cat', color: '#b7a07c', accent: '#4a3b2a', unlock: { kind: 'coins', price: 800 }, blurb: '身上有成排的黑色斑點，尾巴有一圈一圈的環紋。', habitat: { zone: 'low', region: '低海拔草生地與農墾地', elevation: '約 1,000 公尺以下', level: 2, lon: 120.75, lat: 22.12 } },
  { id: 'mikado_pheasant', name: '帝雉', shape: 'pheasant', color: '#1f2f5c', accent: '#7fa3d8', unlock: { kind: 'coins', price: 1200 }, blurb: '住在中高海拔森林，羽毛在陽光下帶著藍紫色的光澤。', habitat: { zone: 'high', region: '中央山脈高山，常有雲霧的針闊葉林', elevation: '約 1,800～3,800 公尺', level: 2, lon: 121.27, lat: 24.12 } },
  { id: 'serow', name: '長鬃山羊', shape: 'goat', color: '#6d5a48', accent: '#d9cbb5', unlock: { kind: 'coins', price: 1600 }, blurb: '擅長在陡峭的山壁上行走，脖子上有長長的鬃毛。', habitat: { zone: 'high', region: '中高海拔陡峭山壁，例如南湖大山、雪山圈谷', elevation: '200 公尺到高山，1,000 公尺以上較常見', level: 3, lon: 121.44, lat: 24.36 } },
  // 商店的新物種（保育類等級與棲息地上架前要再核對）
  { id: 'crested_serpent_eagle', name: '大冠鷲', shape: 'raptor', color: '#5a4632', accent: '#f2d27a', unlock: { kind: 'coins', price: 1400 }, blurb: '常在山區上空盤旋，叫聲響亮，最愛吃蛇。', habitat: { zone: 'low', region: '全島低至中海拔山區', elevation: '約 2,000 公尺以下', level: 2, lon: 120.95, lat: 23.25 } },
  { id: 'maroon_oriole', name: '朱鸝', shape: 'bird', color: '#8f1d2c', accent: '#2a1a1a', unlock: { kind: 'coins', price: 1800 }, blurb: '全身酒紅色、頭是黑色，數量稀少的美麗鳥兒。', habitat: { zone: 'low', region: '低海拔闊葉林，東部與南部較常見', elevation: '約 1,000 公尺以下', level: 2, lon: 121.3, lat: 22.9 } },
  { id: 'yellow_tit', name: '黃山雀', shape: 'bird', color: '#f2c230', accent: '#1f2a3a', unlock: { kind: 'gems', price: 70 }, blurb: '台灣特有種，黃色的身體配上黑色的冠羽。', habitat: { zone: 'mid', region: '中海拔闊葉林', elevation: '約 1,000～2,500 公尺', level: 2, lon: 121.0, lat: 24.05 } },
  { id: 'fish_owl', name: '黃魚鴞', shape: 'owl', color: '#c08a3e', accent: '#f2c230', unlock: { kind: 'gems', price: 90 }, blurb: '台灣最大的貓頭鷹，住在溪流旁，夜裡會抓魚。', habitat: { zone: 'mid', region: '中低海拔原始闊葉林的溪流沿岸', elevation: '約 500～2,000 公尺', level: 1, lon: 121.3, lat: 24.2 } },
  { id: 'clouded_leopard', name: '台灣雲豹', shape: 'cat', color: '#c2a476', accent: '#5b4630', unlock: { kind: 'iap', price: 'NT$90' }, blurb: '身上有像雲朵的斑紋。野外已多年沒有確切紀錄，是森林裡的傳說。', habitat: { zone: 'legend', region: '過去分布在中低海拔原始林；2013 年研究團隊調查後認為台灣野外可能已滅絕', elevation: '已多年沒有確切紀錄', level: 1, lon: 120.9, lat: 22.8 } },
  { id: 'black_eagle', name: '林鵰', shape: 'raptor', color: '#2b2622', accent: '#f2c230', unlock: { kind: 'iap', price: 'NT$60' }, blurb: '全身深色的大型猛禽，常貼著樹冠緩緩滑翔。', habitat: { zone: 'mid', region: '中低海拔原始闊葉林', elevation: '約 500～2,500 公尺', level: 2, lon: 121.45, lat: 23.85 } },
];
export const animalDef = (id: string | undefined) => ANIMALS.find((a) => a.id === id) ?? ANIMALS[0];
// ---------- 探索與族群成長 ----------
// 每段專注是一次「探索」：開始前選想找的動物，完成就遇見牠（留下一筆觀察紀錄），提前放棄牠就被嚇跑了。
// 同一種動物觀察越多次，族群在森林裡越穩定，看到的個體也越成熟：幼年 → 亞成年 → 成年。
/** 族群成長值達到幾點進入：亞成年、成年。 */
export const GROWTH_AT = [3, 8] as const;
export const GROWTH_MAX = GROWTH_AT[GROWTH_AT.length - 1];
/** 一次探索帶來的成長：60 分鐘以上算 2 點（鼓勵長時間專注）。 */
export const growthFor = (minutes: number) => (minutes >= 60 ? 2 : 1);
/** 成長值 → 階段（0 幼年、1 亞成年、2 成年）。 */
export const stageOfGrowth = (g: number) => (g >= GROWTH_AT[1] ? 2 : g >= GROWTH_AT[0] ? 1 : 0);
const BIRD_SHAPES: AnimalShape[] = ['bird', 'owl', 'pheasant', 'raptor'];
/** 階段名稱：鳥類「雛鳥／幼鳥／成鳥」，哺乳類「幼獸／亞成獸／成獸」。 */
export const stageName = (a: AnimalDef, stage: number) => (BIRD_SHAPES.includes(a.shape) ? ['雛鳥', '幼鳥', '成鳥'] : ['幼獸', '亞成獸', '成獸'])[Math.max(0, Math.min(2, stage))];

// ---------- 大自然交響樂：可收集的環境音 ----------

export type SoundUnlock = { kind: 'start' } | { kind: 'project'; id: string } | { kind: 'hatched'; id: string };
export interface SoundDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  unlock: SoundUnlock;
}
// id 對應 sound.ts 裡合成的聲音
export const SOUNDS: SoundDef[] = [
  { id: 'breeze', name: '森林微風', icon: '🍃', desc: '風輕輕吹過樹梢。', unlock: { kind: 'start' } },
  { id: 'birds', name: '林間鳥鳴', icon: '🐦', desc: '樹林間此起彼落的鳥叫聲。', unlock: { kind: 'project', id: 'fo_saplings' } },
  { id: 'bees', name: '草叢蟲鳴', icon: '🐝', desc: '草叢裡忙碌的小昆蟲。', unlock: { kind: 'project', id: 'fo_undergrowth' } },
  { id: 'stream', name: '泉水潺潺', icon: '💧', desc: '水源地的泉水流過石頭。', unlock: { kind: 'project', id: 'fo_spring' } },
  { id: 'fountain', name: '雨後滴答', icon: '🌧️', desc: '雨停後，水滴從樹葉落下。', unlock: { kind: 'project', id: 'fo_canopy' } },
  { id: 'night', name: '夏夜森林', icon: '🌙', desc: '夜晚的森林，遠處傳來貓頭鷹的叫聲。', unlock: { kind: 'hatched', id: 'scops_owl' } },
  { id: 'frogs', name: '林間蛙鳴', icon: '🐸', desc: '下過雨的夜裡，樹蛙開始合唱。', unlock: { kind: 'project', id: 'fo_rescue' } },
];

/** 測試工具（專注畫面的「立即完成」）。上線前改成 false。 */
export const TEST_TOOLS = true;

/** 內容版本：3 = 陸地森林＋探索動物（舊的溫室／溪流、植物、寵物存檔載入時轉換，見 save.ts migrateForest）。 */
export const CONTENT_VERSION = 3;

export const COPY = {
  start: '為自己留一段時間。',
  complete: (min: number) => `這 ${min} 分鐘，讓森林更靠近春天。`,
  projectNeed: (pts: number, promise: string) => `再 ${pts} 點，${promise}。`,
  welcomeBack: '歡迎回來，小島一直在這裡。',
  allRestored: '森林已經恢復了。今天也一起好好生活。',
  demoBanner: '本機合作示範，非即時連線',
  multiplayerOff: '多人連線尚未啟用',
};
