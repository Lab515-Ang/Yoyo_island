// 平台層：所有原生功能（通知、App 狀態、震動）都從這裡呼叫。
// App 版用 Capacitor 外掛；網頁版（目前只當測試管道）退回瀏覽器做法。之後換技術時只需要換這一層。
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';

export const isNative = Capacitor.isNativePlatform();

const FOCUS_END_ID = 1;

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
  try {
    if (!(await requestNotifyPermission())) return;
    await LocalNotifications.cancel({ notifications: [{ id: FOCUS_END_ID }] });
    await LocalNotifications.schedule({ notifications: [{ id: FOCUS_END_ID, title, body, schedule: { at: new Date(at), allowWhileIdle: true } }] });
  } catch {
    // 排程失敗不影響計時，回到 App 時仍會結算
  }
}

/** 暫停、取消、放棄或結束時，取消還沒跳出的通知。 */
export async function cancelFocusEnd() {
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
