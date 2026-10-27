import { Fragment, useState } from 'react';
import { useNow, useSave } from '../app/store';
import { COPY } from '../content/config';
import { ChestArt, ChestOpen, chestTier } from '../components/Chest';
import { Coin, Progress } from '../components/ui';
import { nextLocalMidnight, shiftDateKey } from '../domain/focus';
import { activeProject, projectRow } from '../domain/game';
import { MONTH_REWARD, MONTH_TARGET, STARTER_REWARD, claimQuest, dailyQuests, monthQuest, starterQuest, today, hasReward, type Quest } from '../domain/quests';
import { achievementReady } from '../domain/achievements';
import { Achievements } from './Achievements';
import { ChevronRight, Hammer } from 'lucide-react';
import { PageTip } from '../components/PageTip';

const left = (ms: number) => {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} 小時 ${m % 60} 分` : `${m} 分`;
};

/** 挑戰卡：進度條＋寶箱；完成了寶箱會發光，點一下打開；開過的顯示已完成。 */
function QuestCard({ q, onClaim }: { q: Quest; onClaim: () => void }) {
  const ready = q.progress >= q.target && !q.claimed;
  return (
    <button className={q.claimed ? 'quest-card done' : ready ? 'quest-card ready' : 'quest-card'} disabled={!ready} onClick={onClaim} aria-label={`${q.title}：${q.claimed ? '已完成' : ready ? '完成了，打開寶箱' : `${q.progress}/${q.target}`}`}>
      <strong>{q.title}</strong>
      <span className="quest-bar">
        <i style={{ width: `${(q.progress / q.target) * 100}%` }} />
        <small>{q.claimed ? '已完成' : `${q.progress}/${q.target}`}</small>
      </span>
      <span className="quest-chest">
        <ChestArt open={q.claimed} size={44} />
        {q.claimed && <span className="quest-check">✓</span>}
      </span>
      <span className="quest-reward small">
        <Coin /> {q.reward}
      </span>
    </button>
  );
}

/** 任務：新手任務、本月挑戰、每日挑戰（完成後開寶箱），修復工程摘要。 */
export function Quests({ onIsland, onLobby, onRecords }: { onIsland: () => void; onLobby: () => void; onRecords: () => void }) {
  const { save, update, notify } = useSave();
  const now = useNow(60_000);
  const [opening, setOpening] = useState<{ key: string; title: string } | null>(null);
  // 成就併進任務：挑戰／成就兩個分頁
  const [tab, setTab] = useState<'quests' | 'ach'>('quests');
  const day = today(save, now);
  const daily = dailyQuests(save, day);
  const month = monthQuest(save, day.slice(0, 7));
  const starter = starterQuest(save);
  // 這個月還剩幾天（含今天）：下個月 1 號減今天
  const nextMonth = `${shiftDateKey(`${day.slice(0, 7)}-28`, 4).slice(0, 7)}-01`;
  const daysLeft = Math.round((Date.parse(nextMonth) - Date.parse(day)) / 86400000);
  const claim = () => {
    let got: { coins: number; gems?: number; animalId?: string } | null = null;
    const saved = update((s) => {
      const r = claimQuest(s, opening!.key, Date.now());
      if (!r.ok) {
        notify(r.error);
        return s;
      }
      got = { coins: r.coins, gems: r.gems, animalId: r.animalId };
      return r.save;
    });
    return saved ? got : null; // 存檔失敗（例如空間不足）：寶箱不打開
  };
  const project = activeProject(save);
  const got = project ? (projectRow(save, project.id)?.contributedPoints ?? 0) : 0;

  return (
    <div className="page">
      <h1>任務</h1>
      <PageTip id="quests">每天都有新的挑戰，完成就能開寶箱拿金幣；成就在「成就」分頁。</PageTip>
      <div className="segmented quest-tabs" role="tablist" aria-label="任務分類">
        <button role="tab" aria-selected={tab === 'quests'} className={tab === 'quests' ? 'on' : ''} onClick={() => setTab('quests')}>
          挑戰{hasReward(save, now) && <span className="tab-dot" aria-hidden="true" />}
        </button>
        <button role="tab" aria-selected={tab === 'ach'} className={tab === 'ach' ? 'on' : ''} onClick={() => setTab('ach')}>
          成就{achievementReady(save) && <span className="tab-dot" aria-hidden="true" />}
        </button>
      </div>
      {tab === 'ach' ? (
        <Achievements embedded />
      ) : (
        <>

      {!starter.claimed && (
        <section className="card starter-quest">
          {/* 步驟條：完成的圓圈打勾，中間的線跟著填滿，最後是寶箱 */}
          <div className="starter-steps" aria-hidden="true">
            {starter.steps.map((st, i) => (
              <Fragment key={i}>
                {i > 0 && <i className={starter.steps[i - 1].ok ? 'on' : ''} />}
                <span className={st.ok ? 'on' : ''}>{st.ok ? '✓' : i + 1}</span>
              </Fragment>
            ))}
            <i className={starter.ready ? 'on' : ''} />
            <span className={starter.ready ? 'gift on' : 'gift'}>
              <ChestArt tier="green" size={30} />
            </span>
          </div>
          <h2>{starter.ready ? '你的獎勵正等著你！' : starter.steps.some((st) => st.ok) ? '只差一點！' : '專注，從這裡開始'}</h2>
          <p className="small muted">
            完成新手任務，寶箱裡有{starter.animal ? `「${starter.animal.name}」的探索路線和` : ''} {STARTER_REWARD} 金幣。
          </p>
          {/* 每一步都是一張小卡：有進度條，還沒完成的點一下就帶你去做 */}
          <ul className="starter-list">
            {starter.steps.map((st) => (
              <li key={st.title}>
                <button className={st.ok ? 'starter-task ok' : 'starter-task'} disabled={st.ok} onClick={st.go === 'records' ? onRecords : onLobby}>
                  <span className="starter-task-top">
                    <strong>{st.title}</strong>
                    {st.ok ? <span className="starter-check">✓</span> : <ChevronRight size={18} aria-hidden="true" />}
                  </span>
                  <span className="quest-bar">
                    <i style={{ width: `${(st.have / st.need) * 100}%` }} />
                    <small>{st.ok ? '完成' : `${st.have}/${st.need}`}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {starter.ready && (
            <button className="primary" onClick={() => setOpening({ key: starter.key, title: '新手任務' })}>
              打開寶箱
            </button>
          )}
        </section>
      )}

      <section className="card month-quest">
        <div>
          <p className="eyebrow">本月挑戰</p>
          <p>
            完成 {MONTH_TARGET} 個每日挑戰，就能獲得 <strong>{MONTH_REWARD} 金幣</strong>！
          </p>
          <Progress value={month.progress / month.target} label="本月挑戰進度" />
          <p className="small muted">
            {month.progress}/{month.target}・這個月還剩 {daysLeft} 天
          </p>
        </div>
        {month.claimed ? (
          <span className="small muted">已領取 ✓</span>
        ) : (
          <button className={month.progress >= month.target ? 'quest-month-chest ready' : 'quest-month-chest'} disabled={month.progress < month.target} onClick={() => setOpening({ key: month.key, title: '本月挑戰' })} aria-label="打開本月挑戰的寶箱">
            <ChestArt tier="royal" size={72} />
          </button>
        )}
      </section>

      <section className="card">
        <div className="row-between">
          <p className="eyebrow">每日挑戰</p>
          <span className="small muted">🕒 {left(nextLocalMidnight(now, save.profile.timezone) - now)}後更新</span>
        </div>
        <div className="quest-list">
          {daily.map((q) => (
            <QuestCard key={q.key} q={q} onClaim={() => setOpening({ key: q.key, title: '每日挑戰' })} />
          ))}
        </div>
      </section>

      {opening && (
        <ChestOpen
          title={opening.title}
          tier={chestTier(opening.key)}
          onOpen={claim}
          onClose={() => setOpening(null)}
          onFind={(id) => {
            update((s) => ({ ...s, settings: { ...s.settings, eggId: id } }));
            setOpening(null);
            onLobby();
          }}
        />
      )}

      {/* 修復工程的完整資訊在我的小島，這裡只放一行 */}
      <button className="quest-project" onClick={onIsland}>
        <Hammer size={18} aria-hidden="true" />
        <span>
          <small>修復工程</small>
          <strong>{project ? project.title : COPY.allRestored}</strong>
        </span>
        {project && <span className="quest-project-pct">{Math.floor((got / project.requiredPoints) * 100)}%</span>}
        <ChevronRight size={18} aria-hidden="true" />
      </button>

        </>
      )}
    </div>
  );
}
