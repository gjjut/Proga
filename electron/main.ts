import path from 'node:path';
import fs from 'node:fs';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import type { AdjustmentInput, DayRecordInput, ExportPayload, IpcResult } from '../shared/api';
import type { Settings } from '../shared/model';
import { normalizeData } from '../shared/model';
import { DataStore } from './store';

const APP_TITLE = 'Финансы компаний';
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const isDev = Boolean(devServerUrl);

let store: DataStore | null = null;
let mainWindow: BrowserWindow | null = null;

function getStore(): DataStore {
  if (!store) store = new DataStore();
  return store;
}

function handle<T>(channel: string, handler: (...args: never[]) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const data = await handler(...(args as never[]));
      return { ok: true, data } satisfies IpcResult<T>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ipc] ${channel}:`, error);
      return { ok: false, error: message } satisfies IpcResult<T>;
    }
  });
}

function registerIpc(): void {
  handle('app:info', () => {
    const dataStore = getStore();
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      platform: process.platform,
      dataPath: dataStore.dataFile,
      dataDir: dataStore.dataDir,
      portable: dataStore.portable,
    };
  });

  handle('data:load', () => getStore().load());
  handle('data:save-record', (input: DayRecordInput) => getStore().saveRecord(input));
  handle('data:delete-record', (id: string) => getStore().deleteRecord(id));
  handle('data:save-adjustment', (input: AdjustmentInput) => getStore().saveAdjustment(input));
  handle('data:delete-adjustment', (id: string) => getStore().deleteAdjustment(id));
  handle('data:update-settings', (patch: Partial<Settings>) => getStore().updateSettings(patch));
  handle('data:replace', (raw: unknown) => getStore().replaceData(raw));

  handle('data:export-file', async (payload: ExportPayload) => {
    const window = mainWindow;
    const defaultPath = path.join(app.getPath('downloads'), payload.filename);
    const options = {
      title: 'Сохранить файл',
      defaultPath,
      filters: payload.filters ?? [{ name: 'Все файлы', extensions: ['*'] }],
    };
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) return { saved: false };
    fs.writeFileSync(result.filePath, payload.content, 'utf8');
    return { saved: true, path: result.filePath };
  });

  handle('data:import-file', async () => {
    const window = mainWindow;
    const options = {
      title: 'Импорт резервной копии',
      properties: ['openFile' as const],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);

    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return normalizeData(raw);
  });

  handle('data:open-folder', async () => {
    const dataStore = getStore();
    fs.mkdirSync(dataStore.dataDir, { recursive: true });
    const error = await shell.openPath(dataStore.dataDir);
    if (error) throw new Error(error);
  });

  handle('window:open-external', async (url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Разрешены только http(s)-ссылки');
    await shell.openExternal(url);
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1340,
    height: 900,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    title: APP_TITLE,
    backgroundColor: '#15202B',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // DevTools по Ctrl+Shift+I / F12 без строки меню.
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    const isToggle =
      (input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12';
    if (isToggle && input.type === 'keyDown') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist-renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.setAppUserModelId('ru.gjjut.zatonfinance');
  // Фиксируем папку данных, чтобы путь не зависел от productName/ярлыков
  // и совпадал с тем, что описан в README и показан в «Настройки → Данные».
  app.setPath('userData', path.join(app.getPath('appData'), 'ZatonFinance'));

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerIpc();
    getStore().load();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || !isDev) app.quit();
  });
}

process.on('uncaughtException', (error) => {
  console.error('Необработанная ошибка main-процесса:', error);
});
