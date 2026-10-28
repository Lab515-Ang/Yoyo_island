import { useState } from 'react';
import { useSave } from '../app/store';
import { TAGS, animalDef, projectDef, stageName, tagColor } from '../content/config';
import { AnimalArt, TrackArt } from '../components/Animal';
import { Modal } from '../components/ui';
import { renderSessionCard, ShareModal } from '../components/ShareCard';
import { localDateKey, shiftDateKey } from '../domain/focus';
import { animalsUnlockedBy, editSessionNote, endedSessions, islandId, NOTE_MAX, perSave, sightings } from '../domain/game';
import type { FocusSession, SaveFile } from '../domain/types';

// ---------- 時間歷程（參考 Forest）：依日期的時間軸 ----------

type Entry =
  | { t: number; kind: 'start'; s: FocusSession }
  | { t: number; kind: 'end'; s: FocusSession }
  | { t: number; kind: 'grow'; s: FocusSession; stage: number }
  | { t: number; kind: 'project'; projectId: string }
  | { t: number; kind: 'shop'; animalId: string; gift: boolean };

const WEEK = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
// 時間一律用玩家設定的時區（和日期分組一致）
const fmts = new Map<string, Intl.DateTimeFormat>(); // 建立格式器很慢，依時區重用
const hm = (t: number, tz: string) => {
  let f = fmts.get(tz);
  if (!f) fmts.set(tz, (f = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz })));
  return f.format(t);
};
const minutesOf = (s: FocusSession) => Math.floor(s.accumulatedMs / 60000);

// 依存檔快取：打開選單、分享等重繪時不用整份歷史重排
const entriesOf = perSave((save: SaveFile): Entry[] => {
  const sights = sightings(save);
  const out: Entry[] = [];
  for (const s of endedSessions(save)) {
    out.push({ t: Date.parse(s.startedAt), kind: 'start', s });
    out.push({ t: Date.parse(s.endedAt!), kind: 'end', s });
    const sight = sights.get(s.id);
    if (sight?.grew) out.push({ t: Date.parse(s.endedAt!), kind: 'grow', s, stage: sight.stage });
  }
  for (const p of save.projects) if (p.islandId === islandId(save) && p.completedAt) out.push({ t: Date.parse(p.completedAt), kind: 'project', projectId: p.projectId });
  for (const x of save.transactions) if ((x.kind === 'animal_unlock' || x.kind === 'quest_reward') && x.userId === save.profile.id && x.animalId) out.push({ t: Date.parse(x.createdAt), kind: 'shop', animalId: x.animalId, gift: x.kind === 'quest_reward' });
  // 同一時間：結束的事（解鎖、長大、遇見）排在開始前面（時間軸由新到舊）
  const order = { project: 0, shop: 1, grow: 2, end: 3, start: 4 };
  return out.sort((a, b) => b.t - a.t || order[a.kind] - order[b.kind]);
});

