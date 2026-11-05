#!/usr/bin/env node
/**
 * Инкремент версии приложения и подготовка CHANGELOG.
 *
 *   npm run bump patch        # 1.0.0 → 1.0.1
 *   npm run bump minor        # 1.0.0 → 1.1.0
 *   npm run bump major        # 1.0.0 → 2.0.0
 *   npm run bump 1.4.2        # явная версия
 *   npm run bump patch -- --tag   # + git commit и git tag vX.Y.Z
 *
 * Что делает:
 *  1. обновляет "version" в package.json;
 *  2. превращает раздел [Unreleased] в раздел новой версии с датой и создаёт пустой [Unreleased];
 *  3. (опционально) коммитит и ставит тег — после этого GitHub Actions соберёт релиз.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = resolve(rootDir, 'package.json');
const changelogPath = resolve(rootDir, 'CHANGELOG.md');

const rawArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const withTag = rawArgs.includes('--tag');
const target = rawArgs.find((arg) => arg !== '--tag') ?? 'patch';

const pkgRaw = readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(pkgRaw);
const current = String(pkg.version);

function nextVersion(currentVersion, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [major, minor, patch] = currentVersion.split('.').map((part) => Number.parseInt(part, 10));
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Неизвестный тип версии: ${kind}. Используйте patch | minor | major | x.y.z`);
}

const version = nextVersion(current, target);
const today = new Date().toISOString().slice(0, 10);

// package.json — сохраняем форматирование (2 пробела, перевод строки в конце)
writeFileSync(pkgPath, `${JSON.stringify({ ...pkg, version }, null, 2)}\n`, 'utf8');

// CHANGELOG.md — [Unreleased] превращается в раздел релиза, сверху остаётся пустой [Unreleased]
let changelog = readFileSync(changelogPath, 'utf8');
const headingMatch = changelog.match(/^## \[Unreleased\][^\n]*\n/m);

if (headingMatch && headingMatch.index !== undefined) {
  const start = headingMatch.index;
  const afterHeading = start + headingMatch[0].length;
  const rest = changelog.slice(afterHeading);
  const nextSectionOffset = rest.search(/^## \[/m);
  const notesBody =
    (nextSectionOffset >= 0 ? rest.slice(0, nextSectionOffset) : rest).trim() ||
    '- Первый выпуск версии.';
  const tail = nextSectionOffset >= 0 ? rest.slice(nextSectionOffset) : '';

  changelog =
    changelog.slice(0, start) +
    `## [Unreleased]\n\n## [${version}] - ${today}\n\n${notesBody}\n\n` +
    tail;
} else {
  changelog = changelog.replace(
    /^(# .*\n)/,
    `$1\n## [Unreleased]\n\n## [${version}] - ${today}\n\n- Первый выпуск версии.\n\n`,
  );
}

writeFileSync(changelogPath, changelog, 'utf8');

console.log(`Версия: ${current} → ${version}`);
console.log('Обновлены package.json и CHANGELOG.md');

if (withTag) {
  const commands = [
    'git add package.json CHANGELOG.md',
    `git commit -m "release: v${version}"`,
    `git tag -a v${version} -m "v${version}"`,
    'git push origin HEAD',
    `git push origin v${version}`,
  ];
  for (const command of commands) {
    console.log(`$ ${command}`);
    execSync(command, { cwd: rootDir, stdio: 'inherit' });
  }
  console.log(`\n✓ Тег v${version} отправлен — GitHub Actions соберёт релиз.`);
} else {
  console.log(`
Дальше:
  git add package.json CHANGELOG.md
  git commit -m "release: v${version}"
  git tag -a v${version} -m "v${version}"
  git push origin HEAD --tags

Либо одной командой: npm run bump ${target} -- --tag`);
}
