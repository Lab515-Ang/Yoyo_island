import { useSave } from '../app/store';
import { COPY, speciesDef } from '../content/config';
import { Coin } from '../components/ui';
import { activeProject, balance, chanceFind, coins, earnedFor, feed, remainingFor } from '../domain/game';
import { Creature } from '../components/Creature';

export function Summary({ sessionId, onDone, onProject }: { sessionId: string; onDone: () => void; onProject: () => void }) {
  const { save } = useSave();
  const s = save.sessions.find((x) => x.id === sessionId);
  if (!s) return null;
  const min = Math.floor(s.accumulatedMs / 60000);
  const sec = Math.floor((s.accumulatedMs % 60000) / 1000);
  const earned = earnedFor(save, s.id);
  const found = chanceFind(save, s.id);
  const done = s.status === 'completed';
  const wallet = balance(save);
  const project = activeProject(save);
  const remaining = project ? remainingFor(save, project) : 0;

  return (
    <div className="solo">
      <main className="content">
        <div className="page summary">
          <section className="card center">
            {done ? (
              <>
                <p className="eyebrow">專注完成</p>
                <h1>你為自己留了 {min} 分鐘。</h1>
                <p>{min > 0 ? COPY.complete(min) : '這段專注已記錄。未滿一分鐘不會得到點數。'}</p>
              </>
            ) : (
              <>
                <p className="eyebrow">專注未完成</p>
                <h1>這段專注提前結束了。</h1>
                <p>沒有撐到倒數結束，這次沒有獲得成長點數、金幣和飼料。休息一下，下次再試試。</p>
              </>
            )}
            <dl className="stats">
              <div>
                <dt>實際專注</dt>
                <dd>
                  {min} 分 {sec} 秒
                </dd>
              </div>
              <div>
                <dt>成長點數</dt>
                <dd>+{earned.points}</dd>
              </div>
              <div>
                <dt>金幣</dt>
                <dd>+{earned.coins}</dd>
              </div>
              <div>
                <dt>飼料</dt>
                <dd>+{earned.feed}</dd>
              </div>
            </dl>
          </section>

          {found && (
            <section className="card center chance">
              <p className="eyebrow">偶遇！</p>
              <Creature id={found.speciesId} size={96} />
              <h2>{speciesDef(found.speciesId)?.name}在你專注的時候來訪了</h2>
              <p className="small muted">已收進圖鑑，可以到「我的歷程 → 生物圖鑑」看看牠。</p>
            </section>
          )}

          <p className="small muted center-text">
            現有 🌱 {wallet} 點 · <Coin /> {coins(save)} 金幣 · 🌾 {feed(save)} 份飼料
          </p>

          {project ? (
            <section className="card">
              <h2>{project.title}</h2>
              {wallet >= remaining ? (
                <p>
                  你有 {wallet} 點，已經足夠完成「{project.title}」（還需 {remaining} 點）。要不要去投入？
                </p>
              ) : (
                <p>
                  工程還需 {remaining} 點；把現有的 {wallet} 點投入後，還差 <strong>{remaining - wallet}</strong> 點。
                </p>
              )}
              <button className="primary" onClick={onProject} disabled={wallet === 0}>
                前往工程
              </button>
            </section>
          ) : (
            <section className="card">
              <p>{COPY.allRestored}</p>
            </section>
          )}

          <button className="ghost wide" onClick={onDone}>
            回到大廳
          </button>
        </div>
      </main>
    </div>
  );
}
