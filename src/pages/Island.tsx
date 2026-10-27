import { useCallback, useState } from 'react';
import { useSave } from '../app/store';
import { COPY, habitatName, hasStages, regionAnimals, regionDef, regionProjects, stageName } from '../content/config';
import { RegionChip } from '../components/Region';
import { AnimalCard, Modal, Progress, fmtMinutes } from '../components/ui';
import { AnimalArt } from '../components/Animal';
import { animalsUnlockedBy, balance, contribute, currentRegion, growthOf, habitatProgress, habitatSound, hatchCounts, isDone, projectRow, regionOpen, remainingFor, sceneAnimals } from '../domain/game';
import { HabitatScene } from '../scenes/HabitatScene';
import { useAmbient } from '../sound';
import { ChevronRight, Sprout } from 'lucide-react';
import { PageTip } from '../components/PageTip';

/**
 * 我的小島：森林場景是主角（約半個畫面，可以點動物），下面是目前的工程和這座島的動物。
 * 每個區域一座小島：場景、工程、動物都只看目前的區域。
 */
export function IslandPage({ onLobby, onCodex }: { onLobby: () => void; onCodex: () => void }) {
  const { save } = useSave();
  const [card, setCard] = useState<string | null>(null);
  // 固定的函式：打開動物卡時場景不用整個重畫
  const pick = useCallback((sid: string) => setCard(sceneAnimals(save, 24).find((x) => x.id === sid)?.animalId ?? null), [save]);
  const region = currentRegion(save);
  const habitat = regionDef(region).habitatId;
  useAmbient(save.settings.soundEnabled, save.settings.soundVolume, habitatSound(save, habitat));
  const pct = habitatProgress(save, habitat);
  const hasAnimals = regionAnimals(region).some((a) => hatchCounts(save).get(a.id));

  return (
    <div className="page island">
      <div className="title-row">
        <h1>我的小島</h1>
        <RegionChip />
      </div>
      <PageTip id="island">這是你的小島。每次專注完成，時間會自動拿來修復森林；工程修好，就有新的動物回來。</PageTip>
      <section className="island-stage">
        <HabitatScene habitatId={habitat} onSelect={pick} />
        <span className="stage-chip">
          <Sprout size={15} aria-hidden="true" /> {habitatName(habitat)}・修復 {pct > 0 ? Math.max(1, Math.round(pct * 100)) : 0}%
        </span>
        <p className="stage-hint">{hasAnimals ? '點森林裡的動物，看看牠現在長多大了' : '完成第一次探索，遇見的動物就會出現在這裡'}</p>
      </section>
      <RestorePanel />
      <IslandAnimals onCard={setCard} onLobby={onLobby} onCodex={onCodex} />
      {card && <AnimalCard save={save} animalId={card} onClose={() => setCard(null)} />}
    </div>
  );
}

