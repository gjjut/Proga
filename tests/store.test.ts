import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyData, SCHEMA_VERSION } from '../shared/model';

vi.mock('electron', () => ({ app: { getPath: () => { throw new Error('unexpected userData'); } } }));
import { DataStore } from '../electron/store';

let directory: string;
let oldPortableDir: string | undefined;
let store: DataStore;
const record = {
  company: 'zaton' as const, date: '2026-11-05', cashPrev: 100,
  terminal: 250, cashFact: 300, reserve: 50, expenses: [],
};

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-store-'));
  oldPortableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  process.env.PORTABLE_EXECUTABLE_DIR = directory;
  store = new DataStore();
});
afterEach(() => {
  vi.restoreAllMocks();
  if (oldPortableDir === undefined) delete process.env.PORTABLE_EXECUTABLE_DIR;
  else process.env.PORTABLE_EXECUTABLE_DIR = oldPortableDir;
  fs.rmSync(directory, { recursive: true, force: true });
});

function put(file: string, data: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

describe('файловое хранилище', () => {
  it('создаёт пустое хранилище, сохраняет запись и резервирует предыдущую версию', () => {
    expect(store.load()).toEqual(createEmptyData());
    const first = store.saveRecord(record);
    expect(fs.existsSync(store.backupFile)).toBe(false);
    expect(JSON.parse(fs.readFileSync(store.dataFile, 'utf8'))).toEqual(first);
    const second = store.updateSettings({ commissionRate: 3 });
    expect(JSON.parse(fs.readFileSync(store.backupFile, 'utf8'))).toEqual(first);
    expect(new DataStore().load()).toEqual(second);
    expect(fs.existsSync(`${store.dataFile}.tmp`)).toBe(false);
  });

  it('восстанавливает из резервной копии, не перезаписывая её повреждённым файлом', () => {
    store.load();
    const original = store.saveRecord(record);
    store.updateSettings({ commissionRate: 4 });
    const backup = fs.readFileSync(store.backupFile, 'utf8');
    put(store.dataFile, '{сломанный json');
    const restored = new DataStore();
    expect(restored.load()).toEqual(original);
    expect(restored.recoveryWarning).toContain('Последние изменения могут отсутствовать');
    expect(fs.readFileSync(store.backupFile, 'utf8')).toBe(backup);
    expect(JSON.parse(fs.readFileSync(store.dataFile, 'utf8'))).toEqual(original);
    const damaged = fs.readdirSync(store.dataDir).find((name) => name.startsWith('finance-data.json.corrupted-'));
    expect(damaged).toBeDefined();
    expect(fs.readFileSync(path.join(store.dataDir, damaged!), 'utf8')).toBe('{сломанный json');
    restored.updateSettings({ commissionRate: 5 });
    expect(JSON.parse(fs.readFileSync(store.backupFile, 'utf8'))).toEqual(original);
  });

  it('восстанавливает из резервной копии, если основного файла нет', () => {
    const data = createEmptyData();
    data.settings.commissionRate = 6;
    put(store.backupFile, JSON.stringify(data));
    expect(store.load()).toEqual(data);
    expect(store.recoveryWarning).toBeTruthy();
    expect(JSON.parse(fs.readFileSync(store.backupFile, 'utf8'))).toEqual(data);
  });

  it.each(['{broken', 'null', '{}', '{"records": [] , "adjustments": null}'])(
    'не изменяет повреждённый основной файл (%s), если нет исправной копии', (bad) => {
      put(store.dataFile, bad);
      put(store.backupFile, '{bad backup');
      expect(() => store.load()).toThrow('Файлы не изменены');
      expect(() => store.saveRecord(record)).toThrow('сохранение заблокировано');
      expect(fs.readFileSync(store.dataFile, 'utf8')).toBe(bad);
      expect(fs.readFileSync(store.backupFile, 'utf8')).toBe('{bad backup');
    },
  );

  it('не заменяет данные более новой версии старой резервной копией', () => {
    const newer = JSON.stringify({ ...createEmptyData(), schemaVersion: SCHEMA_VERSION + 1 });
    put(store.dataFile, newer);
    put(store.backupFile, JSON.stringify(createEmptyData()));
    expect(() => store.load()).toThrow('более новой версией');
    expect(fs.readFileSync(store.dataFile, 'utf8')).toBe(newer);
  });

  it('при ошибке резервного копирования не меняет данные на диске и в памяти', () => {
    store.load();
    const original = store.saveRecord(record);
    vi.spyOn(fs, 'copyFileSync').mockImplementation(() => { throw new Error('disk full'); });
    expect(() => store.updateSettings({ commissionRate: 5 })).toThrow('disk full');
    expect(JSON.parse(fs.readFileSync(store.dataFile, 'utf8'))).toEqual(original);
    expect(store.summary().records).toBe(1);
    expect(fs.existsSync(`${store.dataFile}.tmp`)).toBe(false);
  });

  it('при ошибке доступа не заменяет основной файл старой резервной копией', () => {
    const main = JSON.stringify(createEmptyData());
    put(store.dataFile, main);
    put(store.backupFile, JSON.stringify(createEmptyData()));
    const read = fs.readFileSync.bind(fs);
    vi.spyOn(fs, 'readFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, options?: unknown) => {
      if (file === store.dataFile) throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      return read(file, options as BufferEncoding);
    }) as typeof fs.readFileSync);
    expect(() => store.load()).toThrow('permission denied');
    expect(() => store.saveRecord(record)).toThrow('сохранение заблокировано');
    vi.restoreAllMocks();
    expect(fs.readFileSync(store.dataFile, 'utf8')).toBe(main);
  });

  it('не перезаписывает основной файл, если не удалось сохранить его повреждённый оригинал', () => {
    put(store.dataFile, '{bad');
    const backup = JSON.stringify(createEmptyData());
    put(store.backupFile, backup);
    vi.spyOn(fs, 'copyFileSync').mockImplementation(() => { throw new Error('access denied'); });
    expect(() => store.load()).toThrow('access denied');
    expect(fs.readFileSync(store.dataFile, 'utf8')).toBe('{bad');
    expect(fs.readFileSync(store.backupFile, 'utf8')).toBe(backup);
    expect(() => store.saveRecord(record)).toThrow('сохранение заблокировано');
  });
});
