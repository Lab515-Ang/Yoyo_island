import { useState } from 'react';
import { useSave } from '../app/store';
import { ANIMALS, COPY, GROWTH_MAX, animalDef, stageName, tagColor, TAGS } from '../content/config';
import { AnimalArt, TrackArt } from '../components/Animal';
import { Coin, Modal, fmtMinutes } from '../components/ui';
import { localDateKey } from '../domain/focus';
import { activeProject, animalUnlocked, animalsUnlockedBy, balance, coins, earnedFor, editSessionNote, endedSessions, focusOutcome, minutesByDay, NOTE_MAX, endedDayKeys, remainingFor, sightings } from '../domain/game';
import { hasReward } from '../domain/quests';
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
  onQuests,
}: {
  sessionId: string;
  onDone: () => void;
  onProject: () => void;
  onRecords: (tag: string) => void;
  onBreak: () => void;
  onShop: () => void;
  onQuests: () => void;
}) {
  const { save } = useSave();
  const s = save.sessions.find((x) => x.id === sessionId);
  const [comforted, setComforted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<'first' | 'again' | null>(null);
  // 紀錄不見了（例如在別的分頁重設）：不要留白畫面，給一個回大廳的按鈕
  if (!s)
    return (
      <div className="result">
        <p className="result-title">找不到這段專注的紀錄。</p>
        <button className="pill wide" onClick={onDone}>
          返回首頁
        </button>
      </div>
    );
  const done = s.status === 'completed';
  const min = Math.floor(s.accumulatedMs / 60000);
  const earned = earnedFor(save, s.id);
  // 「今天」以這段專注結束的那一天為準（倒數在背景跨過午夜結束、隔天才打開時也一致）
  const dayKeys = endedDayKeys(save);
  const sessionDay = (s.endedAt && dayKeys.get(s.id)) || localDateKey(Date.now(), save.profile.timezone);
  const isToday = sessionDay === localDateKey(Date.now(), save.profile.timezone);
  const todayMin = Math.floor((minutesByDay(save).get(sessionDay) ?? 0) / 60000);
  const project = activeProject(save);
  const canBuild = project && balance(save) >= remainingFor(save, project);
  // 下一個足跡還要多久：目前工程修好就能去找的動物（1 點＝專注 1 分鐘）
  const nextEgg = project ? animalsUnlockedBy(project.id)[0] : undefined;
  const out = focusOutcome(save, s.id);
  // 下一步：金幣夠解鎖商店裡還沒解鎖的動物時，提示去商店
  const wallet = coins(save);
  const canShop = ANIMALS.some((a) => a.unlock.kind === 'coins' && !animalUnlocked(save, a) && wallet >= a.unlock.price);
  const hasTitle = s.taskTitle && s.taskTitle !== '一段專注';
  // 今天第幾次遇見動物（只算完成的探索）
  const todays = s.endedAt ? endedSessions(save).filter((x) => x.status === 'completed' && dayKeys.get(x.id) === sessionDay).sort((a, b) => a.endedAt!.localeCompare(b.endedAt!)) : [];
  const nth = todays.findIndex((x) => x.id === s.id) + 1;
  const animal = animalDef(s.animalId);
  // 這次遇見時的族群成長（階段、成長值、是否長大了）
  const sight = sightings(save).get(s.id);
  const stage = sight?.stage ?? 2;
  // 這段專注修好的工程，讓哪些動物可以去找了
  const newAnimals = out.projects.filter((p) => p.completed).flatMap((p) => animalsUnlockedBy(p.def.id));

  if (!done && !comforted)
    return (
      <div className="result comfort">
        <div className="result-scene" aria-hidden="true">
          <HabitatScene habitatId={s.habitatId} bubble />
        </div>
        <div className="comfort-plant">
          <TrackArt id={s.animalId} fled size={120} />
        </div>
        <p className="result-title">沒關係，下次會更好</p>
        <p className="small">{animal.name}被嚇跑了，下次安靜地多待一會兒吧。</p>
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
      {!saved && <p className="result-title">{done ? (min > 0 ? `很棒！你${isToday ? '今天' : '這天'}已專注 ${todayMin} 分。` : '這段專注已記錄。') : `你${isToday ? '今天' : '這天'}已專注 ${todayMin} 分。`}</p>}

      <div className={done ? 'result-card' : 'result-card faded'}>
        <div className="result-card-scene" aria-hidden="true">
          <HabitatScene habitatId={s.habitatId} bubble hide={s.id} />
          {/* 這次遇見的動物直接出現在場景裡；放棄的話是跑走的剪影。完整紀錄在「我的歷程」 */}
          <div className="result-plant">{done ? <AnimalArt id={s.animalId} stage={stage} size="100%" /> : <TrackArt id={s.animalId} fled size="100%" />}</div>
        </div>
        <span className="minute-pill">{min} 分</span>
        <p className="result-tag">
          <span className="tag-dot" style={{ background: tagColor(s.tag) }} aria-hidden="true" />
          {s.tag}
          {hasTitle && <span className="result-task">・{s.taskTitle}</span>}
        </p>
        <p className="result-plant-line">{done && nth > 0 ? `🔭 遇見了${animal.name}（${stageName(animal, stage)}）・${isToday ? '今天' : '這天'}第 ${nth} 次觀察` : `💨 ${animal.name}被嚇跑了`}</p>
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
              <span>🌲 {p.def.title}</span>
              <strong>{p.completed ? '完成了！' : `${Math.round(p.to * 100)}%（+${Math.max(1, Math.round((p.to - p.from) * 100))}%）`}</strong>
            </li>
          ))}
          {!out.projects.length && earned.points > 0 && (
            <li>
              <span>🌱 成長點數</span>
              <strong>+{earned.points}</strong>
            </li>
          )}
          {sight && animal.unlock.kind !== 'iap' && (
            <li>
              <span>🌱 {animal.name}族群</span>
              <strong>{sight.grew ? `長大了！現在看得到${stageName(animal, stage)}` : stage === 2 ? `已經是${stageName(animal, 2)}` : `成長 ${Math.min(sight.growth, GROWTH_MAX)}/${GROWTH_MAX}`}</strong>
            </li>
          )}
          {newAnimals.map((a) => (
            <li key={a.id}>
              <span>🐾 發現新的足跡</span>
              <strong>{a.name}，下次可以去找牠</strong>
            </li>
          ))}
          {nextEgg && !newAnimals.length && (
            <li>
              <span>🔜 下一個足跡</span>
              <strong>
                {nextEgg.name}・再專注約 {fmtMinutes(remainingFor(save, project!) * 60000)}
              </strong>
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
          <p className="result-saved">{saved === 'first' ? '第一篇專注筆記存好了，森林又多了一段小故事！' : '筆記存好了，森林又多了一段小故事！'}</p>
          <button className="link-light" onClick={() => onRecords(s.tag)}>
            查看專注紀錄：「{s.tag}」
          </button>
        </>
      ) : (
        <p className="result-sub">{done ? (min > 0 ? COPY.complete(min) : '未滿一分鐘不會得到獎勵。') : '提前結束，這次沒有獎勵。'}</p>
      )}

      <div className="result-actions">
        <button className="pill wide" onClick={onDone}>
          返回首頁
        </button>

        {hasReward(save, Date.now()) && (
          <button className="link-light" onClick={onQuests}>
            🎁 挑戰完成了，去打開寶箱
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
        <button className="icon-round" onClick={onClose} aria-label="不儲存，返回" data-back>
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
      <p className="note-prompt">
        {s.status === 'completed'
          ? `✦ 今天在「${tag}」上有進展了，讚喔！把想記住的細節留在筆記裡；也可以加個專注標題，寫上這次做了什麼。`
          : '✦ 這次沒有完成也沒關係。記下是什麼打斷了你，下次比較容易避開。'}
      </p>
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
