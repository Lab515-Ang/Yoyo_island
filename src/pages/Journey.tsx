import { useState } from 'react';
import { useSave } from '../app/store';
import { habitatName, projectDef, speciesDef } from '../content/config';
import { fmtDateTime } from '../components/ui';
import type { HabitatId } from '../domain/types';
import { Codex } from './Codex';

/** 我的歷程：生物圖鑑、工程投入與發現的時間軸。 */
export function Journey({ onEnter }: { onEnter: (h: HabitatId) => void }) {
  const { save } = useSave();
  const [tab, setTab] = useState<'codex' | 'projects' | 'found'>('codex');
  const names = new Map(save.memberships.map((m) => [m.userId, m.demoNickname ?? save.profile.nickname]));
  return (
    <div className="page">
      <h1>我的歷程</h1>
      <div className="segmented" role="tablist">
        {(
          [
            ['codex', '生物圖鑑'],
            ['projects', '工程紀錄'],
            ['found', '發現紀錄'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'codex' && <Codex onEnter={onEnter} />}
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
            {[...save.discoveries].reverse().map((d) => (
              <li key={d.speciesId}>
                <span className="small muted">{fmtDateTime(d.discoveredAt)}</span>
                <div>
                  發現了{speciesDef(d.speciesId)?.name}（{habitatName(speciesDef(d.speciesId)!.habitatId)}）
                </div>
              </li>
            ))}
            {!save.discoveries.length && <li className="muted">還沒有發現紀錄。</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
