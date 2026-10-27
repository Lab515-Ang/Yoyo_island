import { useEffect, useState, type ReactNode } from 'react';
import { useGame } from '../app/store';
import { AVATARS } from '../content/config';
import { AnimalArt, TrackArt } from '../components/Animal';
import { Modal } from '../components/ui';
import { startFocus } from '../domain/game';
import { newSave, validateSave } from '../domain/save';
import { minimizeApp, onBack } from '../platform';

/**
 * 新手引導（參考 Forest 的開場）：首頁 → 三頁小故事（第一頁自己動手「開始觀察」）→ 怎麼稱呼你 → 第一段專注。
 * 全螢幕、按鈕固定在下方。不需要帳號；之後有伺服器再加登入。
 */
export function Onboarding() {
  const { replace, update } = useGame();
  const [step, setStep] = useState(0); // 0 首頁、1～3 小故事、4 名字、5 第一段專注
  const [nickname, setNickname] = useState('');
  const [islandName, setIslandName] = useState('');
  const [avatarId, setAvatarId] = useState(AVATARS[0].id);
  const [task, setTask] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Android 返回鍵：先關隱私權說明，再回上一步，首頁才回到桌面（不要直接退出、弄丟填到一半的資料）
  useEffect(() => onBack(() => (privacy ? setPrivacy(false) : step > 0 ? setStep(step - 1) : minimizeApp())), [privacy, step]);

  const create = () => replace(newSave('personal', { nickname: nickname.trim() || '照護者', islandName: islandName.trim() || '我的小島', avatarId }, Date.now()));
  const restore = async (file?: File) => {
    if (!file) return;
    setRestoreError(null);
    try {
      const v = validateSave(JSON.parse(await file.text()));
      if (!v.ok) return setRestoreError(`無法還原：${v.error}`);
      if (v.save.mode !== 'personal') return setRestoreError('這是示範存檔，不能當成你的小島。');
      replace(v.save);
    } catch {
      setRestoreError('讀不到這個檔案，請選擇從「設定 → 資料」匯出的備份。');
    }
  };

  if (step === 0)
    return (
      <div className="ob ob-landing">
        <div className="ob-hero" aria-hidden="true">
          <div className="ob-hero-island">
            <AnimalArt id="blue_magpie" size={96} />
            <AnimalArt id="pangolin" size={84} />
            <AnimalArt id="scops_owl" size={88} />
          </div>
        </div>
        <div className="ob-body">
          <h1>
            還在拖延嗎？
            <br />
            讓棲光小島陪你專注。
          </h1>
          <p className="muted">每一段專注，都是一次走進台灣森林的探索。</p>
        </div>
        <div className="ob-actions">
          <button className="primary wide" onClick={() => setStep(1)}>
            開始探索
          </button>
          <label className="button-like ob-restore">
            從備份還原小島
            <input type="file" accept="application/json,.json" hidden onChange={(e) => void restore(e.target.files?.[0])} />
          </label>
          {restoreError && <p className="error small">{restoreError}</p>}
          <p className="small muted center-text">
            繼續使用即表示你已閱讀
            <button className="link inline" onClick={() => setPrivacy(true)}>
              隱私權說明
            </button>
          </p>
        </div>
        {privacy && <PrivacyNote onClose={() => setPrivacy(false)} />}
      </div>
    );

  if (step <= 3)
    return (
      <Story step={step} onBack={() => setStep(step - 1)} onNext={() => setStep(step + 1)}>
        {step === 1 ? <Observe /> : step === 2 ? <Approach /> : <Record />}
      </Story>
    );

  if (step === 4)
    return (
      <form
        className="ob"
        onSubmit={(e) => {
          e.preventDefault();
          setStep(5);
        }}
      >
        <Top onBack={() => setStep(3)} />
        <div className="ob-body ob-form">
          <h1>怎麼稱呼你？</h1>
          <p className="muted">不用註冊帳號，紀錄都只存在這支手機。</p>
          <label>
            暱稱
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} placeholder="例如：小晴" />
          </label>
          <label>
            島名
            <input value={islandName} onChange={(e) => setIslandName(e.target.value)} maxLength={20} placeholder="我的小島" />
          </label>
          <fieldset>
            <legend>頭像</legend>
            <div className="avatar-grid">
              {AVATARS.map((a) => (
                <button type="button" key={a.id} className={a.id === avatarId ? 'avatar-opt selected' : 'avatar-opt'} aria-pressed={a.id === avatarId} aria-label={a.label} onClick={() => setAvatarId(a.id)}>
                  {a.emoji}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="ob-actions">
          <button className="primary wide" type="submit">
            下一步
          </button>
        </div>
      </form>
    );

  return (
    <form
      className="ob"
      onSubmit={(e) => {
        e.preventDefault();
        if (!create()) return;
        update((s) => startFocus(s, { taskTitle: task, tag: '其他', habitatId: 'forest', mode: 'countdown', targetSeconds: 10 * 60 }, Date.now()));
      }}
    >
      <Top onBack={() => setStep(4)} />
      <div className="ob-body ob-form">
        <div className="ob-art" aria-hidden="true">
          <TrackArt id="blue_magpie" progress={0.3} size={150} />
        </div>
        <h1>第一次探索，先試 10 分鐘</h1>
        <p className="muted">完成就會在森林裡遇見台灣藍鵲，而且這 10 分鐘剛好能清出森林的步道。</p>
        <label>
          這段時間要做什麼？（可不填）
          <input value={task} onChange={(e) => setTask(e.target.value)} maxLength={40} placeholder="例如：讀完一頁筆記" />
        </label>
      </div>
      <div className="ob-actions">
        <button className="primary wide" type="submit">
          開始 10 分鐘專注
        </button>
        <button type="button" className="link" onClick={create}>
          先逛逛小島
        </button>
      </div>
    </form>
  );
}

function Top({ step, onBack }: { step?: number; onBack: () => void }) {
  return (
    <div className="ob-top">
      <button type="button" className="icon-btn" onClick={onBack} aria-label="上一步">
        ‹
      </button>
      {step !== undefined && (
        <div className="ob-steps" aria-label={`第 ${step} / 3 頁`}>
          {[1, 2, 3].map((k) => (
            <span key={k} className={k <= step ? 'on' : ''} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 小故事的一頁：上方進度、中間內容、下方按鈕。 */
function Story({ step, onBack, onNext, children }: { step: number; onBack: () => void; onNext: () => void; children: ReactNode }) {
  return (
    <div className="ob">
      <Top step={step} onBack={onBack} />
      <div key={step} className="ob-body ob-story">
        {children}
      </div>
      <div className="ob-actions">
        <button className="primary wide" onClick={onNext} data-story-next>
          {step === 3 ? '馬上開始' : '下一步'}
        </button>
      </div>
    </div>
  );
}

/** 第 1 頁：自己按望遠鏡，看剪影慢慢現出顏色（Forest 是「向下滑動種苗」）；不按也可以直接下一步。 */
function Observe() {
  const [p, setP] = useState(0);
  const [going, setGoing] = useState(false);
  useEffect(() => {
    if (!going || p >= 1) return;
    const id = setTimeout(() => setP((x) => Math.min(1, x + 0.1)), 120);
    return () => clearTimeout(id);
  }, [going, p]);
  return (
    <>
      <h1>歡迎來到棲光小島！</h1>
      <p className="muted">需要專注時，就出發去找一隻台灣的保育動物。</p>
      <div className="ob-art">
        <TrackArt id="blue_magpie" progress={p} size={180} />
      </div>
      {p < 1 ? (
        <button className="ob-scope" onClick={() => setGoing(true)} disabled={going} aria-label="按下望遠鏡開始觀察">
          🔭 <span>{going ? '觀察中…' : '按一下望遠鏡，開始觀察'}</span>
        </button>
      ) : (
        <p className="ob-found">遇見台灣藍鵲了！</p>
      )}
    </>
  );
}

/** 第 2 頁：專注越久越靠近；中途離開會被嚇跑。 */
function Approach() {
  return (
    <>
      <h1>專注越久，牠就越靠近</h1>
      <p className="muted">中途離開，牠就會被嚇跑。</p>
      <div className="ob-pair">
        <figure>
          <TrackArt id="pangolin" progress={0.7} size={120} />
          <figcaption>專注中・慢慢靠近</figcaption>
        </figure>
        <figure>
          <TrackArt id="pangolin" fled size={110} />
          <figcaption>提前放棄・被嚇跑</figcaption>
        </figure>
      </div>
      <p className="small muted">開始後 10 秒內可以免費取消；深度專注時，離開小島太久也會把牠嚇跑。</p>
    </>
  );
}

/** 第 3 頁：每次專注都會留下紀錄，你將可以…（Forest 的三個勾）。 */
function Record() {
  return (
    <>
      <h1>每次專注都會留下紀錄</h1>
      <p className="muted">遇見的動物會留在觀察圖鑑裡，你將可以…</p>
      <ul className="ob-checks">
        <li>✓ 看見自己的專注時間</li>
        <li>✓ 收集台灣的保育動物</li>
        <li>✓ 一步步修復整座森林</li>
      </ul>
      <div className="ob-grid" aria-hidden="true">
        {['blue_magpie', 'scops_owl', 'pangolin', 'pitta', 'leopard_cat', 'swinhoe_pheasant', 'crab_mongoose', 'black_bear'].map((id, i) => (
          <AnimalArt key={id} id={id} stage={i % 3} size={64} />
        ))}
      </div>
    </>
  );
}

/** 隱私權說明（上架前要換成正式的隱私權政策網址）。 */
export function PrivacyNote({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="隱私權說明" onClose={onClose}>
      <ul className="privacy-list">
        <li>棲光小島不需要帳號，也不會把你的資料傳到網路上。</li>
        <li>專注紀錄、筆記、圖鑑都只存在這支手機；你可以在「設定 → 資料」自己匯出備份。</li>
        <li>時間守護與深度專注需要「使用情況存取權」：只用來判斷目前前景是哪個 App，不讀取任何內容。</li>
        <li>「顯示在其他應用程式上層」只用來在專注中把你帶回小島；通知只用來提醒與顯示倒數。</li>
        <li>回饋問卷的內容目前也只存在這支手機。</li>
      </ul>
      <button className="primary wide" onClick={onClose}>
        我知道了
      </button>
    </Modal>
  );
}
