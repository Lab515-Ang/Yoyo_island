import { useState } from 'react';
import { Coin } from './ui';

const SLIDES = [
  { icon: '⏳', title: '為自己留一段時間', text: '選好時間按「開始專注」，每段 10～180 分鐘。專注時你選的植物會跟著長大，完成後種進今天的花圃。開始後 10 秒內可以免費取消；之後提前放棄，植物會枯萎、也沒有獎勵。' },
  { icon: '🏝️', title: '專注會修復小島', text: '專注的每一分鐘，都會自動變成成長點數投入修復工程。花圃、噴泉、溪流會一點一點恢復，每完成 25% 就看得到變化。' },
  { icon: '🥚', title: '也會養大你的寵物', text: '專注同時會得到飼料，自動餵給你的陪伴寵物。修好第一個工程就送你一顆卵，孵化時會揭曉牠的表情。' },
  { icon: null, title: '金幣由你決定怎麼花', text: '金幣可以在商店領養新寵物、買設施多養幾隻。專注時偶爾還會偶遇野生生物，收進圖鑑。' },
];

/** 新手導覽：四頁說明整個循環，可略過；設定裡可以再看一次。 */
export function Tour({ onDone, doneLabel = '開始吧' }: { onDone: () => void; doneLabel?: string }) {
  const [i, setI] = useState(0);
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;
  return (
    <div className="tour">
      <div className="tour-icon" aria-hidden="true">
        {s.icon ?? <Coin />}
      </div>
      <p className="eyebrow">
        {i + 1} / {SLIDES.length}
      </p>
      <h2>{s.title}</h2>
      <p className="muted">{s.text}</p>
      <div className="tour-dots" aria-hidden="true">
        {SLIDES.map((_, k) => (
          <span key={k} className={k === i ? 'on' : ''} />
        ))}
      </div>
      <div className="row center">
        {!last && (
          <button className="ghost" onClick={onDone}>
            略過
          </button>
        )}
        <button className="primary" onClick={() => (last ? onDone() : setI(i + 1))}>
          {last ? doneLabel : '下一步'}
        </button>
      </div>
    </div>
  );
}
