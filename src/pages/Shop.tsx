import { useState } from 'react';
import { useNow, useSave } from '../app/store';
import { SOUNDS, animalDef, animalRegion, hasStages, levelName, regionDef, type AnimalDef } from '../content/config';
import { COIN_PACKS, GEM_PACKS, REFRESH_COINS, landDef, type ShopItem } from '../content/shop';
import { AnimalArt, TrackArt } from '../components/Animal';
import { Coin, Flag, Gem, Modal, RegionFlag } from '../components/ui';
import { coins, gems, type ActionResult } from '../domain/game';
import { buyItem, dailyPicks, exchangeCoins, featuredItems, landOwned, owned, refreshPicks, shopItems } from '../domain/shop';
import { Check, Play, RefreshCw, Square } from 'lucide-react';
import { useAmbient } from '../sound';
import type { SaveFile } from '../domain/types';
import { PageTip } from '../components/PageTip';

/**
 * 商店（參考 Forest）：
 * 精選＝每週 3 個推薦（左右滑）＋每日精選 6 個（午夜換新，可花金幣換一批）；探索＝所有商品；貨幣資源＝寶石換金幣、買寶石。
 */
const TABS = [
  ['featured', '精選'],
  ['all', '探索'],
  ['currency', '貨幣資源'],
] as const;
const FILTERS = [
  ['all', '全部'],
  ['animal', '動物'],
  ['sound', '環境音'],
  ['land', '土地造型'],
] as const;

/** 價格膠囊的內容 */
function PriceTag({ it }: { it: ShopItem }) {
  const p = it.price;
  if ('coins' in p)
    return (
      <>
        <Coin /> {p.coins.toLocaleString('en-US')}
      </>
    );
  if ('gems' in p)
    return (
      <>
        <Gem /> {p.gems}
      </>
    );
  return <>{p.iap}</>;
}

/** 商品圖：動物、環境音的圖示、土地造型的小塊草地 */
export function ItemArt({ it, size }: { it: ShopItem; size: number }) {
  if (it.kind === 'animal') return <AnimalArt id={it.ref} size={size} />;
  if (it.kind === 'sound') return <span style={{ fontSize: size * 0.55 }}>{SOUNDS.find((s) => s.id === it.ref)?.icon}</span>;
  const l = landDef(it.ref);
  return (
    <svg viewBox="0 0 100 70" width={size} height={size * 0.7} aria-hidden="true">
      <polygon points="0,30 50,55 50,68 0,43" fill={l.left} />
      <polygon points="50,55 100,30 100,43 50,68" fill={l.right} />
      <polygon points="50,5 100,30 50,55 0,30" fill={l.top} />
    </svg>
  );
}

const kindName = { animal: '動物', sound: '環境音', land: '土地造型' };

