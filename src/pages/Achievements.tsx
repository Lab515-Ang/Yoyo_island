import { useSave } from '../app/store';
import { Coin, Gem, Progress } from '../components/ui';
import { ACHIEVEMENTS, achievementState, claimAchievement } from '../domain/achievements';
import { Check } from 'lucide-react';

/** 成就：依分類列出，看進度；達成後按「領取」拿金幣（大的另外送寶石）。 */
export function Achievements() {
  const { save, update, notify } = useSave();
  const state = achievementState(save);
  const got = state.filter((x) => x.claimed).length;
  const groups = [...new Set(ACHIEVEMENTS.map((a) => a.group))];

  const claim = (id: string) => {
    const a = ACHIEVEMENTS.find((x) => x.id === id)!;
    if (update((s) => claimAchievement(s, id, Date.now()) ?? s)) notify(`「${a.title}」達成！獲得 ${a.coins} 金幣${a.gems ? `和 ${a.gems} 顆寶石` : ''}。`);
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
    </div>
  );
}
