import { useSave } from '../app/store';
import { COPY, habitatName } from '../content/config';
import { Progress } from '../components/ui';
import { activeProject, habitatOpen, pendingVisitors, projectRow } from '../domain/game';
import type { HabitatId } from '../domain/types';
import { WeeklyGoal } from './Together';

/** 任務：目前的修復工程、本週專注時間目標、等待發現的生物。 */
export function Quests({ onIsland, onEnter }: { onIsland: () => void; onEnter: (h: HabitatId) => void }) {
  const { save } = useSave();
  const project = activeProject(save);
  const got = project ? (projectRow(save, project.id)?.contributedPoints ?? 0) : 0;
  const waiting = pendingVisitors(save);
  return (
    <div className="page">
      <h1>任務</h1>
      <section className="card">
        <p className="eyebrow">修復工程</p>
        {project ? (
          <>
            <h2>{project.title}</h2>
            <p className="muted small">
              {habitatName(project.habitatId)} · 完成後：{project.description}
            </p>
            <Progress value={got / project.requiredPoints} label="工程進度" />
            <p className="small">
              {got} / {project.requiredPoints} 點 · {COPY.projectNeed(project.requiredPoints - got, project.promise)}
            </p>
            <button className="ghost" onClick={onIsland}>
              前往我的小島投入點數
            </button>
          </>
        ) : (
          <p>{COPY.allRestored}</p>
        )}
      </section>

      <WeeklyGoal save={save} />

      <section className="card">
        <p className="eyebrow">生物發現</p>
        {waiting.length ? (
          <>
            <p>條件已達成，去棲地就能遇見：{waiting.map((s) => s.name).join('、')}</p>
            <div className="row wrap">
              {[...new Set(waiting.map((s) => s.habitatId))].filter((h) => habitatOpen(save, h)).map((h) => (
                <button key={h} className="ghost" onClick={() => onEnter(h)}>
                  去{habitatName(h)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">目前沒有等待發現的生物。完成下一個工程，就會有新朋友來訪。</p>
        )}
      </section>
    </div>
  );
}
