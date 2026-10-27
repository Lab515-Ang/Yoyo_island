import { useState } from 'react';
import { Coin } from './ui';

const SLIDES = [
  { icon: '⏳', title: '為自己留一段時間', text: '選好時間按「開始專注」，每段 10～180 分鐘。開始後 10 秒內可以免費取消；之後提前放棄，動物會被嚇跑、也沒有獎勵。' },
  { icon: '🔭', title: '每段專注是一次探索', text: '開始前選想找的動物，專注時牠會慢慢靠近，完成就遇見台灣的保育類動物。同一種遇見越多次，族群越穩定，會從幼年慢慢看到成年的牠。' },
  { icon: '🌲', title: '專注會修復森林', text: '專注的每一分鐘都會自動投入森林的修復工程。每修好一個工程，就會解鎖新的動物。' },
  { icon: null, title: '金幣由你決定怎麼花', text: '金幣可以在商店解鎖更多動物的探索路線。遇見的動物都會記進「我的歷程」的觀察圖鑑。' },
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
