import { useState } from 'react';
import { useSave } from '../app/store';
import { animalDef, projectDef } from '../content/config';
import { fmtDateTime } from '../components/ui';
import { endedSessions } from '../domain/game';
import { Codex } from './Codex';

/** 我的歷程：動物圖鑑、工程投入與孵化的時間軸。 */
export function Journey() {
  const { save } = useSave();
  const [tab, setTab] = useState<'codex' | 'projects' | 'found'>('codex');
  const hatches = endedSessions(save).filter((s) => s.status === 'completed').reverse();
  const names = new Map(save.memberships.map((m) => [m.userId, m.demoNickname ?? save.profile.nickname]));
  return (
    <div className="page">
      <h1>我的歷程</h1>
      <div className="segmented" role="tablist">
        {(
          [
            ['codex', '動物圖鑑'],
            ['projects', '工程紀錄'],
            ['found', '孵化紀錄'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'codex' && <Codex />}
      {tab === 'projects' && (
        <section className="card">
          <ul className="list">
            {[...save.contributions].reverse().map((c) => (
              <li key={c.id}>
                <span className="small muted">{fmtDateTime(c.createdAt)}</span>
                <div>
                  {names.get(c.userId)} 投入 {c.points} 點到「{projectDef(c.projectId)?.title}」
                </div>
              </li>
            ))}
            {!save.contributions.length && <li className="muted">還沒有投入紀錄。</li>}
          </ul>
        </section>
      )}
      {tab === 'found' && (
        <section className="card">
          <ul className="list">
            {hatches.map((s) => (
              <li key={s.id}>
                <span className="small muted">{fmtDateTime(s.endedAt!)}</span>
                <div>
                  孵出了{animalDef(s.animalId).name}（{Math.floor(s.accumulatedMs / 60000)} 分鐘）
                </div>
              </li>
            ))}
            {!hatches.length && <li className="muted">還沒有孵化紀錄。</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
