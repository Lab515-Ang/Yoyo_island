import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const PUBLIC_FILES = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

/** 建置時產生 sw.js：預先快取所有輸出檔案，讓 App 可離線開啟。 */
function serviceWorker(): Plugin {
  return {
    name: 'qiguang-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const assets = [...new Set([...PUBLIC_FILES, ...Object.keys(bundle).map((f) => `/${f}`)])];
      const version = createHash('sha1').update(assets.join()).digest('hex').slice(0, 10);
      const source = readFileSync('src/sw.js', 'utf8').replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(assets));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({ plugins: [react(), serviceWorker()] });
