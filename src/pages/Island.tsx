import { useCallback, useState } from 'react';
import { useSave } from '../app/store';
import { COPY, habitatName, regionAnimals, regionDef, regionProjects } from '../content/config';
import { RegionChip } from '../components/Region';
import { AnimalCard, GrowthTag, Progress, fmtMinutes } from '../components/ui';
import { AnimalArt } from '../components/Animal';
import { animalsUnlockedBy, balance, contribute, currentRegion, growthOf, habitatProgress, habitatSound, hatchCounts, isDone, projectRow, regionOpen, remainingFor, sceneAnimals } from '../domain/game';
import { HabitatScene } from '../scenes/HabitatScene';
import { IslandMap } from '../scenes/IslandMap';
import { useAmbient } from '../sound';

/** 我的小島：一打開就是正在修復的森林（可以點動物），下面是修復進度、森林裡的動物，以及之後會開放的區域。 */
export function IslandPage({ onLobby, onCodex }: { onLobby: () => void; onCodex: () => void }) {
  const { save } = useSave();
  const [card, setCard] = useState<string | null>(null);
  // 固定的函式：打開動物卡時場景不用整個重畫
  const pick = useCallback((sid: string) => setCard(sceneAnimals(save, 24).find((x) => x.id === sid)?.animalId ?? null), [save]);
  // 每個區域一座小島：場景、工程、動物都只看目前的區域
  const region = currentRegion(save);
  const habitat = regionDef(region).habitatId;
  const projects = regionProjects(region);
  useAmbient(save.settings.soundEnabled, save.settings.soundVolume, habitatSound(save, habitat));
  const done = projects.filter((p) => isDone(save, p.id)).length;
  const pct = habitatProgress(save, habitat);
  const hasAnimals = regionAnimals(region).some((a) => hatchCounts(save).get(a.id));

  return (
    <div className="page">
      <div className="title-row">
        <h1>我的小島</h1>
        <RegionChip />
      </div>
      <p className="muted small island-sub">
        {habitatName(habitat)}・修復 {pct > 0 ? Math.max(1, Math.round(pct * 100)) : 0}%・工程 {done} / {projects.length}
      </p>
      <section className="card flush">
        <HabitatScene habitatId={habitat} onSelect={pick} />
      </section>
      <p className="small muted center-text">{hasAnimals ? '點森林裡的動物，看看牠現在長多大了。' : '完成第一次探索，遇見的動物就會出現在這裡。'}</p>

      <RestorePanel />
      <ForestAnimals onCard={setCard} onLobby={onLobby} onCodex={onCodex} />

      {region === 'tw' && (
        <section className="card flush">
          <IslandMap save={save} onEnter={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
          <p className="small muted pad">溪流濕地、潮間帶海岸、海灣水下會在日後改版開放，到時候會有新的動物等你去找。</p>
        </section>
      )}
      {card && <AnimalCard save={save} animalId={card} onClose={() => setCard(null)} />}
    </div>
  );
}

/** 修復進度：目前工程、下一個回到森林的動物、精簡的 8 格路線（可展開完整路線）。 */
function RestorePanel() {
  const { save, update, notify } = useSave();
  const [open, setOpen] = useState(false);
  // 完成後先停在完成卡，避免連點把點數投進下一個工程（只有示範模式手上會有點數）
  const [justDone, setJustDone] = useState<{ title: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 只看目前區域的工程（台灣修完後，日本的工程在日本的小島上修）
  const region = currentRegion(save);
  const projects = regionProjects(region);
  const project = projects.find((p) => !isDone(save, p.id)) ?? null;
  const wallet = balance(save);
  const next = regionDef(region === 'tw' ? 'jp' : region);

  const route = (
    <>
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
      <button className="link" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? '收起路線' : '查看完整路線'} {open ? '▴' : '▾'}
      </button>
      {open && (
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
      )}
    </>
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
      <section className="card">
        <p className="eyebrow">修復進度</p>
        <p>{COPY.allRestored}</p>
        {region === 'tw' && regionOpen(save, next.id) && <p className="small">{next.flag} {next.name}開放了！點上方的區域按鈕，到新的小島繼續修復。</p>}
        {route}
      </section>
    );

  const remaining = remainingFor(save, project);
  const got = project.requiredPoints - remaining;
  const returning = animalsUnlockedBy(project.id);

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
    <section className="card">
      <p className="eyebrow">修復進度</p>
      <h2>{project.title}</h2>
      <p className="muted small">完成後：{project.description}</p>
      <Progress value={got / project.requiredPoints} label="工程進度" />
      <p className="small">
        {got} / {project.requiredPoints} 點・{COPY.projectNeed(remaining, project.promise)}
      </p>
      {returning.length > 0 && (
        <div className="next-back">
          {returning.map((a) => (
            <AnimalArt key={a.id} id={a.id} size={44} hidden />
          ))}
          <span className="small">
            修好後，<strong>{returning.map((a) => a.name).join('、')}</strong>會回到森林・再專注約 {fmtMinutes(remaining * 60000)}
          </span>
        </div>
      )}
      <p className="muted small">專注得到的成長點數，會在專注完成時自動投入這個工程。</p>
      {wallet > 0 && (
        <button className="ghost" onClick={give}>
          投入手上的 {Math.min(wallet, remaining)} 點{wallet >= remaining ? '並完成' : ''}
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {route}
    </section>
  );
}

/** 森林裡的動物：每種遇見幾次、族群長到哪個階段；點開看動物卡。 */
function ForestAnimals({ onCard, onLobby, onCodex }: { onCard: (id: string) => void; onLobby: () => void; onCodex: () => void }) {
  const { save } = useSave();
  const counts = hatchCounts(save);
  const all = regionAnimals(currentRegion(save));
  const met = all.filter((a) => counts.get(a.id));
  const adults = met.filter((a) => growthOf(save, a.id).stage === 2).length;
  return (
    <section className="card">
      <div className="row between">
        <h2>森林裡的動物</h2>
        <span className="small muted">
          {met.length} / {all.length} 種・成年 {adults}
        </span>
      </div>
      {met.length ? (
        <div className="pet-row">
          {met.map((a) => {
            const g = growthOf(save, a.id);
            return (
              <button key={a.id} className="pet-chip" onClick={() => onCard(a.id)}>
                <AnimalArt id={a.id} stage={g.stage} size={56} />
                <strong>{a.name}</strong>
                <GrowthTag a={a} g={g} />
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <p className="muted">還沒有遇見動物。回大廳選一個探索目標，完成一段專注就會遇見牠。</p>
          <button className="primary" onClick={onLobby}>
            回大廳開始探索
          </button>
        </>
      )}
      <p className="small muted">同一種動物遇見越多次，族群越穩定，就會從幼年慢慢看到成年的牠。</p>
      <button className="ghost" onClick={onCodex}>
        📖 看完整觀察圖鑑
      </button>
    </section>
  );
}
