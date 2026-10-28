import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameProvider } from './app/store';
import App from './App';
// 字型打包進 App（離線也能用）：內文 GoRound、標題粉圓（都縮成 App 用到的字＋常用字，見 tools/fonts/subset_fonts.py）、數字 Nunito
import './fonts.css';
import '@fontsource-variable/nunito';
import './styles.css';
import { isNative } from './platform';

// 上方安全距離：Capacitor 遇到新版 WebView 會假設畫面畫在狀態列底下（Android 15 的全螢幕），
// 但舊版 Android 的畫面其實從狀態列下方開始，再空一次就會多出一大段。畫面真的蓋到狀態列時才保留。
function fixTopInset() {
  const root = document.documentElement;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-top:var(--safe-area-inset-top, env(safe-area-inset-top));padding-bottom:var(--safe-area-inset-bottom, env(safe-area-inset-bottom))';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const top = parseFloat(cs.paddingTop) || 0;
  const bottom = parseFloat(cs.paddingBottom) || 0;
  probe.remove();
  // 畫面沒蓋到狀態列，就也沒蓋到下方的導覽列：上下都不用再空
  const underBars = screen.height - innerHeight < top;
  // 值沒變就不要寫（不然下面的 MutationObserver 會一直觸發）
  const set = (k: string, v: string) => root.style.getPropertyValue(k) !== v && root.style.setProperty(k, v);
  set('--top-inset', underBars ? `${top}px` : '0px');
  set('--bottom-inset', underBars ? `${bottom}px` : '0px');
}
fixTopInset();
addEventListener('resize', fixTopInset);
// Capacitor 之後才注入／更新 --safe-area-inset-top：跟著重算
new MutationObserver(fixTopInset).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameProvider>
      <App />
    </GameProvider>
  </StrictMode>,
);

// 正式建置才註冊 service worker（開發模式避免快取干擾熱更新）
// 以下只給網頁版（測試管道）：App 版的檔案本來就在手機裡、資料存在 App 自己的空間
if (!isNative) {
  // 正式建置才註冊 service worker（開發模式避免快取干擾熱更新）
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
  }
  // 申請持久儲存：瀏覽器同意後，空間不足時也不會自動清掉小島的資料
  void navigator.storage?.persist?.().catch(() => undefined);
}
