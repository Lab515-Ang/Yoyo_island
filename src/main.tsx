import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameProvider } from './app/store';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameProvider>
      <App />
    </GameProvider>
  </StrictMode>,
);

// 正式建置才註冊 service worker（開發模式避免快取干擾熱更新）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}

// 申請持久儲存：瀏覽器同意後，空間不足時也不會自動清掉小島的資料
void navigator.storage?.persist?.().catch(() => undefined);
