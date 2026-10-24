import { useState } from 'react';
import { useGame } from '../app/store';
import { APP_NAME, AVATARS, COPY } from '../content/config';
import { startFocus } from '../domain/game';
import { newSave } from '../domain/save';

/** 新手：暱稱、島名、頭像 → 第一段專注（最低 10 分鐘，完成後足夠修好第一個工程）。不需登入。
 *  導覽不放在這裡：先讓玩家專注一次，第一次回到大廳時再看（見 App 的 FirstTour）。 */
export function Onboarding() {
  const { replace, update } = useGame();
  const [step, setStep] = useState<1 | 2>(1);
  const [nickname, setNickname] = useState('');
  const [islandName, setIslandName] = useState('');
  const [avatarId, setAvatarId] = useState(AVATARS[0].id);
  const [task, setTask] = useState('');

  const create = () => replace(newSave('personal', { nickname: nickname.trim() || '照護者', islandName: islandName.trim() || '我的小島', avatarId }, Date.now()));

  return (
    <div className="app">
      <div className="onboarding card">
        {step === 1 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStep(2);
            }}
          >
            <p className="eyebrow">{APP_NAME}</p>
            <h1>你好，島嶼照護者</h1>
            <p className="muted">這座小島缺少照護很久了。你在現實裡的每一段專注，都會變成修復它的力量。</p>
            <label>
              暱稱
              <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} placeholder="例如：小晴" autoFocus />
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
            <button className="primary wide" type="submit">
              下一步
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!create()) return;
              update((s) => startFocus(s, { taskTitle: task, tag: '其他', habitatId: 'greenhouse', mode: 'countdown', targetSeconds: 10 * 60 }, Date.now()));
            }}
          >
            <p className="eyebrow">第一段專注</p>
            <h1>{COPY.start}</h1>
            <p className="muted">先試試 10 分鐘。完成後會得到 10 點成長點數，足夠整理溫室入口，還會收到一顆寵物的卵。</p>
            <label>
              這段時間要做什麼？（可不填）
              <input value={task} onChange={(e) => setTask(e.target.value)} maxLength={40} placeholder="例如：讀完一頁筆記" autoFocus />
            </label>
            <button className="primary wide" type="submit">
              開始 10 分鐘專注
            </button>
            <button type="button" className="ghost wide" onClick={create}>
              先看看小島
            </button>
            <button type="button" className="link" onClick={() => setStep(1)}>
              ← 返回修改
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
