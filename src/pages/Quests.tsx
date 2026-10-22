import { useSave } from '../app/store';
import { COPY, habitatName, PETS } from '../content/config';
import { Progress } from '../components/ui';
import { activeProject, adoptedPets, canAdopt, coins, projectRow } from '../domain/game';
import { WeeklyGoal } from './Together';

/** 任務：目前的修復工程、本週專注時間目標、可領養與成長中的寵物。 */
export function Quests({ onIsland, onShop }: { onIsland: () => void; onShop: () => void }) {
  const { save } = useSave();
  const project = activeProject(save);
  const got = project ? (projectRow(save, project.id)?.contributedPoints ?? 0) : 0;
  const adoptable = PETS.filter((p) => canAdopt(save, p));
  const growing = adoptedPets(save).filter((p) => p.stage < 3);
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
        <p className="eyebrow">寵物</p>
        {adoptable.length > 0 && (
          <>
            <p>可以領養：{adoptable.map((p) => `${p.name}（${p.adoptPrice} 金幣）`).join('、')}。你有 {coins(save)} 金幣。</p>
            <button className="ghost" onClick={onShop}>
              去商店領養
            </button>
          </>
        )}
        {growing.length > 0 && (
          <p>
            成長中：{growing.map(({ def, fed, stage }) => `${def.name}（再 ${def.thresholds[stage] - fed} 份飼料長成${def.stages[stage + 1]}）`).join('、')}
          </p>
        )}
        {!adoptable.length && !growing.length && <p className="muted">修好下一個棲地工程，就能領養新的寵物。</p>}
      </section>
    </div>
  );
}
