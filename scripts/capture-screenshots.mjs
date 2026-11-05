#!/usr/bin/env node
/**
 * Снимает скриншоты интерфейса для документации.
 * Запускается в CI (.github/workflows/screenshots.yml) после `vite build` + `vite preview`.
 * Локально:
 *
 *   npm run build:renderer
 *   npx vite preview --port 4173 &
 *   npx wait-on http://127.0.0.1:4173 && node scripts/capture-screenshots.mjs
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.SCREENSHOT_URL ?? 'http://127.0.0.1:4173/';
const OUT_DIR = 'docs/screenshots';

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 940 },
  deviceScaleFactor: 1,
  locale: 'ru-RU',
  timezoneId: 'Europe/Moscow',
  colorScheme: 'dark',
});
const page = await context.newPage();

async function shot(name) {
  // Даём анимациям и переходам завершиться, чтобы не поймать полупрозрачные состояния.
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` });
  console.log(`✓ ${OUT_DIR}/${name}.png`);
}

/** Клик по пункту левого меню (в шапке экранов бывают одноимённые кнопки). */
async function navTo(label) {
  await page.locator('.nav__item', { hasText: label }).first().click();
}

async function fill(locator, value) {
  await locator.click();
  await locator.fill(value);
  await locator.blur();
}

await page.goto(BASE_URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.hero, .empty-state', { timeout: 30000 });
await shot('dashboard');

// ── Запись дня: заполняем поля, чтобы на скриншоте были живые цифры ──
await navTo('Запись дня');
await page.waitForSelector('.day-summary');

// 0 — остаток наличных вчера, 1 — терминал, 2 — факт в кассе, 3 — НЗ
const moneyInputs = page.locator('input.input--money');
await fill(moneyInputs.nth(0), '10000');
await fill(moneyInputs.nth(1), '48200');
await fill(moneyInputs.nth(2), '9600');
await fill(moneyInputs.nth(3), '4500');

await fill(page.locator('.expense-row__amount input').first(), '3400');
await fill(page.locator('.expense-row__comment').first(), 'Корм и прикормка, база на Ленина');

await page.getByRole('button', { name: 'Добавить расход' }).click();
await fill(page.locator('.expense-row__amount input').nth(1), '1800');
await fill(page.locator('.expense-row__comment').nth(1), 'Бензин для генератора');
await page.locator('.screen__title').click();
await shot('day-entry');

// ── Поступления и изъятия ──
await navTo('Поступления');
await page.waitForSelector('.adjust-form');
await fill(page.locator('.adjust-form input.input--money'), '15000');
await fill(page.locator('.adjust-form__comment input'), 'Внесли личные деньги в кассу');
await shot('adjustments');

// ── История ──
await navTo('История');
await page.waitForSelector('.record-list');
await page.locator('.record__toggle').first().click();
await shot('history');

// ── Настройки ──
await navTo('Настройки');
await page.waitForSelector('.theme-option');
await shot('settings');

// ── Чёрная тема ──
// Смену темы не считаем критичной: если кнопка не нашлась, просто пропускаем кадр.
try {
  await page.locator('.theme-option', { hasText: 'Lights out' }).first().click();
  await page.waitForTimeout(400);
  await shot('settings-black');
  await navTo('Главное');
  await page.waitForSelector('.hero, .empty-state', { timeout: 20000 });
  await shot('dashboard-black');
} catch (error) {
  console.warn('Тёмную тему снять не удалось:', error.message);
}

await browser.close();
console.log('Готово');
