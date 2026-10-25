// 推薦意願問卷：0–10 分，選了分數才出現「哪裡可以更好」；送出後顯示感謝。
// ponytail: 還沒有伺服器，回饋先存在這台裝置（介面偏好），之後接上伺服器再上傳。
import { useEffect, useState } from 'react';
import { useSave } from '../app/store';
import type { FeedbackMeta } from '../domain/feedback';
import { Modal } from './ui';

const KEY = 'qiguang-ui:feedback';
type Stored = FeedbackMeta & { answers: { at: number; score: number; text: string }[] };

export function loadFeedback(): Stored {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && Array.isArray(v.answers)) return v;
  } catch {
    // 讀不到就當作沒問過
  }
  return { askedAt: null, answeredAt: null, answers: [] };
}
function saveFeedback(v: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // 只影響下次什麼時候再問
  }
}

export function FeedbackSheet({ onClose }: { onClose: () => void }) {
  const { notify } = useSave();
  const [score, setScore] = useState<number | null>(null);
  const [text, setText] = useState('');
  useEffect(() => saveFeedback({ ...loadFeedback(), askedAt: Date.now() }), []);
  const send = () => {
    const v = loadFeedback();
    saveFeedback({ ...v, answeredAt: Date.now(), answers: [...v.answers, { at: Date.now(), score: score!, text: text.trim() }] });
    notify('感謝你的回饋！');
    onClose();
  };
  return (
    <Modal title="給我們一點回饋" onClose={onClose}>
      <div className="nps">
        <p>
          <strong>你有多大的可能會向朋友或同學推薦棲光小島？</strong>
        </p>
        <div className="nps-scale" aria-hidden="true">
          {Array.from({ length: 11 }, (_, i) => (
            <span key={i} className={score === i ? 'on' : ''}>
              {i}
            </span>
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={score ?? 5}
          className={score === null ? 'nps-range unset' : 'nps-range'}
          style={{ '--fill': `${(score ?? 0) * 10}%` } as React.CSSProperties}
          onChange={(e) => setScore(Number(e.target.value))}
          onPointerDown={(e) => score === null && setScore(Math.round(((e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.offsetWidth) * 10))}
          aria-label="推薦的可能性，0 到 10 分"
          aria-valuetext={score === null ? '還沒選' : `${score} 分`}
        />
        <div className="nps-ends small muted" aria-hidden="true">
          <span>不太可能</span>
          <span>非常可能</span>
        </div>
        {score !== null && (
          <label className="nps-text">
            你覺得棲光小島有哪些地方可以做得更好？
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="歡迎分享你的想法（選填）" />
          </label>
        )}
        <button className="primary" disabled={score === null} onClick={send}>
          送出
        </button>
        <button className="link" onClick={onClose}>
          略過
        </button>
      </div>
    </Modal>
  );
}
