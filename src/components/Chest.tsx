// 寶箱：挑戰卡上的小圖示，以及打開寶箱的全螢幕動畫（點一下打開 → 獲得的金幣／探索路線 → 點空白處繼續）。
import { useEffect, useRef, useState } from 'react';
import { animalDef } from '../content/config';
import { TrackArt } from './Animal';
import { Coin, Gem } from './ui';
import chestWood from '../assets/icons/chest-wood.webp';
import chestGreen from '../assets/icons/chest-green.webp';
import chestRoyal from '../assets/icons/chest-royal.webp';

/** 三種等級的寶箱：每日挑戰（木箱）、新手任務（綠寶石箱）、本月挑戰（紫金箱）。 */
export type ChestTier = 'wood' | 'green' | 'royal';
const CHEST: Record<ChestTier, string> = { wood: chestWood, green: chestGreen, royal: chestRoyal };
export const chestTier = (key: string): ChestTier => (key === 'quest:starter' ? 'green' : key.startsWith('quest:month:') ? 'royal' : 'wood');

/** open：已經領過（變淡）。 */
export function ChestArt({ tier = 'wood', open = false, size = 40 }: { tier?: ChestTier; open?: boolean; size?: number }) {
  return <img src={CHEST[tier]} width={size} height={size} className={open ? 'chest open' : 'chest'} alt="" aria-hidden="true" draggable={false} />;
}

/**
 * 打開寶箱：onOpen 真的領取（成功回傳得到的金幣與動物，失敗回傳 null 並關閉）。
 * 送了探索路線時，最後可以直接「現在就去找牠」。
 */
export function ChestOpen({
  title,
  tier,
  onOpen,
  onClose,
  onFind,
}: {
  title: string;
  tier: ChestTier;
  onOpen: () => { coins: number; gems?: number; animalId?: string } | null;
  onClose: () => void;
  onFind?: (animalId: string) => void;
}) {
  const [got, setGot] = useState<{ coins: number; gems?: number; animalId?: string } | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    return () => d.close();
  }, []);
  const open = () => {
    if (got) return;
    const r = onOpen();
    if (r) setGot(r);
    else onClose();
  };
  const a = got?.animalId ? animalDef(got.animalId) : null;
  return (
    <dialog ref={ref} className="chest-open" aria-label={title} onCancel={(e) => e.target === e.currentTarget && (e.preventDefault(), onClose())} onClick={got && !a ? onClose : undefined}>
      <p className="eyebrow">{title}</p>
      {!got ? (
        <button className="chest-tap" onClick={open} aria-label="打開寶箱">
          <span className="chest-glow" aria-hidden="true" />
          <ChestArt tier={tier} size={190} />
          <span>點一下打開寶箱</span>
        </button>
      ) : (
        <div className="chest-reward">
          <h2>
            恭喜！
            <br />
            你獲得了
          </h2>
          <div className="chest-burst">
            <span className="chest-glow" aria-hidden="true" />
            {a ? <TrackArt id={a.id} size={150} /> : <ChestArt tier={tier} size={170} />}
          </div>
          {a && <p className="chest-line">🐾 {a.name}的探索路線</p>}
          <p className="chest-line">
            <Coin /> 金幣 ×{got.coins}
          </p>
          {!!got.gems && (
            <p className="chest-line">
              <Gem /> 寶石 ×{got.gems}
            </p>
          )}
          {a ? (
            <div className="guard-actions">
              <button className="primary" onClick={() => onFind?.(a.id)}>
                現在就去找牠
              </button>
              <button onClick={onClose}>繼續</button>
            </div>
          ) : (
            <p className="small chest-hint">點空白處繼續</p>
          )}
        </div>
      )}
    </dialog>
  );
}
