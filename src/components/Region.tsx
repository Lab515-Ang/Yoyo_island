import { useState } from 'react';
import { useSave } from '../app/store';
import { REGIONS, TEST_TOOLS, regionAnimals, regionDef, regionProjects } from '../content/config';
import { currentRegion, hatchCounts, isDone, regionOpen } from '../domain/game';
import { Flag, Modal, Progress } from './ui';
import { REGION_XY, WORLD_LAND, WORLD_SPHERE, WORLD_W } from '../content/worldMap';
import { ChevronDown, Lock } from 'lucide-react';

/** 區域膠囊（觀察圖鑑、我的小島的標題旁）：點了打開區域清單。 */
export function RegionChip() {
  const { save } = useSave();
  const [open, setOpen] = useState(false);
  const r = regionDef(currentRegion(save));
  return (
    <>
      <button className="region-chip" onClick={() => setOpen(true)} aria-label={`目前區域：${r.name}，點一下切換`}>
        <Flag region={r.id} size={20} /> {r.name}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && <RegionSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** 區域選單：上面是世界地圖（點區域切換），下面是每個區域的遇見數、工程進度；還沒開放的寫開放條件。 */
function RegionSheet({ onClose }: { onClose: () => void }) {
  const { save, update } = useSave();
  const cur = currentRegion(save);
  const counts = hatchCounts(save);
  const pick = (id: string) => {
    if (id !== cur) update((s) => ({ ...s, settings: { ...s.settings, regionId: id } }));
    onClose();
  };
  return (
    <Modal title="切換區域" onClose={onClose}>
      {/* 世界地圖：已開放的區域是彩色的點，使用中的有光圈，還沒開放的是灰色的鎖 */}
      <svg className="world-map" viewBox={`0 0 ${WORLD_W} 168`} role="group" aria-label="世界地圖">
        <path d={WORLD_SPHERE} fill="#cfe7ea" />
        <path d={WORLD_LAND} fill="#e9e2cf" stroke="#d3c8ad" strokeWidth="0.4" />
        {REGIONS.map((r) => {
          const [x, y] = REGION_XY[r.id] ?? [0, 0];
          const open = regionOpen(save, r.id);
          const on = r.id === cur;
          // 台灣和日本很近：台灣的名字放左邊、其他放右邊
          const left = r.id === 'tw';
          return (
            <g
              key={r.id}
              className="world-pin"
              role="button"
              tabIndex={open ? 0 : -1}
              aria-label={open ? `切換到${r.name}` : `${r.name}（還沒開放）`}
              onClick={() => open && pick(r.id)}
              onKeyDown={(e) => open && (e.key === 'Enter' || e.key === ' ') && pick(r.id)}
            >
              <circle cx={x} cy={y} r="14" fill="transparent" />
              {on && <circle cx={x} cy={y} r="11" fill="rgba(90,140,85,.28)" />}
              <circle cx={x} cy={y} r="5.8" fill={open ? (on ? '#638553' : '#e08a70') : '#a8a296'} stroke="#fffdf8" strokeWidth="1.4" />
              <text x={x + (left ? -10 : 10)} y={y + 3.4} textAnchor={left ? 'end' : 'start'} fontSize="10.5" fontWeight="700" fill="#36302a" stroke="#fffdf8" strokeWidth="2.2" paintOrder="stroke">
                {open ? r.name : `🔒${r.name}`}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="small muted">每個區域是一座自己的小島，有不同的動物和修復工程；金幣和寶石全部共用。點地圖上的點也可以切換。</p>
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
              onClick={() => pick(r.id)}
            >
              <span className="region-flag" aria-hidden="true">
                <Flag region={r.id} size={36} />
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
      {TEST_TOOLS && (
        // 測試工具：不用修完前一區就能先看新區域（上架前移除）
        <button className="test-btn-inline" onClick={() => update((s) => ({ ...s, settings: { ...s.settings, testAllRegions: s.settings.testAllRegions === false, regionId: s.settings.testAllRegions === false ? s.settings.regionId : 'tw' } }))}>
          {save.settings.testAllRegions === false ? '測試：先開放全部區域' : '測試：恢復開放條件'}
        </button>
      )}
    </Modal>
  );
}
