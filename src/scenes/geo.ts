// 觀察圖鑑的立體地圖：每個區域一份簡化的地形資料（海岸線、山脈稜線、投影）。都是示意，不是精確地形。

export interface GeoDef {
  id: string;
  name: string;
  /** 每座島的海岸線（經度、緯度） */
  outlines: [number, number][][];
  /** 山脈稜線：每點是（經度、緯度、高度 公里），寬度是向兩側降下的距離（度） */
  ridges: { pts: [number, number, number][]; w: number }[];
  /** 平面地圖上畫的主要山脈（示意） */
  ridgeLine: [number, number][];
  lon0: number;
  lat0: number;
  /** 每一度緯度在 3D 裡的長度：區域越大越小，讓每張地圖差不多一樣大 */
  k: number;
  /** 地形格子範圍 [西, 南, 東, 北] 與間距（度） */
  bounds: [number, number, number, number];
  step: number;
  /**
   * 手繪地圖貼圖（GPT 照地形配置圖重畫，和世界地圖插畫同一種畫風）。
   * bounds 是整張貼圖對應的經緯度 [西, 南, 東, 北]（畫配置圖時算出），換貼圖要一起換。
   */
  art?: { src: string; bounds: [number, number, number, number] };
}

export const HEIGHT = 0.13; // 每公里高度在 3D 裡的高度（誇大地形，看得出山脈）

export function makeGeo(d: GeoDef) {
  const cos = Math.cos((d.lat0 * Math.PI) / 180);
  /** 經緯度 → 平面座標（x 向東、z 向南）。 */
  const project = (lon: number, lat: number): [number, number] => [(lon - d.lon0) * d.k * cos, -(lat - d.lat0) * d.k];

  const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
    const dx = (bx - ax) * cos;
    const dy = by - ay;
    const qx = (px - ax) * cos;
    const qy = py - ay;
    const t = Math.max(0, Math.min(1, (qx * dx + qy * dy) / (dx * dx + dy * dy || 1)));
    return { d: Math.hypot(qx - t * dx, qy - t * dy), t };
  };

  /** 某個經緯度的高度（公里，示意）。 */
  const heightAt = (lon: number, lat: number) => {
    let h = 0;
    for (const r of d.ridges)
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, ay, ah] = r.pts[i];
        const [bx, by, bh] = r.pts[i + 1];
        const { d: dist, t } = segDist(lon, lat, ax, ay, bx, by);
        h = Math.max(h, (ah + (bh - ah) * t) * Math.exp(-((dist / r.w) ** 2)));
      }
    // 一點起伏，讓山看起來不是光滑的（用 3D 座標算，每張地圖的紋路大小一樣）
    const [u, v] = project(lon, lat);
    const n = Math.sin(u * 35) * Math.cos(v * 36) * 0.12 + Math.sin(u * 90 + v * 67) * 0.06;
    return Math.max(0, h + (h > 0.3 ? n : n * 0.2));
  };

  const inPoly = (poly: [number, number][], lon: number, lat: number) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  const inside = (lon: number, lat: number) => d.outlines.some((p) => inPoly(p, lon, lat));

  return { ...d, project, heightAt, inside };
}
export type Geo = ReturnType<typeof makeGeo>;

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
