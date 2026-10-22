import { useEffect } from 'react';

/** 合成的柔和環境音（低通棕噪音，有水時頻率較亮）。沒有外部音檔，預設關閉。 */
export function useAmbient(active: boolean, volume: number, water: boolean) {
  useEffect(() => {
    if (!active || volume <= 0 || typeof AudioContext === 'undefined') return;
    const ctx = new AudioContext();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = water ? 900 : 380;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume * 0.35, ctx.currentTime + 2);
    src.connect(lp).connect(gain).connect(ctx.destination);
    src.start();
    return () => void ctx.close();
  }, [active, volume, water]);
}

/** 倒數結束的柔和三音鐘聲（即時合成）。 */
export function playChime(volume: number) {
  if (typeof AudioContext === 'undefined' || volume <= 0) return;
  const ctx = new AudioContext();
  void ctx.resume();
  const t = ctx.currentTime;
  [523.25, 659.25, 783.99].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const g = ctx.createGain();
    const s = t + i * 0.4;
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(0.3 * volume, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 2.4);
    o.connect(g).connect(ctx.destination);
    o.start(s);
    o.stop(s + 2.5);
  });
  setTimeout(() => void ctx.close(), 4000);
}

export const notifySupported = () => typeof Notification !== 'undefined';

/** 系統通知；有 service worker 時走 showNotification（手機瀏覽器只支援這條路）。 */
export async function notifyEnd(title: string, body: string) {
  if (!notifySupported() || Notification.permission !== 'granted') return;
  const opts = { body, icon: '/icon-192.png', tag: 'focus-end' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return void (await reg.showNotification(title, opts));
    new Notification(title, opts);
  } catch {
    // 通知失敗不影響結算
  }
}
