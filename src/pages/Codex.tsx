import { useState } from 'react';
import { useSave } from '../app/store';
import { ANIMALS } from '../content/config';
import { AnimalArt } from '../components/Animal';
import { AnimalCard, unlockText } from '../components/ui';
import { animalUnlocked, hatchCounts } from '../domain/game';

/** 動物圖鑑：孵過的動物與數量；還沒孵過的顯示剪影與取得方式。 */
export function Codex() {
  const { save } = useSave();
  const [show, setShow] = useState<'all' | 'found' | 'missing'>('all');
  const [card, setCard] = useState<string | null>(null);
  const counts = hatchCounts(save);
  const found = ANIMALS.filter((a) => counts.get(a.id)).length;
  const list = ANIMALS.filter((a) => show === 'all' || (show === 'found') === !!counts.get(a.id));

  return (
    <div className="page sub">
      <p className="muted">
        已孵出 {found} / {ANIMALS.length} 種
      </p>
      <div className="segmented small" role="radiogroup" aria-label="孵化狀態">
        {(
          [
            ['all', '全部'],
            ['found', '孵過'],
            ['missing', '還沒孵過'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="radio" aria-checked={show === k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="codex-grid">
        {list.map((a) => {
          const n = counts.get(a.id) ?? 0;
          const ok = animalUnlocked(save, a);
          return (
            <button key={a.id} className={n ? 'codex-card' : 'codex-card locked'} onClick={() => setCard(a.id)}>
              <AnimalArt id={a.id} size={64} hidden={!n} />
              <strong>{n || ok ? a.name : '尚未解鎖'}</strong>
              {n ? <span className="small muted">孵過 {n} 隻</span> : <span className="small cond">{ok ? '已解鎖，還沒孵過' : unlockText(a)}</span>}
            </button>
          );
        })}
        {!list.length && <p className="muted">這個篩選下沒有動物。</p>}
      </div>
      {card && <AnimalCard save={save} animalId={card} onClose={() => setCard(null)} />}
    </div>
  );
}
