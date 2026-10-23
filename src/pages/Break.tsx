import { useEffect, useRef, useState } from 'react';
import { useNow, useSave } from '../app/store';
import { playChime } from '../sound';

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** 休息一下：短暫的休息倒數，不算專注、沒有獎勵，也不留紀錄。 */
export function Break({ onDone }: { onDone: () => void }) {
  const { save } = useSave();
  const [endsAt, setEndsAt] = useState(() => Date.now() + 5 * 60000);
  const now = useNow(250);
  const left = Math.max(0, endsAt - now);
  const rang = useRef(false);

  useEffect(() => {
    if (left > 0 || rang.current) return;
    rang.current = true;
    if (save.settings.endChime) playChime(save.settings.soundVolume);
  }, [left, save.settings.endChime, save.settings.soundVolume]);

  const restart = (min: number) => {
    rang.current = false;
    setEndsAt(Date.now() + min * 60000);
  };

  return (
    <div className="result break">
      <p className="result-title">{left > 0 ? '休息一下' : '休息結束'}</p>
      <p className="result-sub">{left > 0 ? '起來走走、喝口水、看看遠方。' : '準備好了，就回到小島開始下一段吧。'}</p>
      <p className="break-time" role="timer" aria-label="休息剩餘時間">
        {clock(left)}
      </p>
      <div className="chips" role="group" aria-label="休息時間">
        {[5, 10, 15].map((m) => (
          <button key={m} className="chip" onClick={() => restart(m)}>
            {m} 分鐘
          </button>
        ))}
      </div>
      <div className="result-actions">
        <button className="pill wide" onClick={onDone}>
          {left > 0 ? '結束休息' : '返回首頁'}
        </button>
      </div>
    </div>
  );
}
