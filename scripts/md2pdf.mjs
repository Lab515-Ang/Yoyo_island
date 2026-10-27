// 把專案 docs 的 Markdown（標題、段落、清單、表格、粗體）轉成奶油森林風格的 PDF。
// 用法：node md2pdf.mjs <輸入.md> <輸出.pdf>
// 需要 puppeteer-core（暫存資料夾安裝即可）與電腦上的 Chrome。
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [, , IN, OUT] = process.argv;
const md = fs.readFileSync(IN, 'utf8').replace(/\r\n/g, '\n');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
const lines = md.split('\n');
let html = '';
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (!l.trim()) continue;
  let m;
  if ((m = /^(#{1,3}) (.*)$/.exec(l))) {
    html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`;
  } else if (l.startsWith('|')) {
    const rows = [];
    while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
    i--;
    const cells = (r) => r.slice(1, -1).split('|').map((c) => c.trim());
    html += '<table><thead><tr>' + cells(rows[0]).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
    for (const r of rows.slice(2)) html += '<tr>' + cells(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>';
    html += '</tbody></table>';
  } else if (/^(- |\d+\. )/.test(l)) {
    const ordered = /^\d+\. /.test(l);
    const items = [];
    while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) items.push(lines[i++].replace(/^(- |\d+\. )/, ''));
    i--;
    html += `<${ordered ? 'ol' : 'ul'}>` + items.map((x) => `<li>${inline(x)}</li>`).join('') + `</${ordered ? 'ol' : 'ul'}>`;
  } else html += `<p>${inline(l)}</p>`;
}
const doc = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm 16mm 20mm; }
body { font-family: 'Microsoft JhengHei', 'PingFang TC', sans-serif; color: #36302a; font-size: 10.5pt; line-height: 1.7; }
h1 { font-size: 22pt; color: #4a6a42; margin: 0 0 4pt; padding-bottom: 8pt; border-bottom: 3px solid #8ca67a; }
h1 + p { color: #766b5e; margin-bottom: 14pt; }
h2 { font-size: 14pt; color: #fffdf8; background: #638553; padding: 5pt 12pt; border-radius: 8pt; margin: 20pt 0 8pt; break-after: avoid; }
h3 { font-size: 12pt; color: #4a6a42; margin: 14pt 0 6pt; break-after: avoid; }
p { margin: 4pt 0; }
ul, ol { margin: 4pt 0 8pt; padding-left: 20pt; }
li { margin: 3pt 0; }
strong { color: #4a6a42; }
table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 6pt 0 10pt; font-size: 9.5pt; break-inside: auto; }
th { background: #e8eedb; color: #4a6a42; text-align: left; padding: 6pt 8pt; border-bottom: 2px solid #8ca67a; }
td { padding: 6pt 8pt; border-bottom: 1px solid #ece4d3; vertical-align: top; }
tr { break-inside: avoid; }
tbody tr:nth-child(even) td { background: #fbf6ec; }
td:first-child { font-weight: 700; white-space: nowrap; }
</style></head><body>${html}</body></html>`;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setContent(doc, { waitUntil: 'load' });
await page.pdf({
  path: OUT,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: '<div style="width:100%;font-size:8pt;color:#a59a8b;text-align:center;font-family:Microsoft JhengHei">棲光小島｜產品規劃與路線圖・第 <span class="pageNumber"></span> / <span class="totalPages"></span> 頁</div>',
  margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
});
await browser.close();
console.log('ok', fs.statSync(OUT).size);
