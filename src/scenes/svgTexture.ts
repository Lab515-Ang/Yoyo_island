// 把 SVG 圖（臨時動物圖；美術圖到位後換成圖片）畫成 three.js 貼圖。
// 所有 3D 畫面（森林場景、圖鑑地圖）共用同一份快取：換頁重開不用重畫，也不會一直累積貼圖。
import { useEffect, useState } from 'react';
import * as THREE from 'three';

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const cache = new Map<string, Promise<THREE.CanvasTexture>>();

/** key 相同就共用同一張貼圖；markup 只在第一次需要時才產生。 */
export function svgTexture(key: string, markup: () => string, size = 256) {
  let p = cache.get(key);
  if (!p) {
    p = loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup())}`).then((img) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d')!.drawImage(img, 0, 0, size, size);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
    p.catch(() => cache.delete(key)); // 失敗的下次再試
    cache.set(key, p);
  }
  return p;
}

export function useSvgTexture(key: string, markup: () => string) {
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    let alive = true;
    svgTexture(key, markup)
      .then((t) => alive && setTex(t))
      .catch(() => undefined); // 圖檔缺漏時不顯示，不影響場景
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return tex;
}
