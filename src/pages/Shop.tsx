import { useEffect, useState } from 'react';
import { useSave } from '../app/store';
import { EGG_PRICE, FACES, FACILITIES, HABITATS, MAX_PETS_PER_HABITAT, PETS, RARITY_LABEL, habitatName, petDef, projectDef, type FacilityDef, type PetDef } from '../content/config';
import { PetImage } from '../components/PetArt';
import { Coin, Modal } from '../components/ui';
import {
  adoptPet,
  adoptedPets,
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
import type { HabitatId, PetInstance } from '../domain/types';

type Pick = { kind: 'pet'; def: PetDef } | { kind: 'egg'; habitatId: HabitatId } | { kind: 'facility'; def: FacilityDef };

/** 商店：驚喜蛋、指定購買寵物、設施（名額）。全部用專注得到的金幣，沒有任何真錢購買。
 *  流程：點商品看介紹 → 確認 → 新夥伴來了（驚喜蛋會先晃一晃再揭曉）。 */
export function Shop({ onIsland }: { onIsland: () => void }) {
  const { save, update, notify } = useSave();
  const [pick, setPick] = useState<Pick | null>(null);
  const [got, setGot] = useState<{ pet: PetInstance; surprise: boolean } | null>(null);
  const wallet = coins(save);
  const open = HABITATS.filter((h) => h.playable && habitatOpen(save, h.id));
  const slotText = (h: HabitatId) => `名額 ${habitatPetCount(save, h)} / ${habitatSlots(save, h)}`;
  const owned = (typeId: string) => adoptedPets(save).filter((v) => v.def.id === typeId).length;

  const price = (p: Pick) => (p.kind === 'egg' ? EGG_PRICE[p.habitatId]! : p.kind === 'pet' ? p.def.adoptPrice : p.def.price);
  const priceBtn = (p: Pick, disabled = false) => (
    <button className="primary" disabled={disabled} onClick={() => setPick(p)}>
      <span className="row">
        <Coin /> {price(p)}
      </span>
    </button>
  );

  return (
    <div className="page">
      <h1>商店</h1>
      <p>
        你的金幣：<Coin /> <strong>{wallet}</strong>
      </p>
      <p className="small muted">完成專注每分鐘得 1 金幣。每個場景先有 1 個寵物名額，買設施可以增加，最多 {MAX_PETS_PER_HABITAT} 隻。</p>

      <h2>驚喜蛋</h2>
      <p className="small muted">孵出這個場景的隨機寵物，島上還沒養過的種類優先。</p>
      <div className="codex-grid">
        {open.map((h) => {
          if (!EGG_PRICE[h.id]) return null;
          const any = eggOdds(save, h.id).length > 0;
          return (
            <div key={h.id} className="codex-card shop-card">
              <span className="sound-icon" aria-hidden="true">
                🥚
              </span>
              <strong>{h.name}的驚喜蛋</strong>
              <span className="small muted">{any ? slotText(h.id) : '修好棲地工程後才有寵物可以孵化'}</span>
              {priceBtn({ kind: 'egg', habitatId: h.id }, !any)}
            </div>
          );
        })}
        {!open.length && <p className="muted">還沒有開放的場景。</p>}
      </div>

      <h2>指定購買</h2>
      <p className="small muted">自己選種類；同一種可以養很多隻。</p>
      <div className="codex-grid">
        {PETS.map((p) => {
          const ready = petAvailable(save, p);
          const n = owned(p.id);
          return (
            <div key={p.id} className={ready ? 'codex-card shop-card' : 'codex-card shop-card locked'}>
              <PetImage typeId={p.id} art={p.art} stage={ready ? 3 : 0} size={64} hidden={!ready} />
              <strong>{p.name}</strong>
              <span className="small muted">
                {RARITY_LABEL[p.rarity]} · {habitatName(p.habitatId)}
              </span>
              {n > 0 && <span className="small cond">✓ 已養 {n} 隻</span>}
              {ready ? (
                priceBtn({ kind: 'pet', def: p })
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
              const ok = habitatOpen(save, h.id);
              return (
                <div key={f.id} className={ok ? 'codex-card shop-card' : 'codex-card shop-card locked'}>
                  <strong>{f.name}</strong>
                  <span className="small muted">{f.blurb}</span>
                  {facilityOwned(save, f.id) ? (
                    <span className="small cond">✓ 已放進場景（名額 +1）</span>
                  ) : ok ? (
                    priceBtn({ kind: 'facility', def: f })
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

      {pick && (
        <BuySheet
          pick={pick}
          price={price(pick)}
          wallet={wallet}
          onClose={() => setPick(null)}
          onBuy={() => {
            const now = Date.now();
            let r: ActionResult | PetResult | null = null;
            const saved = update((s) => {
              r = pick.kind === 'pet' ? adoptPet(s, s.profile.id, pick.def.id, now) : pick.kind === 'egg' ? buyEgg(s, s.profile.id, pick.habitatId, now) : buyFacility(s, s.profile.id, pick.def.id, now);
              return r.ok ? r.save : s;
            });
            const res = r as ActionResult | PetResult | null;
            if (!res) return;
            if (!res.ok) return res.error;
            if (!saved) return null;
            setPick(null);
            if ('pet' in res) setGot({ pet: res.pet, surprise: pick.kind === 'egg' });
            else if (pick.kind === 'facility') notify(`${pick.def.name}放進${habitatName(pick.def.habitatId)}了，可以多養一隻寵物。`);
            return null;
          }}
        />
      )}
      {got && <NewFriend pet={got.pet} surprise={got.surprise} onIsland={onIsland} onClose={() => setGot(null)} />}
    </div>
  );
}

/** 商品介紹＋確認購買。onBuy 回傳錯誤訊息或 null。 */
function BuySheet({ pick, price, wallet, onClose, onBuy }: { pick: Pick; price: number; wallet: number; onClose: () => void; onBuy: () => string | null | undefined }) {
  const { save } = useSave();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const habitat = pick.kind === 'egg' ? pick.habitatId : pick.def.habitatId;
  const needsSlot = pick.kind !== 'facility';
  const full = needsSlot && habitatFree(save, habitat) <= 0;
  const short = price - wallet;
  const what = pick.kind === 'egg' ? `一顆${habitatName(habitat)}的驚喜蛋` : pick.kind === 'pet' ? `一顆${pick.def.name}的${pick.def.stages[0]}` : pick.def.name;
  const title = pick.kind === 'egg' ? `${habitatName(habitat)}的驚喜蛋` : pick.def.name;

  return (
    <Modal title={title} onClose={onClose}>
      {pick.kind === 'pet' && (
        <>
          <div className="center">
            <PetImage typeId={pick.def.id} art={pick.def.art} stage={3} size={140} />
          </div>
          <p className="small muted center">
            {RARITY_LABEL[pick.def.rarity]} · 住在{habitatName(habitat)}
          </p>
          <p>{pick.def.blurb}</p>
          <div className="stage-row" aria-label="成長階段">
            {pick.def.stages.map((name, i) => (
              <figure key={name}>
                <PetImage typeId={pick.def.id} art={pick.def.art} stage={i} size={52} />
                <figcaption className="small">{name}</figcaption>
              </figure>
            ))}
          </div>
          <p className="small muted">用飼料慢慢養大。孵化時會隨機揭曉 {FACES.length} 種表情之一，沒有稀有度、不能重抽。</p>
        </>
      )}
      {pick.kind === 'egg' && (
        <>
          <div className="center sound-icon" aria-hidden="true">
            🥚
          </div>
          <p>孵出{habitatName(habitat)}的隨機寵物，島上還沒養過的種類優先。</p>
          <ul className="odds small">
            {eggOdds(save, habitat).map((o) => (
              <li key={o.def.id}>
                {o.def.name}（{RARITY_LABEL[o.def.rarity]}）{Math.round(o.p * 100)}%
              </li>
            ))}
          </ul>
        </>
      )}
      {pick.kind === 'facility' && (
        <>
          <p>{pick.def.blurb}</p>
          <p className="small muted">放進{habitatName(habitat)}後看得到，這個場景的寵物名額 +1。</p>
        </>
      )}

      {needsSlot && <p className="small muted">{habitatName(habitat)}名額 {habitatPetCount(save, habitat)} / {habitatSlots(save, habitat)}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {confirming ? (
        <div className="confirm-box">
          <p>
            確定用 <Coin /> <strong>{price}</strong> 買{what}嗎？
          </p>
          <div className="row">
            <button onClick={() => setConfirming(false)}>取消</button>
            <button className="primary" onClick={() => setError(onBuy() ?? null)}>
              確定購買
            </button>
          </div>
        </div>
      ) : (
        <>
          <button className="primary wide" disabled={full || short > 0} onClick={() => setConfirming(true)}>
            <span className="row">
              <Coin /> {price} 購買
            </span>
          </button>
          {full ? (
            <p className="small muted">{habitatName(habitat)}名額已滿，買設施可以增加。</p>
          ) : (
            short > 0 && <p className="small muted">還差 {short} 金幣，再專注 {short} 分鐘就夠了。</p>
          )}
        </>
      )}
    </Modal>
  );
}

/** 新夥伴來了：驚喜蛋先晃一晃，再揭曉是誰。 */
function NewFriend({ pet, surprise, onIsland, onClose }: { pet: PetInstance; surprise: boolean; onIsland: () => void; onClose: () => void }) {
  const def = petDef(pet.typeId)!;
  const [shaking, setShaking] = useState(surprise);
  useEffect(() => {
    if (!shaking) return;
    const id = setTimeout(() => setShaking(false), 1800);
    return () => clearTimeout(id);
  }, [shaking]);

  return (
    <div className="new-friend" role="dialog" aria-modal="true" aria-labelledby="new-friend-title">
      <p className="eyebrow">{surprise ? '驚喜蛋' : '商店'}</p>
      <h1 id="new-friend-title">{shaking ? '蛋在晃動…' : surprise ? `是${def.name}！` : '新夥伴來了！'}</h1>
      <div className={shaking ? 'new-friend-art shake' : 'new-friend-art glow'}>
        {shaking ? <span aria-hidden="true">🥚</span> : <PetImage typeId={def.id} art={def.art} stage={0} size={160} />}
      </div>
      {!shaking && (
        <>
          <p>
            {def.name}的{def.stages[0]}來到{habitatName(def.habitatId)}了。
          </p>
          <p className="small muted">在「我的小島」把牠設成陪伴寵物，專注得到的飼料就會先餵牠；孵化時會揭曉牠的表情。</p>
          <div className="guard-actions">
            <button className="primary" onClick={() => (onClose(), onIsland())}>
              去小島看看
            </button>
            <button onClick={onClose}>繼續逛逛</button>
          </div>
        </>
      )}
    </div>
  );
}
