import { useState } from 'react';
import { useSave } from '../app/store';
import { COPY, TAGS, speciesDef, tagColor } from '../content/config';
import { Coin, Modal } from '../components/ui';
import { Creature } from '../components/Creature';
import { localDateKey } from '../domain/focus';
import { activeProject, balance, chanceFind, earnedFor, editSessionNote, minutesByDay, NOTE_MAX, remainingFor } from '../domain/game';
import { HabitatScene } from '../scenes/HabitatScene';

const clock = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/** 結算（參考 Forest 流程）：放棄先安慰 → 結果卡片 → 可寫專注筆記 → 存好後可查看同標籤的紀錄。 */
export function Summary({
  sessionId,
  onDone,
  onProject,
  onRecords,
  onBreak,
}: {
  sessionId: string;
  onDone: () => void;
  onProject: () => void;
  onRecords: (tag: string) => void;
  onBreak: () => void;
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
  const hasTitle = s.taskTitle && s.taskTitle !== '一段專注';

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
        </div>
        <span className="minute-pill">{min} 分</span>
        <p className="result-tag">
          <span className="tag-dot" style={{ background: tagColor(s.tag) }} aria-hidden="true" />
          {s.tag}
          {hasTitle && <span className="result-task">・{s.taskTitle}</span>}
        </p>
        {s.note ? (
          <button className="result-note" onClick={() => setEditing(true)} aria-label="編輯專注筆記">
            {s.note}
          </button>
        ) : (
          <button className="note-btn" onClick={() => setEditing(true)}>
            ✎ 新增專注筆記
          </button>
        )}
        <div className="reward-chips" aria-label="這次的獎勵">
          <span>🌱 +{earned.points}</span>
          <span>
            <Coin /> +{earned.coins}
          </span>
          <span>🌾 +{earned.feed}</span>
        </div>
      </div>

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
        {canBuild && (
          <button className="link-light" onClick={onProject}>
            點數夠了，去修「{project.title}」
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
