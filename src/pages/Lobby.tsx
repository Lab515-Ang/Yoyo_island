import { useRef, useState, type CSSProperties } from 'react';
import { useSave } from '../app/store';
import { ANIMALS, MAX_FOCUS_MINUTES, MIN_FOCUS_MINUTES, TAGS, animalDef, animalRegion, clampMinutes, projectDef, regionDef, tagColor, type AnimalDef } from '../content/config';
import { LEAVE_MS, Modal, SHEET_OUT_MS, fmtMinutes } from '../components/ui';
import { AnimalArt, TrackArt } from '../components/Animal';
import { GrowthTag, RegionFlag, unlockText } from '../components/ui';
import { activeProject, animalUnlocked, animalsUnlockedBy, chosenAnimal, currentHabitat, growthOf, regionOpen, hatchCounts, newAnimals, remainingFor, startFocus } from '../domain/game';
import { DEEP_GRACE_MS, TimeGuard, isAndroid, isNative, requestNotifyPermission, type GuardApp } from '../platform';
import { AppPicker } from './Guard';
import { DeepSetup, deepPerm, deepSetupSeen } from '../components/DeepSetup';
import { ChevronDown, PencilLine } from 'lucide-react';

type Sheet = 'tag' | 'title' | 'time' | 'egg' | 'plus' | 'allow' | 'deep' | 'deepInfo' | null;

