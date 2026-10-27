// 上週回顧（參考 Forest）：新的一週第一次回到大廳時邀請玩家，用一頁一頁的小故事回顧上週，最後是可以分享的總結卡。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSave } from '../app/store';
import { animalDef } from '../content/config';
import { AnimalArt } from '../components/Animal';
import { ShareModal, renderRecapCard } from '../components/ShareCard';
import { Modal } from '../components/ui';
import { localDateKey, shiftDateKey, weekStartKey, weekStartsOn } from '../domain/focus';
import { communityRank, growthOf, weekRecap } from '../domain/game';
import type { SaveFile } from '../domain/types';

const SEEN_KEY = 'qiguang-ui:recapSeen'; // 介面偏好：最後一次邀請回顧的是哪一週
// 一週從週一或週日開始（跟著設定）：第 k 天叫什麼
const MON = ['一', '二', '三', '四', '五', '六', '日'];
const dot = (k: number) => MON[(k + 7 - (1 - weekStartsOn())) % 7];

/** 上一週的第一天（依玩家時區與每週起始日設定）。 */
export const lastWeekStart = (tz: string) => shiftDateKey(weekStartKey(localDateKey(Date.now(), tz)), -7);
const md = (key: string) => `${Number(key.slice(5, 7))}/${Number(key.slice(8))}`;
export const weekRange = (weekStart: string) => `${md(weekStart)} – ${md(shiftDateKey(weekStart, 6))}`;
const hoursText = (ms: number) => {
  const m = Math.floor(ms / 60000);
  return m >= 60 ? (
    <>
      <b>{Math.floor(m / 60)}</b> 小時 <b>{m % 60}</b> 分鐘
    </>
  ) : (
    <>
      <b>{m}</b> 分鐘
    </>
  );
};

/** 這週還沒邀請過回顧、上週也有專注（大廳會跳出邀請；其他彈窗這時先別出來）。 */
export function recapPending(save: SaveFile) {
  const week = lastWeekStart(save.profile.timezone);
  try {
    if (localStorage.getItem(SEEN_KEY) === week) return false;
  } catch {
    return false;
  }
  return weekRecap(save, week).total >= 60_000;
}

/** 新的一週第一次回到大廳：上週有專注的話，邀請回顧一次（不管開始或下次再說，這週都不會再問）。 */
export function RecapInvite() {
  const { save } = useSave();
  const week = lastWeekStart(save.profile.timezone);
  const [state, setState] = useState<'ask' | 'story' | 'done'>(() => {
    try {
      return localStorage.getItem(SEEN_KEY) === week ? 'done' : 'ask';
    } catch {
      return 'done';
    }
  });
  if (state === 'done' || weekRecap(save, week).total < 60_000) return null;
  const seen = (next: 'story' | 'done') => {
    try {
      localStorage.setItem(SEEN_KEY, week);
    } catch {
      // 只影響下次會不會再問
    }
    setState(next);
  };
  if (state === 'story') return <WeekRecap weekStart={week} onClose={() => setState('done')} />;
  return (
    <Modal title="上週回顧" onClose={() => seen('done')}>
      <div className="recap-invite">
        <p className="recap-invite-emoji" aria-hidden="true">
          🌿
        </p>
        <p>
          <strong>新的一週開始了！</strong>
        </p>
        <p className="muted">一起來回顧上週的成果吧。</p>
        <button className="primary" onClick={() => seen('story')}>
          開始回顧
        </button>
        <button className="link" onClick={() => seen('done')}>
          下次再說
        </button>
      </div>
    </Modal>
  );
}

