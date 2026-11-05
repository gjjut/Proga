/**
 * Контракт между preload-скриптом и рендерером.
 * Реализуется дважды: electron/preload.ts (реальный мост) и src/lib/api.ts (браузерный адаптер).
 */
import type { AppData, Settings } from './model';
import type { DayRecordInput } from './model';

export type { DayRecordInput } from './model';

export interface AppInfo {
  version: string;
  electron: string;
  platform: string;
  dataPath: string;
  dataDir: string;
  portable: boolean;
}

export interface ExportPayload {
  filename: string;
  content: string;
  /** Фильтры диалога сохранения, например [{ name: 'CSV', extensions: ['csv'] }] */
  filters?: { name: string; extensions: string[] }[];
}

export interface ExportResult {
  saved: boolean;
  path?: string;
}

export interface FinanceApi {
  info(): Promise<AppInfo>;
  load(): Promise<AppData>;
  saveRecord(input: DayRecordInput): Promise<AppData>;
  deleteRecord(id: string): Promise<AppData>;
  updateSettings(patch: Partial<Settings>): Promise<AppData>;
  replaceData(data: unknown): Promise<AppData>;
  exportFile(payload: ExportPayload): Promise<ExportResult>;
  importFile(): Promise<AppData | null>;
  openDataFolder(): Promise<void>;
  openExternal(url: string): Promise<void>;
}

export interface IpcResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