/** 首頁大廳（參考 Forest 構圖）：左上標籤與標題、中央棲地泡泡、大字時間、開始按鈕；細項點了才展開。 */
export function Lobby({ onStarted, onShop }: { onStarted: () => void; onShop: () => void }) {
  const { save, update, mode } = useSave();
  const st = save.settings;
  const [task, setTask] = useState('');
  // 標籤預設沿用上一段專注的（標籤被刪掉的話回到第一個）
  const [tag, setTag] = useState(() => {
    const last = [...save.sessions].reverse().find((s) => s.userId === save.profile.id)?.tag;
    return last && (TAGS.includes(last) || st.customTags.includes(last)) ? last : TAGS[0];
  });
  // 舊存檔可能記著 5 分鐘：收進 10～180 分鐘（示範的 10 秒例外）
  const [seconds, setSeconds] = useState(mode === 'demo' && st.lastTargetSeconds === 10 ? 10 : clampMinutes(st.lastTargetSeconds / 60) * 60);
  // 選的探索目標直接記進設定：去商店或其他頁再回來也不會跑掉
  const egg = chosenAnimal(save).id;
  // 專注的場景跟著要找的動物住的區域（台灣森林、日本里山…）
  const eggRegion = animalRegion(animalDef(egg));
  const habitat = regionOpen(save, eggRegion) ? regionDef(eggRegion).habitatId : currentHabitat(save);
  const setEgg = (id: string) => update((s) => ({ ...s, settings: { ...s.settings, eggId: id } }));
  const [sheet, setSheet] = useState<Sheet>(null);
  // 關掉底部選單：先讓它滑下去再拿掉；then 是滑完才做的事（例如換探索目標，換的動畫才看得到）
  const [closing, setClosing] = useState(false);
  const closeSheet = (then?: () => void) => {
    setClosing(true);
    window.setTimeout(() => {
      setSheet(null);
      setClosing(false);
      then?.();
    }, SHEET_OUT_MS);
  };
  const [leaving, setLeaving] = useState(false); // 按下開始：大廳先淡出，再進專注畫面
  const [draft, setDraft] = useState('');
  const [custom, setCustom] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [newTag, setNewTag] = useState('');

  const tags = [...TAGS, ...st.customTags];
  const firstTime = !save.sessions.some((s) => s.userId === save.profile.id && s.endedAt);
  const customMin = Number(custom);
  const customValid = Number.isInteger(customMin) && customMin >= MIN_FOCUS_MINUTES && customMin <= MAX_FOCUS_MINUTES;
  const shown = seconds < 60 ? `00:${String(seconds).padStart(2, '0')}` : `${Math.round(seconds / 60)}:00`;

  // 可以去找、但還沒遇見過的動物：標「新」，遇見一次就消失
  const fresh = newAnimals(save);
  const counts = hatchCounts(save);
  // 找動物的清單：已解鎖的不分區域都能選；Plus 專屬另外一區
  const isPlus = (a: AnimalDef) => a.unlock.kind === 'iap';
  const mine = ANIMALS.filter((a) => animalUnlocked(save, a));
  const plus = ANIMALS.filter(isPlus);
  const locked = ANIMALS.filter((a) => !isPlus(a) && !animalUnlocked(save, a) && regionOpen(save, animalRegion(a)));
  // 下一步：第一次就是完成一段專注；之後是目前工程還差多久、修好後誰會回來（1 點＝專注 1 分鐘）
  const project = activeProject(save);
  const back = project ? animalsUnlockedBy(project.id).map((a) => a.name).join('、') : '';
  const nextStep = firstTime
    ? `第一步：完成一段專注，遇見${animalDef(egg).name}`
    : project
      ? `下一步：再專注約 ${fmtMinutes(remainingFor(save, project) * 60_000)}，${project.promise}${back ? `，${back}會回來` : ''}`
      : '森林都修好了！到其他區域的小島看看吧';

  // 深度專注（Android）：預設開；第一段專注先不開，熟悉之後再挑戰
  const deep = isAndroid && st.deepFocus && !firstTime;
  const graceSec = DEEP_GRACE_MS / 1000;
  const toggleAllow = (a: GuardApp) =>
    update((s) => {
      const cur = s.settings.focusAllow;
      return { ...s, settings: { ...s.settings, focusAllow: cur.some((x) => x.pkg === a.pkg) ? cur.filter((x) => x.pkg !== a.pkg) : [...cur, { pkg: a.pkg, label: a.label }] } };
    });

  const begin = (useDeep: boolean) => {
    if (leaving) return;
    setSheet(null);
    setLeaving(true);
    const t = Date.now(); // 從按下的那一刻開始算
    window.setTimeout(() => {
      const next = update((s) => startFocus(s, { taskTitle: task, tag, habitatId: habitat, mode: 'countdown', targetSeconds: seconds, animalId: egg, deep: useDeep, extend: st.extendTimer }, t));
      if (next) onStarted();
      else setLeaving(false);
    }, LEAVE_MS);
  };
  // 深度專注要先等原生端回覆權限：連點兩下不要跑兩次
  const starting = useRef(false);
  const start = async () => {
    if (starting.current) return;
    starting.current = true;
    try {
      await startInner();
    } finally {
      starting.current = false;
    }
  };
  const startInner = async () => {
    // 深度專注：缺「使用情況」（必要）一定要先設定；其他建議的權限只在第一次跳出清單（參考 Forest）
    if (deep) {
      const perm = await deepPerm();
      if (!perm.usage || (!deepSetupSeen() && !(perm.overlay && perm.notify && perm.battery))) return setSheet('deep');
    }
    begin(deep);
  };

  const removeTag = (t: string) => {
    update((s) => ({ ...s, settings: { ...s.settings, customTags: s.settings.customTags.filter((x) => x !== t) } }));
    if (tag === t) setTag(TAGS[0]);
  };
    const addTag = () => {
    const t = newTag.trim();
    setNewTag('');
    if (!t || tags.includes(t)) return;
    update((s) => ({ ...s, settings: { ...s.settings, customTags: [...s.settings.customTags, t].slice(-8) } }));
    setTag(t);
  };

  return (
    <div className={leaving ? 'lobby leaving' : 'lobby'}>
      {/* 這次要做什麼：標籤＋標題 */}
      <div className="lobby-task">
        <button className="tag-chip" onClick={() => setSheet('tag')} aria-label={`標籤：${tag}，點一下更換`}>
          <span className="tag-dot" style={{ background: tagColor(tag) }} aria-hidden="true" />
          {tag}
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        <button
          className={task ? 'title-chip' : 'title-chip empty'}
          onClick={() => {
            setDraft(task);
            setSheet('title');
          }}
        >
          <span>{task || '想專注做什麼？'}</span>
          <PencilLine size={16} aria-hidden="true" />
        </button>
      </div>

      {/* 找誰：整頁漸層，中間一圈是這次的探索目標（還沒出發，只看得到剪影） */}
      <div className="lobby-target">
        <button className="lobby-ring" onClick={() => setSheet('egg')} aria-label={`探索目標：${animalDef(egg).name}${fresh.length ? '，有新的足跡' : ''}，點一下更換`}>
          {/* key：換了探索目標就重新進場（從小彈到大） */}
          <span className="ring-art" key={egg}>
            <TrackArt id={egg} stage={growthOf(save, egg).stage} size="72%" />
          </span>
          {/* 有還沒遇見過的動物可以去找：圓圈右下角一個驚嘆號 */}
          {fresh.length > 0 && (
            <span className="ring-alert" aria-hidden="true">
              !
            </span>
          )}
        </button>
        {/* 下一步：只講一件事，照著做就好（降低學習門檻） */}
        <p className="next-step">{nextStep}</p>
      </div>

      {/* 多久：點數字打開時間設定 */}
      <button className="lobby-time" onClick={() => setSheet('time')} aria-label={`專注時間 ${shown}${deep ? '，深度專注' : ''}，點一下調整`}>
        {shown}
      </button>

      <button className="primary start" onClick={() => void start()}>
        開始專注
      </button>
      <InstallHint />

      {sheet === 'tag' && (
        <Modal title="標籤" onClose={() => setSheet(null)} closing={closing}>
          <div className="sheet-list" role="radiogroup" aria-label="標籤">
            {tags.map((t) => (
              <div key={t} className="tag-row">
                <button
                  role="radio"
                  aria-checked={tag === t}
                  className={tag === t ? 'sheet-row on' : 'sheet-row'}
                  onClick={() => {
                    setTag(t);
                    setSheet(null);
                  }}
                >
                  <span className="tag-dot" style={{ background: tagColor(t) }} aria-hidden="true" />
                  {t}
                </button>
                {/* 自訂標籤可以刪除（舊紀錄的標籤不受影響）；內建標籤不能刪 */}
                {!TAGS.includes(t) && (
                  <button className="icon-btn" onClick={() => removeTag(t)} aria-label={`刪除標籤 ${t}`}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="row">
            <input value={newTag} onChange={(e) => setNewTag(e.target.value)} maxLength={8} placeholder="新增標籤" aria-label="新增標籤" onKeyDown={(e) => e.key === 'Enter' && addTag()} />
            <button onClick={addTag} disabled={!newTag.trim()}>
              ＋ 新增
            </button>
          </div>
          <p className="small muted">自訂標籤最多 8 個；刪除後，用過這個標籤的紀錄仍會保留。</p>
        </Modal>
      )}

      {sheet === 'title' && (
        <Modal title="專注標題" onClose={() => setSheet(null)} closing={closing}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setTask(draft.trim());
              setSheet(null);
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={40} placeholder="例：數學第二章" autoFocus aria-label="專注標題" />
            <button className="primary wide" type="submit">
              完成
            </button>
          </form>
        </Modal>
      )}

      {sheet === 'time' && (
        <Modal title="專注時間" onClose={() => setSheet(null)} closing={closing}>
          {/* 參考 Forest：滑動軌拉時間，另外可以自訂分鐘、開關深度專注 */}
          <div className="time-sheet">
            <p className="time-value">
              {seconds < 60 ? `${seconds} 秒` : `${seconds / 60} 分鐘`}
            </p>
            <input
              type="range"
              min={MIN_FOCUS_MINUTES}
              max={MAX_FOCUS_MINUTES}
              step={5}
              value={Math.max(MIN_FOCUS_MINUTES, Math.round(seconds / 60))}
              onChange={(e) => setSeconds(Number(e.target.value) * 60)}
              aria-label="專注分鐘"
              style={{ '--fill': `${((Math.max(MIN_FOCUS_MINUTES, seconds / 60) - MIN_FOCUS_MINUTES) / (MAX_FOCUS_MINUTES - MIN_FOCUS_MINUTES)) * 100}%` } as CSSProperties}
            />
            <div className="range-ends small muted">
              <span>{MIN_FOCUS_MINUTES} 分</span>
              <span>{MAX_FOCUS_MINUTES} 分</span>
            </div>
            {customOpen ? (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!customValid) return;
                  setSeconds(customMin * 60);
                  setCustom('');
                  setCustomOpen(false);
                }}
              >
                <input className="short" inputMode="numeric" autoFocus value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ''))} placeholder={`${MIN_FOCUS_MINUTES}～${MAX_FOCUS_MINUTES}`} aria-label={`自訂分鐘（${MIN_FOCUS_MINUTES}～${MAX_FOCUS_MINUTES}）`} />
                <span className="small">分鐘</span>
                <button type="submit" disabled={!customValid}>
                  設定
                </button>
              </form>
            ) : (
              <div className="row center">
                <button onClick={() => setCustomOpen(true)}>
                  <PencilLine size={16} aria-hidden="true" /> 自訂
                </button>
                {mode === 'demo' && (
                  <button className="demo" onClick={() => setSeconds(10)}>
                    10 秒（示範）
                  </button>
                )}
              </div>
            )}
            {isAndroid && (
              <div className="deep-box">
                <label className="toggle switch-row">
                  <strong>深度專注</strong>
                  <input type="checkbox" role="switch" className="switch" checked={st.deepFocus} onChange={(e) => update((s) => ({ ...s, settings: { ...s.settings, deepFocus: e.target.checked } }))} />
                </label>
                <p className="small muted">
                  離開棲光小島超過 {graceSec} 秒，動物就會被嚇跑。
                  {firstTime && st.deepFocus ? '（第一段專注先不開，下次開始生效）' : ''}
                </p>
                {st.deepFocus && (
                  <div className="row">
                    <button className="link" onClick={() => setSheet('allow')}>
                      可以用的 App{st.focusAllow.length ? `（${st.focusAllow.length}）` : ''} ›
                    </button>
                    <button className="link" onClick={() => setSheet('deepInfo')}>
                      需要的權限 ›
                    </button>
                  </div>
                )}
              </div>
            )}
            <button className="primary wide" onClick={() => setSheet(null)}>
              完成
            </button>
          </div>
        </Modal>
      )}

      {sheet === 'allow' && (
        <Modal title="深度專注時可以使用的 App" onClose={() => setSheet('time')}>
          <p className="small muted">例如字典、計算機、音樂。打開這些 App 不算離開小島。</p>
          <AppPicker selected={st.focusAllow} onToggle={toggleAllow} />
          <button className="primary wide" onClick={() => setSheet('time')}>
            完成
          </button>
        </Modal>
      )}

      {(sheet === 'deep' || sheet === 'deepInfo') && (
        <DeepSetup
          onClose={() => setSheet(sheet === 'deepInfo' ? 'time' : null)}
          onStart={sheet === 'deep' ? () => (setSheet(null), begin(true)) : undefined}
          onDisable={() => {
            update((s) => ({ ...s, settings: { ...s.settings, deepFocus: false } }));
            setSheet(null);
            begin(false);
          }}
        />
      )}

      {sheet === 'egg' && (
        <Modal title="這次想去找誰？" onClose={() => setSheet(null)} closing={closing}>
          <p className="small muted">專注時牠會慢慢靠近，完成就遇見牠，留下一筆觀察紀錄；提前放棄牠就被嚇跑了。同一種動物遇見越多次，族群越穩定，看到的就越成熟（60 分鐘以上的探索算 2 點成長）。</p>
          {/* 我的動物：已經可以去找的（不分區域） */}
          <h3 className="pick-head">我的動物</h3>
          <div className="plant-pick" role="radiogroup" aria-label="我的動物">
            {mine.map((a) => {
              const g = growthOf(save, a.id);
              const met = (counts.get(a.id) ?? 0) > 0;
              return (
                <button
                  key={a.id}
                  role="radio"
                  aria-checked={egg === a.id}
                  className={egg === a.id ? 'plant-option on' : 'plant-option'}
                  onClick={() => closeSheet(() => setEgg(a.id))}
                >
                  <RegionFlag id={a.id} />
                  {met ? <AnimalArt id={a.id} stage={g.stage} size={56} /> : <TrackArt id={a.id} size={56} />}
                  <span>
                    {a.name}
                    {fresh.includes(a) && <span className="new-badge">新</span>}
                  </span>
                  {met ? <GrowthTag a={a} g={g} /> : <span className="small muted">還沒遇見過</span>}
                </button>
              );
            })}
          </div>
          {/* Plus 會員專屬：直接給看彩色的樣子，點了介紹 Plus 會員 */}
          <h3 className="pick-head">更多動物</h3>
          <div className="plus-divider">
            <span>PLUS</span>
          </div>
          <div className="plant-pick">
            {plus.map((a) => (
              <button key={a.id} className="plant-option plus" onClick={() => setSheet('plus')}>
                <RegionFlag id={a.id} />
                <AnimalArt id={a.id} size={56} />
                <span>{a.name}</span>
                <span className="small muted">Plus 會員專屬</span>
              </button>
            ))}
          </div>
          {locked.length > 0 && (
            <>
              <h3 className="pick-head">還沒解鎖</h3>
              <div className="plant-pick">
                {locked.map((a) => (
                  // 修復工程或商店（金幣、寶石）解鎖的動物：點了去商店
                  <button
                    key={a.id}
                    className="plant-option"
                    onClick={() => closeSheet(onShop)}
                  >
                    <RegionFlag id={a.id} />
                    <AnimalArt id={a.id} size={56} hidden />
                    <span>{a.name}</span>
                    <span className="small muted">{shortUnlock(a)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}

      {sheet === 'plus' && <PlusSheet onClose={() => setSheet('egg')} />}

    </div>
  );
}

/** 清單格子裡的短版解鎖方式（完整說明在商店）。 */
const shortUnlock = (a: AnimalDef) => {
  const u = a.unlock;
  if (u.kind === 'project') return `修好「${projectDef(u.id)?.title}」`;
  if (u.kind === 'coins') return `商店 ${u.price} 金幣`;
  if (u.kind === 'gems') return `商店 ${u.price} 寶石`;
  return unlockText(a);
};

/** Plus 會員介紹：還沒有訂閱系統，上架後才開放購買。 */
function PlusSheet({ onClose }: { onClose: () => void }) {
  const plus = ANIMALS.filter((a) => a.unlock.kind === 'iap');
  return (
    <Modal title="棲光 Plus 會員" onClose={onClose} className="plus-modal">
      <div className="plus-hero" aria-hidden="true">
        {plus.slice(0, 4).map((a) => (
          <AnimalArt key={a.id} id={a.id} size={64} />
        ))}
      </div>
      <ul className="plus-perks">
        <li>解鎖 {plus.length} 種 Plus 專屬保育動物，之後新增的也包含在內</li>
        <li>每月贈送寶石</li>
        <li>支持保育專案的推廣</li>
      </ul>
      <button className="primary" disabled>
        上架後開放訂閱
      </button>
      <p className="small muted center">目前是測試版，還不能購買。</p>
    </Modal>
  );
}

const HINT_KEY = 'qiguang-ui:installHintDismissed';
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** 還沒加到主畫面時提醒：瀏覽器可能清掉網站資料，安裝後比較安全。 */
function InstallHint() {
  const [hidden, setHidden] = useState(() => {
    try {
      return isNative || standalone() || localStorage.getItem(HINT_KEY) === '1';
    } catch {
      return true;
    }
  });
  const [how, setHow] = useState(false);
  if (hidden) return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return (
    <div className="install-hint">
      <p className="small">
        把棲光小島加到主畫面：可以全螢幕使用，進度也比較不會被瀏覽器清掉。
        <button className="link" onClick={() => setHow(!how)}>
          怎麼加？
        </button>
      </p>
      {how && <p className="small">{ios ? 'iPhone：用 Safari 打開 → 下方分享按鈕 □↑ → 「加入主畫面」。' : 'Android：Chrome 右上角 ⋮ → 「安裝應用程式」或「加到主畫面」。'}</p>}
      <button
        className="link"
        onClick={() => {
          try {
            localStorage.setItem(HINT_KEY, '1');
          } catch {
            // 只影響提示是否再出現
          }
          setHidden(true);
        }}
      >
        知道了
      </button>
    </div>
  );
}
