import { useState, type CSSProperties } from 'react';
import { useSave } from '../app/store';
import { Coin, Gem, Progress } from '../components/ui';
import { ACHIEVEMENTS, achievementState, claimAchievement, type AchievementDef } from '../domain/achievements';
import { Check } from 'lucide-react';

/** 成就：依分類列出，看進度；達成後按「領取」拿金幣（大的另外送寶石）。 */
export function Achievements() {
  const { save, update } = useSave();
  const [celebrate, setCelebrate] = useState<AchievementDef | null>(null);
  const state = achievementState(save);
  const got = state.filter((x) => x.claimed).length;
  const groups = [...new Set(ACHIEVEMENTS.map((a) => a.group))];

  const claim = (id: string) => {
    const a = ACHIEVEMENTS.find((x) => x.id === id)!;
    if (update((s) => claimAchievement(s, id, Date.now()) ?? s)) setCelebrate(a);
  };

  return (
    <div className="page achievements">
      <h1>成就</h1>
      <section className="card ach-summary">
        <span className="ach-medal" aria-hidden="true">
          🏅
        </span>
        <div>
          <strong>
            已達成 {got} / {ACHIEVEMENTS.length}
          </strong>
          <Progress value={got / ACHIEVEMENTS.length} label="成就進度" />
        </div>
      </section>

      {groups.map((g) => (
        <section key={g} className="ach-group">
          <h2 className="set-title">{g}</h2>
          <div className="set-list">
            {state
              .filter((x) => x.a.group === g)
              .map(({ a, value, ready, claimed }) => {
                const per = a.per ?? 1;
                return (
                  <div key={a.id} className={claimed ? 'ach-row done' : 'ach-row'}>
                    <span className="ach-icon" aria-hidden="true">
                      {a.icon}
                    </span>
                    <div className="ach-main">
                      <strong>{a.title}</strong>
                      <small>{a.desc}</small>
                      {!claimed && (
                        <>
                          <Progress value={value / a.target} label={`${a.title}進度`} />
                          <small className="ach-count">
                            {Math.floor(value / per)} / {a.target / per} {a.unit ?? ''}
                          </small>
                        </>
                      )}
                    </div>
                    {claimed ? (
                      <span className="ach-done" aria-label="已領取">
                        <Check size={20} aria-hidden="true" />
                      </span>
                    ) : ready ? (
                      <button className="primary ach-claim" onClick={() => claim(a.id)}>
                        領取
                      </button>
                    ) : (
                      <span className="ach-reward">
                        <span>
                          <Coin /> {a.coins}
                        </span>
                        {a.gems && (
                          <span>
                            <Gem /> {a.gems}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      ))}
      {celebrate && <Celebrate a={celebrate} onClose={() => setCelebrate(null)} />}
    </div>
  );
}

// 紙花的方向與顏色（12 片，平均散開）
const CONFETTI = Array.from({ length: 12 }, (_, i) => ({ a: i * 30 + (i % 2) * 12, c: ['#f3c566', '#f29b7f', '#7aaa74', '#9ccfd3'][i % 4] }));

/** 領取成就的小表演：背景壓暗，徽章彈出、光芒旋轉、紙花散開，獎勵依序跳出來。 */
function Celebrate({ a, onClose }: { a: AchievementDef; onClose: () => void }) {
  return (
    <div className="ach-celebrate" role="dialog" aria-modal="true" aria-labelledby="ach-cel-title" onClick={onClose}>
      <div className="ach-cel-card" onClick={(e) => e.stopPropagation()}>
        <div className="ach-cel-badge" aria-hidden="true">
          <span className="ach-cel-rays" />
          {CONFETTI.map((p, i) => (
            <span key={i} className="ach-cel-confetti" style={{ '--a': `${p.a}deg`, '--c': p.c } as CSSProperties} />
          ))}
          <span className="ach-cel-icon">{a.icon}</span>
        </div>
        <p className="eyebrow ach-cel-line">成就達成</p>
        <h2 id="ach-cel-title" className="ach-cel-line">
          {a.title}
        </h2>
        <p className="small muted ach-cel-line">{a.desc}</p>
        <div className="ach-cel-rewards">
          <span>
            <Coin /> +{a.coins}
          </span>
          {a.gems && (
            <span>
              <Gem /> +{a.gems}
            </span>
          )}
        </div>
        <button className="primary wide ach-cel-line" autoFocus onClick={onClose}>
          太棒了
        </button>
      </div>
    </div>
  );
}
