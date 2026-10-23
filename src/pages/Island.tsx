import { useEffect, useState } from 'react';
import { useSave } from '../app/store';
import { COPY, habitatName, HABITATS, MAX_PETS_PER_HABITAT, PLANTS, PROJECTS } from '../content/config';
import { Progress } from '../components/ui';
import { PetImage } from '../components/PetArt';
import { PetCard } from '../components/PetCard';
import { activeProject, adoptedPets, balance, companionPet, contribute, feed, habitatOpen, habitatSlots, habitatSound, isDone, petMaxFeed, projectRow, remainingFor } from '../domain/game';
import type { HabitatId } from '../domain/types';
import { HabitatScene, prefersReducedMotion } from '../scenes/HabitatScene';
import { IslandMap } from '../scenes/IslandMap';
import { useAmbient } from '../sound';

export function IslandPage({ habitat, setHabitat, onShop }: { habitat: HabitatId | null; setHabitat: (h: HabitatId | null) => void; onShop: () => void }) {
  const { save } = useSave();
  if (habitat && habitatOpen(save, habitat)) return <HabitatView id={habitat} onBack={() => setHabitat(null)} />;
  const project = activeProject(save);
  return (
    <div className="page">
      <h1>我的小島</h1>
      <section className="card flush">
        <IslandMap save={save} onEnter={setHabitat} />
        <div className="row wrap pad">
          {HABITATS.filter((h) => h.playable).map((h) =>
            habitatOpen(save, h.id) ? (
              <button key={h.id} className="ghost" onClick={() => setHabitat(h.id)}>
                進入{h.name}
              </button>
            ) : (
              <span key={h.id} className="muted small">
                {h.name}：完成「打開溪流步道」後開放
              </span>
            ),
          )}
        </div>
      </section>
      <MyPets onShop={onShop} />
      {project ? <ProjectPanel onEnter={setHabitat} /> : <section className="card"><p>{COPY.allRestored}</p></section>}
      <section className="card">
        <h2>修復路線</h2>
        <ol className="route">
          {PROJECTS.map((p) => {
            const row = projectRow(save, p.id);
            const done = isDone(save, p.id);
            const current = p.id === project?.id;
            return (
              <li key={p.id} className={done ? 'done' : current ? 'current' : 'later'}>
                <span className="route-dot" aria-hidden="true">{done ? '✓' : ''}</span>
                <div>
                  <strong>{p.title}</strong> <span className="muted small">· {habitatName(p.habitatId)}</span>
                  <div className="small muted">
                    {done ? `已完成 · ${p.description}` : `${row?.contributedPoints ?? 0} / ${p.requiredPoints} 點 · ${p.description}`}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="muted small">
          整條路線共 {PROJECTS.reduce((a, p) => a + p.requiredPoints, 0).toLocaleString()} 點，大約 {Math.round(PROJECTS.reduce((a, p) => a + p.requiredPoints, 0) / 60)} 小時的專注。每投入 25%，場景就會先有一點變化。
        </p>
      </section>
    </div>
  );
}

function ProjectPanel({ onEnter }: { onEnter: (h: HabitatId) => void }) {
  const { save, update, notify } = useSave();
  const [amount, setAmount] = useState('');
  // 完成後先停在完成卡，避免連點把點數投進下一個工程
  const [justDone, setJustDone] = useState<{ title: string; habitatId: HabitatId; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const project = activeProject(save)!;
  const wallet = balance(save);
  const remaining = remainingFor(save, project);
  const got = project.requiredPoints - remaining;

  const give = (input: number | 'all') => {
    setError(null);
    let result: ReturnType<typeof contribute> | null = null;
    const saved = update((s) => {
      result = contribute(s, s.profile.id, project.id, input, Date.now());
      return result.ok ? result.save : s;
    });
    const r = result as ReturnType<typeof contribute> | null;
    if (!r) return;
    if (!r.ok) return setError(r.error);
    if (!saved) return;
    setAmount('');
    if (r.completed) {
      const extra = r.completed.id === 'st_entrance' ? '溪流濕地開放了，也可以選作專注背景。' : r.unlocked.length ? COPY.canAdopt(r.unlocked.map((p) => p.name).join('、')) : r.completed.description + '。';
      setJustDone({ title: r.completed.title, habitatId: r.completed.habitatId, message: extra });
      notify(`「${r.completed.title}」完成了！`); // 最後一個工程完成時面板會換成「全部修復」，靠提示告知
    } else {
      const left = remainingFor(saved, project);
      notify(r.quarter ? `「${project.title}」完成 ${r.quarter}%，小島有了一點變化！${COPY.projectNeed(left, project.promise)}` : COPY.projectNeed(left, project.promise));
    }
  };

  const parsed = Number(amount);
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
      <p className="eyebrow">目前工程 · {habitatName(project.habitatId)}</p>
      <h2>{project.title}</h2>
      <p className="muted">
        完成後：{project.description}
        {PLANTS.filter((p) => p.unlockProjectId === project.id).map((p) => `，解鎖植物「${p.name}」`)}
      </p>
      <Progress value={got / project.requiredPoints} label="工程進度" />
      <p className="small">
        {got} / {project.requiredPoints} 點 · {COPY.projectNeed(remaining, project.promise)}
      </p>
      <p className="muted small">專注得到的成長點數，會在專注完成時自動投入這個工程。</p>
      {wallet > 0 && (
        <button className="primary" onClick={() => give('all')}>
          投入手上的 {Math.min(wallet, remaining)} 點{wallet >= remaining ? '並完成' : ''}
        </button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

/** 我的寵物：已領養的寵物與成長進度，點開可餵食。 */
function MyPets({ onShop }: { onShop: () => void }) {
  const { save } = useSave();
  const [card, setCard] = useState<string | null>(null);
  const habitats = HABITATS.filter((h) => h.playable && habitatOpen(save, h.id));
  const companion = companionPet(save)?.pet.id;
  return (
    <section className="card">
      <div className="row between">
        <h2>我的寵物</h2>
        <span className="small">🌾 {feed(save)} 份飼料</span>
      </div>
      {habitats.map((h) => {
        const pets = adoptedPets(save, h.id);
        const slots = habitatSlots(save, h.id);
        return (
          <div key={h.id} className="pet-habitat">
            <p className="small">
              <strong>{h.name}</strong> <span className="muted">名額 {pets.length} / {slots}</span>
            </p>
            <div className="pet-row">
              {pets.map(({ pet, def, fed, stage, face }) => {
                const prev = stage === 0 ? 0 : def.thresholds[stage - 1];
                const next = stage === 3 ? petMaxFeed(def) : def.thresholds[stage];
                return (
                  <button key={pet.id} className="pet-chip" onClick={() => setCard(pet.id)}>
                    <PetImage typeId={def.id} art={def.art} stage={stage} face={face} size={56} />
                    <strong>
                      {companion === pet.id && <span title="陪伴寵物">★ </span>}
                      {def.name}
                    </strong>
                    <span className="small muted">{def.stages[stage]}</span>
                    {stage < 3 ? <Progress value={(fed - prev) / (next - prev)} label={`${def.name}成長進度`} /> : <span className="small cond">已長大</span>}
                  </button>
                );
              })}
              {Array.from({ length: Math.max(0, slots - pets.length) }, (_, i) => (
                <button key={`empty${i}`} className="pet-chip empty" onClick={onShop}>
                  <span className="sound-icon" aria-hidden="true">
                    ＋
                  </span>
                  <span className="small muted">空位：到商店領養</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <p className="small muted">★ 是陪伴寵物：專注得到的飼料會自動餵牠。每個場景先有 1 個名額，在商店買設施可以增加，最多 {MAX_PETS_PER_HABITAT} 隻。</p>
      {card && <PetCard petId={card} onClose={() => setCard(null)} />}
    </section>
  );
}

function HabitatView({ id, onBack }: { id: HabitatId; onBack: () => void }) {
  const { save } = useSave();
  const [card, setCard] = useState<string | null>(null);
  const pets = adoptedPets(save, id);
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
        <HabitatScene habitatId={id} onSelect={setCard} />
      </section>
      <section className="card">
        <h2>住在這裡的寵物</h2>
        {pets.length ? (
          <div className="creature-row">
            {pets.map(({ pet, def, stage, face }) => (
              <button key={pet.id} className="creature-chip" onClick={() => setCard(`pet:${pet.id}`)}>
                <PetImage typeId={def.id} art={def.art} stage={stage} face={face} size={40} />
                <span>
                  {def.name}・{def.stages[stage]}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">還沒有寵物住在這裡。修好棲地後，可以到商店領養。</p>
        )}
        <p className="muted small">{h.blurb} 點場景中的寵物可以打開寵物卡餵食。</p>
      </section>
      {card && <PetCard petId={card.replace(/^pet:/, '')} onClose={() => setCard(null)} />}
    </div>
  );
}
