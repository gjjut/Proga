import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoBackup } from '../electron/autoBackup';
import { createEmptyData } from '../shared/model';

let directory: string;
let backups: AutoBackup;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-backups-'));
  backups = new AutoBackup(directory);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);
const read = (folder: string, name: string) => JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'));

describe('автоматические копии', () => {
  it('сохраняет первую и последнюю версию за местный день', () => {
    const original = createEmptyData();
    backups.snapshot(original, day(2026, 11, 5));
    const updated = createEmptyData();
    updated.settings.commissionRate = 5;
    backups.snapshot(updated, day(2026, 11, 5));
    expect(read(backups.folder, 'zaton-finance-2026-11-05-start.json')).toEqual(original);
    expect(read(backups.folder, 'zaton-finance-2026-11-05-latest.json')).toEqual(updated);
  });

  it('оставляет 30 дат и не трогает чужие файлы', () => {
    fs.mkdirSync(backups.folder, { recursive: true });
    fs.writeFileSync(path.join(backups.folder, 'my-notes.json'), 'important');
    const start = day(2026, 1, 1);
    for (let n = 0; n < 31; n++) {
      const date = new Date(start);
      date.setDate(date.getDate() + n);
      backups.snapshot(createEmptyData(), date);
    }
    expect(fs.existsSync(path.join(backups.folder, 'zaton-finance-2026-01-01-start.json'))).toBe(false);
    expect(fs.readdirSync(backups.folder).filter((name) => name.startsWith('zaton-finance-'))).toHaveLength(60);
    expect(fs.readFileSync(path.join(backups.folder, 'my-notes.json'), 'utf8')).toBe('important');
  });

  it('создаёт отдельные точки перед удалением и восстановлением', () => {
    const data = createEmptyData();
    backups.checkpoint(data);
    backups.checkpoint(data);
    const names = fs.readdirSync(backups.folder);
    expect(names).toHaveLength(2);
    expect(names.every((name) => name.includes('-before-'))).toBe(true);
    expect(read(backups.folder, names[0])).toEqual(data);
  });

  it('сохраняет выбранную папку и проверяет запись до изменения настроек', () => {
    const external = path.join(directory, 'cloud');
    backups.setFolder(external, createEmptyData());
    expect(new AutoBackup(directory).folder).toBe(external);
    expect(fs.readdirSync(external)).toHaveLength(2);
    const inaccessible = path.join(directory, 'file');
    fs.writeFileSync(inaccessible, 'not a directory');
    expect(() => backups.setFolder(path.join(inaccessible, 'child'), createEmptyData())).toThrow();
    expect(backups.folder).toBe(external);
    expect(new AutoBackup(directory).folder).toBe(external);
  });

  it('предупреждает об ошибке копирования, а после восстановления доступа продолжает', () => {
    const spy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => { throw new Error('offline'); });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    backups.snapshot(createEmptyData(), day(2026, 11, 5));
    expect(backups.warning).toContain('Не удалось создать автоматическую копию');
    expect(() => backups.checkpoint(createEmptyData())).toThrow();
    spy.mockRestore();
    backups.snapshot(createEmptyData(), day(2026, 11, 5));
    expect(backups.warning).toBeUndefined();
  });

  it('не молчит о повреждённых настройках и не копирует в неожиданное место', () => {
    fs.writeFileSync(path.join(directory, 'backup-config.json'), '{bad');
    backups = new AutoBackup(directory);
    expect(backups.warning).toContain('Не удалось прочитать');
    backups.snapshot(createEmptyData());
    expect(backups.warning).toBeTruthy();
    expect(fs.existsSync(backups.defaultDir)).toBe(false);
    expect(() => backups.checkpoint(createEmptyData())).toThrow();
    backups.setFolder(backups.defaultDir, createEmptyData());
    expect(backups.warning).toBeUndefined();
  });
});
