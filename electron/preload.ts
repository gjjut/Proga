import { contextBridge, ipcRenderer } from 'electron';
import type { FinanceApi, IpcResult } from '../shared/api';

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T> | undefined;
  if (!result || !result.ok) {
    throw new Error(result?.error ?? 'Неизвестная ошибка IPC');
  }
  return result.data as T;
}

const financeApi: FinanceApi = {
  info: () => call('app:info'),
  load: () => call('data:load'),
  saveRecord: (input) => call('data:save-record', input),
  deleteRecord: (id) => call('data:delete-record', id),
  saveAdjustment: (input) => call('data:save-adjustment', input),
  deleteAdjustment: (id) => call('data:delete-adjustment', id),
  updateSettings: (patch) => call('data:update-settings', patch),
  replaceData: (data) => call('data:replace', data),
  exportFile: (payload) => call('data:export-file', payload),
  importFile: () => call('data:import-file'),
  openDataFolder: () => call('data:open-folder'),
  openExternal: (url) => call('window:open-external', url),
};

contextBridge.exposeInMainWorld('finance', financeApi);
