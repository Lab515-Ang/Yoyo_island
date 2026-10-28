// 把動物圖（SVG 的 React 元素）轉成字串，做成圖片網址、分享圖、3D 貼圖用。
// 取代 react-dom/server 的 renderToStaticMarkup：那個套件只為了這件事就多 190 KB 啟動程式碼。
// 只支援畫圖會用到的部分（元素、屬性、style、文字、Fragment、沒有用 hook 的函式元件）；輸出和 React 一樣（有測試比對）。
import { Fragment, isValidElement, type ReactNode } from 'react';

// React 保留駝峰寫法的 SVG 屬性；其他駝峰屬性會轉成小寫連字號（strokeWidth → stroke-width）
const KEEP = new Set(['viewBox', 'preserveAspectRatio', 'gradientTransform', 'gradientUnits', 'patternUnits', 'patternTransform', 'patternContentUnits', 'stdDeviation', 'refX', 'refY', 'markerWidth', 'markerHeight', 'markerUnits', 'filterUnits', 'primitiveUnits', 'clipPathUnits', 'maskUnits', 'maskContentUnits', 'spreadMethod', 'baseFrequency', 'numOctaves', 'tableValues', 'kernelMatrix', 'textLength', 'lengthAdjust', 'startOffset', 'attributeName', 'keyTimes', 'keySplines', 'calcMode', 'repeatCount', 'pathLength', 'preserveAlpha', 'surfaceScale', 'specularExponent', 'diffuseConstant', 'limitingConeAngle', 'pointsAtX', 'pointsAtY', 'pointsAtZ', 'edgeMode', 'kernelUnitLength', 'xChannelSelector', 'yChannelSelector']);
const RENAME: Record<string, string> = { className: 'class', htmlFor: 'for', xlinkHref: 'xlink:href', xmlnsXlink: 'xmlns:xlink', xmlSpace: 'xml:space' };
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// 不加 px 的 style 數值
const UNITLESS = new Set(['opacity', 'fillOpacity', 'strokeOpacity', 'stopOpacity', 'floodOpacity', 'fontWeight', 'lineHeight', 'zIndex', 'flex', 'flexGrow', 'flexShrink', 'order', 'strokeMiterlimit', 'strokeDashoffset', 'strokeWidth', 'zoom', 'scale']);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const kebab = (s: string) => s.replace(/^(Webkit|Moz|ms)/, (m) => `-${m.toLowerCase()}`).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function style(o: Record<string, unknown>) {
  return Object.entries(o)
    .filter(([, v]) => v != null && typeof v !== 'boolean' && v !== '')
    .map(([k, v]) => `${k.startsWith('--') ? k : kebab(k)}:${typeof v === 'number' && v !== 0 && !UNITLESS.has(k) && !k.startsWith('--') ? `${v}px` : String(v).trim()}`)
    .join(';');
}

function attrs(props: Record<string, unknown>) {
  let out = '';
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children' || k === 'key' || k === 'ref' || /^on[A-Z]/.test(k) || k.startsWith('suppress') || v == null) continue;
    if (k === 'style') {
      const s = style(v as Record<string, unknown>);
      if (s) out += ` style="${esc(s)}"`;
      continue;
    }
    const aria = k.startsWith('aria-') || k.startsWith('data-');
    if (typeof v === 'boolean' && !aria) {
      if (v) out += ` ${k}=""`;
      continue;
    }
    if (typeof v === 'function' || typeof v === 'symbol') continue;
    const name = RENAME[k] ?? (aria || KEEP.has(k) ? k : kebab(k));
    out += ` ${name}="${esc(String(v))}"`;
  }
  return out;
}

export function svgMarkup(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return esc(String(node));
  if (Array.isArray(node)) return node.map(svgMarkup).join('');
  if (!isValidElement(node)) return '';
  const { type } = node;
  const props = node.props as Record<string, unknown> & { children?: ReactNode };
  if (type === Fragment) return svgMarkup(props.children);
  if (typeof type === 'function') return svgMarkup((type as (p: unknown) => ReactNode)(props));
  if (typeof type !== 'string') return '';
  const inner = svgMarkup(props.children);
  return VOID.has(type) ? `<${type}${attrs(props)}/>` : `<${type}${attrs(props)}>${inner}</${type}>`;
}
