import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { AppData, DayRecordInput, Settings } from '../shared/model';
import {
  createEmptyData,
  normalizeData,
  patchSettings,
  removeRecord,
  round2,
  upsertRecord,
} from '../shared/model';

const DATA_FILENAME = 'finance-data.json';
const BACKUP_FILENAME = 'finance-data.backup.json';

/**
 * Хранилище данных: JSON-файл рядом с exe (portable) либо в %APPDATA%.
 * Запись атомарная (tmp + rename) с предварительным резервным копированием.
 */
export class DataStore {
  readonly portable: boolean;
  readonly dataDir: string;
  readonly dataFile: string;
  readonly backupFile: string;

  private data: AppData = createEmptyData();

  constructor() {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    this.portable = Boolean(portableDir);
    this.dataDir = portableDir ? path.join(portableDir, 'data') : app.getPath('userData');
    this.dataFile = path.join(this.dataDir, DATA_FILENAME);
    this.backupFile = path.join(this.dataDir, BACKUP_FILENAME);
  }

  load(): AppData {
    fs.mkdirSync(this.dataDir, { recursive: true });

    if (fs.existsSync(this.dataFile)) {
      try {
        this.data = normalizeData(JSON.parse(fs.readFileSync(this.dataFile, 'utf8')));
        return this.data;
      } catch (error) {
        console.error('Не удалось прочитать файл данных, пробуем резервную копию:', error);
      }
    }

    if (fs.existsSync(this.backupFile)) {
      try {
        this.data = normalizeData(JSON.parse(fs.readFileSync(this.backupFile, 'utf8')));
        this.persist(this.data);
        return this.data;
      } catch (error) {
        console.error('Резервная копия тоже повреждена:', error);
      }
    }

    this.data = createEmptyData();
    if (fs.existsSync(this.dataFile)) {
      // Файл есть, но битый — сохраняем его для разбора, чтобы не потерять данные безвозвратно.
      try {
        fs.copyFileSync(this.dataFile, `${this.dataFile}.corrupted-${Date.now()}`);
      } catch {
        /* ignore */
      }
      this.persist(this.data);
    }
    return this.data;
  }

  private persist(next: AppData): AppData {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmpFile = `${this.dataFile}.tmp`;
    fs.writeFileSync(tmpFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    if (fs.existsSync(this.dataFile)) {
      try {
        fs.copyFileSync(this.dataFile, this.backupFile);
      } catch (error) {
        console.error('Резервное копирование не удалось:', error);
      }
    }
    fs.renameSync(tmpFile, this.dataFile);
    this.data = next;
    return this.data;
  }

  saveRecord(input: DayRecordInput): AppData {
    return this.persist(upsertRecord(this.data, input));
  }

  deleteRecord(id: string): AppData {
    return this.persist(removeRecord(this.data, id));
  }

  updateSettings(patch: Partial<Settings>): AppData {
    return this.persist(patchSettings(this.data, patch));
  }

  replaceData(raw: unknown): AppData {
    return this.persist(normalizeData(raw));
  }

  summary(): { records: number; revenue: number } {
    const revenue = this.data.records.reduce((sum, record) => sum + record.terminal, 0);
    return { records: this.data.records.length, revenue: round2(revenue) };
  }
}
