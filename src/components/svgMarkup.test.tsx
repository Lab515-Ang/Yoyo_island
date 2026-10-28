import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ANIMALS } from '../content/config';
import { AnimalArt, TrackArt } from './Animal';
import { svgMarkup } from './svgMarkup';

// 自己寫的轉字串要和 React 輸出一模一樣（動物格子、分享圖、3D 貼圖都靠它）
describe('svgMarkup', () => {
  it('每種動物、每個階段、探索中與被嚇跑的樣子都和 renderToStaticMarkup 一樣', () => {
    for (const a of ANIMALS) {
      for (const stage of [0, 1, 2]) {
        for (const el of [<AnimalArt id={a.id} stage={stage} size={96} />, <AnimalArt id={a.id} stage={stage} size="100%" hidden />, <TrackArt id={a.id} stage={stage} progress={0} size={100} />, <TrackArt id={a.id} stage={stage} progress={0.6} size={100} />, <TrackArt id={a.id} fled size={170} />]) {
          expect(svgMarkup(el)).toBe(renderToStaticMarkup(el));
        }
      }
    }
  });

  it('屬性、style、跳脫字元', () => {
    const el = (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" className="a" aria-hidden="true">
        <text x={1} fontSize={3} textAnchor="middle" style={{ fontWeight: 700, fill: 'red', marginTop: 4, opacity: 0.5 }}>
          {'a<b&"c\''}
        </text>
        {false}
        {null}
        <>
          <stop offset="0" stopColor="#fff" stopOpacity={0.5} />
        </>
      </svg>
    );
    expect(svgMarkup(el)).toBe(renderToStaticMarkup(el));
  });
});
