import { useSave } from '../app/store';
import { ANIMALS, COPY } from '../content/config';
import { Progress } from '../components/ui';
import { activeProject, animalUnlocked, animalsUnlockedBy, coins, hatchCounts, newAnimals, projectRow } from '../domain/game';
import { WeeklyGoal } from './Together';

/** 任務：目前的修復工程、本週專注時間目標、動物收集。 */
export function Quests({ onIsland, onShop }: { onIsland: () => void; onShop: () => void }) {
  const { save } = useSave();
  const project = activeProject(save);
  const got = project ? (projectRow(save, project.id)?.contributedPoints ?? 0) : 0;
  const wallet = coins(save);
  const affordable = ANIMALS.filter((a) => a.unlock.kind === 'coins' && !animalUnlocked(save, a) && wallet >= a.unlock.price);
  const fresh = newAnimals(save);
  const kinds = [...hatchCounts(save).keys()].length;
  const nextUnlock = project ? animalsUnlockedBy(project.id) : [];
  return (
    <div className="page">
      <h1>任務</h1>
      <section className="card">
        <p className="eyebrow">修復工程</p>
        {project ? (
          <>
            <h2>{project.title}</h2>
            <p className="muted small">
              完成後：{project.description}
              {nextUnlock.length > 0 && `，解鎖${nextUnlock.map((a) => a.name).join('、')}的蛋`}
            </p>
            <Progress value={got / project.requiredPoints} label="工程進度" />
            <p className="small">
              {got} / {project.requiredPoints} 點 · {COPY.projectNeed(project.requiredPoints - got, project.promise)}
            </p>
            <button className="ghost" onClick={onIsland}>
              前往我的小島看看
            </button>
          </>
        ) : (
          <p>{COPY.allRestored}</p>
        )}
      </section>

      <WeeklyGoal save={save} />

      <section className="card">
        <p className="eyebrow">動物收集</p>
        <p>
          已孵出 <strong>{kinds}</strong> / {ANIMALS.length} 種動物。
        </p>
        {fresh.length > 0 && <p>還沒孵過：{fresh.map((a) => a.name).join('、')}。回大廳換一顆蛋試試看。</p>}
        {affordable.length > 0 && (
          <>
            <p>
              金幣夠解鎖了：{affordable.map((a) => `${a.name}（${a.unlock.kind === 'coins' ? a.unlock.price : ''} 金幣）`).join('、')}。你有 {wallet} 金幣。
            </p>
            <button className="ghost" onClick={onShop}>
              去商店解鎖
            </button>
          </>
        )}
      </section>
    </div>
  );
}
