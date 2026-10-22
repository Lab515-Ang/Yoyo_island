import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import * as storage from '../data/storage';
import { newDemoSave } from '../domain/save';
import type { AppMode, SaveFile } from '../domain/types';

interface Store {
  mode: AppMode;
  loaded: storage.LoadResult;
  save: SaveFile | null;
  stale: boolean;
  writeError: string | null;
  /** 套用純函式並原子保存；回傳保存後的存檔，失敗回傳 null。 */
  update: (fn: (s: SaveFile) => SaveFile) => SaveFile | null;
  /** 整份取代（新手建立、匯入）。 */
  replace: (s: SaveFile) => boolean;
  switchMode: (m: AppMode) => void;
  resetDemo: () => void;
  resetAll: () => void;
  toast: string | null;
  notify: (msg: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppMode>(storage.getMode);
  const [loaded, setLoaded] = useState<storage.LoadResult>(() => storage.load(storage.getMode()));
  const ref = useRef<SaveFile | null>(loaded.status === 'ok' ? loaded.save : null);
  const [stale, setStale] = useState(false);
  const staleRef = useRef(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);

  // 其他分頁寫入同一存檔 → 此分頁停止寫入，請玩家重新載入
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (storage.isOurKey(e.key)) {
        staleRef.current = true;
        setStale(true);
      }
    };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);

  const commit = useCallback((next: SaveFile, expected: string | null) => {
    if (staleRef.current) return null;
    try {
      const stamped = storage.write(next, expected);
      ref.current = stamped;
      setLoaded({ status: 'ok', save: stamped });
      setWriteError(null);
      return stamped;
    } catch (e) {
      if (e instanceof storage.StaleSaveError) {
        staleRef.current = true;
        setStale(true);
      } else setWriteError('無法保存到這台裝置，可能是瀏覽器儲存空間已滿或被停用。剛才的操作沒有生效。');
      return null;
    }
  }, []);

  const update = useCallback(
    (fn: (s: SaveFile) => SaveFile) => {
      const cur = ref.current;
      if (!cur) return null;
      const next = fn(cur);
      return next === cur ? cur : commit(next, cur.savedAt);
    },
    [commit],
  );

  const replace = useCallback((s: SaveFile) => commit(s, null) !== null, [commit]);

  const switchMode = useCallback(
    (m: AppMode) => {
      if (staleRef.current) return;
      const personal = m === 'demo' ? storage.load('personal') : null;
      storage.setMode(m);
      setMode(m);
      let r = storage.load(m);
      if (m === 'demo' && r.status === 'empty') {
        const demo = storage.write(newDemoSave(personal?.status === 'ok' ? personal.save : null, Date.now()), null);
        r = { status: 'ok', save: demo };
      }
      ref.current = r.status === 'ok' ? r.save : null;
      setLoaded(r);
    },
    [],
  );

  const resetDemo = useCallback(() => {
    storage.remove('demo');
    switchMode('demo');
  }, [switchMode]);

  const resetAll = useCallback(() => {
    storage.clearAll();
    ref.current = null;
    setMode('personal');
    setLoaded({ status: 'empty' });
  }, []);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  return (
    <Ctx.Provider value={{ mode, loaded, save: loaded.status === 'ok' ? loaded.save : null, stale, writeError, update, replace, switchMode, resetDemo, resetAll, toast, notify }}>
      {children}
    </Ctx.Provider>
  );
}

export function useGame() {
  const s = useContext(Ctx);
  if (!s) throw new Error('GameProvider missing');
  return s;
}

/** 已有存檔時使用的 hook（App 只在存檔存在時渲染主要頁面）。 */
export function useSave() {
  const g = useGame();
  return { ...g, save: g.save! };
}

/** 每 interval 重新渲染一次；真實時間由時間戳推算。 */
export function useNow(interval = 1000, active = true) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, interval);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [interval, active]);
  return now;
}
