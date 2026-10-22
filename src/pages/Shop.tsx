import { useState } from 'react';
import { useSave } from '../app/store';
import { habitatName, PETS, projectDef, RARITY_LABEL } from '../content/config';
import { PetArt } from '../components/PetArt';
import { Coin } from '../components/ui';
import { adoptPet, coins, isAdopted, isDone, type PetResult } from '../domain/game';

/** 商店：用專注得到的金幣領養寵物（住進小島的只有寵物）。沒有任何真錢購買。 */
export function Shop() {
  const { save, update, notify } = useSave();
  const [error, setError] = useState<string | null>(null);
  const wallet = coins(save);

  const adopt = (id: string) => {
    setError(null);
    let r: PetResult | null = null;
    const saved = update((s) => {
      r = adoptPet(s, s.profile.id, id, Date.now());
      return r.ok ? r.save : s;
    });
    const res = r as PetResult | null;
    if (!res) return;
    if (!res.ok) return setError(res.error);
    const p = PETS.find((x) => x.id === id)!;
    if (saved) notify(`領養了${p.name}的${p.stages[0]}！到「我的小島」用飼料把牠養大吧。`);
  };

  return (
    <div className="page">
      <h1>商店</h1>
      <p>
        你的金幣：<Coin /> <strong>{wallet}</strong>
      </p>
      <p className="small muted">完成專注每分鐘得 1 金幣。棲地工程完成後，就能用金幣領養寵物，牠會住進小島。</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <h2>領養寵物</h2>
      <p className="small muted">領養後從卵或蛋開始，用專注得到的飼料慢慢養大。</p>
      <div className="codex-grid">
        {PETS.map((p) => {
          const adopted = isAdopted(save, p.id);
          const ready = isDone(save, p.requiredProjectId);
          return (
            <div key={p.id} className={ready ? 'codex-card shop-card' : 'codex-card shop-card locked'}>
              <PetArt id={p.id} stage={ready ? 3 : 0} size={64} hidden={!ready} />
              <strong>{p.name}</strong>
              <span className="small muted">
                {RARITY_LABEL[p.rarity]} · {habitatName(p.habitatId)}
              </span>
              <span className="small muted">{p.stages.join(' → ')}</span>
              {adopted ? (
                <span className="small cond">已領養</span>
              ) : ready ? (
                <>
                  <button className="primary" onClick={() => adopt(p.id)} disabled={wallet < p.adoptPrice}>
                    <span className="row">
                      <Coin /> {p.adoptPrice} 領養
                    </span>
                  </button>
                  {wallet < p.adoptPrice && <span className="small muted">還差 {p.adoptPrice - wallet} 金幣</span>}
                </>
              ) : (
                <span className="small muted">
                  完成「{projectDef(p.requiredProjectId)?.title}」後可用 {p.adoptPrice} 金幣領養
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="small muted">金幣只能靠完成專注獲得，沒有付費購買。</p>
    </div>
  );
}
