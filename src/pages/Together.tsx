import { useState } from 'react';
import { useSave } from '../app/store';
import { COPY, avatarEmoji, projectDef } from '../content/config';
import { Progress, fmtDateTime } from '../components/ui';
import { localDateKey, shiftDateKey, weekStartKey } from '../domain/focus';
import { activeProject, balance, contributionsByUser, contribute, islandId, minutesByDay } from '../domain/game';
import { demoGrant } from '../domain/save';
import type { SaveFile } from '../domain/types';
import { PROJECTS } from '../content/config';

export function Together() {
  const { save, mode, switchMode, resetDemo, update, notify } = useSave();
  const demo = mode === 'demo';
  const byUser = contributionsByUser(save);
  const members = save.memberships.filter((m) => m.islandId === islandId(save));
  const name = (uid: string) => {
    const m = members.find((x) => x.userId === uid);
    return m?.demoNickname ?? save.profile.nickname;
  };
  const project = activeProject(save);

  // 開發快轉：只存在獨立示範存檔
  const fastForward = () =>
    update((s) => {
      let next = s;
      for (const p of PROJECTS) {
        const need = p.requiredPoints - (next.projects.find((r) => r.projectId === p.id)?.contributedPoints ?? 0);
        if (need <= 0) continue;
        next = demoGrant(next, next.profile.id, need, Date.now());
        const r = contribute(next, next.profile.id, p.id, need, Date.now());
        if (r.ok) next = r.save;
      }
      return next;
    }) && notify('示範路線已全部完成。到小島看看兩個棲地吧。');

  return (
    <div className="page">
      <h1>好友</h1>
      {demo ? (
        <div className="notice demo">
          <strong>🧪 {COPY.demoBanner}</strong>
          <p className="small">「小林」「阿遙」是虛構的示範成員，他們的貢獻是預先寫好的範例資料。示範的點數、工程與圖鑑都存在獨立存檔，不會影響你的小島。</p>
        </div>
      ) : (
        <div className="notice">
          <strong>{COPY.multiplayerOff}</strong>
          <p className="small">目前是單人小島。真實邀請與共同修復會在接上雲端後開放；在那之前不會產生任何邀請碼。你可以先開啟「本機合作示範」看看多人時的樣子。</p>
        </div>
      )}

      <section className="card">
        <h2>成員</h2>
        <ul className="members">
          {members.map((m) => (
            <li key={m.userId}>
              <span className="avatar-sm">{avatarEmoji(m.demoAvatarId ?? save.profile.avatarId)}</span>
              <div>
                <strong>{m.demoNickname ?? `${save.profile.nickname}（你）`}</strong>
                <div className="small muted">{m.role === 'owner' ? '島主' : '成員'}</div>
              </div>
              <span className="small">貢獻 {byUser.get(m.userId) ?? 0} 點</span>
            </li>
          ))}
        </ul>
        <button disabled title={COPY.multiplayerOff}>
          邀請朋友（{COPY.multiplayerOff}）
        </button>
      </section>

      <section className="card">
        <h2>共同工程</h2>
        {project ? (
          <>
            <p>
              {project.title}：{project.requiredPoints - (save.projects.find((r) => r.projectId === project.id)?.contributedPoints ?? 0)} 點後完成
            </p>
            <Progress value={(save.projects.find((r) => r.projectId === project.id)?.contributedPoints ?? 0) / project.requiredPoints} label="共同工程進度" />
          </>
        ) : (
          <p>{COPY.allRestored}</p>
        )}
        <h3>最近的貢獻</h3>
        <ul className="list">
          {[...save.contributions].reverse().slice(0, 8).map((c) => (
            <li key={c.id}>
              <span className="small muted">{fmtDateTime(c.createdAt)}</span>
              <div>
                {name(c.userId)} 投入 {c.points} 點到「{projectDef(c.projectId)?.title}」
              </div>
            </li>
          ))}
          {!save.contributions.length && <li className="muted">還沒有貢獻。完成專注後到「我的小島」投入點數。</li>}
        </ul>
        <p className="muted small">只會顯示暱稱、頭像與工程貢獻；你的任務名稱不會分享。</p>
      </section>

      <section className="card">
        <h2>本機合作示範</h2>
        {demo ? (
          <>
            <p className="small muted">開發與驗收用工具，只作用在示範存檔。你的示範錢包：{balance(save)} 點。</p>
            <div className="row wrap">
              <button onClick={() => update((s) => demoGrant(s, s.profile.id, 30, Date.now())) && notify('已在示範存檔加入 30 點。')}>＋30 點（示範）</button>
              <button onClick={fastForward}>完成全部工程（示範）</button>
              <button
                className="danger"
                onClick={() => {
                  if (confirm('重設示範存檔？你的小島不受影響。')) resetDemo();
                }}
              >
                重設示範
              </button>
            </div>
            <p className="small muted">大廳在示範模式下多了「10 秒」計時，可快速走完一次專注與結算。</p>
            <button className="primary" onClick={() => switchMode('personal')}>
              退出示範，回到我的小島
            </button>
          </>
        ) : (
          <>
            <p className="small muted">用虛構成員的範例資料，看看朋友一起修復小島時的畫面。示範有自己的存檔，可隨時重設；退出後回到你的小島。</p>
            <button className="primary" onClick={() => switchMode('demo')}>
              開啟本機合作示範
            </button>
          </>
        )}
      </section>
    </div>
  );
}

/** 每週專注時間目標：只算時間，不發點數。 */
export function WeeklyGoal({ save }: { save: SaveFile }) {
  const { update } = useSave();
  const tz = save.profile.timezone;
  const week = weekStartKey(localDateKey(Date.now(), tz));
  const goal = save.weeklyGoals.find((g) => g.islandId === islandId(save) && g.weekStartLocalDate === week);
  const [value, setValue] = useState(goal ? String(goal.targetMinutes) : '');
  const [error, setError] = useState<string | null>(null);
  const totals = new Map<string, number>();
  for (const m of save.memberships) for (const [d, ms] of minutesByDay(save, m.userId)) totals.set(d, (totals.get(d) ?? 0) + ms);
  const weekMs = Array.from({ length: 7 }, (_, i) => totals.get(shiftDateKey(week, i)) ?? 0).reduce((a, b) => a + b, 0);
  const minutes = Math.floor(weekMs / 60000);

  const saveGoal = () => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 10080) return setError('請輸入 1～10080 的整數分鐘。');
    setError(null);
    update((s) => ({
      ...s,
      weeklyGoals: [...s.weeklyGoals.filter((g) => !(g.islandId === islandId(s) && g.weekStartLocalDate === week)), { islandId: islandId(s), weekStartLocalDate: week, targetMinutes: n }],
    }));
  };

  return (
    <section className="card">
      <h2>本週專注時間目標</h2>
      <p className="muted small">可選。這是專注時間目標，不會額外發點數，也不影響工程。</p>
      {goal && (
        <>
          <Progress value={minutes / goal.targetMinutes} label="本週專注時間" />
          <p className="small">
            本週已專注 {minutes} / {goal.targetMinutes} 分鐘
          </p>
        </>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          saveGoal();
        }}
      >
        <input className="short" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="例如 300" aria-label="每週目標分鐘" />
        <span className="small">分鐘</span>
        <button type="submit">{goal ? '更新目標' : '設定目標'}</button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
