import { useState } from 'react';
import { useSave } from '../app/store';
import { REGIONS, regionAnimals, regionDef, regionProjects } from '../content/config';
import { currentRegion, hatchCounts, isDone, regionOpen } from '../domain/game';
import { Modal, Progress } from './ui';
import { ChevronDown, Lock } from 'lucide-react';

/** 區域膠囊（觀察圖鑑、我的小島的標題旁）：點了打開區域清單。 */
export function RegionChip() {
  const { save } = useSave();
  const [open, setOpen] = useState(false);
  const r = regionDef(currentRegion(save));
  return (
    <>
      <button className="region-chip" onClick={() => setOpen(true)} aria-label={`目前區域：${r.name}，點一下切換`}>
        <span aria-hidden="true">{r.flag}</span> {r.name}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && <RegionSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** 區域清單：每個區域的遇見數、工程進度；還沒開放的寫開放條件。 */
function RegionSheet({ onClose }: { onClose: () => void }) {
  const { save, update } = useSave();
  const cur = currentRegion(save);
  const counts = hatchCounts(save);
  return (
    <Modal title="切換區域" onClose={onClose}>
      <p className="small muted">每個區域是一座自己的小島，有不同的動物和修復工程；金幣和寶石全部共用。</p>
      <div className="region-list">
        {REGIONS.map((r, i) => {
          const open = regionOpen(save, r.id);
          const animals = regionAnimals(r.id);
          const projects = regionProjects(r.id);
          const met = animals.filter((a) => counts.get(a.id)).length;
          const fixed = projects.filter((p) => isDone(save, p.id)).length;
          const prev = REGIONS[i - 1];
          // 還沒開放：顯示前一個區域的修復進度
          const prevDone = prev ? regionProjects(prev.id).filter((p) => isDone(save, p.id)).length : 0;
          const prevAll = prev ? regionProjects(prev.id).length : 1;
          return (
            <button
              key={r.id}
              className={r.id === cur ? 'region-row on' : 'region-row'}
              disabled={!open}
              onClick={() => {
                if (r.id !== cur) update((s) => ({ ...s, settings: { ...s.settings, regionId: r.id } }));
                onClose();
              }}
            >
              <span className="region-flag" aria-hidden="true">
                {r.flag}
              </span>
              <span className="region-info">
                <strong>{r.name}</strong>
                {open ? (
                  <small>
                    遇見 {met} / {animals.length} 種・工程 {fixed} / {projects.length}
                  </small>
                ) : (
                  <>
                    <small>
                      修完{prev?.name}的 {prevAll} 個工程後開放（{prevDone} / {prevAll}）
                    </small>
                    <Progress value={prevDone / prevAll} label={`${prev?.name}修復進度`} />
                  </>
                )}
              </span>
              <span className="region-state">{!open ? <Lock size={18} aria-label="還沒開放" /> : r.id === cur ? '使用中' : '切換'}</span>
            </button>
          );
        })}
      </div>
      <p className="small muted center-text">更多國家陸續推出中</p>
    </Modal>
  );
}
