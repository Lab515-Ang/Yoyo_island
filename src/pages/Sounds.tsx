import { useState } from 'react';
import { useSave } from '../app/store';
import { SOUNDS, animalDef, projectDef, type SoundUnlock } from '../content/config';
import { soundUnlocked } from '../domain/game';
import { useAmbient } from '../sound';

function unlockText(u: SoundUnlock) {
  if (u.kind === 'project') return `完成「${projectDef(u.id)?.title}」後收集`;
  if (u.kind === 'hatched') return `遇見${animalDef(u.id).name}後收集`;
  return '';
}

/** 大自然交響樂：收集小島上的環境音，可試聽、可選作專注背景音。 */
export function Sounds({ onSettings }: { onSettings: () => void }) {
  const { save, update } = useSave();
  const st = save.settings;
  const [playing, setPlaying] = useState<string | null>(null);
  useAmbient(playing !== null, st.soundVolume || 0.5, playing ?? 'breeze');
  const got = SOUNDS.filter((s) => soundUnlocked(save, s.unlock, s.id));
  const choose = (id: string) => update((s) => ({ ...s, settings: { ...s.settings, focusSound: id } }));
  const current = got.some((s) => s.id === st.focusSound) ? st.focusSound : 'auto';

  return (
    <div className="page">
      <h1>大自然交響樂</h1>
      <p>
        已收集 <strong>{got.length}</strong> / {SOUNDS.length} 種聲音。修復森林、遇見動物，小島的聲音會越來越豐富。
      </p>
      {!st.soundEnabled && (
        <div className="notice">
          專注時的環境音目前是關閉的，這裡的試聽不受影響。
          <button className="link" onClick={onSettings}>
            到設定開啟
          </button>
        </div>
      )}

      <section className="card">
        <h2>專注背景音</h2>
        <label className="toggle">
          <input type="radio" name="focus-sound" checked={current === 'auto'} onChange={() => choose('auto')} />
          跟著森林（平常是微風，修好水源地後是流水）
        </label>
        {got.map((s) => (
          <label key={s.id} className="toggle">
            <input type="radio" name="focus-sound" checked={current === s.id} onChange={() => choose(s.id)} />
            {s.icon} {s.name}
          </label>
        ))}
      </section>

      <div className="codex-grid">
        {SOUNDS.map((s) => {
          const ok = soundUnlocked(save, s.unlock, s.id);
          const on = playing === s.id;
          return (
            <div key={s.id} className={ok ? 'codex-card shop-card' : 'codex-card shop-card locked'}>
              <span className={ok ? 'sound-icon' : 'sound-icon silhouette'} aria-hidden="true">
                {s.icon}
              </span>
              <strong>{s.name}</strong>
              {ok ? (
                <>
                  <span className="small muted">{s.desc}</span>
                  <button className={on ? 'primary' : ''} aria-pressed={on} onClick={() => setPlaying(on ? null : s.id)}>
                    {on ? '■ 停止' : '▶ 試聽'}
                  </button>
                </>
              ) : (
                <span className="small muted">{unlockText(s.unlock)}</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="small muted">所有聲音都是即時合成的柔和環境音，不使用外部音樂或音檔。</p>
    </div>
  );
}
