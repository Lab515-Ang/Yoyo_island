import { useState } from 'react';
import { useSave } from '../app/store';
import { ANIMALS, COPY, habitatName, HABITATS, PROJECTS } from '../content/config';
import { AnimalCard, Progress } from '../components/ui';
import { AnimalArt } from '../components/Animal';
import { activeProject, animalsUnlockedBy, balance, contribute, habitatOpen, habitatSound, hatchCounts, isDone, projectRow, remainingFor, sceneAnimals } from '../domain/game';
import type { HabitatId } from '../domain/types';
import { HabitatScene, prefersReducedMotion } from '../scenes/HabitatScene';
import { IslandMap } from '../scenes/IslandMap';
import { useAmbient } from '../sound';

export function IslandPage({ habitat, setHabitat }: { habitat: HabitatId | null; setHabitat: (h: HabitatId | null) => void }) {
  const { save } = useSave();
  if (habitat && habitatOpen(save, habitat)) return <HabitatView id={habitat} onBack={() => setHabitat(null)} />;
  const project = activeProject(save);
  return (
    <div className="page">
      <h1>我的小島</h1>
      <section className="card flush">
        <IslandMap save={save} onEnter={setHabitat} />
        <div className="row wrap pad">
          {HABITATS.filter((h) => habitatOpen(save, h.id)).map((h) => (
            <button key={h.id} className="ghost" onClick={() => setHabitat(h.id)}>
              進入{h.name}
            </button>
          ))}
          <span className="muted small">溪流、海岸與海灣會在日後改版開放。</span>
        </div>
      </section>
      <MyAnimals />
      {project ? <ProjectPanel onEnter={setHabitat} /> : <section className="card"><p>{COPY.allRestored}</p></section>}
      <section className="card">
        <h2>修復路線</h2>
        <ol className="route">
          {PROJECTS.map((p) => {
            const row = projectRow(save, p.id);
            const done = isDone(save, p.id);
            const current = p.id === project?.id;
            const unlocks = animalsUnlockedBy(p.id).map((a) => a.name).join('、');
            return (
              <li key={p.id} className={done ? 'done' : current ? 'current' : 'later'}>
                <span className="route-dot" aria-hidden="true">{done ? '✓' : ''}</span>
                <div>
                  <strong>{p.title}</strong>
                  <div className="small muted">
                    {done ? `已完成 · ${p.description}` : `${row?.contributedPoints ?? 0} / ${p.requiredPoints} 點 · ${p.description}`}
                    {unlocks && ` · 解鎖${unlocks}`}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="muted small">
          整條路線共 {PROJECTS.reduce((a, p) => a + p.requiredPoints, 0).toLocaleString()} 點，大約 {Math.round(PROJECTS.reduce((a, p) => a + p.requiredPoints, 0) / 60)} 小時的專注。每投入 25%，森林就會先有一點變化。
        </p>
      </section>
    </div>
  );
}

function ProjectPanel({ onEnter }: { onEnter: (h: HabitatId) => void }) {
  const { save, update, notify } = useSave();
  // 完成後先停在完成卡，避免連點把點數投進下一個工程
  const [justDone, setJustDone] = useState<{ title: string; habitatId: HabitatId; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const project = activeProject(save)!;
  const wallet = balance(save);
  const remaining = remainingFor(save, project);
  const got = project.requiredPoints - remaining;
  const unlocks = animalsUnlockedBy(project.id);

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
      const extra = r.unlocked.length ? `解鎖了${r.unlocked.map((a) => a.name).join('、')}的蛋，下次專注可以孵化。` : r.completed.description + '。';
      setJustDone({ title: r.completed.title, habitatId: r.completed.habitatId, message: extra });
      notify(`「${r.completed.title}」完成了！`); // 最後一個工程完成時面板會換成「全部修復」，靠提示告知
    } else {
      const left = remainingFor(saved, project);
      notify(r.quarter ? `「${project.title}」完成 ${r.quarter}%，森林有了一點變化！${COPY.projectNeed(left, project.promise)}` : COPY.projectNeed(left, project.promise));
    }
  };

  if (justDone)
    return (
      <section className="card center">
        <p className="eyebrow">工程完成</p>
        <h2>「{justDone.title}」完成了！</h2>
        <p>{justDone.message}</p>
        <div className="row center">
          <button className="primary" onClick={() => onEnter(justDone.habitatId)}>
            去{habitatName(justDone.habitatId)}看看
          </button>
          <button className="ghost" onClick={() => setJustDone(null)}>
            下一個工程
          </button>
        </div>
      </section>
    );
  return (
    <section className="card">
      <p className="eyebrow">目前工程</p>
      <h2>{project.title}</h2>
      <p className="muted">
        完成後：{project.description}
        {unlocks.length > 0 && `，解鎖${unlocks.map((a) => a.name).join('、')}的蛋`}
      </p>
      <Progress value={got / project.requiredPoints} label="工程進度" />
      <p className="small">
        {got} / {project.requiredPoints} 點 · {COPY.projectNeed(remaining, project.promise)}
      </p>
      <p className="muted small">專注得到的成長點數，會在專注完成時自動投入這個工程。</p>
      {wallet > 0 && (
        <button className="primary" onClick={give}>
          投入手上的 {Math.min(wallet, remaining)} 點{wallet >= remaining ? '並完成' : ''}
        </button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

/** 森林裡的動物：每種孵出幾隻，點開看圖鑑卡。 */
function MyAnimals() {
  const { save } = useSave();
  const [card, setCard] = useState<string | null>(null);
  const counts = hatchCounts(save);
  const hatched = ANIMALS.filter((a) => counts.get(a.id));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return (
    <section className="card">
      <div className="row between">
        <h2>森林裡的動物</h2>
        <span className="small">共 {total} 隻</span>
      </div>
      {hatched.length ? (
        <div className="pet-row">
          {hatched.map((a) => (
            <button key={a.id} className="pet-chip" onClick={() => setCard(a.id)}>
              <AnimalArt id={a.id} size={56} />
              <strong>{a.name}</strong>
              <span className="small muted">× {counts.get(a.id)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">還沒有孵出動物。完成一段專注，選好的蛋就會孵出來。</p>
      )}
      <p className="small muted">
        已孵出 {hatched.length} / {ANIMALS.length} 種。完整的圖鑑在「我的歷程」。
      </p>
      {card && <AnimalCard save={save} animalId={card} onClose={() => setCard(null)} />}
    </section>
  );
}

function HabitatView({ id, onBack }: { id: HabitatId; onBack: () => void }) {
  const { save } = useSave();
  const [card, setCard] = useState<string | null>(null);
  const shown = sceneAnimals(save);
  useAmbient(save.settings.soundEnabled, save.settings.soundVolume, habitatSound(save, id));
  const h = HABITATS.find((x) => x.id === id)!;
  const reduced = save.settings.reducedMotion || prefersReducedMotion();
  return (
    <div className="page">
      <div className="row between">
        <button className="link" onClick={onBack}>
          ← 小島總覽
        </button>
        <span className="muted small">{reduced ? '低動態' : ''}</span>
      </div>
      <h1>{h.name}</h1>
      <section className="card flush">
        <HabitatScene habitatId={id} onSelect={(sid) => setCard(shown.find((x) => x.id === sid)?.animalId ?? null)} />
      </section>
      <section className="card">
        <h2>最近孵出的動物</h2>
        {shown.length ? (
          <div className="creature-row">
            {shown.map((x) => (
              <button key={x.id} className="creature-chip" onClick={() => setCard(x.animalId)}>
                <AnimalArt id={x.animalId} size={40} />
                <span>{ANIMALS.find((a) => a.id === x.animalId)?.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">還沒有動物住在這裡。完成一段專注就會孵出第一隻。</p>
        )}
        <p className="muted small">{h.blurb}</p>
      </section>
      {card && <AnimalCard save={save} animalId={card} onClose={() => setCard(null)} />}
    </div>
  );
}
