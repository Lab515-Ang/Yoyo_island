// 由 vite.config.ts 在建置時填入版本與檔案清單（開發模式不註冊）
const CACHE = 'qiguang-__VERSION__';
const ASSETS = __ASSETS__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // 頁面：有網路拿最新版，離線用快取；其餘檔案名稱帶雜湊，直接用快取
  // ignoreVary：伺服器回應帶 Vary 標頭時，仍以網址比對快取
  if (req.mode === 'navigate') e.respondWith(fetch(req).catch(() => caches.match('/index.html', { ignoreVary: true })));
  else e.respondWith(caches.match(req.url, { ignoreVary: true }).then((hit) => hit || fetch(req)));
});

// 點通知回到已開啟的小島
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((ws) => (ws[0] ? ws[0].focus() : self.clients.openWindow('/'))));
});
