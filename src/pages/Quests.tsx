import { useState } from 'react';
import { useNow, useSave } from '../app/store';
import { ANIMALS, COPY, GROWTH_MAX, stageName } from '../content/config';
import { ChestArt, ChestOpen } from '../components/Chest';
import { Coin, Progress } from '../components/ui';
import { nextLocalMidnight, shiftDateKey } from '../domain/focus';
import { activeProject, animalUnlocked, animalsUnlockedBy, coins, growthOf, hatchCounts, newAnimals, projectRow } from '../domain/game';
import { MONTH_REWARD, MONTH_TARGET, STARTER_REWARD, claimQuest, dailyQuests, monthQuest, starterQuest, today, type Quest } from '../domain/quests';
import { WeeklyGoal } from './Together';

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

/** 任務：新手任務、本月挑戰、每日挑戰（完成後開寶箱），修復工程摘要、本週目標、探索與族群成長。 */
export function Quests({ onIsland, onShop, onLobby }: { onIsland: () => void; onShop: () => void; onLobby: () => void }) {
  const { save, update, notify } = useSave();
  const now = useNow(60_000);
  const [opening, setOpening] = useState<{ key: string; title: string } | null>(null);
  const day = today(save, now);
  const daily = dailyQuests(save, day);
  const month = monthQuest(save, day.slice(0, 7));
  const starter = starterQuest(save);
  // 這個月還剩幾天（含今天）：下個月 1 號減今天
  const nextMonth = `${shiftDateKey(`${day.slice(0, 7)}-28`, 4).slice(0, 7)}-01`;
  const daysLeft = Math.round((Date.parse(nextMonth) - Date.parse(day)) / 86400000);
  const claim = () => {
    let got: { coins: number; animalId?: string } | null = null;
    update((s) => {
      const r = claimQuest(s, opening!.key, Date.now());
      if (!r.ok) {
        notify(r.error);
        return s;
      }
      got = { coins: r.coins, animalId: r.animalId };
      return r.save;
    });
    return got;
  };
  const project = activeProject(save);
  const got = project ? (projectRow(save, project.id)?.contributedPoints ?? 0) : 0;
  const wallet = coins(save);
  const affordable = ANIMALS.filter((a) => a.unlock.kind === 'coins' && !animalUnlocked(save, a) && wallet >= a.unlock.price);
  const fresh = newAnimals(save);
  const counts = hatchCounts(save);
  const met = ANIMALS.filter((a) => counts.get(a.id));
  const adults = met.filter((a) => growthOf(save, a.id).stage === 2).length;
  // 最快長成成年的：遇見過、還沒成年、成長值最高的
  const closest = met
    .map((a) => ({ a, g: growthOf(save, a.id) }))
    .filter((x) => x.g.stage < 2)
    .sort((x, y) => y.g.growth - x.g.growth)[0];
  const returning = project ? animalsUnlockedBy(project.id) : [];

  return (
    <div className="page">
      <h1>任務</h1>

      {!starter.claimed && (
        <section className="card starter-quest">
          <div className="starter-steps" aria-hidden="true">
            {starter.steps.map((st, i) => (
              <span key={i} className={st.ok ? 'on' : ''}>
                {st.ok ? '✓' : i + 1}
              </span>
            ))}
            <span className={starter.ready ? 'gift on' : 'gift'}>🎁</span>
          </div>
          <h2>你的獎勵正等著你！</h2>
          <p className="small muted">
            完成新手任務，寶箱裡有{starter.animal ? `「${starter.animal.name}」的探索路線和` : ''} {STARTER_REWARD} 金幣。
          </p>
          <ol className="starter-list">
            {starter.steps.map((st) => (
              <li key={st.title} className={st.ok ? 'ok' : ''}>
                {st.ok ? '✅' : '⬜'} {st.title}
              </li>
            ))}
          </ol>
          <button className="primary" disabled={!starter.ready} onClick={() => setOpening({ key: starter.key, title: '新手任務' })}>
            {starter.ready ? '打開寶箱' : `下一步：${starter.steps.find((st) => !st.ok)?.title}`}
          </button>
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
            <ChestArt size={64} />
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
          onOpen={claim}
          onClose={() => setOpening(null)}
          onFind={(id) => {
            update((s) => ({ ...s, settings: { ...s.settings, eggId: id } }));
            setOpening(null);
            onLobby();
          }}
        />
      )}

      <section className="card">
        <p className="eyebrow">修復工程</p>
        {project ? (
          <>
            <p>
              <strong>{project.title}</strong>
              {returning.length > 0 && <span className="muted small">・修好後{returning.map((a) => a.name).join('、')}會回到森林</span>}
            </p>
            <Progress value={got / project.requiredPoints} label="工程進度" />
            <p className="small">{COPY.projectNeed(project.requiredPoints - got, project.promise)}</p>
            <button className="ghost" onClick={onIsland}>
              看完整的修復路線
            </button>
          </>
        ) : (
          <p>{COPY.allRestored}</p>
        )}
      </section>

      <WeeklyGoal save={save} />

      <section className="card">
        <p className="eyebrow">探索與族群成長</p>
        <p>
          遇見過 <strong>{met.length}</strong> / {ANIMALS.length} 種動物，其中 <strong>{adults}</strong> 種已經看得到成年的牠。
        </p>
        {closest && (
          <p className="small">
            {closest.a.name}最接近成年：成長 {closest.g.growth}/{GROWTH_MAX}（現在是{stageName(closest.a, closest.g.stage)}），再遇見幾次就能看到{stageName(closest.a, 2)}。
          </p>
        )}
        {fresh.length > 0 && (
          <>
            <p className="small">還沒遇見過：{fresh.map((a) => a.name).join('、')}。</p>
            <button className="ghost" onClick={() => update((s) => ({ ...s, settings: { ...s.settings, eggId: fresh[0].id } })) && onLobby()}>
              🔍 去找{fresh[0].name}
            </button>
          </>
        )}
        {affordable.length > 0 && (
          <>
            <p className="small">
              金幣夠解鎖探索路線了：{affordable.map((a) => `${a.name}（${a.unlock.kind === 'coins' ? a.unlock.price : ''} 金幣）`).join('、')}。你有 {wallet} 金幣。
            </p>
            <button className="ghost" onClick={onShop}>
              去商店解鎖
            </button>
          </>
        )}
      </section>
    </div>
  );
}