/** 回顧故事：點右邊（或 → 鍵）下一頁、點左邊上一頁；最後一頁是總結卡和分享。 */
export function WeekRecap({ weekStart, onClose }: { weekStart: string; onClose: () => void }) {
  const { save } = useSave();
  const r = weekRecap(save, weekStart);
  const [i, setI] = useState(0);
  const [sharing, setSharing] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    return () => d.close();
  }, []);

  const min = Math.floor(r.total / 60000);
  const top = r.top && animalDef(r.top.id);
  const pct = r.prevTotal ? Math.round(((r.total - r.prevTotal) / r.prevTotal) * 100) : null;
  const times = r.prevTotal ? (r.total / r.prevTotal).toFixed(1) : ''; // 大幅成長時用「幾倍」比較好懂
  const peak = Math.max(1, ...r.days);
  const rank = communityRank(r.total);

  const slides: { tone: string; art: ReactNode; text: ReactNode }[] = [
    {
      tone: 'teal',
      art: (
        <>
          <div className="recap-animals">
            {r.animals.slice(0, 5).map((id) => (
              <AnimalArt key={id} id={id} stage={growthOf(save, id).stage} size={64} />
            ))}
          </div>
          <p className="recap-big">
            {min}
            <small>分鐘</small>
          </p>
        </>
      ),
      text: (
        <>
          <p>上週，你專注了 {hoursText(r.total)}</p>
          <p>每一分鐘，都讓森林更熱鬧</p>
        </>
      ),
    },
    {
      tone: 'lavender',
      art: (
        <>
          <p className="recap-big">{r.focusDays}</p>
          <div className="recap-week">
            {MON.map((_, k) => dot(k)).map((d, k) => (
              <span key={d} className={r.days[k] ? 'on' : ''}>
                <small>{d}</small>
                <i aria-hidden="true">{r.days[k] ? '✓' : ''}</i>
              </span>
            ))}
          </div>
        </>
      ),
      text: (
        <>
          <p>
            上週你一共專注了 <b>{r.focusDays}</b> 天
          </p>
          <p>{r.focusDays === 7 ? '整整七天，太厲害了！' : r.focusDays >= 4 ? '專注已經慢慢變成習慣了！' : '繼續保持專注習慣！'}</p>
        </>
      ),
    },
    {
      tone: 'warm',
      art: (
        <div className="recap-bars" aria-hidden="true">
          {r.days.map((ms, k) => (
            <span key={k} className={k === r.best ? 'best' : ''}>
              <i style={{ height: `${Math.max(3, (ms / peak) * 100)}%` }} />
              <small>{dot(k)}</small>
            </span>
          ))}
        </div>
      ),
      text: (
        <>
          <p>
            <b>週{dot(r.best)}</b>最厲害，你專注了 <b>{Math.floor(r.days[r.best] / 60000)}</b> 分鐘
          </p>
          <p>那天的你，完全進入狀態！</p>
        </>
      ),
    },
    ...(top
      ? [
          {
            tone: 'pink',
            art: (
              <div className="recap-hero">
                <AnimalArt id={top.id} stage={growthOf(save, top.id).stage} size={180} />
              </div>
            ),
            text: (
              <>
                <p>
                  <b>{top.name}</b>上週陪你最久
                </p>
                <p>一共遇見 {r.top!.count} 次，看來牠成了你的好夥伴！</p>
              </>
            ),
          },
        ]
      : []),
    {
      tone: 'sky',
      art: (
        <>
          <p className="recap-big">{pct === null ? '🌱' : pct >= 100 ? `×${times}` : `${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%`}</p>
          <div className="recap-chips">
            <span>遇見 {r.species} 種</span>
            {r.newSpecies > 0 && <span>第一次見到 {r.newSpecies} 種</span>}
            {r.grew > 0 && <span>族群長大 {r.grew} 次</span>}
          </div>
        </>
      ),
      text:
        pct === null ? (
          <>
            <p>上週是新的開始！</p>
            <p>從這裡出發，看看這週能走多遠。</p>
          </>
        ) : pct >= 100 ? (
          <>
            <p>
              是前一週的 <b>{times}</b> 倍
            </p>
            <p>你正在越來越進入狀態！</p>
          </>
        ) : pct >= 5 ? (
          <>
            <p>
              比前一週多專注了 <b>{pct}%</b>
            </p>
            <p>你正在越來越進入狀態！</p>
          </>
        ) : pct <= -5 ? (
          <>
            <p>
              比前一週少了 <b>{-pct}%</b>
            </p>
            <p>沒關係，這週再慢慢找回節奏。</p>
          </>
        ) : (
          <>
            <p>和前一週差不多</p>
            <p>穩定，就是最好的節奏。</p>
          </>
        ),
    },
    {
      tone: 'gold',
      art: (
        <p className="recap-big recap-rank">
          {rank.top}
          <small>%</small>
        </p>
      ),
      text: (
        <>
          <p>
            你的專注表現進入棲光小島前 <b>{rank.top}%</b>！
          </p>
          <p>
            你專注了 <b>{min}</b> 分鐘，超越了 <b>{rank.beat}%</b> 的玩家
          </p>
          <p>{rank.top <= 20 ? '這成就太厲害了！' : rank.top <= 50 ? '已經比一半的人更專注了！' : '每一週都是新的起點，加油！'}</p>
        </>
      ),
    },
    {
      tone: 'summary',
      art: (
        <div className="recap-card">
          <div className="recap-animals">
            {r.animals.slice(0, 4).map((id) => (
              <AnimalArt key={id} id={id} stage={growthOf(save, id).stage} size={72} />
            ))}
          </div>
          <p className="recap-card-title">我的專注表現進入棲光小島前 {rank.top}%！</p>
          <div className="recap-tiles">
            <span>
              ⏱️ <b>{min}</b>
              <small>專注分鐘</small>
            </span>
            <span>
              ✅ <b>{r.focusDays}/7</b>
              <small>專注天數</small>
            </span>
            <span>
              👑 <b>週{dot(r.best)}</b>
              <small>最佳日</small>
            </span>
            <span>
              ❤️ <b>{top ? top.name : '—'}</b>
              <small>最常遇見</small>
            </span>
          </div>
          <p className="small muted">🌿 棲光小島・{weekRange(weekStart)}</p>
        </div>
      ),
      text: null,
    },
  ];
  const last = i === slides.length - 1;
  const slide = slides[i];
  const go = (d: number) => setI((k) => Math.max(0, Math.min(slides.length - 1, k + d)));

  return (
    <dialog
      ref={ref}
      className={`recap recap-${slide.tone}`}
      aria-label="上週回顧"
      onCancel={(e) => e.target === e.currentTarget && (e.preventDefault(), onClose())}
      onKeyDown={(e) => (e.key === 'ArrowRight' ? go(1) : e.key === 'ArrowLeft' ? go(-1) : undefined)}
    >
      <header className="recap-top">
        <button className="icon-btn" onClick={onClose} aria-label="關閉回顧">
          ✕
        </button>
        <div className="recap-steps" aria-label={`第 ${i + 1} / ${slides.length} 頁`}>
          {slides.map((_, k) => (
            <span key={k} className={k <= i ? 'on' : ''} />
          ))}
        </div>
      </header>
      {/* 點畫面左邊三分之一回上一頁，其他地方下一頁 */}
      <div
        className="recap-body"
        onClick={(e) => {
          const b = e.currentTarget.getBoundingClientRect();
          go(e.clientX < b.left + b.width / 3 ? -1 : 1);
        }}
      >
        <div key={i} className="recap-slide">
          <div className="recap-art">{slide.art}</div>
          {slide.text && (
            <div className="recap-text" aria-live="polite">
              {slide.text}
            </div>
          )}
        </div>
      </div>
      <footer className="recap-foot">
        {last ? (
          <>
            <button className="primary" onClick={() => setSharing(true)}>
              分享
            </button>
            <button className="link" onClick={onClose}>
              返回首頁
            </button>
          </>
        ) : (
          <button className="link" onClick={() => go(1)}>
            點畫面繼續 ›
          </button>
        )}
      </footer>
      {sharing && (
        <ShareModal
          title="分享上週回顧"
          fileName={`棲光小島-上週回顧-${weekStart}.png`}
          make={() => renderRecapCard({ ...r, rankTop: rank.top, range: weekRange(weekStart), bestName: r.best >= 0 ? `週${dot(r.best)}` : '—', topStage: top ? growthOf(save, top.id).stage : 2 })}
          onClose={() => setSharing(false)}
        />
      )}
    </dialog>
  );
}
