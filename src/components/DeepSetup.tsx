// 深度專注設定清單（參考 Forest「開始使用深度專注」）：需要的權限列在同一頁，開好的打勾，從系統設定回來自動更新。
import { useEffect, useState } from 'react';
import { TimeGuard, onResume, requestNotifyPermission } from '../platform';
import { Modal } from './ui';

type Perm = { usage: boolean; overlay: boolean; notify: boolean; battery: boolean };
const SEEN_KEY = 'qiguang-ui:deepSetupSeen'; // 介面偏好：清單看過了（之後只有缺必要權限才會再跳）

export const deepSetupSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
};

/** 目前的權限狀態（讀不到就當作都沒開）。 */
export const deepPerm = (): Promise<Perm> => TimeGuard.status().catch(() => ({ usage: false, overlay: false, notify: false, battery: false }));

const ITEMS: { key: keyof Perm; title: string; why: string; need?: boolean; open: () => unknown }[] = [
  { key: 'usage', title: '允許查看使用情況', why: '判斷你有沒有離開小島（只看前景是哪個 App，不讀任何內容）', need: true, open: () => TimeGuard.openUsageSettings() },
  { key: 'overlay', title: '允許顯示在其他應用程式上層', why: '專注中打開其他 App 時，馬上帶你回到小島', open: () => TimeGuard.openOverlaySettings() },
  { key: 'notify', title: '允許通知', why: '離開時提醒你回來，並在通知列顯示專注倒數', open: async () => (await requestNotifyPermission()) || TimeGuard.openNotificationSettings() },
  { key: 'battery', title: '不受省電限制', why: '避免系統在背景把看守關掉（在清單裡把棲光小島設成「不限制」）', open: () => TimeGuard.openBatterySettings() },
];

/**
 * onStart：開始專注（從大廳按開始時）；沒有就是單純查看設定。
 * onDisable：先關閉深度專注、照常開始。
 */
export function DeepSetup({ onStart, onDisable, onClose }: { onStart?: () => void; onDisable?: () => void; onClose: () => void }) {
  const [perm, setPerm] = useState<Perm | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // 只影響下次會不會再跳
    }
    const load = () => void deepPerm().then(setPerm);
    load();
    return onResume(load); // 從系統設定回來時更新勾選
  }, []);
  const done = !!perm && ITEMS.every((i) => perm[i.key]);
  return (
    <Modal title="開始使用深度專注" onClose={onClose}>
      <p className="small muted">深度專注期間只能使用允許名單裡的 App；離開小島太久，動物會被嚇跑。開好下面的權限，小島才能幫你守住這段時間。</p>
      <ul className="deep-setup">
        {ITEMS.map((i) => {
          const ok = !!perm?.[i.key];
          return (
            <li key={i.key} className={ok ? 'ok' : ''}>
              <span className="deep-check" aria-hidden="true">
                {ok ? '✓' : ''}
              </span>
              <span>
                <strong>
                  {i.title}
                  {i.need && <em>必要</em>}
                </strong>
                <small>{i.why}</small>
              </span>
              {!ok && (
                <button className="ghost small" onClick={() => void i.open()} aria-label={`去開啟：${i.title}`}>
                  去開啟
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {done && <p className="deep-done">🎉 設定完成！以後開始深度專注就不用再設定了。</p>}
      {onStart ? (
        <div className="stack">
          <button className="primary wide" disabled={!perm?.usage} onClick={onStart}>
            {done ? '開始專注' : perm?.usage ? '先這樣，開始專注' : '開啟「使用情況」後才能開始'}
          </button>
          {onDisable && (
            <button className="link" onClick={onDisable}>
              先關閉深度專注，直接開始
            </button>
          )}
        </div>
      ) : (
        <button className="primary wide" onClick={onClose}>
          完成
        </button>
      )}
    </Modal>
  );
}
