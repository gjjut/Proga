import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { AdjustmentInput, AppData, DayRecordInput, Settings } from '../shared/model';
import {
  createEmptyData,
  SCHEMA_VERSION,
  normalizeData,
  patchSettings,
  parseBackupData,
  removeAdjustment,
  removeRecord,
  round2,
  upsertAdjustment,
  upsertRecord,
} from '../shared/model';

const DATA_FILENAME = 'finance-data.json';
const BACKUP_FILENAME = 'finance-data.backup.json';

class NewerSchemaError extends Error {}

function fileExists(file: string): boolean {
  try {
    fs.statSync(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function readData(file: string): AppData {
  const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) ||
      !Array.isArray((raw as Record<string, unknown>).records)) {
    throw new Error('Неверный формат файла данных');
  }
  const source = raw as Record<string, unknown>;
  if (typeof source.schemaVersion === 'number' && source.schemaVersion > SCHEMA_VERSION) {
    throw new NewerSchemaError('Файл создан более новой версией программы');
  }
  if (source.adjustments !== undefined && !Array.isArray(source.adjustments)) {
    throw new Error('Неверный формат движений');
  }
  return normalizeData(raw);
}

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
  private loaded = false;
  recoveryWarning: string | undefined;

  constructor() {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    this.portable = Boolean(portableDir);
    this.dataDir = portableDir ? path.join(portableDir, 'data') : app.getPath('userData');
    this.dataFile = path.join(this.dataDir, DATA_FILENAME);
    this.backupFile = path.join(this.dataDir, BACKUP_FILENAME);
  }

  load(): AppData {
    this.loaded = false;
    fs.mkdirSync(this.dataDir, { recursive: true });
    const mainExists = fileExists(this.dataFile);
    const backupExists = fileExists(this.backupFile);

    if (mainExists) {
      try {
        this.data = readData(this.dataFile);
        this.loaded = true;
        return this.data;
      } catch (error) {
        // Never downgrade or overwrite data made by a newer application.
        if (error instanceof NewerSchemaError || (error as NodeJS.ErrnoException).code) throw error;
        console.error('Не удалось прочитать файл данных, пробуем резервную копию:', error);
      }
    }

    if (backupExists) {
      let restored: AppData;
      try {
        restored = readData(this.backupFile);
      } catch (error) {
        console.error('Не удалось прочитать резервную копию:', error);
        throw new Error(`Не удалось прочитать данные и резервную копию. Файлы не изменены: ${this.dataDir}`);
      }
      // Preserve the damaged original before replacing it, and never copy it over the good backup.
      if (mainExists) {
        const damaged = `${this.dataFile}.corrupted-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        fs.copyFileSync(this.dataFile, damaged, fs.constants.COPYFILE_EXCL);
      }
      this.persist(restored, true);
      this.loaded = true;
      this.recoveryWarning = 'Данные восстановлены из резервной копии. Последние изменения могут отсутствовать. Проверьте записи и сохраните отдельную копию данных.';
      return this.data;
    }

    if (mainExists) {
      throw new Error(`Не удалось прочитать файл данных; резервной копии нет. Файл не изменён: ${this.dataFile}`);
    }
    this.data = createEmptyData();
    this.loaded = true;
    return this.data;
  }

  private persist(next: AppData, restoring = false): AppData {
    if (!this.loaded && !restoring) throw new Error('Данные не загружены; сохранение заблокировано');
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmpFile = `${this.dataFile}.tmp`;
    const backupTmp = `${this.backupFile}.tmp`;
    try {
      fs.writeFileSync(tmpFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      if (!restoring && fileExists(this.dataFile)) {
        // Do not damage the previous backup if copying fails midway.
        fs.copyFileSync(this.dataFile, backupTmp);
        fs.renameSync(backupTmp, this.backupFile);
      }
      fs.renameSync(tmpFile, this.dataFile);
    } finally {
      for (const file of [tmpFile, backupTmp]) {
        try { fs.unlinkSync(file); } catch { /* file is absent or cannot be removed */ }
      }
    }
    this.data = next;
    return this.data;
  }

  saveRecord(input: DayRecordInput): AppData {
    return this.persist(upsertRecord(this.data, input));
  }

  deleteRecord(id: string): AppData {
    return this.persist(removeRecord(this.data, id));
  }

  saveAdjustment(input: AdjustmentInput): AppData {
    return this.persist(upsertAdjustment(this.data, input));
  }

  deleteAdjustment(id: string): AppData {
    return this.persist(removeAdjustment(this.data, id));
  }

  updateSettings(patch: Partial<Settings>): AppData {
    return this.persist(patchSettings(this.data, patch));
  }

  replaceData(raw: unknown): AppData {
    return this.persist(parseBackupData(raw));
  }

  current(): AppData {
    if (!this.loaded) throw new Error('Данные не загружены');
    return this.data;
  }

  summary(): { records: number; adjustments: number; revenue: number } {
    const revenue = this.data.records.reduce((sum, record) => sum + record.terminal, 0);
    return {
      records: this.data.records.length,
      adjustments: this.data.adjustments.length,
      revenue: round2(revenue),
    };
  }
}
