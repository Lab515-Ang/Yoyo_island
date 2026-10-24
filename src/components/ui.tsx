import { useEffect, useRef, type ReactNode } from 'react';
import { animalDef, projectDef, type AnimalDef } from '../content/config';
import { animalUnlocked, hatchCounts } from '../domain/game';
import type { SaveFile } from '../domain/types';
import { AnimalArt } from './Animal';

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

/** 這種動物怎麼取得（還沒解鎖時顯示）。 */
export function unlockText(a: AnimalDef) {
  const u = a.unlock;
  if (u.kind === 'start') return '一開始就有';
  if (u.kind === 'project') return `修好「${projectDef(u.id)?.title}」後解鎖`;
  if (u.kind === 'coins') return `商店用 ${u.price} 金幣解鎖`;
  return `商店特別品種（${u.price}）`;
}

/** 動物圖鑑卡：孵過的顯示介紹與數量；還沒孵過的顯示剪影與取得方式。 */
export function AnimalCard({ save, animalId, onClose }: { save: SaveFile; animalId: string; onClose: () => void }) {
  const a = animalDef(animalId);
  const n = hatchCounts(save).get(a.id) ?? 0;
  const ok = animalUnlocked(save, a);
  return (
    <Modal title={n ? a.name : ok ? `${a.name}（還沒孵過）` : '尚未解鎖'} onClose={onClose}>
      <div className="species-hero">
        <AnimalArt id={a.id} size={140} hidden={!n} />
      </div>
      <dl className="facts">
        <dt>孵過</dt>
        <dd>{n} 隻</dd>
        <dt>取得</dt>
        <dd>{ok ? '已解鎖，大廳選這顆蛋就能孵化' : unlockText(a)}</dd>
      </dl>
      {(n > 0 || ok) && <p className="muted">{a.blurb}</p>}
    </Modal>
  );
}
