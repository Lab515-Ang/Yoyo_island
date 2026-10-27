// 商店：買商品、寶石換金幣、每日精選與精選推薦。全部是對 SaveFile 的純函式。
import { ANIMALS, SOUNDS, animalDef } from '../content/config';
import { COIN_PACKS, DAILY_PICKS, REFRESH_COINS, SHOP_ITEMS, shopItem, type ShopItem } from '../content/shop';
import { localDateKey, nextLocalMidnight, weekStartKey } from './focus';
import { animalUnlocked, coins, gems, islandId, soundUnlocked, type ActionResult } from './game';
import type { PointTransaction, SaveFile } from './types';

const iso = (t: number) => new Date(t).toISOString();
const newId = () => crypto.randomUUID();

/** 商品的紀錄 key：動物沿用舊的 animal: key（金幣、寶石、寶箱送的都算），其他用 shop:。 */
export const itemKey = (save: SaveFile, it: ShopItem) => (it.kind === 'animal' ? `animal:${islandId(save)}:${it.ref}` : `shop:${islandId(save)}:${it.id}`);

/** 已經擁有（動物包含工程完成、一開始就有的；環境音包含收集到的）。 */
export function owned(save: SaveFile, it: ShopItem) {
  if (it.kind === 'animal') return animalUnlocked(save, animalDef(it.ref));
  if (it.kind === 'sound') {
    const s = SOUNDS.find((x) => x.id === it.ref);
    return !!s && soundUnlocked(save, s.unlock, s.id);
  }
  return save.transactions.some((t) => t.idempotencyKey === itemKey(save, it));
}

export const landOwned = (save: SaveFile, landId: string) => landId === 'classic' || owned(save, shopItem(`land:${landId}`)!);

/** 用金幣或寶石買商品（真錢的上架後才開放）。 */
export function buyItem(save: SaveFile, itemId: string, now: number): ActionResult {
  const it = shopItem(itemId);
  if (!it || 'iap' in it.price) return { ok: false, error: '這個商品現在還不能買。' };
  if (owned(save, it)) return { ok: false, error: `已經擁有${it.name}了。` };
  const base = { id: newId(), userId: save.profile.id, islandId: islandId(save), idempotencyKey: itemKey(save, it), createdAt: iso(now), ...(it.kind === 'animal' ? { animalId: it.ref } : {}) };
  let t: PointTransaction;
  if ('coins' in it.price) {
    const short = it.price.coins - coins(save);
    if (short > 0) return { ok: false, error: `金幣不足，還差 ${short} 金幣。` };
    // 動物用金幣買沿用 animal_unlock（舊存檔的商店紀錄也是這種）
    t = { ...base, kind: it.kind === 'animal' ? 'animal_unlock' : 'shop_buy', amount: -it.price.coins };
  } else {
    const short = it.price.gems - gems(save);
    if (short > 0) return { ok: false, error: `寶石不足，還差 ${short} 顆寶石。` };
    t = { ...base, kind: 'gem_spend', amount: -it.price.gems };
  }
  return { ok: true, save: { ...save, transactions: [...save.transactions, t] } };
}

/** 寶石換金幣：一筆扣寶石、一筆加金幣，用同一個 id 配對（存檔檢查會核對數量）。 */
export function exchangeCoins(save: SaveFile, packId: string, now: number): ActionResult {
  const p = COIN_PACKS.find((x) => x.id === packId);
  if (!p) return { ok: false, error: '找不到這個方案。' };
  const short = p.gems - gems(save);
  if (short > 0) return { ok: false, error: `寶石不足，還差 ${short} 顆寶石。` };
  const id = newId();
  const base = { userId: save.profile.id, islandId: islandId(save), createdAt: iso(now) };
  const spend: PointTransaction = { ...base, id: newId(), kind: 'gem_spend', amount: -p.gems, idempotencyKey: `exchange:${id}:gems` };
  const get: PointTransaction = { ...base, id: newId(), kind: 'coin_exchange', amount: p.coins, idempotencyKey: `exchange:${id}:coins` };
  return { ok: true, save: { ...save, transactions: [...save.transactions, spend, get] } };
}

