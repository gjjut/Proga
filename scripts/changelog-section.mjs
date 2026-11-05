#!/usr/bin/env node
/**
 * Печатает секцию CHANGELOG.md для указанной версии (по умолчанию — текущей из package.json).
 * Использование:
 *   node scripts/changelog-section.mjs                → в stdout
 *   node scripts/changelog-section.mjs release-notes.md → в файл
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
const version = process.env.RELEASE_VERSION ?? pkg.version;
const outFile = process.argv[2];

const changelog = readFileSync(resolve(rootDir, 'CHANGELOG.md'), 'utf8');
const lines = changelog.split(/\r?\n/);

const startIndex = lines.findIndex((line) => line.trim().startsWith(`## [${version}]`));
let section = '';

if (startIndex >= 0) {
  const collected = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('## ')) break;
    collected.push(lines[i]);
  }
  section = collected.join('\n').trim();
}

if (!section) {
  section = `Релиз версии ${version}.\n\nПолный список изменений — в CHANGELOG.md репозитория.`;
}

const body = `## Что нового в ${version}\n\n${section}\n\n---\n\n**Установка:** скачайте \`ZatonFinance-Setup-${version}.exe\` (установщик) или \`ZatonFinance-Portable-${version}.exe\` (запуск без установки). Данные хранятся локально и при обновлении не затрагиваются.\n`;

if (outFile) {
  writeFileSync(resolve(rootDir, outFile), body, 'utf8');
  console.log(`✓ заметки релиза записаны в ${outFile}`);
} else {
  process.stdout.write(body);
}
