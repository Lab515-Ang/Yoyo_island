import { useSave } from '../app/store';
import { COPY, SPECIES, habitatName } from '../content/config';
import { Progress } from '../components/ui';
import { activeProject, coins, habitatOpen, isInvitable, pendingVisitors, projectRow } from '../domain/game';
import type { HabitatId } from '../domain/types';
import { WeeklyGoal } from './Together';

/** 任務：目前的修復工程、本週專注時間目標、可邀請與等待見面的生物。 */
export function Quests({ onIsland, onEnter, onShop }: { onIsland: () => void; onEnter: (h: HabitatId) => void; onShop: () => void }) {
  const { save } = useSave();
  const project = activeProject(save);
  const got = project ? (projectRow(save, project.id)?.contributedPoints ?? 0) : 0;
  const waiting = pendingVisitors(save);
  const invitable = SPECIES.filter((s) => isInvitable(save, s));
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
        <p className="eyebrow">生物</p>
        {invitable.length > 0 && (
          <>
            <p>
              可以邀請：{invitable.map((s) => `${s.name}（${s.price} 金幣）`).join('、')}。你有 {coins(save)} 金幣。
            </p>
            <button className="ghost" onClick={onShop}>
              去商店邀請
            </button>
          </>
        )}
        {waiting.length ? (
          <>
            <p>已入住，去棲地就能遇見：{waiting.map((s) => s.name).join('、')}</p>
            <div className="row wrap">
              {[...new Set(waiting.map((s) => s.habitatId))].filter((h) => habitatOpen(save, h)).map((h) => (
                <button key={h} className="ghost" onClick={() => onEnter(h)}>
                  去{habitatName(h)}
                </button>
              ))}
            </div>
          </>
        ) : (
          !invitable.length && <p className="muted">完成下一個工程，就能用金幣邀請新朋友。</p>
        )}
      </section>
    </div>
  );
}
