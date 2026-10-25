import { useState } from 'react';
import { useSave } from '../app/store';
import { ANIMALS, type AnimalDef } from '../content/config';
import { AnimalArt, TrackArt } from '../components/Animal';
import { Coin, Modal } from '../components/ui';
import { animalUnlocked, coins, unlockAnimal, type ActionResult } from '../domain/game';

/**
 * 商店：用專注賺的金幣解鎖動物的探索路線（之後就能去找牠）；少數特別探索用真錢（上架後開放，現在只有流程）。
 * 流程：點商品看介紹 → 確認 → 發現新的足跡。
 */
export function Shop({ onLobby }: { onLobby: () => void }) {
  const { save } = useSave();
  const [pick, setPick] = useState<AnimalDef | null>(null);
  const [got, setGot] = useState<AnimalDef | null>(null);
  const wallet = coins(save);
  const coinAnimals = ANIMALS.filter((a) => a.unlock.kind === 'coins');
  const special = ANIMALS.filter((a) => a.unlock.kind === 'iap');

  const card = (a: AnimalDef) => {
    const ok = animalUnlocked(save, a);
    return (
      <div key={a.id} className="codex-card shop-card">
        <AnimalArt id={a.id} size={72} hidden={!ok} />
        <strong>{a.name}</strong>
        {ok ? (
          <span className="small cond">✓ 已解鎖，大廳可以選牠當探索目標</span>
        ) : (
          <button className="primary" onClick={() => setPick(a)} aria-label={`解鎖${a.name}的探索路線`}>
            {a.unlock.kind === 'coins' ? (
              <span className="row">
                <Coin /> {a.unlock.price}
              </span>
            ) : (
              a.unlock.kind === 'iap' && a.unlock.price
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="page">
      <h1>商店</h1>
      <p>
        你的金幣：<Coin /> <strong>{wallet}</strong>
      </p>
      <p className="small muted">完成專注每分鐘得 1 金幣。解鎖探索路線後，每次專注前都可以選擇去找這種動物。其他動物會在修復森林時陸續回到森林。</p>

      <h2>探索路線</h2>
      <div className="codex-grid">{coinAnimals.map(card)}</div>

      <h2>特別探索</h2>
      <p className="small muted">跟著保育研究員去找森林裡最難遇見的動物，第一次就能看到成年的牠。需要付費，App 上架後開放。</p>
      <div className="codex-grid">{special.map(card)}</div>

      {pick && <BuySheet animal={pick} wallet={wallet} onClose={() => setPick(null)} onDone={(a) => (setPick(null), setGot(a))} />}
      {got && <NewEgg animal={got} onLobby={onLobby} onClose={() => setGot(null)} />}
    </div>
  );
}

/** 商品介紹＋確認購買。 */
function BuySheet({ animal: a, wallet, onClose, onDone }: { animal: AnimalDef; wallet: number; onClose: () => void; onDone: (a: AnimalDef) => void }) {
  const { update } = useSave();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iap = a.unlock.kind === 'iap';
  const price = a.unlock.kind === 'coins' ? a.unlock.price : 0;
  const short = price - wallet;

  const buy = () => {
    let r: ActionResult | null = null;
    const saved = update((s) => {
      r = unlockAnimal(s, s.profile.id, a.id, Date.now());
      return r.ok ? r.save : s;
    });
    const res = r as ActionResult | null;
    if (res && !res.ok) return setError(res.error);
    if (saved && res?.ok) onDone(a);
  };

  return (
    <Modal title={a.name} onClose={onClose}>
      <div className="center">
        <AnimalArt id={a.id} size={150} />
      </div>
      <p>{a.blurb}</p>
      <p className="small muted">{iap ? '解鎖後，每次專注前都能選擇去找牠，而且一遇見就是成年的牠。' : '解鎖後，每次專注前都能選擇去找牠。遇見越多次，族群越穩定，會從幼年慢慢看到成年的牠。'}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {iap ? (
        <>
          <button className="primary wide" disabled>
            {a.unlock.kind === 'iap' && a.unlock.price} · 即將推出
          </button>
          <p className="small muted">付費購買會在 App 上架後開放，到時候會使用 App Store／Google Play 的付款。</p>
        </>
      ) : confirming ? (
        <div className="confirm-box">
          <p>
            確定用 <Coin /> <strong>{price}</strong> 解鎖{a.name}的探索路線嗎？
          </p>
          <div className="row">
            <button onClick={() => setConfirming(false)}>取消</button>
            <button className="primary" onClick={buy}>
              確定解鎖
            </button>
          </div>
        </div>
      ) : (
        <>
          <button className="primary wide" disabled={short > 0} onClick={() => setConfirming(true)}>
            <span className="row">
              <Coin /> {price} 解鎖
            </span>
          </button>
          {short > 0 && <p className="small muted">還差 {short} 金幣，再專注 {short} 分鐘就夠了。</p>}
        </>
      )}
    </Modal>
  );
}

/** 發現新的足跡（解鎖了探索路線）。 */
function NewEgg({ animal: a, onLobby, onClose }: { animal: AnimalDef; onLobby: () => void; onClose: () => void }) {
  const { update } = useSave();
  const hatch = () => {
    update((s) => ({ ...s, settings: { ...s.settings, eggId: a.id } }));
    onClose();
    onLobby();
  };
  return (
    <div className="new-friend" role="dialog" aria-modal="true" aria-labelledby="new-egg-title">
      <p className="eyebrow">商店</p>
      <h1 id="new-egg-title">發現新的足跡！</h1>
      <div className="new-friend-art glow">
        <TrackArt id={a.id} size={150} />
      </div>
      <p>現在可以去找{a.name}了。</p>
      <p className="small muted">之後也可以在大廳點泡泡換成其他探索目標。</p>
      <div className="guard-actions">
        <button className="primary" onClick={hatch}>
          現在就去找牠
        </button>
        <button onClick={onClose}>繼續逛逛</button>
      </div>
    </div>
  );
}
