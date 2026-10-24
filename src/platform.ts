// 平台層：所有原生功能（通知、App 狀態、震動）都從這裡呼叫。
// App 版用 Capacitor 外掛；網頁版（目前只當測試管道）退回瀏覽器做法。之後換技術時只需要換這一層。
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';

export const isNative = Capacitor.isNativePlatform();
export const isAndroid = Capacitor.getPlatform() === 'android';

const FOCUS_END_ID = 1;
// 每次取消就加一：排程要先等權限與狀態查詢，期間若被取消，就放棄這次排程
let focusEndGen = 0;

/** 要求通知權限；回傳是否允許。 */
export async function requestNotifyPermission(): Promise<boolean> {
  try {
    if (isNative) {
      const cur = await LocalNotifications.checkPermissions();
      if (cur.display === 'granted') return true;
      return (await LocalNotifications.requestPermissions()).display === 'granted';
    }
    if (typeof Notification === 'undefined') return false;
    const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    return p === 'granted';
  } catch {
    return false;
  }
}

/** 排定倒數結束通知：App 版用系統本機通知，鎖屏、關掉 App 也會準時跳出。網頁版不排程（網頁在回到頁面時提醒）。 */
export async function scheduleFocusEnd(at: number, title: string, body: string) {
  if (!isNative || at <= Date.now()) return;
  const gen = focusEndGen;
  try {
    if (!(await requestNotifyPermission())) return;
    await LocalNotifications.cancel({ notifications: [{ id: FOCUS_END_ID }] });
    // 沒有「鬧鐘與提醒」權限時改用一般提醒（可能稍晚一點）：
    // 不然外掛會在每次開始專注時把玩家帶去系統設定頁，深度專注也會因此判定離開
    const exact = isAndroid ? (await TimeGuard.status().catch(() => ({ exactAlarm: false }))).exactAlarm : true;
    if (gen !== focusEndGen) return;
    await LocalNotifications.schedule({ notifications: [{ id: FOCUS_END_ID, title, body, schedule: { at: new Date(at), allowWhileIdle: true }, isExactNotification: exact }] });
  } catch {
    // 排程失敗不影響計時，回到 App 時仍會結算
  }
}

/** 暫停、取消、放棄或結束時，取消還沒跳出的通知。 */
export async function cancelFocusEnd() {
  focusEndGen++;
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: FOCUS_END_ID }] });
  } catch {
    // 沒有排程時忽略
  }
}

/** App 回到前景時呼叫 cb（網頁版用 visibilitychange）。回傳取消監聽的函式。 */
export function onResume(cb: () => void): () => void {
  if (isNative) {
    const handle = App.addListener('appStateChange', ({ isActive }) => isActive && cb());
    return () => void handle.then((h) => h.remove());
  }
  const on = () => document.visibilityState === 'visible' && cb();
  document.addEventListener('visibilitychange', on);
  return () => document.removeEventListener('visibilitychange', on);
}

/** 輕微震動（倒數結束時）。 */
export function buzz() {
  if (isNative) void Haptics.vibrate({ duration: 300 }).catch(() => undefined);
  else navigator.vibrate?.([200, 100, 200]);
}

// ── 時間守護（目前只有 Android 原生版）──────────────────────────────

export interface GuardApp {
  pkg: string;
  label: string;
  icon?: string; // data URL
}

/** 守護設定：存在手機的原生設定裡，App 關掉後背景服務照樣使用。 */
export interface GuardConfig {
  enabled: boolean;
  apps: GuardApp[]; // 只存 pkg、label
  always: boolean; // true = 全天候；false = 依下方時段
  from: number; // 一天中的第幾分鐘
  to: number; // from > to 表示跨午夜
  days: boolean[]; // 0 = 週日
}

export const defaultGuardConfig = (): GuardConfig => ({
  enabled: false,
  apps: [],
  always: true,
  from: 9 * 60,
  to: 17 * 60,
  days: [false, true, true, true, true, true, false],
});

interface TimeGuardNative {
  status(): Promise<{ usage: boolean; overlay: boolean; exactAlarm: boolean }>;
  openExactAlarmSettings(): Promise<void>;
  openUsageSettings(): Promise<void>;
  openOverlaySettings(): Promise<void>;
  listApps(): Promise<{ apps: GuardApp[] }>;
  getConfig(): Promise<{ config: GuardConfig | null }>;
  setConfig(o: { config: GuardConfig }): Promise<void>;
  unlock(o: { pkg: string; minutes: number }): Promise<void>;
  goHome(): Promise<void>;
  startFocusWatch(o: { key: string; endAt: number; graceMs: number; allow: string[]; notifyEnd: boolean; doneTitle: string; doneText: string }): Promise<void>;
  stopFocusWatch(): Promise<void>;
  focusWatchStatus(): Promise<{ active: boolean; failedAt: number; callStart: number; calls: [number, number][] }>;
  clearFocusEvents(): Promise<void>;
}

/** 深度專注：離開小島超過這麼久，蛋就不會孵化。 */
export const DEEP_GRACE_MS = 10_000;

export const TimeGuard = registerPlugin<TimeGuardNative>('TimeGuard');

/** Android 返回鍵：有監聽時系統不會直接關掉 App，由 cb 決定怎麼回上一步。網頁版不處理。 */
export function onBack(cb: () => void): () => void {
  if (!isAndroid) return () => undefined;
  const handle = App.addListener('backButton', cb);
  return () => void handle.then((h) => h.remove());
}

/** 回到桌面但不結束 App（返回鍵在大廳時）。 */
export const minimizeApp = () => void App.minimizeApp().catch(() => undefined);

/** App 進到背景時呼叫 cb。回傳取消監聽的函式。 */
export function onPause(cb: () => void): () => void {
  if (isNative) {
    const handle = App.addListener('appStateChange', ({ isActive }) => !isActive && cb());
    return () => void handle.then((h) => h.remove());
  }
  const on = () => document.visibilityState === 'hidden' && cb();
  document.addEventListener('visibilitychange', on);
  return () => document.removeEventListener('visibilitychange', on);
}

// 啟動網址只處理一次：畫面重新掛上時不會再跳出同一個攔截畫面
let launchHandled = false;

/** 背景服務把小島叫到前面時（qiguang://guard?pkg=…&label=…）呼叫 cb。回傳取消監聽的函式。 */
export function onGuard(cb: (app: GuardApp) => void): () => void {
  if (!isAndroid) return () => undefined;
  const handle = (url?: string) => {
    if (!url?.startsWith('qiguang://guard')) return;
    const q = new URL(url).searchParams;
    const pkg = q.get('pkg');
    if (pkg) cb({ pkg, label: q.get('label') ?? pkg });
  };
  if (!launchHandled) {
    launchHandled = true;
    void App.getLaunchUrl().then((r) => handle(r?.url));
  }
  const listener = App.addListener('appUrlOpen', (e) => handle(e.url));
  return () => void listener.then((h) => h.remove());
}
