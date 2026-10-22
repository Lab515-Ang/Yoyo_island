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
