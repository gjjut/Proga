import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = dirname(fileURLToPath(import.meta.url));

/**
 * CSP добавляется только в production-сборку: в dev-режиме Vite вставляет inline-скрипты
 * (react-refresh preamble), которые строгая политика заблокировала бы.
 */
function cspPlugin(): Plugin {
  return {
    name: 'zaton-inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const meta =
        '    <meta http-equiv="Content-Security-Policy" content="default-src \'self\'; ' +
        "script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
        'font-src \'self\' data:; connect-src \'self\'" />\n';
      return html.replace('</head>', `${meta}  </head>`);
    },
  };
}
const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')) as { version: string };

export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
    target: 'chrome128',
    assetsDir: 'assets',
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Превью в облаке открывается с другого хоста — разрешаем любой Host-заголовок.
    allowedHosts: true,
  },
});
