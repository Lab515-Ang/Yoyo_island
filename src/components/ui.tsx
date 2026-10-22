import { useEffect, useRef, type ReactNode } from 'react';
import { CATEGORY_LABEL, CHANCE, habitatName, speciesDef } from '../content/config';
import { discoveryOf } from '../domain/game';
import type { SaveFile } from '../domain/types';
import { Creature } from './Creature';

/** CSS 畫的金幣圖示（🪙 在 Windows 10 的表情字型裡沒有）。 */
export const Coin = () => <span className="coin" aria-hidden="true" />;

/** 原生 <dialog>：焦點、Esc 關閉都由瀏覽器處理。 */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog ref={ref} className="modal" onCancel={(e) => (e.preventDefault(), onClose())} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="modal-body">
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="關閉">✕</button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="bar" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtMinutes = (ms: number) => {
  const m = Math.floor(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} 小時 ${m % 60} 分` : `${m} 分鐘`;
};

export function conditionText(save: SaveFile, speciesId: string) {
  const s = speciesDef(speciesId)!;
  if (discoveryOf(save, s.id)) return null;
  return `完成 ${CHANCE.minMinutes} 分鐘以上的專注時有機會偶遇，專注越久機率越高。`;
}

export function SpeciesCard({ save, speciesId, onClose }: { save: SaveFile; speciesId: string; onClose: () => void }) {
  const s = speciesDef(speciesId)!;
  const d = discoveryOf(save, s.id);
  const cond = conditionText(save, s.id);
  return (
    <Modal title={d ? s.name : '尚未發現'} onClose={onClose}>
      <div className="species-hero">
        <Creature id={s.id} size={120} hidden={!d} />
      </div>
      <dl className="facts">
        <dt>類別</dt>
        <dd>{CATEGORY_LABEL[s.category]}</dd>
        <dt>棲地</dt>
        <dd>{habitatName(s.habitatId)}</dd>
        {d ? (
          <>
            <dt>代表行為</dt>
            <dd>{s.behaviorLabel}</dd>
            <dt>首次發現</dt>
            <dd>
              {fmtDateTime(d.discoveredAt)}
              {d.sessionId ? '・專注時偶遇' : ''}
            </dd>
          </>
        ) : (
          <>
            <dt>條件</dt>
            <dd>{cond}</dd>
          </>
        )}
      </dl>
      {d && <p className="muted">{s.description}</p>}
    </Modal>
  );
}
