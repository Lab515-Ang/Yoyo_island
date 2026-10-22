import { useState } from 'react';
import { useSave } from '../app/store';
import { COPY, speciesDef } from '../content/config';
import { Coin } from '../components/ui';
import { Creature } from '../components/Creature';
import { localDateKey } from '../domain/focus';
import { activeProject, balance, chanceFind, earnedFor, minutesByDay, remainingFor } from '../domain/game';
import { HabitatScene } from '../scenes/HabitatScene';

const clock = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/** 結算（參考 Forest 構圖）：放棄時先安慰一句，再看今天的專注與獎勵。 */
export function Summary({ sessionId, onDone, onProject }: { sessionId: string; onDone: () => void; onProject: () => void }) {
  const { save } = useSave();
  const s = save.sessions.find((x) => x.id === sessionId);
  const [comforted, setComforted] = useState(false);
  if (!s) return null;
  const done = s.status === 'completed';
  const min = Math.floor(s.accumulatedMs / 60000);
  const earned = earnedFor(save, s.id);
  const found = chanceFind(save, s.id);
  const todayMin = Math.floor((minutesByDay(save).get(localDateKey(Date.now(), save.profile.timezone)) ?? 0) / 60000);
  const project = activeProject(save);
  const canBuild = project && balance(save) >= remainingFor(save, project);

  if (!done && !comforted)
    return (
      <div className="result comfort">
        <div className="result-scene" aria-hidden="true">
          <HabitatScene habitatId={s.habitatId} bubble />
        </div>
        <p className="result-title">沒關係，下次會更好</p>
        <p className="result-time">{clock(s.accumulatedMs)}</p>
        <button className="pill" onClick={() => setComforted(true)}>
          繼續
        </button>
      </div>
    );

  return (
    <div className="result">
      <div className="result-scene" aria-hidden="true">
        <HabitatScene habitatId={s.habitatId} bubble />
      </div>
      <p className="result-title">{done ? (min > 0 ? `很棒！你今天已專注 ${todayMin} 分。` : '這段專注已記錄。') : `你今天已專注 ${todayMin} 分。`}</p>
      <p className="result-sub">{done ? (min > 0 ? COPY.complete(min) : '未滿一分鐘不會得到獎勵。') : '提前結束，這次沒有獎勵。'}</p>

      <ul className="reward-list">
        <li>
          <span>🌱 成長點數</span>
          <strong>+{earned.points}</strong>
        </li>
        <li>
          <span>
            <Coin /> 金幣
          </span>
          <strong>+{earned.coins}</strong>
        </li>
        <li>
          <span>🌾 飼料</span>
          <strong>+{earned.feed}</strong>
        </li>
      </ul>

      {found && (
        <div className="reward-chance">
          <Creature id={found.speciesId} size={56} />
          <div>
            <strong>偶遇！{speciesDef(found.speciesId)?.name}</strong>
            <div className="small">在你專注的時候來訪，已收進圖鑑。</div>
          </div>
        </div>
      )}

      <button className="pill" onClick={onDone}>
        返回首頁
      </button>
      {canBuild && (
        <button className="link-light" onClick={onProject}>
          點數夠了，去修「{project.title}」
        </button>
      )}
    </div>
  );
}
