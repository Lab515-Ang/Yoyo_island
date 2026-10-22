import { useState } from 'react';
import { useSave } from '../app/store';
import type { Settings } from '../domain/types';
import { useAmbient } from '../sound';

/** 大自然交響樂：環境音開關、音量與試聽。聲音由瀏覽器即時合成，預設關閉。 */
export function Sounds() {
  const { save, update } = useSave();
  const st = save.settings;
  const set = (patch: Partial<Settings>) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const [preview, setPreview] = useState<'breeze' | 'water' | null>(null);
  useAmbient(preview !== null, st.soundVolume, preview === 'water');

  return (
    <div className="page">
      <h1>大自然交響樂</h1>
      <section className="card">
        <label className="toggle">
          <input type="checkbox" checked={st.soundEnabled} onChange={(e) => set({ soundEnabled: e.target.checked })} />
          專注與棲地中播放環境音
        </label>
        <p className="small muted">開啟後，專注畫面與棲地會依場景播放：溫室噴泉修好前是微風，有水的地方是水聲。</p>
        <label>
          音量
          <input type="range" min={0} max={1} step={0.05} value={st.soundVolume} onChange={(e) => set({ soundVolume: Number(e.target.value) })} />
        </label>
      </section>
      <section className="card">
        <h2>試聽</h2>
        <div className="row wrap">
          {(
            [
              ['breeze', '🍃 溫室微風'],
              ['water', '💧 流水'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={preview === k ? 'primary' : ''} aria-pressed={preview === k} onClick={() => setPreview(preview === k ? null : k)}>
              {preview === k ? `停止 ${l}` : l}
            </button>
          ))}
        </div>
        <p className="small muted">聲音是即時合成的柔和環境音，不使用外部音樂或音檔。</p>
      </section>
    </div>
  );
}
