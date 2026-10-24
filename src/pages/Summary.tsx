import { useState } from 'react';
import { useSave } from '../app/store';
import { COPY, EGG_PRICE, FACILITIES, HABITATS, PLANTS, plantDef, plantTier, speciesDef, tagColor, TAGS } from '../content/config';
import { PlantArt } from '../components/Garden';
import { Coin, Modal } from '../components/ui';
import { Creature } from '../components/Creature';
import { localDateKey } from '../domain/focus';
import { activeProject, balance, chanceFind, coins, earnedFor, editSessionNote, eggOdds, facilityOwned, focusOutcome, habitatFree, habitatOpen, minutesByDay, NOTE_MAX, plantedSessions, remainingFor } from '../domain/game';
import { HabitatScene } from '../scenes/HabitatScene';

const clock = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/** 結算（參考 Forest 流程）：放棄先安慰 → 結果卡片 → 可寫專注筆記 → 存好後可查看同標籤的紀錄。 */
export function Summary({
  sessionId,
  onDone,
  onProject,
  onRecords,
  onBreak,
  onShop,
}: {
  sessionId: string;
  onDone: () => void;
  onProject: () => void;
  onRecords: (tag: string) => void;
  onBreak: () => void;
  onShop: () => void;
}) {
  const { save } = useSave();
  const s = save.sessions.find((x) => x.id === sessionId);
  const [comforted, setComforted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<'first' | 'again' | null>(null);
  if (!s) return null;
  const done = s.status === 'completed';
  const min = Math.floor(s.accumulatedMs / 60000);
  const earned = earnedFor(save, s.id);
  const found = chanceFind(save, s.id);
  const todayMin = Math.floor((minutesByDay(save).get(localDateKey(Date.now(), save.profile.timezone)) ?? 0) / 60000);
  const project = activeProject(save);
  const canBuild = project && balance(save) >= remainingFor(save, project);
  const out = focusOutcome(save, s.id);
  // 這段專注結束時才送到的新手禮物（卵在這段開始之後來到島上）
  const gift = out.pets.find((p) => p.pet.source === 'gift' && Date.parse(p.pet.adoptedAt) >= Date.parse(s.startedAt));
  // 下一步：金幣夠買蛋（有空位）或下一個設施時，提示去商店
  const wallet = coins(save);
  const canShop = HABITATS.some(
    (h) =>
      habitatOpen(save, h.id) &&
      ((habitatFree(save, h.id) > 0 && wallet >= (EGG_PRICE[h.id] ?? Infinity) && eggOdds(save, h.id).length > 0) ||
        FACILITIES.some((f) => f.habitatId === h.id && !facilityOwned(save, f.id) && wallet >= f.price)),
  );
  const hasTitle = s.taskTitle && s.taskTitle !== '一段專注';
  // 今天的花圃：這段專注是今天的第幾株
  const tz = save.profile.timezone;
  const dayOf = (iso: string) => localDateKey(Date.parse(iso), tz);
  const todays = s.endedAt ? plantedSessions(save).filter((x) => dayOf(x.endedAt!) === dayOf(s.endedAt!)).sort((a, b) => a.endedAt!.localeCompare(b.endedAt!)) : [];
  const nth = todays.findIndex((x) => x.id === s.id) + 1;
  const plantName = plantDef(s.plantId).name;
  // 這段專注修好的工程解鎖了哪些植物
  const newPlants = out.projects.filter((p) => p.completed).flatMap((p) => PLANTS.filter((pl) => pl.unlockProjectId === p.def.id));

  if (!done && !comforted)
    return (
      <div className="result comfort">
        <div className="result-scene" aria-hidden="true">
          <HabitatScene habitatId={s.habitatId} bubble />
        </div>
        <div className="comfort-plant">
          <PlantArt id={s.plantId} tier={0} color={tagColor(s.tag)} withered size={130} />
        </div>
        <p className="result-title">沒關係，下次會更好</p>
        <p className="result-time">{clock(s.accumulatedMs)}</p>
        <button className="pill" onClick={() => setComforted(true)}>
          繼續
        </button>
      </div>
    );

  if (editing)
    return (
      <NoteEditor
        sessionId={s.id}
        onClose={() => setEditing(false)}
        onSaved={(first) => {
          setEditing(false);
          setSaved(first ? 'first' : 'again');
        }}
      />
    );

  return (
    <div className="result">
      {!saved && <p className="result-title">{done ? (min > 0 ? `很棒！你今天已專注 ${todayMin} 分。` : '這段專注已記錄。') : `你今天已專注 ${todayMin} 分。`}</p>}

      <div className={done ? 'result-card' : 'result-card faded'}>
        <div className="result-card-scene" aria-hidden="true">
          <HabitatScene habitatId={s.habitatId} bubble />
          {/* 這次種下的植物直接長在場景裡；完整的花圃在「專注紀錄」 */}
          <div className="result-plant">
            <PlantArt id={s.plantId} tier={plantTier(min)} color={tagColor(s.tag)} withered={!done} size="100%" />
          </div>
        </div>
        <span className="minute-pill">{min} 分</span>
        <p className="result-tag">
          <span className="tag-dot" style={{ background: tagColor(s.tag) }} aria-hidden="true" />
          {s.tag}
          {hasTitle && <span className="result-task">・{s.taskTitle}</span>}
        </p>
        {nth > 0 && <p className="result-plant-line">🌱 {done ? `今天的第 ${nth} 株：${plantName}` : `${plantName}枯萎了，留在今天的花圃裡`}</p>}
        {s.note ? (
          <button className="result-note" onClick={() => setEditing(true)} aria-label="編輯專注筆記">
            {s.note}
          </button>
        ) : (
          <button className="note-btn" onClick={() => setEditing(true)}>
            ✎ 新增專注筆記
          </button>
        )}
      </div>

      {done && min > 0 && (
        <ul className="reward-list" aria-label="這段專注的成果">
          {out.projects.map((p) => (
            <li key={p.def.id}>
              <span>🏝️ {p.def.title}</span>
              <strong>{p.completed ? '完成了！' : `${Math.round(p.to * 100)}%（+${Math.max(1, Math.round((p.to - p.from) * 100))}%）`}</strong>
            </li>
          ))}
          {!out.projects.length && earned.points > 0 && (
            <li>
              <span>🌱 成長點數</span>
              <strong>+{earned.points}</strong>
            </li>
          )}
          {newPlants.map((p) => (
            <li key={p.id}>
              <span>🌱 解鎖新植物</span>
              <strong>{p.name}，下次專注可以種</strong>
            </li>
          ))}
          {gift && (
            <li>
              <span>🎁 新手禮物</span>
              <strong>{gift.def.name}的{gift.def.stages[0]}來到島上了！</strong>
            </li>
          )}
          {out.pets.map((p) => (
            <li key={p.pet.id}>
              <span>🥚 {p.def.name}吃了 {p.amount} 份飼料</span>
              <strong>{p.to > p.from ? `長成${p.def.stages[p.to]}了！` : p.def.stages[p.to]}</strong>
            </li>
          ))}
          {!out.pets.length && earned.feed > 0 && (
            <li>
              <span>🌾 飼料</span>
              <strong>+{earned.feed}（先存著）</strong>
            </li>
          )}
          <li>
            <span>
              <Coin /> 金幣
            </span>
            <strong>
              +{earned.coins}（共 {coins(save)}）
            </strong>
          </li>
        </ul>
      )}

      {saved ? (
        <>
          <p className="result-saved">{saved === 'first' ? '第一篇專注筆記存好了，小島又多了一段小故事！' : '筆記存好了，小島又多了一段小故事！'}</p>
          <button className="link-light" onClick={() => onRecords(s.tag)}>
            查看專注紀錄：「{s.tag}」
          </button>
        </>
      ) : (
        <p className="result-sub">{done ? (min > 0 ? COPY.complete(min) : '未滿一分鐘不會得到獎勵。') : '提前結束，這次沒有獎勵。'}</p>
      )}

      {found && (
        <div className="reward-chance">
          <Creature id={found.speciesId} size={56} />
          <div>
            <strong>偶遇！{speciesDef(found.speciesId)?.name}</strong>
            <div className="small">在你專注的時候來訪，已收進圖鑑。</div>
          </div>
        </div>
      )}

      <div className="result-actions">
        <button className="pill wide" onClick={onDone}>
          返回首頁
        </button>
        {gift && (
          <button className="link-light" onClick={onProject}>
            去看看{gift.def.name}的{gift.def.stages[0]}
          </button>
        )}
        {canBuild && (
          <button className="link-light" onClick={onProject}>
            點數夠了，去修「{project.title}」
          </button>
        )}
        {canShop && (
          <button className="link-light" onClick={onShop}>
            金幣夠了，去商店看看
          </button>
        )}
        <button className="text-light" onClick={onBreak}>
          休息一下
        </button>
      </div>
    </div>
  );
}

/** 寫專注筆記：可順便改標籤與標題。 */
function NoteEditor({ sessionId, onClose, onSaved }: { sessionId: string; onClose: () => void; onSaved: (first: boolean) => void }) {
  const { save, update } = useSave();
  const s = save.sessions.find((x) => x.id === sessionId)!;
  const [note, setNote] = useState(s.note ?? '');
  const [tag, setTag] = useState(s.tag);
  const [title, setTitle] = useState(s.taskTitle === '一段專注' ? '' : s.taskTitle);
  const [picking, setPicking] = useState(false);
  const tags = [...TAGS, ...save.settings.customTags.filter((t) => !TAGS.includes(t))];
  const first = !save.sessions.some((x) => x.note && x.id !== sessionId) && !s.note;

  const submit = () => {
    if (update((sv) => editSessionNote(sv, sessionId, { note, tag, taskTitle: title }))) onSaved(first);
  };

  return (
    <div className="result note-editor">
      <div className="note-top">
        <button className="icon-round" onClick={onClose} aria-label="不儲存，返回">
          ✕
        </button>
        <button className="icon-round on" onClick={submit} aria-label="儲存筆記">
          ✓
        </button>
      </div>
      <div className="note-scene" aria-hidden="true">
        <HabitatScene habitatId={s.habitatId} bubble />
      </div>
      <div className="note-meta">
        <button className="tag-line" onClick={() => setPicking(true)}>
          <span className="tag-dot" style={{ background: tagColor(tag) }} aria-hidden="true" />
          {tag} ›
        </button>
        <input className="note-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} placeholder="新增專注標題" aria-label="專注標題" />
      </div>
      <p className="note-prompt">✦ 今天在「{tag}」上有進展了，讚喔！把想記住的細節留在筆記裡；也可以加個專注標題，寫上這次做了什麼。</p>
      <textarea
        className="note-input"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={NOTE_MAX}
        placeholder="例：兩種做法，還不知道怎麼選。"
        aria-label="專注筆記"
        autoFocus
      />
      <p className="small note-count">
        {note.length} / {NOTE_MAX}・筆記只存在你的裝置，不會分享給好友
      </p>
      {picking && (
        <Modal title="標籤" onClose={() => setPicking(false)}>
          <div className="sheet-list" role="radiogroup" aria-label="標籤">
            {tags.map((t) => (
              <button
                key={t}
                role="radio"
                aria-checked={tag === t}
                className={tag === t ? 'sheet-row on' : 'sheet-row'}
                onClick={() => {
                  setTag(t);
                  setPicking(false);
                }}
              >
                <span className="tag-dot" style={{ background: tagColor(t) }} aria-hidden="true" />
                {t}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
