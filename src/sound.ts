import { useEffect } from 'react';

// ---------- 環境音：全部即時合成，沒有外部音檔，預設關閉 ----------

type Stop = () => void;

/** 棕噪音（柔和、低頻多），循環播放。 */
function brownNoise(ctx: AudioContext) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

/** 噪音經過濾波器：風、水的底層。 */
function bed(ctx: AudioContext, out: AudioNode, type: BiquadFilterType, freq: number, gain: number, q = 0.7) {
  const src = ctx.createBufferSource();
  src.buffer = brownNoise(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(out);
  src.start();
}

/** 每隔隨機時間觸發一次短音（鳥鳴、蛙鳴、蟲鳴）。 */
function every(minS: number, maxS: number, fn: () => void): Stop {
  let timer = 0;
  const loop = () => {
    fn();
    timer = window.setTimeout(loop, (minS + Math.random() * (maxS - minS)) * 1000);
  };
  timer = window.setTimeout(loop, minS * 1000);
  return () => clearTimeout(timer);
}

function tone(ctx: AudioContext, out: AudioNode, type: OscillatorType, from: number, to: number, start: number, dur: number, peak: number) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, start);
  o.frequency.exponentialRampToValueAtTime(to, start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + dur * 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(out);
  o.start(start);
  o.stop(start + dur + 0.02);
}

const SCAPES: Record<string, (ctx: AudioContext, out: AudioNode) => Stop | void> = {
  breeze: (ctx, out) => bed(ctx, out, 'lowpass', 380, 1),
  fountain: (ctx, out) => {
    bed(ctx, out, 'lowpass', 900, 0.8);
    bed(ctx, out, 'bandpass', 2600, 0.35, 0.8);
  },
  stream: (ctx, out) => {
    bed(ctx, out, 'lowpass', 900, 1);
    bed(ctx, out, 'bandpass', 600, 0.4, 1);
  },
  bees: (ctx, out) => {
    bed(ctx, out, 'lowpass', 380, 0.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.25; // 嗡嗡聲忽遠忽近
    const depth = ctx.createGain();
    depth.gain.value = 0.03;
    lfo.connect(depth).connect(g.gain);
    for (const f of [208, 213]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
    }
    lp.connect(g).connect(out);
    lfo.start();
  },
  birds: (ctx, out) => {
    bed(ctx, out, 'lowpass', 380, 0.6);
    return every(2, 5, () => {
      const t = ctx.currentTime;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) tone(ctx, out, 'sine', 2400 + Math.random() * 600, 3600 + Math.random() * 800, t + i * 0.16, 0.12, 0.06);
    });
  },
  frogs: (ctx, out) => {
    bed(ctx, out, 'lowpass', 900, 0.7);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    lp.connect(out);
    return every(1.2, 3.5, () => {
      const t = ctx.currentTime;
      const base = 110 + Math.random() * 40;
      for (let i = 0; i < 3; i++) tone(ctx, lp, 'square', base, base * 0.9, t + i * 0.11, 0.08, 0.08);
    });
  },
  night: (ctx, out) => {
    bed(ctx, out, 'lowpass', 300, 0.5);
    return every(0.8, 1.6, () => {
      const t = ctx.currentTime;
      for (let i = 0; i < 6; i++) tone(ctx, out, 'sine', 4400, 4300, t + i * 0.05, 0.035, 0.025);
    });
  },
};

/** 播放一段環境音；soundId 對應 SOUNDS。 */
export function useAmbient(active: boolean, volume: number, soundId: string) {
  useEffect(() => {
    if (!active || volume <= 0 || typeof AudioContext === 'undefined') return;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(volume * 0.35, ctx.currentTime + 2);
    master.connect(ctx.destination);
    const stop = (SCAPES[soundId] ?? SCAPES.breeze)(ctx, master);
    return () => {
      stop?.();
      void ctx.close();
    };
  }, [active, volume, soundId]);
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
