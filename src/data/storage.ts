// 本機儲存：每個模式一個 localStorage key，整份存檔原子寫入。
// 未來雲端 adapter 取代這裡的 load/write 即可（見 README「多人接入」）。
import { CONTENT_VERSION, STORAGE_PREFIX } from '../content/config';
import { validateSave } from '../domain/save';
import type { AppMode, SaveFile } from '../domain/types';

const saveKey = (mode: AppMode) => `${STORAGE_PREFIX}:save:${mode}`;
const MODE_KEY = `${STORAGE_PREFIX}:mode`;

export type LoadResult = { status: 'empty' } | { status: 'ok'; save: SaveFile } | { status: 'corrupt'; error: string; raw: string };

export function load(mode: AppMode): LoadResult {
  const raw = localStorage.getItem(saveKey(mode));
  if (raw === null) return { status: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt', error: '存檔無法讀取。', raw };
  }
  const v = validateSave(parsed);
  if (!v.ok) return { status: 'corrupt', error: v.error, raw };
  if (v.save.mode !== mode) return { status: 'corrupt', error: '存檔模式不符。', raw };
  // 舊版存檔轉換後馬上寫回，之後就不用每次開啟都再轉一次
  if ((parsed as { content?: number }).content !== CONTENT_VERSION) {
    try {
      return { status: 'ok', save: write(v.save, null) };
    } catch {
      // 寫不進去（空間不足）就先用轉換好的版本，下次操作時再存
    }
  }
  return { status: 'ok', save: v.save };
}

export class StaleSaveError extends Error {}

/** 寫入前確認存檔沒被其他分頁更新過；被更新就拒絕覆寫。 */
export function write(next: SaveFile, expectedSavedAt: string | null): SaveFile {
  const key = saveKey(next.mode);
  const current = localStorage.getItem(key);
  if (current !== null && expectedSavedAt !== null) {
    // 只找 savedAt，不整份 JSON.parse（存檔大了每次寫入會多花好幾毫秒）；
    // 使用者輸入的文字在 JSON 裡引號會被跳脫，不會誤判成這個欄位
    const m = /"savedAt":"([^"]*)"/.exec(current);
    if (m && m[1] !== expectedSavedAt) throw new StaleSaveError();
  }
  const stamped = { ...next, savedAt: new Date().toISOString() };
  localStorage.setItem(key, JSON.stringify(stamped));
  return stamped;
}

export const remove = (mode: AppMode) => localStorage.removeItem(saveKey(mode));

export const getMode = (): AppMode => (localStorage.getItem(MODE_KEY) === 'demo' ? 'demo' : 'personal');
export const setMode = (mode: AppMode) => localStorage.setItem(MODE_KEY, mode);

/** 重設：只清除本 App 的 key。 */
export function clearAll() {
  for (const k of Object.keys(localStorage)) if (k.startsWith(`${STORAGE_PREFIX}:`) || k.startsWith('qiguang-ui:')) localStorage.removeItem(k);
}

export const isOurKey = (k: string | null) => !!k && k.startsWith(`${STORAGE_PREFIX}:`);
