import { useState } from 'react';
import { useSave } from '../app/store';
import { ANIMALS } from '../content/config';
import { AnimalArt } from '../components/Animal';
import { AnimalCard, GrowthTag, unlockText } from '../components/ui';
import { animalUnlocked, growthOf, hatchCounts } from '../domain/game';
import { TaiwanMap } from '../scenes/TaiwanMap';
import type { MapPin } from '../scenes/TaiwanMap3D';

/** 觀察圖鑑：遇見過的動物、次數與族群成長；還沒遇見的顯示剪影與怎麼找到牠。 */
export function Codex() {
  const { save } = useSave();
  const [show, setShow] = useState<'all' | 'found' | 'missing'>('all');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [card, setCard] = useState<string | null>(null);
  const counts = hatchCounts(save);
  const stageOf = (id: string) => growthOf(save, id).stage;
  // 地圖上的動物：遇見過的上色、可以去找的剪影、還找不到的淡剪影；台灣雲豹是霧裡的傳說
  const pins: MapPin[] = ANIMALS.map((a) => ({
    id: a.id,
    state: a.habitat.zone === 'legend' && !counts.get(a.id) ? 'legend' : counts.get(a.id) ? 'met' : animalUnlocked(save, a) ? 'open' : 'locked',
    stage: stageOf(a.id),
  }));
  const list = ANIMALS.filter((a) => {
    const n = counts.get(a.id) ?? 0;
    return show === 'all' || (show === 'found' && n > 0) || (show === 'missing' && !n);
  });

  return (
    <div className="page">
      <h1>觀察圖鑑</h1>
      <div className="segmented view-toggle" role="radiogroup" aria-label="顯示方式">
        {(
          [
            ['list', '清單'],
            ['map', '🗺️ 地圖'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="radio" aria-checked={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>
            {l}
          </button>
        ))}
      </div>
      {view === 'map' && (
        <>
          <TaiwanMap pins={pins} onSelect={setCard} />
          <p className="small muted map-legend">
            <span>🟡 遇見過</span>
            <span>⚪ 可以去找</span>
            <span>🔘 還找不到</span>
            <span>☁️ 傳說</span>
          </p>
        </>
      )}
      {view === 'list' && (
        <>
          <div className="segmented small" role="radiogroup" aria-label="觀察狀態">
            {(
              [
                ['all', '全部'],
                ['found', '遇見過'],
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
                      <span className="small muted">遇見 {n} 次</span>
                      <GrowthTag a={a} g={g} />
                    </>
                  ) : (
                    <span className="small cond">{ok ? '可以去找，還沒遇見' : unlockText(a)}</span>
                  )}
                </button>
              );
            })}
            {!list.length && <p className="muted">這個篩選下沒有動物。</p>}
          </div>
        </>
      )}
      {card && <AnimalCard save={save} animalId={card} onClose={() => setCard(null)} />}
    </div>
  );
}
