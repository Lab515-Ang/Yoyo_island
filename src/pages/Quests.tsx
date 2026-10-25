import { useSave } from '../app/store';
import { ANIMALS, COPY, GROWTH_MAX, stageName } from '../content/config';
import { Progress } from '../components/ui';
import { activeProject, animalUnlocked, animalsUnlockedBy, coins, growthOf, hatchCounts, newAnimals, projectRow } from '../domain/game';
import { WeeklyGoal } from './Together';

/** 任務：修復工程（摘要，完整的在「我的小島」）、本週專注時間目標、探索與族群成長。 */
export function Quests({ onIsland, onShop, onLobby }: { onIsland: () => void; onShop: () => void; onLobby: () => void }) {
  const { save, update } = useSave();
  const project = activeProject(save);
  const got = project ? (projectRow(save, project.id)?.contributedPoints ?? 0) : 0;
  const wallet = coins(save);
  const affordable = ANIMALS.filter((a) => a.unlock.kind === 'coins' && !animalUnlocked(save, a) && wallet >= a.unlock.price);
  const fresh = newAnimals(save);
  const counts = hatchCounts(save);
  const met = ANIMALS.filter((a) => counts.get(a.id));
  const adults = met.filter((a) => growthOf(save, a.id).stage === 2).length;
  // 最快長成成年的：遇見過、還沒成年、成長值最高的
  const closest = met
    .map((a) => ({ a, g: growthOf(save, a.id) }))
    .filter((x) => x.g.stage < 2)
    .sort((x, y) => y.g.growth - x.g.growth)[0];
  const returning = project ? animalsUnlockedBy(project.id) : [];

  return (
    <div className="page">
      <h1>任務</h1>
      <section className="card">
        <p className="eyebrow">修復工程</p>
        {project ? (
          <>
            <p>
              <strong>{project.title}</strong>
              {returning.length > 0 && <span className="muted small">・修好後{returning.map((a) => a.name).join('、')}會回到森林</span>}
            </p>
            <Progress value={got / project.requiredPoints} label="工程進度" />
            <p className="small">{COPY.projectNeed(project.requiredPoints - got, project.promise)}</p>
            <button className="ghost" onClick={onIsland}>
              看完整的修復路線
            </button>
          </>
        ) : (
          <p>{COPY.allRestored}</p>
        )}
      </section>

      <WeeklyGoal save={save} />

      <section className="card">
        <p className="eyebrow">探索與族群成長</p>
        <p>
          遇見過 <strong>{met.length}</strong> / {ANIMALS.length} 種動物，其中 <strong>{adults}</strong> 種已經看得到成年的牠。
        </p>
        {closest && (
          <p className="small">
            {closest.a.name}最接近成年：成長 {closest.g.growth} / {GROWTH_MAX}（現在是{stageName(closest.a, closest.g.stage)}），再遇見幾次就能看到{stageName(closest.a, 2)}。
          </p>
        )}
        {fresh.length > 0 && (
          <>
            <p className="small">還沒遇見過：{fresh.map((a) => a.name).join('、')}。</p>
            <button className="ghost" onClick={() => update((s) => ({ ...s, settings: { ...s.settings, eggId: fresh[0].id } })) && onLobby()}>
              🔍 去找{fresh[0].name}
            </button>
          </>
        )}
        {affordable.length > 0 && (
          <>
            <p className="small">
              金幣夠解鎖探索路線了：{affordable.map((a) => `${a.name}（${a.unlock.kind === 'coins' ? a.unlock.price : ''} 金幣）`).join('、')}。你有 {wallet} 金幣。
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
