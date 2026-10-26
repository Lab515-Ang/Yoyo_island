import type { CapacitorConfig } from '@capacitor/cli';

// 上架後 appId 就不能改：第一次送審前請確認（目前是暫定值）
const config: CapacitorConfig = {
  appId: 'tw.qiguang.island',
  appName: '棲光小島',
  webDir: 'dist',
  // 打包用的是新版瀏覽器語法（Vite 預設 Chrome 111 以上）：WebView 太舊時改顯示「請更新 WebView」頁，不要白畫面
  android: { minWebViewVersion: 111 },
  server: { errorPath: 'webview-update.html' },
  plugins: {
    LocalNotifications: {
      iconColor: '#4f7a55',
    },
  },
};

export default config;
