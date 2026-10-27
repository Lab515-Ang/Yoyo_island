import { useState } from 'react';
import { useSave } from '../app/store';
import { ANIMALS, type AnimalDef } from '../content/config';
import { AnimalArt, TrackArt } from '../components/Animal';
import { Coin, Modal } from '../components/ui';
import { animalUnlocked, coins, unlockAnimal, type ActionResult } from '../domain/game';
import { Check } from 'lucide-react';

/**
 * 商店：用專注賺的金幣解鎖動物的探索路線（之後就能去找牠）；少數特別探索用真錢（上架後開放，現在只有流程）。
 * 流程：點商品看介紹 → 確認 → 發現新的足跡。
 */
const TABS = [
  ['featured', '精選'],
  ['coins', '探索路線'],
  ['special', '特別探索'],
] as const;

export function Shop({ onLobby }: { onLobby: () => void }) {
  const { save } = useSave();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('featured');
  const [pick, setPick] = useState<AnimalDef | null>(null);
  const [got, setGot] = useState<AnimalDef | null>(null);
  const wallet = coins(save);
  const coinAnimals = ANIMALS.filter((a) => a.unlock.kind === 'coins');
  const special = ANIMALS.filter((a) => a.unlock.kind === 'iap');
  // 精選：還沒解鎖、金幣最少就能買的那一隻（全部買完就推特別探索）
  const featured = coinAnimals.filter((a) => !animalUnlocked(save, a)).sort((a, b) => (a.unlock.kind === 'coins' && b.unlock.kind === 'coins' ? a.unlock.price - b.unlock.price : 0))[0] ?? special[0];

  const price = (a: AnimalDef) =>
    a.unlock.kind === 'coins' ? (
      <>
        <Coin /> {a.unlock.price.toLocaleString('en-US')}
      </>
    ) : (
      a.unlock.kind === 'iap' && a.unlock.price
    );

  // 商品格（參考 Forest：上面是圖、下面是名稱和價格膠囊）
  const card = (a: AnimalDef) => {
    const ok = animalUnlocked(save, a);
    return (
      <button key={a.id} className={ok ? 'shop-item owned' : 'shop-item'} onClick={() => setPick(a)} aria-label={ok ? `${a.name}（已解鎖）` : `${a.name}，解鎖探索路線`}>
        <span className="shop-art">
          <AnimalArt id={a.id} size={64} hidden={!ok} />
        </span>
        <span className="shop-name">{a.name}</span>
        <span className="price-pill">{ok ? <><Check size={14} aria-hidden="true" /> 已解鎖</> : price(a)}</span>
      </button>
    );
  };

  return (
    <div className="page shop">
      <h1>商店</h1>
      <div className="shop-tabs" role="tablist" aria-label="商店分類">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      <div className="slide-in" key={tab}>
        {tab === 'featured' && (
          <>
            {featured && (
              <button className="shop-hero" onClick={() => setPick(featured)}>
                <span className="eyebrow">{featured.unlock.kind === 'iap' ? '特別探索' : '今日推薦'}</span>
                <AnimalArt id={featured.id} size={150} hidden={!animalUnlocked(save, featured)} />
                <strong>{featured.name}</strong>
                <span className="small">{featured.blurb}</span>
                <span className="price-pill big">{price(featured)}</span>
              </button>
            )}
            <h2 className="shop-sub">全部探索路線</h2>
            <div className="shop-grid">{coinAnimals.map(card)}</div>
          </>
        )}
        {tab === 'coins' && (
          <>
            <p className="small muted">完成專注每分鐘得 1 金幣。解鎖探索路線後，每次專注前都可以選擇去找這種動物。</p>
            <div className="shop-grid">{coinAnimals.map(card)}</div>
          </>
        )}
        {tab === 'special' && (
          <>
            <p className="small muted">跟著保育研究員去找森林裡最難遇見的動物，第一次就能看到成年的牠。需要付費，App 上架後開放。</p>
            <div className="shop-grid">{special.map(card)}</div>
          </>
        )}
      </div>

      {pick && <BuySheet animal={pick} wallet={wallet} owned={animalUnlocked(save, pick)} onLobby={onLobby} onClose={() => setPick(null)} onDone={(a) => (setPick(null), setGot(a))} />}
      {got && <NewEgg animal={got} onLobby={onLobby} onClose={() => setGot(null)} />}
    </div>
  );
}

/** 商品介紹＋確認購買。 */
function BuySheet({ animal: a, wallet, owned, onLobby, onClose, onDone }: { animal: AnimalDef; wallet: number; owned: boolean; onLobby: () => void; onClose: () => void; onDone: (a: AnimalDef) => void }) {
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
      {owned ? (
        <>
          <p className="small cond">✓ 已解鎖，大廳可以選牠當探索目標。</p>
          <button
            className="primary wide"
            onClick={() => {
              update((s) => ({ ...s, settings: { ...s.settings, eggId: a.id } }));
              onClose();
              onLobby();
            }}
          >
            現在就去找牠
          </button>
        </>
      ) : iap ? (
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
