// 時間守護第一次打開的引導（參考 Forest）：四頁小故事（上方分段進度、手機插圖、像在回話的按鈕）→ 權限清單 → 建立計劃。
import { useEffect, useState } from 'react';
import { Camera, ChevronLeft, Gamepad2, Lock, MessageCircle, Music, Play, ShieldCheck, ShoppingBag, X } from 'lucide-react';
import { AnimalArt } from './Animal';
import { PermList, type PermItem } from './DeepSetup';
import { TimeGuard, onResume } from '../platform';

const SEEN_KEY = 'qiguang-ui:guardIntroSeen'; // 介面偏好：引導看過了（之後直接進時間守護頁）

export const guardIntroSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
};

const APPS = [Play, Camera, MessageCircle, Music, ShoppingBag, Gamepad2];
const STORY = [
  { title: '今天已經滑了\n多久手機？', reply: '好像…有點久' },
  { title: '點開一下，\n半小時就不見了', reply: '我也常這樣' },
  { title: '小島可以幫你\n守住時間', sub: '打開常滑的 App 時，小島會先請你停一下、深呼吸，再決定要不要用。', reply: '怎麼做？' },
  { title: '把常滑的 App\n交給小島守護吧', reply: '開始設定' },
];
const ITEMS: PermItem[] = [
  { key: 'usage', title: '允許查看使用情況', why: '知道你打開了哪個 App、用了多久', need: true, open: () => TimeGuard.openUsageSettings() },
  { key: 'overlay', title: '允許顯示在其他應用程式上層', why: '打開守護中的 App 時，把小島叫到前面請你停一下', need: true, open: () => TimeGuard.openOverlaySettings() },
];

/** 手機插圖：每一頁一個小場景（純 CSS 動畫，低動態效果時停住）。 */
function Phone({ step, petId, petStage }: { step: number; petId?: string; petStage: number }) {
  return (
    <div className="gi-phone" aria-hidden="true">
      <span className="gi-notch" />
      {step === 0 && (
        <div className="gi-scene gi-ask">
          <div className="gi-grid dim">{APPS.map((Icon, i) => <span key={i}><Icon size={20} /></span>)}</div>
          <b>?</b>
          <i className="gi-spark" />
          <i className="gi-spark two" />
        </div>
      )}
      {step === 1 && (
        <div className="gi-scene gi-feed">
          <div className="gi-feed-roll">
            {[0, 1, 2, 3, 0, 1, 2, 3].map((c, i) => (
              <div key={i} className={`gi-post c${c}`}>
                <span />
                <i />
                <i className="short" />
              </div>
            ))}
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="gi-scene gi-pet">
          <span className="gi-shield">
            <ShieldCheck size={30} />
          </span>
          {petId ? <AnimalArt id={petId} stage={petStage} size={120} /> : <span className="gi-sprout">🌱</span>}
        </div>
      )}
      {step === 3 && (
        <div className="gi-scene gi-lock">
          <div className="gi-grid">
            {APPS.map((Icon, i) => (
              <span key={i} className={i % 2 ? '' : 'locked'}>
                <Icon size={20} />
                {i % 2 ? null : (
                  <em>
                    <Lock size={10} />
                  </em>
                )}
              </span>
            ))}
          </div>
          <div className="gi-pop">
            <strong>先停一下</strong>
            <small>深呼吸 5 秒</small>
          </div>
        </div>
      )}
    </div>
  );
}

/** onDone(ready)：ready 表示權限都開好了，接著建立計劃。 */
export function GuardIntro({ petId, petStage, onDone }: { petId?: string; petStage: number; onDone: (ready: boolean) => void }) {
  const [step, setStep] = useState(0); // 0～3 小故事、4 權限
  const [perm, setPerm] = useState<{ usage: boolean; overlay: boolean } | null>(null);
  useEffect(() => {
    const load = () => void TimeGuard.status().then(setPerm).catch(() => setPerm({ usage: false, overlay: false }));
    load();
    return onResume(load); // 從系統設定回來時更新勾選
  }, []);
  const finish = (ready: boolean) => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // 只影響下次會不會再出現
    }
    onDone(ready);
  };
  const ready = !!perm?.usage && !!perm.overlay;
  const story = STORY[step];

  return (
    <div className="gi" role="dialog" aria-modal="true" aria-label="時間守護引導">
      <div className="gi-top">
        {/* data-back：Android 返回鍵會按這顆 */}
        <button className="icon-btn" data-back onClick={() => (step > 0 ? setStep(step - 1) : finish(false))} aria-label={step > 0 ? '上一步' : '關閉'}>
          {step > 0 ? <ChevronLeft size={22} aria-hidden="true" /> : <X size={20} aria-hidden="true" />}
        </button>
        <div className="gi-progress" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>
      </div>

      {story ? (
        <div className="gi-page" key={step}>
          <h1>{story.title}</h1>
          {story.sub && <p className="muted">{story.sub}</p>}
          <Phone step={step} petId={petId} petStage={petStage} />
          {/* 回話按鈕等插圖演完才浮出來 */}
          <button className="primary wide gi-reply" onClick={() => setStep(step + 1)}>
            {story.reply}
          </button>
        </div>
      ) : (
        <div className="gi-page gi-perm" key="perm">
          <h1>啟用時間守護</h1>
          <p className="muted">開好下面兩個權限，小島就能開始幫你守住時間。</p>
          <PermList items={ITEMS} perm={perm} />
          <div className="gi-promise">
            <strong>小島不會：</strong>
            <span>讀取 App 裡的內容</span>
            <span>記錄你的個人資料</span>
            <span>把資料傳出這支手機</span>
          </div>
          <button className="primary wide" disabled={!ready} onClick={() => finish(true)}>
            {ready ? '完成，建立守護計劃' : '開好兩個權限後就能開始'}
          </button>
          <button className="link" onClick={() => finish(false)}>
            之後再說
          </button>
        </div>
      )}
    </div>
  );
}
