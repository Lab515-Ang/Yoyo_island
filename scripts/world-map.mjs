// 產生區域選單用的世界地圖（陸地輪廓的 SVG path＋各區域的位置）→ src/content/worldMap.ts
// 資料：Natural Earth 1:110m（公有領域，經由 world-atlas 套件）。只在新增區域或想調整地圖時重新產生：
//   在暫存資料夾 npm install world-atlas@2.0.2 topojson-client@3.1.0 d3-geo@3.1.1，再用 NODE_PATH 指向它執行：
//   NODE_PATH=<暫存>/node_modules node scripts/world-map.mjs <暫存>/node_modules/world-atlas/land-110m.json
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(process.env.NODE_PATH + '/');
const { feature } = require('topojson-client');
const { geoNaturalEarth1, geoPath } = require('d3-geo');

const W = 360;
const H = 190;
// 各區域在地圖上的點（經度、緯度）：新增區域時加在這裡
const REGIONS = { tw: [121.0, 23.7], jp: [138.5, 36.5] };

const topo = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const land = feature(topo, topo.objects.land);
// 以太平洋西側為中心（台灣、日本在畫面中間偏左），之後加的國家也看得到
const proj = geoNaturalEarth1().rotate([-150, 0]).fitSize([W, H], { type: 'Sphere' });
const d = geoPath(proj)(land).replace(/(\d+\.\d)\d+/g, '$1');
const xy = Object.fromEntries(Object.entries(REGIONS).map(([k, p]) => [k, proj(p).map((v) => Math.round(v * 10) / 10)]));
const sphere = geoPath(proj)({ type: 'Sphere' }).replace(/(\d+\.\d)\d+/g, '$1');
fs.writeFileSync(
  'src/content/worldMap.ts',
  `// 由 scripts/world-map.mjs 產生（Natural Earth 1:110m，公有領域），不要手動改\nexport const WORLD_W = ${W};\nexport const WORLD_H = ${H};\nexport const WORLD_SPHERE = ${JSON.stringify(sphere)};\nexport const WORLD_LAND = ${JSON.stringify(d)};\nexport const REGION_XY: Record<string, [number, number]> = ${JSON.stringify(xy)};\n`,
);
console.log('path chars', d.length, xy);
