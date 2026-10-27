// 商店的商品、寶石與金幣方案（數值都在這裡調）
import { ANIMALS, PROJECTS, SOUNDS } from './config';

export type Price = { coins: number } | { gems: number } | { iap: string };
export type ShopItem = { id: string; kind: 'animal' | 'sound' | 'land'; ref: string; name: string; price: Price };

/** 土地造型：專注紀錄那塊等角草地的顏色（草地、左側土壤、右側土壤）。classic 一開始就有。 */
export const LANDS = [
  { id: 'classic', name: '經典草地', top: '#a9cf80', left: '#8a6847', right: '#a3805a', price: null },
  { id: 'sakura', name: '櫻花草地', top: '#f2c4cf', left: '#8a6847', right: '#a3805a', price: { coins: 2000 } },
  { id: 'autumn', name: '秋楓林地', top: '#e6a65a', left: '#7a5a3e', right: '#93704f', price: { coins: 2400 } },
  { id: 'snow', name: '雪地', top: '#f4f6f4', left: '#8d9aa3', right: '#a9b4bb', price: { gems: 60 } },
  { id: 'moss', name: '月光苔原', top: '#7fb7a8', left: '#4d5a66', right: '#62707d', price: { gems: 80 } },
] as const;
export type LandId = (typeof LANDS)[number]['id'];
export const landDef = (id: string) => LANDS.find((l) => l.id === id) ?? LANDS[0];

// 工程才會回來的動物，也可以用寶石提早解鎖：越後面的工程越貴
const projectGems = (projectId: string) => 40 + 10 * Math.max(0, PROJECTS.findIndex((p) => p.id === projectId));
// 環境音：不想等工程或遇見，也可以用金幣買
const SOUND_COINS: Record<string, number> = { birds: 600, bees: 700, stream: 800, fountain: 900, night: 600, frogs: 1000 };

export const SHOP_ITEMS: ShopItem[] = [
  ...ANIMALS.flatMap((a): ShopItem[] => {
    const base = { id: `animal:${a.id}`, kind: 'animal' as const, ref: a.id, name: a.name };
    const u = a.unlock;
    if (u.kind === 'coins') return [{ ...base, price: { coins: u.price } }];
    if (u.kind === 'gems') return [{ ...base, price: { gems: u.price } }];
    if (u.kind === 'iap') return [{ ...base, price: { iap: u.price } }];
    if (u.kind === 'project') return [{ ...base, price: { gems: projectGems(u.id) } }];
    return [];
  }),
  ...SOUNDS.filter((s) => SOUND_COINS[s.id]).map((s): ShopItem => ({ id: `sound:${s.id}`, kind: 'sound', ref: s.id, name: s.name, price: { coins: SOUND_COINS[s.id] } })),
  ...LANDS.filter((l) => l.price).map((l): ShopItem => ({ id: `land:${l.id}`, kind: 'land', ref: l.id, name: l.name, price: l.price! })),
];
export const shopItem = (id: string) => SHOP_ITEMS.find((x) => x.id === id);

/** 寶石換金幣（參考 Forest：買越多送越多）。 */
export const COIN_PACKS = [
  { id: 'bag', name: '一袋金幣', gems: 50, coins: 1500, bonus: 0 },
  { id: 'barrel', name: '一桶金幣', gems: 100, coins: 3150, bonus: 5 },
  { id: 'cart', name: '一推車金幣', gems: 200, coins: 6600, bonus: 10 },
  { id: 'chest', name: '一大箱金幣', gems: 400, coins: 13800, bonus: 15 },
] as const;

/** 用真實貨幣買寶石（Google Play 付款，上架後開放）。 */
export const GEM_PACKS = [
  { id: 'scoop', name: '一鏟子寶石', gems: 30, price: 'NT$30', bonus: 0 },
  { id: 'pot', name: '一小盆寶石', gems: 160, price: 'NT$150', bonus: 6 },
  { id: 'sack', name: '一大袋寶石', gems: 345, price: 'NT$300', bonus: 15 },
  { id: 'cartful', name: '一推車寶石', gems: 720, price: 'NT$600', bonus: 20 },
] as const;

/** 每日精選：6 個，寶石 2～3 個、金幣其餘；花金幣可以換一批。 */
export const DAILY_PICKS = 6;
export const REFRESH_COINS = 300;
/** 寶箱偶爾送的寶石 */
export const STARTER_GEMS = 10;
export const MONTH_GEMS = 20;