/** 日期標頭：「今天 / 10月25日」「週五 / 10月23日」 */
function dayLabel(key: string, today: string) {
  const [y, m, d] = key.split('-').map(Number);
  const head = key === today ? '今天' : key === shiftDateKey(today, -1) ? '昨天' : WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${head} / ${y === Number(today.slice(0, 4)) ? '' : `${y}年`}${m}月${d}日`;
}

/** 這次探索的卡片：時間、分鐘、遇見的動物（當時的成長階段）或跑走的剪影、標題／標籤／筆記；⋯ 可以編輯或分享。 */
function SessionCard({ s, stage, tz, onMenu }: { s: FocusSession; stage: number; tz: string; onMenu: () => void }) {
  const done = s.status === 'completed';
  const a = animalDef(s.animalId);
  const title = s.taskTitle && s.taskTitle !== '一段專注' ? s.taskTitle : '';
  return (
    <div className={done ? 'tl-card' : 'tl-card cold'}>
      <div className="row between tl-card-head">
        <span className="small">
          {hm(Date.parse(s.startedAt), tz)} – {hm(Date.parse(s.endedAt!), tz)} · ⌛ {minutesOf(s)} 分
        </span>
        <button className="icon-btn" onClick={onMenu} aria-label="編輯或分享這段專注">
          ⋯
        </button>
      </div>
      <div className="tl-art">{done ? <AnimalArt id={a.id} stage={stage} size={110} /> : <TrackArt id={a.id} fled size={90} />}</div>
      <div className="tl-card-foot">
        {title && <strong>{title}</strong>}
        <span className="small">
          <span className="tag-dot" style={{ background: tagColor(s.tag) }} aria-hidden="true" /> {s.tag}
        </span>
        {s.note && <p className="small tl-note">{s.note}</p>}
      </div>
    </div>
  );
}

/** 編輯這段專注：標籤、標題、筆記。 */
function EntryEditor({ s, stage, onClose }: { s: FocusSession; stage: number; onClose: () => void }) {
  const { save, update } = useSave();
  const [tag, setTag] = useState(s.tag);
  const [title, setTitle] = useState(s.taskTitle === '一段專注' ? '' : s.taskTitle);
  const [note, setNote] = useState(s.note ?? '');
  const tags = [...new Set([...TAGS, ...save.settings.customTags, s.tag])];
  const saveIt = () => {
    if (update((sv) => editSessionNote(sv, s.id, { note, tag, taskTitle: title }))) onClose();
  };
  return (
    <Modal title="編輯這段專注" onClose={onClose}>
      <div className="tl-art">{s.status === 'completed' ? <AnimalArt id={animalDef(s.animalId).id} stage={stage} size={90} /> : <TrackArt id={animalDef(s.animalId).id} fled size={80} />}</div>
      <label>
        標籤
        <select value={tag} onChange={(e) => setTag(e.target.value)}>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        專注標題
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} placeholder="這次做了什麼？" />
      </label>
      <label>
        筆記
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))} rows={4} placeholder="為這次的專注留下一點紀錄吧！" />
      </label>
      <p className="small muted">
        {[...note].length} / {NOTE_MAX}
      </p>
      <div className="row editor-actions">
        <button onClick={onClose}>取消</button>
        <button className="primary" onClick={saveIt}>
          儲存
        </button>
      </div>
    </Modal>
  );
}

function Timeline() {
  const { save } = useSave();
  const tz = save.profile.timezone;
  const today = localDateKey(Date.now(), tz);
  const [days, setDays] = useState(7); // 一次顯示 7 個有紀錄的日子
  const [menu, setMenu] = useState<FocusSession | null>(null);
  const [editing, setEditing] = useState<FocusSession | null>(null);
  const [sharing, setSharing] = useState<FocusSession | null>(null);

  const sights = sightings(save);
  const stageAt = (s: FocusSession) => sights.get(s.id)?.stage ?? 2;
  const groups: { key: string; items: Entry[] }[] = [];
  // 由新到舊分組；只需要畫出來的天數（多一組用來判斷還有沒有更早的）
  for (const e of entriesOf(save)) {
    const key = localDateKey(e.t, tz);
    if (groups[groups.length - 1]?.key !== key) {
      if (groups.length > days) break;
      groups.push({ key, items: [] });
    }
    groups[groups.length - 1].items.push(e);
  }
  if (!groups.length) return <p className="card muted">還沒有紀錄。完成第一次探索，時間歷程就會從這裡開始。</p>;

  const line = (e: Entry) => {
    const name = (id: string | undefined) => animalDef(id).name;
    if (e.kind === 'start') return { icon: '🧭', text: `出發去找${name(e.s.animalId)}` };
    if (e.kind === 'end') return e.s.status === 'completed' ? { icon: '🔭', text: `遇見了${name(e.s.animalId)}（${stageName(animalDef(e.s.animalId), stageAt(e.s))}，${minutesOf(e.s)} 分鐘）` } : { icon: '💨', text: `${name(e.s.animalId)}被嚇跑了` };
    if (e.kind === 'grow') return { icon: '🌱', text: `${name(e.s.animalId)}的族群長大了，現在看得到${stageName(animalDef(e.s.animalId), e.stage)}` };
    if (e.kind === 'project') return { icon: '🌲', text: `修好了「${projectDef(e.projectId)?.title ?? '工程'}」` };
    return e.gift ? { icon: '🎁', text: `新手任務的寶箱送了${name(e.animalId)}的探索路線` } : { icon: '🛍️', text: `在商店解鎖了${name(e.animalId)}的探索路線` };
  };
  const whenOf = (s: FocusSession) => `${localDateKey(Date.parse(s.endedAt!), tz).slice(5).replace('-', '/')} ${hm(Date.parse(s.startedAt), tz)}–${hm(Date.parse(s.endedAt!), tz)}`;

  return (
    <>
      <ol className="timeline">
        {groups.slice(0, days).map((g) => (
          <li key={g.key}>
            <span className="tl-day">{dayLabel(g.key, today)}</span>
            <ol>
              {g.items.map((e, i) => {
                const { icon, text } = line(e);
                const unlocked = e.kind === 'project' ? animalsUnlockedBy(e.projectId) : e.kind === 'shop' ? [animalDef(e.animalId)] : [];
                return (
                  <li key={i} className={`tl-item ${e.kind}`}>
                    <span className="tl-dot" aria-hidden="true">
                      {icon}
                    </span>
                    <span className="small muted">{hm(e.t, tz)}</span>
                    <div>{text}</div>
                    {e.kind === 'end' && <SessionCard s={e.s} stage={stageAt(e.s)} tz={tz} onMenu={() => setMenu(e.s)} />}
                    {unlocked.length > 0 && (
                      <div className="tl-card unlock">
                        {unlocked.map((a) => (
                          <span key={a.id} className="tl-unlock">
                            <AnimalArt id={a.id} size={72} />
                            <span className="small">{e.kind === 'project' ? `發現新的足跡：${a.name}` : a.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
      {groups.length > days && (
        <button className="link" onClick={() => setDays((d) => d + 7)}>
          顯示更早的紀錄
        </button>
      )}

      {menu && (
        <Modal title="這段專注" onClose={() => setMenu(null)}>
          <div className="sheet-list">
            <button className="sheet-row" onClick={() => (setEditing(menu), setMenu(null))}>
              ✎ 編輯標籤、標題、筆記
            </button>
            <button className="sheet-row" onClick={() => (setSharing(menu), setMenu(null))}>
              ⤴ 分享
            </button>
          </div>
        </Modal>
      )}
      {editing && <EntryEditor s={editing} stage={stageAt(editing)} onClose={() => setEditing(null)} />}
      {sharing && (
        <ShareModal
          title={sharing.status === 'completed' ? '觀察紀錄' : '這次探索'}
          fileName={`棲光小島-${sharing.id.slice(0, 8)}`}
          make={() =>
            renderSessionCard({
              session: sharing,
              when: whenOf(sharing),
              title: sharing.status === 'completed' ? `遇見了${animalDef(sharing.animalId).name}（${stageName(animalDef(sharing.animalId), stageAt(sharing))}）` : `${animalDef(sharing.animalId).name}被嚇跑了`,
              stage: stageAt(sharing),
            })
          }
          onClose={() => setSharing(null)}
        />
      )}
    </>
  );
}

/** 我的歷程：時間歷程（觀察圖鑑是獨立的一頁）。 */
export function Journey({ onBack }: { onBack?: () => void }) {
  return (
    <div className="page">
      {onBack && (
        <button className="link back-link" data-back onClick={onBack}>
          ‹ 專注紀錄
        </button>
      )}
      <h1>時間歷程</h1>
      <Timeline />
    </div>
  );
}
