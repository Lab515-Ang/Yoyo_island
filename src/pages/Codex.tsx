import { useState } from 'react';
import { useSave } from '../app/store';
import { ANIMALS, GROWTH_MAX, stageName } from '../content/config';
import { AnimalArt } from '../components/Animal';
import { AnimalCard, Progress, unlockText } from '../components/ui';
import { animalUnlocked, growthOf, hatchCounts } from '../domain/game';

/** 觀察圖鑑：遇見過的動物、次數與族群成長；還沒遇見的顯示剪影與怎麼找到牠。 */
export function Codex() {
  const { save } = useSave();
  const [show, setShow] = useState<'all' | 'found' | 'adult' | 'missing'>('all');
  const [card, setCard] = useState<string | null>(null);
  const counts = hatchCounts(save);
  const stageOf = (id: string) => growthOf(save, id).stage;
  const found = ANIMALS.filter((a) => counts.get(a.id)).length;
  const adults = ANIMALS.filter((a) => counts.get(a.id) && stageOf(a.id) === 2).length;
  const list = ANIMALS.filter((a) => {
    const n = counts.get(a.id) ?? 0;
    return show === 'all' || (show === 'found' && n > 0) || (show === 'adult' && n > 0 && stageOf(a.id) === 2) || (show === 'missing' && !n);
  });

  return (
    <div className="page sub">
      <p className="muted">
        遇見過 {found} / {ANIMALS.length} 種・看過成年的 {adults} 種
      </p>
      <div className="segmented small" role="radiogroup" aria-label="觀察狀態">
        {(
          [
            ['all', '全部'],
            ['found', '遇見過'],
            ['adult', '成年'],
            ['missing', '還沒遇見'],
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
          const g = growthOf(save, a.id);
          return (
            <button key={a.id} className={n ? 'codex-card' : 'codex-card locked'} onClick={() => setCard(a.id)}>
              <AnimalArt id={a.id} stage={n ? g.stage : 2} size={64} hidden={!n} />
              <strong>{n || ok ? a.name : '還不知道是誰'}</strong>
              {n ? (
                <>
                  <span className="small muted">
                    遇見 {n} 次・{stageName(a, g.stage)}
                  </span>
                  {g.stage < 2 && <Progress value={g.growth / GROWTH_MAX} label={`${a.name}族群成長`} />}
                </>
              ) : (
                <span className="small cond">{ok ? '可以去找，還沒遇見' : unlockText(a)}</span>
              )}
            </button>
          );
        })}
        {!list.length && <p className="muted">這個篩選下沒有動物。</p>}
      </div>
      {card && <AnimalCard save={save} animalId={card} onClose={() => setCard(null)} />}
    </div>
  );
}
