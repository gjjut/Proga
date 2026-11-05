import type { AppInfo, ExportPayload, FinanceApi } from '../../shared/api';
import {
  createEmptyData,
  normalizeData,
  patchSettings,
  removeRecord,
  upsertRecord,
  type AppData,
  type DayRecordInput,
  type Settings,
 } from '../../shared/model';
import { buildDemoData } from './demo';
import { todayIso } from './format';

const STORAGE_KEY = 'zaton-finance:data:v1';

function readStorage(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeData(JSON.parse(raw));
  } catch (error) {
    console.error('Не удалось прочитать localStorage:', error);
  }
  const demo = buildDemoData(todayIso());
  writeStorage(demo);
  return demo;
}

function writeStorage(data: AppData): AppData {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Не удалось сохранить в localStorage:', error);
  }
  return data;
}

function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickJsonFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    const finish = (value: string | null) => {
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      const reader = new FileReader();
      reader.onload = () => finish(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => finish(null);
      reader.readAsText(file);
    });
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}

/**
 * Браузерная реализация того же контракта: используется в режиме разработки
 * и в облачном превью, где Electron-моста нет. Данные лежат в localStorage.
 */
const browserApi: FinanceApi = {
  async info(): Promise<AppInfo> {
    return {
      version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0',
      electron: '—',
      platform: 'browser',
      dataPath: 'localStorage → zaton-finance:data:v1',
      dataDir: 'localStorage',
      portable: false,
    };
  },
  async load() {
    return readStorage();
  },
  async saveRecord(input: DayRecordInput) {
    return writeStorage(upsertRecord(readStorage(), input));
  },
  async deleteRecord(id: string) {
    return writeStorage(removeRecord(readStorage(), id));
  },
  async updateSettings(patch: Partial<Settings>) {
    return writeStorage(patchSettings(readStorage(), patch));
  },
  async replaceData(data: unknown) {
    return writeStorage(normalizeData(data));
  },
  async exportFile(payload: ExportPayload) {
    const mime = payload.filename.endsWith('.json') ? 'application/json' : 'text/csv';
    downloadFile(payload.filename, payload.content, mime);
    return { saved: true, path: payload.filename };
  },
  async importFile() {
    const raw = await pickJsonFile();
    if (!raw) return null;
    return normalizeData(JSON.parse(raw));
  },
  async openDataFolder() {
    /* в браузере папки данных нет */
  },
  async openExternal(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  },
};

export const isDesktop = typeof window !== 'undefined' && Boolean(window.finance);

export const api: FinanceApi = (typeof window !== 'undefined' && window.finance) || browserApi;

export function emptyData(): AppData {
  return createEmptyData();
}