// ---------- 每日精選與精選推薦 ----------

/** 固定種子的亂數（同一天、同一批看到的都一樣）。 */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
const shuffle = <T,>(xs: T[], r: () => number) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const refreshes = (save: SaveFile, day: string) => save.transactions.filter((t) => t.idempotencyKey.startsWith(`refresh:${islandId(save)}:${day}:`));

/**
 * 今天的每日精選：6 個，寶石 2～3 個、其餘金幣；午夜換新，也可以花金幣換一批。
 * 只從「這一批開始時還沒擁有」的商品挑，買了之後清單不會跟著變（顯示已擁有）。
 */
export function dailyPicks(save: SaveFile, now: number) {
  const day = localDateKey(now, save.profile.timezone);
  const rs = refreshes(save, day);
  // 這一批開始（今天第一次或上次換一批）之前的紀錄：用來判斷「當時還沒擁有」
  const since = rs.length ? rs[rs.length - 1].createdAt : null;
  const tz = save.profile.timezone;
  const before = { ...save, transactions: save.transactions.filter((t) => (since ? t.createdAt < since : localDateKey(Date.parse(t.createdAt), tz) < day)) };
  const pool = SHOP_ITEMS.filter((it) => !('iap' in it.price) && !owned(before, it));
  const r = rng(`${save.profile.id}:${day}:${rs.length}`);
  const gemPool = shuffle(pool.filter((it) => 'gems' in it.price), r);
  const coinPool = shuffle(pool.filter((it) => 'coins' in it.price), r);
  const nGem = Math.min(gemPool.length, 2 + Math.floor(r() * 2), DAILY_PICKS);
  const picks = [...gemPool.slice(0, nGem), ...coinPool.slice(0, DAILY_PICKS - nGem)];
  // 金幣商品不夠時用寶石商品補滿
  for (const it of gemPool.slice(nGem)) if (picks.length < DAILY_PICKS) picks.push(it);
  return { picks, nextAt: nextLocalMidnight(now, save.profile.timezone), refreshed: rs.length };
}

/** 花金幣換一批每日精選。 */
export function refreshPicks(save: SaveFile, now: number): ActionResult {
  if (coins(save) < REFRESH_COINS) return { ok: false, error: `金幣不足，換一批要 ${REFRESH_COINS} 金幣。` };
  const day = localDateKey(now, save.profile.timezone);
  const t: PointTransaction = { id: newId(), userId: save.profile.id, islandId: islandId(save), kind: 'shop_buy', amount: -REFRESH_COINS, idempotencyKey: `refresh:${islandId(save)}:${day}:${refreshes(save, day).length}`, createdAt: iso(now) };
  return { ok: true, save: { ...save, transactions: [...save.transactions, t] } };
}

/** 精選推薦：每週換 3 個，從新物種、特別探索與土地造型裡挑（優先還沒擁有的）。 */
export function featuredItems(save: SaveFile, now: number) {
  const week = weekStartKey(localDateKey(now, save.profile.timezone));
  const special = SHOP_ITEMS.filter((it) => it.kind === 'land' || (it.kind === 'animal' && ['gems', 'iap', 'coins'].includes(animalDef(it.ref).unlock.kind)));
  const r = rng(`${save.profile.id}:featured:${week}`);
  const [fresh, have] = [special.filter((it) => !owned(save, it)), special.filter((it) => owned(save, it))];
  return [...shuffle(fresh, r), ...shuffle(have, r)].slice(0, 3);
}

/** 存檔檢查用：商品 key 是否認得。 */
export function shopKeyOk(key: string) {
  const m = /^shop:[^:]+:(.+)$/.exec(key);
  return !!m && !!shopItem(m[1]);
}
export const animalKeyOk = (key: string, islandIdOfTx: string) => ANIMALS.some((a) => key === `animal:${islandIdOfTx}:${a.id}`);
export const coinPackOk = (gemsSpent: number, coinsGot: number) => COIN_PACKS.some((p) => p.gems === gemsSpent && p.coins === coinsGot);
