import { useState } from 'react';
import { useSave } from '../app/store';
import { TAGS, animalDef, projectDef, sizeTier, tagColor } from '../content/config';
import { AnimalArt, EggArt } from '../components/Animal';
import { Modal } from '../components/ui';
import { renderSessionCard, ShareModal } from '../components/ShareCard';
import { localDateKey, shiftDateKey } from '../domain/focus';
import { animalsUnlockedBy, editSessionNote, endedSessions, islandId, NOTE_MAX } from '../domain/game';
import type { FocusSession, SaveFile } from '../domain/types';
import { Codex } from './Codex';

// ---------- 時間歷程（參考 Forest）：依日期的時間軸 ----------

type Entry =
  | { t: number; kind: 'start'; s: FocusSession }
  | { t: number; kind: 'end'; s: FocusSession }
  | { t: number; kind: 'project'; projectId: string }
  | { t: number; kind: 'shop'; animalId: string };

const WEEK = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
// 時間一律用玩家設定的時區（和日期分組一致）
const hm = (t: number, tz: string) => new Date(t).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz });
const minutesOf = (s: FocusSession) => Math.floor(s.accumulatedMs / 60000);

function entriesOf(save: SaveFile): Entry[] {
  const out: Entry[] = [];
  for (const s of endedSessions(save)) {
    out.push({ t: Date.parse(s.startedAt), kind: 'start', s });
    out.push({ t: Date.parse(s.endedAt!), kind: 'end', s });
  }
  for (const p of save.projects) if (p.islandId === islandId(save) && p.completedAt) out.push({ t: Date.parse(p.completedAt), kind: 'project', projectId: p.projectId });
  for (const x of save.transactions) if (x.kind === 'animal_unlock' && x.userId === save.profile.id && x.animalId) out.push({ t: Date.parse(x.createdAt), kind: 'shop', animalId: x.animalId });
  // 同一時間：結束的事（孵出、解鎖）排在開始前面（時間軸由新到舊）
  const order = { project: 0, shop: 1, end: 2, start: 3 };
  return out.sort((a, b) => b.t - a.t || order[a.kind] - order[b.kind]);
}

/** 日期標頭：「今天 / 10月25日」「週五 / 10月23日」 */
function dayLabel(key: string, today: string) {
  const [y, m, d] = key.split('-').map(Number);
  const head = key === today ? '今天' : key === shiftDateKey(today, -1) ? '昨天' : WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${head} / ${y === Number(today.slice(0, 4)) ? '' : `${y}年`}${m}月${d}日`;
}

/** 這段專注的卡片：時間、分鐘、孵出的動物（或沒孵化的蛋）、標題／標籤／筆記；⋯ 可以編輯或分享。 */
function SessionCard({ s, tz, onMenu }: { s: FocusSession; tz: string; onMenu: () => void }) {
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
      <div className="tl-art">{done ? <AnimalArt id={a.id} tier={sizeTier(minutesOf(s))} size={110} /> : <EggArt id={a.id} cold size={80} />}</div>
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
function EntryEditor({ s, onClose }: { s: FocusSession; onClose: () => void }) {
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
      <div className="tl-art">{s.status === 'completed' ? <AnimalArt id={animalDef(s.animalId).id} size={90} /> : <EggArt id={animalDef(s.animalId).id} cold size={70} />}</div>
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

  const groups: { key: string; items: Entry[] }[] = [];
  for (const e of entriesOf(save)) {
    const key = localDateKey(e.t, tz);
    if (groups[groups.length - 1]?.key !== key) groups.push({ key, items: [] });
    groups[groups.length - 1].items.push(e);
  }
  if (!groups.length) return <p className="card muted">還沒有紀錄。完成第一段專注，時間歷程就會從這裡開始。</p>;

  const line = (e: Entry) => {
    if (e.kind === 'start') return { icon: '🥚', text: `開始孵${animalDef(e.s.animalId).name}的蛋` };
    if (e.kind === 'end') return e.s.status === 'completed' ? { icon: '🐣', text: `孵出了一隻${animalDef(e.s.animalId).name}（${minutesOf(e.s)} 分鐘）` } : { icon: '🥶', text: `${animalDef(e.s.animalId).name}的蛋沒有孵化` };
    if (e.kind === 'project') return { icon: '🌲', text: `修好了「${projectDef(e.projectId)?.title ?? '工程'}」` };
    return { icon: '🛍️', text: `在商店解鎖了${animalDef(e.animalId).name}的蛋` };
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
                    {e.kind === 'end' && <SessionCard s={e.s} tz={tz} onMenu={() => setMenu(e.s)} />}
                    {unlocked.length > 0 && (
                      <div className="tl-card unlock">
                        {unlocked.map((a) => (
                          <span key={a.id} className="tl-unlock">
                            <AnimalArt id={a.id} size={72} />
                            <span className="small">{e.kind === 'project' ? `解鎖新的蛋：${a.name}` : a.name}</span>
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
      {editing && <EntryEditor s={editing} onClose={() => setEditing(null)} />}
      {sharing && (
        <ShareModal
          title={sharing.status === 'completed' ? '孵化紀錄' : '這段專注'}
          fileName={`棲光小島-${sharing.id.slice(0, 8)}`}
          make={() =>
            renderSessionCard({
              session: sharing,
              when: whenOf(sharing),
              title: sharing.status === 'completed' ? `孵出了${animalDef(sharing.animalId).name}` : `${animalDef(sharing.animalId).name}的蛋沒有孵化`,
            })
          }
          onClose={() => setSharing(null)}
        />
      )}
    </>
  );
}

/** 我的歷程：時間歷程與動物圖鑑。 */
export function Journey() {
  const [tab, setTab] = useState<'timeline' | 'codex'>('timeline');
  return (
    <div className="page">
      <h1>我的歷程</h1>
      <div className="segmented" role="tablist">
        {(
          [
            ['timeline', '時間歷程'],
            ['codex', '動物圖鑑'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'timeline' ? <Timeline /> : <Codex />}
    </div>
  );
}
