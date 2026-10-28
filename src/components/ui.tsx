import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GROWTH_MAX, ZONE_NAME, animalDef, animalRegion, regionDef, hasStages, levelName, projectDef, stageName, type AnimalDef } from '../content/config';
import { animalUnlocked, growthOf, hatchCounts } from '../domain/game';
import type { SaveFile } from '../domain/types';
import { AnimalArt } from './Animal';
import { MeshAnimal, hasMesh } from './MeshAnimal';
import { X } from 'lucide-react';

/** CSS 畫的金幣圖示（🪙 在 Windows 10 的表情字型裡沒有）。 */
// 轉場時間（和 styles.css 的動畫一致）：底部選單滑下去、進出專注畫面的淡出
export const SHEET_OUT_MS = 220;
export const LEAVE_MS = 420;
/** 上一個畫面有沒有先淡出到深綠（大廳按開始、專注畫面結束時設成 true）；沒有的話換畫面時用比較淡的轉場，不要突然整片變綠。 */
export const fadedOut = { current: false };

export const Coin = () => <span className="coin" aria-hidden="true" />;
/** CSS 畫的寶石（六角形）。 */
export const Gem = () => <span className="gem" aria-hidden="true" />;

/** 原生 <dialog>：焦點、Esc 關閉都由瀏覽器處理。被瀏覽器直接關掉時也通知（重新打開過的就不算，例如開發模式的重掛載）。 */
export function Modal({ title, onClose, children, className, closing }: { title: string; onClose: () => void; children: ReactNode; className?: string; closing?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  // 關掉時先播滑下去的動畫，播完才真的關（不要硬切）
  const [leaving, setLeaving] = useState(false);
  const timer = useRef(0);
  const dismiss = () => {
    if (leaving) return;
    setLeaving(true);
    timer.current = window.setTimeout(onClose, SHEET_OUT_MS);
  };
  const cls = ['modal', className, (leaving || closing) && 'closing'].filter(Boolean).join(' ');
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    // 要直接打字的欄位（標題、暱稱、邀請碼）：開好之後才聚焦，手機鍵盤才會跳出來（autoFocus 在打開前就跑了，沒有用）
    d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => (d.close(), clearTimeout(timer.current));
  }, []);
  return (
    <dialog ref={ref} className={cls} onCancel={(e) => e.target === e.currentTarget && (e.preventDefault(), dismiss())} onClose={(e) => e.target === e.currentTarget && !ref.current?.open && onClose()} onClick={(e) => e.target === ref.current && dismiss()}>
      <div className="modal-body" inert={leaving || closing ? true : undefined}>
        <header className="modal-head">
          {/* 打開時焦點放在標題（讀屏先唸標題），不要讓關閉按鈕一打開就亮起焦點框 */}
          <h2 tabIndex={-1} autoFocus style={{ outline: 'none' }}>
            {title}
          </h2>
          <button className="icon-btn" onClick={dismiss} aria-label="關閉">
            <X size={20} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

// 台灣國旗的白日：12 道光芒（外半徑 3、內半徑 1.7）
const SUN = Array.from({ length: 24 }, (_, i) => {
  const r = i % 2 ? 1.7 : 3;
  const t = (i * Math.PI) / 12 - Math.PI / 2;
  return `${(6 + r * Math.cos(t)).toFixed(2)},${(4 + r * Math.sin(t)).toFixed(2)}`;
}).join(' ');

/** 國旗圖示（畫成 SVG：國旗 emoji 在部分手機和電腦上只會顯示成字母）。 */
export function Flag({ region, size = 20 }: { region: string; size?: number }) {
  const r = regionDef(region);
  return (
    <svg className="flag" viewBox="0 0 24 16" width={size} height={(size * 2) / 3} role="img" aria-label={r.name}>
      {r.id === 'jp' ? (
        <>
          <rect width="24" height="16" fill="#fff" />
          <circle cx="12" cy="8" r="4.8" fill="#bc002d" />
        </>
      ) : (
        <>
          <rect width="24" height="16" fill="#fe0000" />
          <rect width="12" height="8" fill="#000095" />
          <polygon points={SUN} fill="#fff" />
          <circle cx="6" cy="4" r="1.7" fill="#000095" />
          <circle cx="6" cy="4" r="1.45" fill="#fff" />
        </>
      )}
    </svg>
  );
}

/** 動物主要分布的國家：格子右上角的小國旗。 */
export function RegionFlag({ id }: { id: string }) {
  return (
    <span className="animal-flag">
      <Flag region={animalRegion(animalDef(id))} size={18} />
    </span>
  );
}

/** 族群成長（大廳、小島、圖鑑共用同一種寫法）：「幼鳥・成長 3/6」＋進度條；成年只寫階段名。 */
export function GrowthTag({ a, g }: { a: AnimalDef; g: { growth: number; stage: number } }) {
  return (
    <>
      <span className="small muted">{g.stage === 2 ? stageName(a, 2) : `${stageName(a, g.stage)}・成長 ${Math.min(g.growth, GROWTH_MAX)}/${GROWTH_MAX}`}</span>
      {g.stage < 2 && <Progress value={g.growth / GROWTH_MAX} label={`${a.name}族群成長`} />}
    </>
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

/** 這種動物怎麼才能去找（還沒解鎖時顯示）。 */
export function unlockText(a: AnimalDef) {
  const u = a.unlock;
  if (u.kind === 'start') return '一開始就能去找';
  if (u.kind === 'project') return `完成「${projectDef(u.id)?.title}」後，牠會回到森林（也可以在商店用寶石提早解鎖）`;
  if (u.kind === 'coins') return `商店用 ${u.price} 金幣解鎖探索路線`;
  if (u.kind === 'gems') return `商店用 ${u.price} 顆寶石解鎖探索路線`;
  return 'Plus 會員專屬';
}

/** 三個成長階段的小圖（看得到的階段上色，還沒看到的是剪影）。 */
export function StageStrip({ animalId, stage, seen }: { animalId: string; stage: number; seen: boolean }) {
  const a = animalDef(animalId);
  return (
    <ol className="stage-strip" aria-label="成長階段">
      {[0, 1, 2].map((i) => (
        <li key={i} className={seen && i <= stage ? 'on' : ''}>
          <AnimalArt id={a.id} stage={i} size={48} hidden={!seen || i > stage} />
          <span className="small">{stageName(a, i)}</span>
        </li>
      ))}
    </ol>
  );
}

/** 動物卡：遇見過的顯示族群成長與介紹；還沒遇見的顯示剪影與怎麼找到牠。 */
export function AnimalCard({ save, animalId, onClose }: { save: SaveFile; animalId: string; onClose: () => void }) {
  const a = animalDef(animalId);
  const n = hatchCounts(save).get(a.id) ?? 0;
  const ok = animalUnlocked(save, a);
  const g = growthOf(save, a.id);
  return (
    <Modal title={n ? a.name : ok ? `${a.name}（還沒遇見）` : '還不知道是誰'} onClose={onClose}>
      <div className="species-hero">
        {n && hasMesh(a.id) ? (
          <div style={{ width: 140 }}>
            <MeshAnimal id={a.id} stage={g.stage} />
          </div>
        ) : (
          <AnimalArt id={a.id} stage={n ? g.stage : 2} size={140} hidden={!n} />
        )}
      </div>
      {n > 0 && hasStages(a) && <StageStrip animalId={a.id} stage={g.stage} seen />}
      <dl className="facts">
        <dt>遇見</dt>
        <dd>{n} 次</dd>
        {n > 0 && (
          <>
            <dt>族群</dt>
            <dd>{!hasStages(a) ? '只有一種樣式，遇見就是成年的牠' : g.stage === 2 ? `穩定了，看得到${stageName(a, 2)}` : `成長 ${g.growth}/${GROWTH_MAX}・現在看得到${stageName(a, g.stage)}`}</dd>
          </>
        )}
        <dt>探索</dt>
        <dd>{ok ? '大廳選牠當探索目標就能去找' : unlockText(a)}</dd>
        <dt>棲息地</dt>
        <dd>
          {ZONE_NAME[a.habitat.zone]}・{a.habitat.region}
        </dd>
        <dt>海拔</dt>
        <dd>{a.habitat.elevation}</dd>
        <dt>保育</dt>
        <dd>{levelName(a)}</dd>
      </dl>
      {(n > 0 || ok) && <p className="muted">{a.blurb}</p>}
    </Modal>
  );
}
