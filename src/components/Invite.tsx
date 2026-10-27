import { useState } from 'react';
import { useSave } from '../app/store';
import { Coin, Gem, Modal } from './ui';
import { ChevronDown, Copy, Gift } from 'lucide-react';

/** 邀請拿獎勵的里程碑（參考 Forest）：受邀的朋友累積專注到這個時間，你就拿到獎勵。 */
const MILESTONES = [
  { minutes: 30, coins: 500 },
  { minutes: 120, coins: 1500 },
  { minutes: 300, gems: 30 },
  { minutes: 600, gems: 60 },
  { minutes: 3000, gems: 150 },
];
/** 受邀的人輸入邀請碼拿到的金幣 */
export const INVITEE_COINS = 300;

/** 邀請碼：由玩家 id 算出來的 8 碼（多人連線開放後由伺服器核對）。 */
const inviteCode = (id: string) => (parseInt(id.replace(/-/g, '').slice(0, 10), 16) || 0).toString(36).toUpperCase().padStart(8, '0').slice(-8);

/**
 * 好友頁的「邀請拿獎勵」。
 * ponytail: 沒有伺服器就沒辦法核對邀請碼、累積朋友的專注時間；現在只有畫面和複製邀請碼，輸入邀請碼先提示上架後開放。
 */
export function InviteCard() {
  const { save, notify } = useSave();
  const [entering, setEntering] = useState(false);
  const [code, setCode] = useState('');
  const mine = inviteCode(save.profile.id);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`一起來棲光小島專注、遇見台灣的保育類動物！輸入我的邀請碼 ${mine}，可以拿到 ${INVITEE_COINS} 金幣。`);
      notify('已複製邀請碼，貼給朋友吧！');
    } catch {
      notify(`你的邀請碼是 ${mine}`);
    }
  };

  return (
    <section className="card invite-card">
      <div className="invite-head">
        <span className="invite-gift" aria-hidden="true">
          <Gift size={30} />
        </span>
        <div>
          <h2>邀請拿獎勵</h2>
          <p className="small muted">你邀請的朋友專注越久，你的獎勵越多。</p>
        </div>
      </div>
      <p className="invite-count">已邀請 0 人</p>
      <ol className="invite-track" aria-label="邀請獎勵">
        {MILESTONES.map((m) => (
          <li key={m.minutes}>
            <span className="invite-time">
              <strong>{m.minutes >= 60 ? m.minutes / 60 : m.minutes}</strong> {m.minutes >= 60 ? '小時' : '分鐘'}
            </span>
            <span className="invite-dot" aria-hidden="true" />
            <span className="invite-reward">
              {m.coins ? (
                <>
                  <Coin /> {m.coins.toLocaleString('en-US')}
                </>
              ) : (
                <>
                  <Gem /> {m.gems}
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
      <details className="invite-more">
        <summary>
          流程說明 <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <ol>
          <li>分享你的邀請碼給朋友</li>
          <li>朋友在好友頁輸入你的邀請碼，馬上拿到 {INVITEE_COINS} 金幣</li>
          <li>朋友每次專注，都會累積你的邀請進度</li>
          <li>朋友的專注時間達到上面的里程碑，你就拿到獎勵</li>
        </ol>
      </details>
      <details className="invite-more">
        <summary>
          常見問題 <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <p className="small">
          <strong>可以邀請幾個人？</strong>沒有上限，每位朋友的進度分開計算。
        </p>
        <p className="small">
          <strong>我可以輸入幾次邀請碼？</strong>每個人只能輸入一組邀請碼，而且不能輸入自己的。
        </p>
        <p className="small">
          <strong>什麼時候開放？</strong>邀請要連線核對，會和多人連線一起在 App 上架後開放；現在可以先複製你的邀請碼。
        </p>
      </details>
      <button className="primary wide invite-code" onClick={() => void copy()}>
        <span>{mine}</span>
        <Copy size={18} aria-hidden="true" />
      </button>
      <p className="small muted center-text">
        受邀的人輸入邀請碼，可以獲得 <Coin /> {INVITEE_COINS} 金幣
      </p>
      <button className="link center-text" onClick={() => setEntering(true)}>
        輸入邀請碼
      </button>
      {entering && (
        <Modal title="輸入邀請碼" onClose={() => setEntering(false)}>
          <p className="small muted">輸入朋友的邀請碼，即可獲得 {INVITEE_COINS} 金幣。</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim().toUpperCase() === mine) return notify('不能輸入自己的邀請碼喔。');
              notify('邀請功能要連線核對，會在 App 上架後開放。');
              setEntering(false);
            }}
          >
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9a-z]/gi, '').slice(0, 8))} placeholder="例：K3F9Q2MA" aria-label="邀請碼" autoFocus />
            <button className="primary wide" type="submit" disabled={code.length < 8}>
              確認
            </button>
          </form>
          <p className="small muted center-text">每個人只能輸入一組邀請碼</p>
        </Modal>
      )}
    </section>
  );
}