export function Shop({ onLobby }: { onLobby: () => void }) {
  const { save, update, notify } = useSave();
  const now = useNow(60_000);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('featured');
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');
  const [pick, setPick] = useState<ShopItem | null>(null);
  const [pack, setPack] = useState<(typeof COIN_PACKS)[number] | null>(null);
  const [askRefresh, setAskRefresh] = useState(false);
  const [got, setGot] = useState<AnimalDef | null>(null);
  const wallet = coins(save);
  const jewels = gems(save);
  const daily = dailyPicks(save, now);
  const featured = featuredItems(save, now);
  const hoursLeft = Math.max(1, Math.ceil((daily.nextAt - now) / 3_600_000));

  const run = (fn: (s: SaveFile) => ActionResult, ok: string) => {
    let err: string | null = null;
    const saved = update((s) => {
      const r = fn(s);
      if (!r.ok) err = r.error;
      return r.ok ? r.save : s;
    });
    if (err) notify(err);
    else if (saved) notify(ok);
    return !err && !!saved;
  };

  const card = (it: ShopItem) => {
    const have = owned(save, it);
    return (
      <button key={it.id} className={have ? 'shop-item owned' : 'shop-item'} onClick={() => setPick(it)} aria-label={have ? `${it.name}（已擁有）` : `${it.name}，購買`}>
        <span className="shop-art">
          {it.kind === 'animal' && <RegionFlag id={it.ref} />}
          <ItemArt it={it} size={64} />
        </span>
        <span className="shop-name">{it.name}</span>
        <span className="price-pill">
          {have ? (
            <>
              <Check size={14} aria-hidden="true" /> 已擁有
            </>
          ) : (
            <PriceTag it={it} />
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="page shop">
      <div className="shop-head">
        <h1>商店</h1>
        <span className="shop-wallet">
          <span>
            <Coin /> {wallet.toLocaleString('en-US')}
          </span>
          <span>
            <Gem /> {jewels.toLocaleString('en-US')}
          </span>
        </span>
      </div>
      <PageTip id="shop">用專注賺到的金幣，可以解鎖新的動物探索路線、環境音和土地造型。</PageTip>
      <div className="shop-tabs" role="tablist" aria-label="商店分類">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      <div className="slide-in shop-body" key={tab}>
        {tab === 'featured' && (
          <>
            {/* 精選推薦：左右滑，旁邊露出下一張 */}
            <div className="shop-carousel" aria-label="精選推薦">
              {featured.map((it) => (
                <button key={it.id} className={`shop-hero kind-${it.kind}`} onClick={() => setPick(it)}>
                  <span className="eyebrow">{kindName[it.kind]}</span>
                  {it.kind === 'animal' && <RegionFlag id={it.ref} />}
                  <ItemArt it={it} size={150} />
                  <strong>{it.name}</strong>
                  <span className="price-pill big">{owned(save, it) ? '已擁有' : <PriceTag it={it} />}</span>
                </button>
              ))}
            </div>

            <div className="daily-head">
              <div>
                <h2>每日精選</h2>
                <span className="small muted">{hoursLeft} 小時後刷新</span>
              </div>
              <button className="refresh-btn" onClick={() => setAskRefresh(true)} aria-label={`花 ${REFRESH_COINS} 金幣換一批`}>
                <RefreshCw size={18} aria-hidden="true" />
                <Coin /> {REFRESH_COINS}
              </button>
            </div>
            {daily.picks.length ? <div className="shop-grid">{daily.picks.map(card)}</div> : <p className="small muted center-text">商品都擁有了，真厲害！</p>}
          </>
        )}

        {tab === 'all' && (
          <>
            <div className="chips shop-filter" role="radiogroup" aria-label="商品種類">
              {FILTERS.map(([k, l]) => (
                <button key={k} role="radio" aria-checked={filter === k} className={filter === k ? 'chip on' : 'chip'} onClick={() => setFilter(k)}>
                  {l}
                </button>
              ))}
            </div>
            <div className="shop-grid">{shopItems(save).filter((it) => filter === 'all' || it.kind === filter).map(card)}</div>
          </>
        )}

        {tab === 'currency' && (
          <>
            <h2 className="shop-sub">金幣</h2>
            <div className="pack-list">
              {COIN_PACKS.map((p) => (
                <button key={p.id} className="pack-row" onClick={() => setPack(p)}>
                  <span className="pack-icon coins" aria-hidden="true">
                    <Coin />
                    {p.bonus > 0 && <span className="pack-bonus">+{p.bonus}%</span>}
                  </span>
                  <span className="pack-name">
                    {p.name}
                    <small>{p.coins.toLocaleString('en-US')} 金幣</small>
                  </span>
                  <span className="price-pill">
                    <Gem /> {p.gems}
                  </span>
                </button>
              ))}
            </div>
            <h2 className="shop-sub">寶石</h2>
            <div className="pack-list">
              {GEM_PACKS.map((p) => (
                <div key={p.id} className="pack-row">
                  <span className="pack-icon gems" aria-hidden="true">
                    <Gem />
                    {p.bonus > 0 && <span className="pack-bonus">+{p.bonus}%</span>}
                  </span>
                  <span className="pack-name">
                    {p.name}
                    <small>{p.gems} 寶石</small>
                  </span>
                  <span className="price-pill">{p.price}</span>
                </div>
              ))}
            </div>
            <p className="small muted">寶石購買會在 App 上架後開放，使用 Google Play 付款。新手任務和本月挑戰的寶箱也會送寶石。</p>
          </>
        )}
      </div>

      {pick && <ItemSheet it={pick} onClose={() => setPick(null)} onBought={(a) => (setPick(null), a && setGot(a))} onLobby={onLobby} run={run} />}
      {pack && (
        <Modal title={pack.name} onClose={() => setPack(null)}>
          <p>
            用 <Gem /> <strong>{pack.gems}</strong> 寶石換 <Coin /> <strong>{pack.coins.toLocaleString('en-US')}</strong> 金幣？
          </p>
          {jewels < pack.gems && <p className="small muted">寶石不夠，還差 {pack.gems - jewels} 顆。</p>}
          <div className="row editor-actions">
            <button onClick={() => setPack(null)}>取消</button>
            <button className="primary" disabled={jewels < pack.gems} onClick={() => run((s) => exchangeCoins(s, pack.id, Date.now()), `換到 ${pack.coins.toLocaleString('en-US')} 金幣了。`) && setPack(null)}>
              確定兌換
            </button>
          </div>
        </Modal>
      )}
      {askRefresh && (
        <Modal title="換一批每日精選" onClose={() => setAskRefresh(false)}>
          <p>
            花 <Coin /> <strong>{REFRESH_COINS}</strong> 金幣，馬上換一批新的每日精選？
          </p>
          <div className="row editor-actions">
            <button onClick={() => setAskRefresh(false)}>取消</button>
            <button className="primary" disabled={wallet < REFRESH_COINS} onClick={() => run((s) => refreshPicks(s, Date.now()), '換好一批新的每日精選了。') && setAskRefresh(false)}>
              換一批
            </button>
          </div>
        </Modal>
      )}
      {got && <NewEgg animal={got} onLobby={onLobby} onClose={() => setGot(null)} />}
    </div>
  );
}

/** 商品介紹＋購買（或已擁有時：去找牠／套用土地造型）。 */
function ItemSheet({ it, onClose, onBought, onLobby, run }: { it: ShopItem; onClose: () => void; onBought: (a: AnimalDef | null) => void; onLobby: () => void; run: (fn: (s: SaveFile) => ActionResult, ok: string) => boolean }) {
  const { save, update } = useSave();
  const [confirming, setConfirming] = useState(false);
  const have = owned(save, it);
  const p = it.price;
  const short = 'coins' in p ? p.coins - coins(save) : 'gems' in p ? p.gems - gems(save) : 0;
  const desc = it.kind === 'animal' ? animalDef(it.ref).blurb : it.kind === 'sound' ? SOUNDS.find((s) => s.id === it.ref)?.desc : '專注紀錄裡的那塊草地會換成這個樣子。';
  const usingLand = it.kind === 'land' && save.settings.landId === it.ref;
  // 環境音可以先試聽再決定要不要買
  const [listening, setListening] = useState(false);
  useAmbient(it.kind === 'sound' && listening, save.settings.soundVolume || 0.5, it.kind === 'sound' ? it.ref : 'breeze');

  const buy = () => {
    if (!run((s) => buyItem(s, it.id, Date.now()), `買到${it.name}了！`)) return;
    onBought(it.kind === 'animal' ? animalDef(it.ref) : null);
  };

  const animal = it.kind === 'animal' ? animalDef(it.ref) : null;
  const region = animal ? regionDef(animalRegion(animal)) : null;

  // 底下的動作列：已擁有（去找牠／套用／去交響樂選）、真錢（即將推出）、確認購買、購買
  const action = have ? (
    it.kind === 'animal' ? (
      <button
        className="primary wide"
        onClick={() => {
          update((s) => ({ ...s, settings: { ...s.settings, eggId: it.ref } }));
          onClose();
          onLobby();
        }}
      >
        現在就去找牠
      </button>
    ) : it.kind === 'land' ? (
      <button className="primary wide" disabled={usingLand || !landOwned(save, it.ref)} onClick={() => update((s) => ({ ...s, settings: { ...s.settings, landId: it.ref } })) && onClose()}>
        {usingLand ? '使用中' : '套用這個土地造型'}
      </button>
    ) : (
      <p className="small cond center-text">可以在「大自然交響樂」選它當專注背景音。</p>
    )
  ) : 'iap' in p ? (
    <>
      <button className="primary wide" disabled>
        {p.iap} · 即將推出
      </button>
      <p className="small muted center-text">付費購買會在 App 上架後開放，使用 Google Play 付款。</p>
    </>
  ) : confirming ? (
    <div className="item-confirm">
      <p>
        確定用 <PriceTag it={it} /> 買{it.name}嗎？
      </p>
      <div className="row">
        <button onClick={() => setConfirming(false)}>取消</button>
        <button className="primary" onClick={buy}>
          確定購買
        </button>
      </div>
    </div>
  ) : (
    <>
      <button className="primary wide item-buy" disabled={short > 0} onClick={() => setConfirming(true)}>
        <span className="item-buy-price">
          <PriceTag it={it} />
        </span>
        購買
      </button>
      {short > 0 && <p className="small muted center-text">{'coins' in p ? `還差 ${short} 金幣，再專注 ${short} 分鐘就夠了。` : `還差 ${short} 顆寶石，可以到「貨幣資源」看看。`}</p>}
    </>
  );

  return (
    <Modal title={it.name} onClose={onClose} className={`item-modal kind-${it.kind}`}>
      {/* 上方的展示台：依種類換底色，商品站在光暈上 */}
      <div className="item-hero">
        <span className="item-chip">{kindName[it.kind]}</span>
        {have && (
          <span className="item-chip owned">
            <Check size={13} aria-hidden="true" /> 已擁有
          </span>
        )}
        <span className="item-glow" aria-hidden="true" />
        <span className="item-art">
          <ItemArt it={it} size={150} />
        </span>
      </div>
      <p className="item-desc">{desc}</p>
      {animal && region && (
        <dl className="item-facts">
          <div>
            <dt>區域</dt>
            <dd>
              <Flag region={region.id} size={18} /> {region.name}
            </dd>
          </div>
          <div>
            <dt>保育</dt>
            <dd>{levelName(animal)}</dd>
          </div>
          <div>
            <dt>樣式</dt>
            <dd>{hasStages(animal) ? '三個成長階段' : '一種樣式'}</dd>
          </div>
          <div className="wide">
            <dt>棲息地</dt>
            <dd>{animal.habitat.region}</dd>
          </div>
        </dl>
      )}
      {it.kind === 'sound' && (
        <button className={listening ? 'primary listen-btn' : 'listen-btn'} aria-pressed={listening} onClick={() => setListening((x) => !x)}>
          {listening ? <Square size={14} fill="currentColor" aria-hidden="true" /> : <Play size={16} fill="currentColor" aria-hidden="true" />}
          {listening ? '停止試聽' : '試聽'}
        </button>
      )}
      {it.kind === 'animal' && !have && <p className="small muted center-text">解鎖後，每次專注前都能選擇去找牠。</p>}
      <div className="item-action">{action}</div>
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
      <p className="small muted">之後也可以在大廳點中間的圓圈換成其他探索目標。</p>
      <div className="guard-actions">
        <button className="primary" onClick={hatch}>
          現在就去找牠
        </button>
        <button onClick={onClose}>繼續逛逛</button>
      </div>
    </div>
  );
}