/** 目前的工程：進度、還要多久、修好後誰會回來、8 格路線；完整路線點了才跳出。 */
function RestorePanel() {
  const { save, update, notify, mode } = useSave();
  const [routeOpen, setRouteOpen] = useState(false);
  // 完成後先停在完成卡，避免連點把點數投進下一個工程（只有示範模式手上會有點數）
  const [justDone, setJustDone] = useState<{ title: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 只看目前區域的工程（台灣修完後，日本的工程在日本的小島上修）
  const region = currentRegion(save);
  const projects = regionProjects(region);
  const project = projects.find((p) => !isDone(save, p.id)) ?? null;
  const done = projects.filter((p) => isDone(save, p.id)).length;
  const wallet = balance(save);
  const next = regionDef(region === 'tw' ? 'jp' : region);

  const track = (
    <ol className="route-track" aria-label="修復路線">
      {projects.map((p, i) => {
        const state = isDone(save, p.id) ? 'done' : p.id === project?.id ? 'current' : 'later';
        return (
          <li key={p.id} className={state} title={p.title}>
            <span aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
            <span className="sr-only">
              {p.title}：{state === 'done' ? '已完成' : state === 'current' ? '進行中' : '還沒開始'}
            </span>
          </li>
        );
      })}
    </ol>
  );
  const head = (
    <div className="restore-head">
      <span className="eyebrow">
        修復工程 {done} / {projects.length}
      </span>
      <button className="link restore-route" onClick={() => setRouteOpen(true)}>
        完整路線 <ChevronRight size={15} aria-hidden="true" />
      </button>
    </div>
  );
  const routeModal = routeOpen && (
    <Modal title="修復路線" onClose={() => setRouteOpen(false)}>
      <ol className="route">
        {projects.map((p) => {
          const row = projectRow(save, p.id);
          const finished = isDone(save, p.id);
          const back = animalsUnlockedBy(p.id).map((a) => a.name).join('、');
          return (
            <li key={p.id} className={finished ? 'done' : p.id === project?.id ? 'current' : 'later'}>
              <span className="route-dot" aria-hidden="true">
                {finished ? '✓' : ''}
              </span>
              <div>
                <strong>{p.title}</strong>
                <div className="small muted">
                  {finished ? `已完成 · ${p.description}` : `${row?.contributedPoints ?? 0} / ${p.requiredPoints} 點 · ${p.description}`}
                  {back && ` · ${back}會回到森林`}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Modal>
  );

  if (justDone)
    return (
      <section className="card center">
        <p className="eyebrow">工程完成</p>
        <h2>「{justDone.title}」完成了！</h2>
        <p>{justDone.message}</p>
        <button className="ghost" onClick={() => setJustDone(null)}>
          下一個工程
        </button>
      </section>
    );

  if (!project)
    return (
      <section className="card restore">
        {head}
        <p>{COPY.allRestored}</p>
        {region === 'tw' && regionOpen(save, next.id) && (
          <p className="small">
            {next.flag} {next.name}開放了！點上方的區域按鈕，到新的小島繼續修復。
          </p>
        )}
        {track}
        {routeModal}
      </section>
    );

  const remaining = remainingFor(save, project);
  const got = project.requiredPoints - remaining;
  const returning = animalsUnlockedBy(project.id);

  // 示範模式手上會有點數，可以手動投入；一般玩家的點數在專注完成時就自動投入了
  const give = () => {
    setError(null);
    let result: ReturnType<typeof contribute> | null = null;
    const saved = update((s) => {
      result = contribute(s, s.profile.id, project.id, 'all', Date.now());
      return result.ok ? result.save : s;
    });
    const r = result as ReturnType<typeof contribute> | null;
    if (!r) return;
    if (!r.ok) return setError(r.error);
    if (!saved) return;
    if (r.completed) {
      const extra = r.unlocked.length ? `${r.unlocked.map((a) => a.name).join('、')}回到森林了，下次可以去找牠。` : r.completed.description + '。';
      setJustDone({ title: r.completed.title, message: extra });
      notify(`「${r.completed.title}」完成了！`);
    } else notify(COPY.projectNeed(remainingFor(saved, project), project.promise));
  };

  return (
    <section className="card restore">
      {head}
      <h2>{project.title}</h2>
      <p className="muted small">完成後：{project.description}</p>
      <div className="restore-bar">
        <Progress value={got / project.requiredPoints} label="工程進度" />
        <div className="restore-nums">
          <span>
            <strong>{got.toLocaleString('en-US')}</strong> / {project.requiredPoints.toLocaleString('en-US')} 點
          </span>
          <span>還要專注約 {fmtMinutes(remaining * 60000)}</span>
        </div>
      </div>
      {returning.length > 0 && (
        <div className="next-back">
          {returning.map((a) => (
            <AnimalArt key={a.id} id={a.id} size={44} hidden />
          ))}
          <span className="small">
            修好後，<strong>{returning.map((a) => a.name).join('、')}</strong>會回到森林
          </span>
        </div>
      )}
      {track}
      {mode === 'demo' && wallet > 0 && (
        <button className="ghost" onClick={give}>
          投入手上的 {Math.min(wallet, remaining)} 點{wallet >= remaining ? '並完成' : ''}
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {routeModal}
    </section>
  );
}

/** 這座島的動物：一排橫向滑動，點開看動物卡；完整資料在觀察圖鑑。 */
function IslandAnimals({ onCard, onLobby, onCodex }: { onCard: (id: string) => void; onLobby: () => void; onCodex: () => void }) {
  const { save } = useSave();
  const counts = hatchCounts(save);
  const all = regionAnimals(currentRegion(save));
  const met = all.filter((a) => counts.get(a.id));
  return (
    <section className="card island-animals">
      <div className="restore-head">
        <span className="eyebrow">
          這座島的動物 {met.length} / {all.length}
        </span>
        <button className="link restore-route" onClick={onCodex}>
          圖鑑 <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>
      {met.length ? (
        <div className="animal-strip">
          {met.map((a) => {
            const g = growthOf(save, a.id);
            return (
              <button key={a.id} className="animal-mini" onClick={() => onCard(a.id)}>
                <span className="animal-mini-art">
                  <AnimalArt id={a.id} stage={g.stage} size={60} />
                </span>
                <strong>{a.name}</strong>
                <small>{hasStages(a) ? stageName(a, g.stage) : '只有一種樣式'}</small>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <p className="muted small">還沒有遇見動物。回大廳選一個探索目標，完成一段專注就會遇見牠。</p>
          <button className="primary" onClick={onLobby}>
            回大廳開始探索
          </button>
        </>
      )}
    </section>
  );
}
