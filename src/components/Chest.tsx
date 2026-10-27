// 寶箱：挑戰卡上的小圖示，以及打開寶箱的全螢幕動畫（點一下打開 → 獲得的金幣／探索路線 → 點空白處繼續）。
import { useEffect, useRef, useState } from 'react';
import { animalDef } from '../content/config';
import { TrackArt } from './Animal';
import { Coin, Gem } from './ui';

export function ChestArt({ open = false, size = 40 }: { open?: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 120 100" width={size} height={(size * 100) / 120} className={open ? 'chest open' : 'chest'} aria-hidden="true">
      <rect x="18" y="48" width="84" height="44" rx="8" fill="#b9764a" />
      <rect x="18" y="62" width="84" height="8" fill="#8f5634" />
      <rect x="54" y="56" width="12" height="18" rx="3" fill="#f2c230" />
      <g className="chest-lid">
        <path d="M18 50 Q18 20 60 20 Q102 20 102 50 Z" fill="#cf8a57" />
        <rect x="18" y="44" width="84" height="8" fill="#8f5634" />
        <rect x="54" y="20" width="12" height="32" fill="#f2c230" />
      </g>
    </svg>
  );
}

/**
 * 打開寶箱：onOpen 真的領取（成功回傳得到的金幣與動物，失敗回傳 null 並關閉）。
 * 送了探索路線時，最後可以直接「現在就去找牠」。
 */
export function ChestOpen({
  title,
  onOpen,
  onClose,
  onFind,
}: {
  title: string;
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
          <ChestArt size={170} />
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
            {a ? <TrackArt id={a.id} size={150} /> : <ChestArt open size={170} />}
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
