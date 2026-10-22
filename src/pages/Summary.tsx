import { useSave } from '../app/store';
import { COPY } from '../content/config';
import { activeProject, balance, remainingFor } from '../domain/game';

export function Summary({ sessionId, onDone, onProject }: { sessionId: string; onDone: () => void; onProject: () => void }) {
  const { save } = useSave();
  const s = save.sessions.find((x) => x.id === sessionId);
  if (!s) return null;
  const min = Math.floor(s.accumulatedMs / 60000);
  const sec = Math.floor((s.accumulatedMs % 60000) / 1000);
  const earned = save.transactions.find((t) => t.idempotencyKey === `reward:${s.id}`)?.amount ?? 0;
  const wallet = balance(save);
  const project = activeProject(save);
  const remaining = project ? remainingFor(save, project) : 0;

  return (
    <div className="solo">
      <main className="content">
        <div className="page summary">
          <section className="card center">
            <p className="eyebrow">專注完成</p>
            <h1>你為自己留了 {min} 分鐘。</h1>
            <p>{min > 0 ? COPY.complete(min) : '這段專注已記錄。未滿一分鐘不會得到點數。'}</p>
            <dl className="stats">
              <div>
                <dt>實際專注</dt>
                <dd>
                  {min} 分 {sec} 秒
                </dd>
              </div>
              <div>
                <dt>取得點數</dt>
                <dd>+{earned}</dd>
              </div>
              <div>
                <dt>可用點數</dt>
                <dd>{wallet}</dd>
              </div>
            </dl>
          </section>

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
