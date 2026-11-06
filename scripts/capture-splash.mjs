#!/usr/bin/env node
/**
 * Скриншоты стартовой заставки для документации.
 *
 * Заставка живёт в Electron, но собрана из обычного HTML (`electron/splash.ts`),
 * поэтому её можно отрисовать в Chromium Playwright — фазу фиксируем параметром.
 *
 *   npm run build:electron
 *   npx playwright install chromium
 *   node scripts/capture-splash.mjs
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const { renderSplashHtml } = require('../dist-electron/electron/splash.js');

const OUT_DIR = process.env.SPLASH_OUT_DIR ?? 'docs/screenshots';
const VERSION = process.env.SPLASH_VERSION ?? require('../package.json').version;

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 600, height: 420 },
  deviceScaleFactor: 2,
  locale: 'ru-RU',
});

/** Фон под прозрачным окном: заставка показывается поверх тёмного рабочего стола. */
const DESKTOP = 'html { background: radial-gradient(120% 120% at 50% 0%, #16191d 0%, #07080a 100%); }';

async function shot(name, stage) {
  const page = await context.newPage();
  const html = renderSplashHtml(VERSION, { frozenStage: stage });
  await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`, {
    waitUntil: 'load',
  });
  await page.addStyleTag({ content: DESKTOP });
  // Даём анимациям доиграть до устойчивого состояния.
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` });
  console.log(`✓ ${OUT_DIR}/${name}.png`);
  await page.close();
}

await shot('splash-loading', 'ring');
await shot('splash', 'card');

await browser.close();
