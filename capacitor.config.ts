import type { CapacitorConfig } from '@capacitor/cli';

// 上架後 appId 就不能改：第一次送審前請確認（目前是暫定值）
const config: CapacitorConfig = {
  appId: 'tw.qiguang.island',
  appName: '棲光小島',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      iconColor: '#4f7a55',
    },
  },
};

export default config;
