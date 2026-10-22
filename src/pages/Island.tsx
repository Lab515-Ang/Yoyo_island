import { useEffect, useState } from 'react';
import { useSave } from '../app/store';
import { COPY, HABITATS, PROJECTS, habitatName } from '../content/config';
import { Creature } from '../components/Creature';
import { Progress, SpeciesCard } from '../components/ui';
import { activeProject, balance, contribute, discoveryOf, habitatOpen, isDone, projectRow, remainingFor, speciesPresent, visitHabitat } from '../domain/game';
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
        <p className="muted small">首版路線共 580 點，大約是 580 分鐘的專注。</p>
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
      const extra = r.completed.id === 'st_entrance' ? '溪流濕地開放了，也可以選作專注背景。' : r.unlocked.length ? COPY.newVisitor(habitatName(r.completed.habitatId)) : r.completed.description + '。';
      setJustDone({ title: r.completed.title, habitatId: r.completed.habitatId, message: extra });
      notify(`「${r.completed.title}」完成了！`); // 最後一個工程完成時面板會換成「全部修復」，靠提示告知
    } else {
      const left = remainingFor(saved, project);
      notify(COPY.projectNeed(left, project.promise));
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
      <p className="muted">完成後：{project.description}</p>
      <Progress value={got / project.requiredPoints} label="工程進度" />
      <p className="small">
        {got} / {project.requiredPoints} 點 · {COPY.projectNeed(remaining, project.promise)}
      </p>
      <p>
        可用點數：<strong>{wallet}</strong>
      </p>
      {wallet > 0 ? (
        <>
          <div className="row wrap">
            <button className="primary" onClick={() => give('all')}>
              投入 {Math.min(wallet, remaining)} 點{wallet >= remaining ? '並完成' : ''}
            </button>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                give(amount.trim() === '' ? NaN : parsed);
              }}
            >
              <input className="short" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="點數" aria-label="自訂投入點數" />
              <button type="submit">投入</button>
            </form>
          </div>
          <p className="muted small">實際投入會是輸入值、你的點數與工程剩餘需求三者中最小的一個。</p>
        </>
      ) : (
        <p className="muted">目前沒有可投入的點數。完成一段專注，每滿 1 分鐘得到 1 點。</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function HabitatView({ id, onBack }: { id: HabitatId; onBack: () => void }) {
  const { save, update, notify } = useSave();
  const [card, setCard] = useState<string | null>(null);
  const present = speciesPresent(save, id);
  const water = id === 'stream' || isDone(save, 'gh_fountain');
  useAmbient(save.settings.soundEnabled, save.settings.soundVolume, water);

  // 進入棲地時首次發現（同一物種只記錄一次）
  useEffect(() => {
    let found: string[] = [];
    update((s) => {
      const r = visitHabitat(s, id, Date.now());
      found = r.discovered.map((x) => x.name);
      return r.save;
    });
    if (found.length) notify(`有新朋友來訪：${found.join('、')}。點牠們看看圖鑑卡吧。`);
  }, [id, update, notify]);

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
        <h2>在這裡的生物</h2>
        {present.length ? (
          <div className="creature-row">
            {present.map((s) => (
              <button key={s.id} className="creature-chip" onClick={() => setCard(s.id)}>
                <Creature id={s.id} size={40} />
                <span>{s.name}</span>
                {!discoveryOf(save, s.id) && <span className="badge">新</span>}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">還很安靜。修復這裡的工程，生物就會慢慢回來。</p>
        )}
        <p className="muted small">{h.blurb} 點場景中的生物或上方名稱可以打開圖鑑卡。</p>
      </section>
      {card && <SpeciesCard save={save} speciesId={card} onClose={() => setCard(null)} />}
    </div>
  );
}
