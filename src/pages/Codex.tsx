import { useState } from 'react';
import { useSave } from '../app/store';
import { CATEGORY_LABEL, HABITATS, SPECIES, habitatName } from '../content/config';
import { Creature } from '../components/Creature';
import { SpeciesCard, conditionText } from '../components/ui';
import { discoveryOf, habitatOpen, pendingVisitors } from '../domain/game';
import type { HabitatId } from '../domain/types';

export function Codex({ onEnter }: { onEnter: (h: HabitatId) => void }) {
  const { save } = useSave();
  const [show, setShow] = useState<'all' | 'found' | 'missing'>('all');
  const [habitat, setHabitat] = useState<HabitatId | 'all'>('all');
  const [card, setCard] = useState<string | null>(null);
  const found = SPECIES.filter((s) => discoveryOf(save, s.id)).length;
  const list = SPECIES.filter((s) => (habitat === 'all' || s.habitatId === habitat) && (show === 'all' || (show === 'found') === !!discoveryOf(save, s.id)));
  const waiting = pendingVisitors(save);

  return (
    <div className="page sub">
      <p className="muted">
        已發現 {found} / {SPECIES.length} 種
      </p>
      {waiting.length > 0 && (
        <div className="notice">
          有新朋友在等你：{waiting.map((s) => s.name).join('、')}。
          {[...new Set(waiting.map((s) => s.habitatId))].filter((h) => habitatOpen(save, h)).map((h) => (
            <button key={h} className="link" onClick={() => onEnter(h)}>
              去{habitatName(h)}看看
            </button>
          ))}
        </div>
      )}
      <div className="segmented small" role="radiogroup" aria-label="發現狀態">
        {(
          [
            ['all', '全部'],
            ['found', '已發現'],
            ['missing', '未發現'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="radio" aria-checked={show === k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="chips" role="radiogroup" aria-label="棲地">
        {(['all', ...HABITATS.filter((h) => h.playable).map((h) => h.id)] as const).map((h) => (
          <button key={h} role="radio" aria-checked={habitat === h} className={habitat === h ? 'chip on' : 'chip'} onClick={() => setHabitat(h)}>
            {h === 'all' ? '所有棲地' : habitatName(h)}
          </button>
        ))}
      </div>
      <div className="codex-grid">
        {list.map((s) => {
          const d = discoveryOf(save, s.id);
          return (
            <button key={s.id} className={d ? 'codex-card' : 'codex-card locked'} onClick={() => setCard(s.id)}>
              <Creature id={s.id} size={64} hidden={!d} />
              <strong>{d ? s.name : '尚未發現'}</strong>
              <span className="small muted">
                {CATEGORY_LABEL[s.category]} · {habitatName(s.habitatId)}
              </span>
              {!d && <span className="small cond">{conditionText(save, s.id)}</span>}
            </button>
          );
        })}
        {!list.length && <p className="muted">這個篩選下沒有生物。</p>}
      </div>
      {card && <SpeciesCard save={save} speciesId={card} onClose={() => setCard(null)} />}
    </div>
  );
}
