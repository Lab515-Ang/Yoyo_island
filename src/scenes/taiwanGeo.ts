// 立體台灣（觀察圖鑑的地圖）：海岸線、投影、山脈高度。都是簡化的示意，不是精確地形。

/** 台灣本島海岸線（經度、緯度），順時針。 */
export const OUTLINE: [number, number][] = [
  [121.53, 25.3], [121.75, 25.15], [121.93, 25.02], [121.85, 24.85], [121.83, 24.57], [121.75, 24.35], [121.66, 24.12],
  [121.62, 23.95], [121.52, 23.62], [121.43, 23.3], [121.37, 23.1], [121.25, 22.86], [121.15, 22.72], [120.99, 22.47],
  [120.89, 22.3], [120.85, 22.08], [120.84, 21.9], [120.72, 21.93], [120.7, 22.05], [120.62, 22.3], [120.46, 22.48],
  [120.28, 22.6], [120.16, 22.9], [120.1, 23.1], [120.14, 23.4], [120.2, 23.7], [120.34, 24.05], [120.54, 24.3],
  [120.7, 24.6], [120.9, 24.85], [121.05, 25.05], [121.25, 25.12], [121.4, 25.22],
];

/** 山脈稜線：每點是（經度、緯度、高度 公里），寬度是向兩側降下的距離（度）。 */
const RIDGES: { pts: [number, number, number][]; w: number }[] = [
  // 中央山脈（含玉山一帶）
  { w: 0.2, pts: [[121.62, 24.62, 1.4], [121.44, 24.36, 3.6], [121.27, 24.12, 3.4], [121.1, 23.75, 3.3], [120.96, 23.47, 3.9], [120.9, 23.0, 2.9], [120.86, 22.6, 2.4], [120.85, 22.3, 1.3], [120.83, 22.0, 0.4]] },
  // 雪山山脈
  { w: 0.14, pts: [[121.0, 24.78, 1.2], [121.23, 24.38, 3.8], [121.12, 24.1, 2.4]] },
  // 阿里山山脈
  { w: 0.12, pts: [[120.82, 23.75, 1.6], [120.8, 23.5, 2.4], [120.72, 23.1, 1.3]] },
  // 海岸山脈
  { w: 0.08, pts: [[121.55, 23.95, 0.8], [121.38, 23.35, 1.6], [121.2, 22.92, 0.9]] },
];

const COS = Math.cos((23.7 * Math.PI) / 180);
const K = 1.45; // 每一度緯度在 3D 裡的長度
export const LON0 = 120.95;
export const LAT0 = 23.62;
export const HEIGHT = 0.13; // 每公里高度在 3D 裡的高度（誇大地形，看得出山脈）

/** 經緯度 → 平面座標（x 向東、z 向南）。 */
export const project = (lon: number, lat: number): [number, number] => [(lon - LON0) * K * COS, -(lat - LAT0) * K];

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = (bx - ax) * COS;
  const dy = by - ay;
  const qx = (px - ax) * COS;
  const qy = py - ay;
  const t = Math.max(0, Math.min(1, (qx * dx + qy * dy) / (dx * dx + dy * dy || 1)));
  return { d: Math.hypot(qx - t * dx, qy - t * dy), t };
}

/** 某個經緯度的高度（公里，示意）。 */
export function heightAt(lon: number, lat: number) {
  let h = 0;
  for (const r of RIDGES)
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, ay, ah] = r.pts[i];
      const [bx, by, bh] = r.pts[i + 1];
      const { d, t } = segDist(lon, lat, ax, ay, bx, by);
      h = Math.max(h, (ah + (bh - ah) * t) * Math.exp(-((d / r.w) ** 2)));
    }
  // 一點起伏，讓山看起來不是光滑的
  const n = Math.sin(lon * 47) * Math.cos(lat * 53) * 0.12 + Math.sin(lon * 131 + lat * 97) * 0.06;
  return Math.max(0, h + (h > 0.3 ? n : n * 0.2));
}

export function inside(lon: number, lat: number) {
  let hit = false;
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    const [xi, yi] = OUTLINE[i];
    const [xj, yj] = OUTLINE[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** 依高度上色：平地綠 → 山林深綠 → 岩石 → 高山雪白。 */
export function colorAt(h: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [0.66, 0.8, 0.53]],
    [0.8, [0.47, 0.65, 0.4]],
    [2.0, [0.33, 0.5, 0.32]],
    [3.2, [0.5, 0.5, 0.42]],
    [3.9, [0.86, 0.86, 0.82]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (h <= stops[i][0]) {
      const [h0, c0] = stops[i - 1];
      const [h1, c1] = stops[i];
      const t = (h - h0) / (h1 - h0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return stops[stops.length - 1][1];
}
