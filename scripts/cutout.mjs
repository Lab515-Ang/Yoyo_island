// 去背：從四邊往內灌，去掉接近背景色的像素和灰色的地面影子；邊緣柔化一圈；裁切置中到 512×512（腳貼底）。
// 用法：node cutout.mjs <來源圖> <輸出 webp> <預覽 png>（TOL=數字 可以試著連地面影子一起去掉；毛色很平滑時會吃進身體，預設不開）
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [, , SRC, OUT, PREVIEW] = process.argv;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const b64 = fs.readFileSync(SRC).toString('base64');
const res = await page.evaluate(async (b64, TOL) => {
  const img = new Image();
  img.src = 'data:image/webp;base64,' + b64;
  await img.decode();
  const W = img.width, H = img.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, W, H);
  const d = id.data;
  const bg = [d[0], d[1], d[2]];
  const dist = (i) => Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
  const chroma = (i) => Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
  // 背景：很接近背景色；影子：灰灰的（彩度低）、比較暗但不是深色斑點
  const removable = (i) => dist(i) < 14 || (chroma(i) < 16 && d[i] > 170);
  const gone = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop();
    if (gone[p] || !removable(p * 4)) continue;
    gone[p] = 1;
    const x = p % W, y = (p / W) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }
  // 地面影子（暖色、和腳掌顏色很像）：從已去掉的地方往旁邊慢慢變色的像素擴散；腳掌邊緣有一圈較暗的輪廓會擋住
  const step = (p, q) => Math.hypot(d[p * 4] - d[q * 4], d[p * 4 + 1] - d[q * 4 + 1], d[p * 4 + 2] - d[q * 4 + 2]);
  const yMin = Math.floor(H * 0.55);
  if (TOL > 0) for (let y = yMin; y < H; y++) for (let x = 0; x < W; x++) if (gone[y * W + x]) stack.push(y * W + x);
  while (stack.length) {
    const p = stack.pop();
    const x = p % W, y = (p / W) | 0;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > yMin ? p - W : -1, y < H - 1 ? p + W : -1]) {
      if (q < 0 || gone[q] || d[q * 4] < 180 || step(p, q) > TOL) continue;
      gone[q] = 1;
      stack.push(q);
    }
  }
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    if (gone[p]) {
      d[i + 3] = 0;
      continue;
    }
    const x = p % W, y = (p / W) | 0;
    // 邊緣一圈：越接近背景色越透明（柔化鋸齒和白邊）
    const edge = (x > 0 && gone[p - 1]) || (x < W - 1 && gone[p + 1]) || (y > 0 && gone[p - W]) || (y < H - 1 && gone[p + W]);
    if (edge) d[i + 3] = Math.round(255 * Math.min(1, dist(i) / 45));
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  g.putImageData(id, 0, 0);
  // 裁切置中：寬高最多 94%，腳貼在底部（留 2%）
  const S = 512;
  const out = document.createElement('canvas');
  out.width = S; out.height = S;
  const o = out.getContext('2d');
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const k = Math.min((S * 0.94) / bw, (S * 0.94) / bh);
  const w = bw * k, h = bh * k;
  o.imageSmoothingQuality = 'high';
  o.drawImage(c, minX, minY, bw, bh, (S - w) / 2, S * 0.98 - h, w, h);
  const webp = out.toDataURL('image/webp', 0.9);
  // 預覽：放在奶油底和深綠底上
  const pv = document.createElement('canvas');
  pv.width = S * 2; pv.height = S;
  const q = pv.getContext('2d');
  q.fillStyle = '#fbf6ec'; q.fillRect(0, 0, S, S);
  q.fillStyle = '#3f6b53'; q.fillRect(S, 0, S, S);
  q.drawImage(out, 0, 0); q.drawImage(out, S, 0);
  return { webp, preview: pv.toDataURL('image/png'), box: [minX, minY, maxX, maxY] };
}, b64, Number(process.env.TOL ?? 0));
fs.writeFileSync(OUT, Buffer.from(res.webp.split(',')[1], 'base64'));
fs.writeFileSync(PREVIEW, Buffer.from(res.preview.split(',')[1], 'base64'));
console.log('box', res.box, 'bytes', fs.statSync(OUT).size);
await browser.close();
