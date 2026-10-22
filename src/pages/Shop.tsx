import { useState } from 'react';
import { useSave } from '../app/store';
import { EGG_PRICE, FACILITIES, HABITATS, MAX_PETS_PER_HABITAT, PETS, RARITY_LABEL, habitatName, petDef, projectDef } from '../content/config';
import { PetImage } from '../components/PetArt';
import { Coin } from '../components/ui';
import {
  adoptPet,
  buyEgg,
  buyFacility,
  coins,
  eggOdds,
  facilityOwned,
  habitatFree,
  habitatOpen,
  habitatPetCount,
  habitatSlots,
  petAvailable,
  type ActionResult,
  type PetResult,
} from '../domain/game';
import type { HabitatId, SaveFile } from '../domain/types';

/** 商店：驚喜蛋、指定購買寵物、設施（名額）。全部用專注得到的金幣，沒有任何真錢購買。 */
export function Shop() {
  const { save, update, notify } = useSave();
  const [error, setError] = useState<string | null>(null);
  const wallet = coins(save);
  const open = HABITATS.filter((h) => h.playable && habitatOpen(save, h.id));

  /** 執行一個商店動作；成功時用 message 產生提示 */
  function run(fn: (s: SaveFile) => ActionResult | PetResult, message: (r: ActionResult | PetResult) => string) {
    setError(null);
    let r: ActionResult | PetResult | null = null;
    const saved = update((s) => {
      r = fn(s);
      return r.ok ? r.save : s;
    });
    const res = r as ActionResult | PetResult | null;
    if (!res) return;
    if (!res.ok) return setError(res.error);
    if (saved) notify(message(res));
  }

  const hatched = (r: ActionResult | PetResult) => {
    const def = 'pet' in r ? petDef(r.pet.typeId) : undefined;
    return def ? `${def.name}的${def.stages[0]}來到島上了！到「我的小島」用飼料把牠養大吧。` : '';
  };
  const slotText = (h: HabitatId) => `名額 ${habitatPetCount(save, h)} / ${habitatSlots(save, h)}`;

  return (
    <div className="page">
      <h1>商店</h1>
      <p>
        你的金幣：<Coin /> <strong>{wallet}</strong>
      </p>
      <p className="small muted">完成專注每分鐘得 1 金幣。每個場景先有 1 個寵物名額，買設施可以增加，最多 {MAX_PETS_PER_HABITAT} 隻。</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <h2>驚喜蛋</h2>
      <p className="small muted">孵出這個場景的隨機寵物，島上還沒養過的種類優先。表情在孵化時隨機揭曉。</p>
      <div className="codex-grid">
        {open.map((h) => {
          const price = EGG_PRICE[h.id];
          if (!price) return null;
          const odds = eggOdds(save, h.id);
          const free = habitatFree(save, h.id) > 0;
          return (
            <div key={h.id} className="codex-card shop-card">
              <span className="sound-icon" aria-hidden="true">
                🥚
              </span>
              <strong>{h.name}的驚喜蛋</strong>
              <span className="small muted">{slotText(h.id)}</span>
              {odds.length ? (
                <ul className="odds small">
                  {odds.map((o) => (
                    <li key={o.def.id}>
                      {o.def.name}（{RARITY_LABEL[o.def.rarity]}）{Math.round(o.p * 100)}%
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="small muted">修好棲地工程後才有寵物可以孵化</span>
              )}
              <button className="primary" disabled={!odds.length || wallet < price || !free} onClick={() => run((s) => buyEgg(s, s.profile.id, h.id, Date.now()), hatched)}>
                <span className="row">
                  <Coin /> {price} 購買
                </span>
              </button>
              {!free && <span className="small muted">名額已滿，買設施可以增加</span>}
            </div>
          );
        })}
        {!open.length && <p className="muted">還沒有開放的場景。</p>}
      </div>

      <h2>指定購買</h2>
      <p className="small muted">自己選種類，表情在孵化時隨機揭曉；同一種可以養很多隻。</p>
      <div className="codex-grid">
        {PETS.map((p) => {
          const ready = petAvailable(save, p);
          const free = habitatFree(save, p.habitatId) > 0;
          return (
            <div key={p.id} className={ready ? 'codex-card shop-card' : 'codex-card shop-card locked'}>
              <PetImage typeId={p.id} art={p.art} stage={ready ? 3 : 0} size={64} hidden={!ready} />
              <strong>{p.name}</strong>
              <span className="small muted">
                {RARITY_LABEL[p.rarity]} · {habitatName(p.habitatId)}
              </span>
              <span className="small muted">{p.stages.join(' → ')}</span>
              {ready ? (
                <>
                  <button className="primary" disabled={wallet < p.adoptPrice || !free} onClick={() => run((s) => adoptPet(s, s.profile.id, p.id, Date.now()), hatched)}>
                    <span className="row">
                      <Coin /> {p.adoptPrice} 購買
                    </span>
                  </button>
                  {!free ? (
                    <span className="small muted">{habitatName(p.habitatId)}名額已滿</span>
                  ) : (
                    wallet < p.adoptPrice && <span className="small muted">還差 {p.adoptPrice - wallet} 金幣</span>
                  )}
                </>
              ) : (
                <span className="small muted">
                  完成「{projectDef(p.requiredProjectId)?.title}」後可購買（{p.adoptPrice} 金幣）
                </span>
              )}
            </div>
          );
        })}
      </div>

      <h2>設施</h2>
      <p className="small muted">放進場景、看得到的設施。每買一個，那個場景就多 1 個寵物名額。</p>
      {HABITATS.filter((h) => h.playable).map((h) => (
        <section key={h.id}>
          <h3>
            {h.name} <span className="small muted">{habitatOpen(save, h.id) ? slotText(h.id) : '尚未開放'}</span>
          </h3>
          <div className="codex-grid">
            {FACILITIES.filter((f) => f.habitatId === h.id).map((f) => {
              const owned = facilityOwned(save, f.id);
              const ok = habitatOpen(save, h.id);
              return (
                <div key={f.id} className={ok ? 'codex-card shop-card' : 'codex-card shop-card locked'}>
                  <strong>{f.name}</strong>
                  <span className="small muted">{f.blurb}</span>
                  {owned ? (
                    <span className="small cond">已放進場景（名額 +1）</span>
                  ) : ok ? (
                    <button className="primary" disabled={wallet < f.price} onClick={() => run((s) => buyFacility(s, s.profile.id, f.id, Date.now()), () => `${f.name}放進${h.name}了，可以多養一隻寵物。`)}>
                      <span className="row">
                        <Coin /> {f.price} 購買
                      </span>
                    </button>
                  ) : (
                    <span className="small muted">{h.name}開放後可購買</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <p className="small muted">金幣只能靠完成專注獲得，沒有付費購買。</p>
    </div>
  );
}
