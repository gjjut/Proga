import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppInfo } from '../shared/api';
import {
  createEmptyData,
  type Adjustment,
  type AdjustmentInput,
  type AppData,
  type CompanyId,
  type DayRecord,
  type DayRecordInput,
  type Settings,
} from '../shared/model';
import { api, isDesktop } from './lib/api';
import { buildCsv, buildJsonBackup, csvFilename, jsonBackupFilename } from './lib/csv';

export type ScreenId = 'dashboard' | 'day' | 'adjustments' | 'history' | 'settings';

export interface DayTarget {
  company: CompanyId;
  date: string;
}

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  leaving?: boolean;
}

interface AppContextValue {
  ready: boolean;
  loadError: string | null;
  data: AppData;
  info: AppInfo | null;
  isDesktop: boolean;
  screen: ScreenId;
  dayTarget: DayTarget | null;
  toasts: Toast[];
  navigate: (screen: ScreenId, target?: DayTarget | null) => void;
  saveRecord: (input: DayRecordInput) => Promise<boolean>;
  deleteRecord: (id: string) => Promise<boolean>;
  saveAdjustment: (input: AdjustmentInput) => Promise<boolean>;
  deleteAdjustment: (id: string) => Promise<boolean>;
  updateSettings: (patch: Partial<Settings>) => Promise<boolean>;
  replaceData: (data: unknown) => Promise<void>;
  clearAll: () => Promise<void>;
  notify: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
  exportCsv: (
    records: DayRecord[],
    adjustments: Adjustment[],
    options?: {
      from?: string;
      to?: string;
      scopeLabel?: string;
      title?: string;
      extraSummary?: { label: string; value: string | number }[];
    },
  ) => Promise<void>;
  exportBackup: () => Promise<void>;
  importBackup: () => Promise<boolean>;
  openDataFolder: () => Promise<void>;
  chooseBackupFolder: () => Promise<void>;
  resetBackupFolder: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Неизвестная ошибка';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => createEmptyData());
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [screen, setScreen] = useState<ScreenId>('dashboard');
  const [dayTarget, setDayTarget] = useState<DayTarget | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) =>
      current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)),
    );
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 200);
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      toastId.current += 1;
      const id = toastId.current;
      setToasts((current) => [...current.slice(-3), { id, tone, message }]);
      const timeout = tone === 'error' ? 6000 : 3500;
      window.setTimeout(() => dismissToast(id), timeout);
    },
    [dismissToast],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await api.load();
        const appInfo = await api.info();
        if (cancelled) return;
        setData(loaded);
        setInfo(appInfo);
      } catch (error) {
        if (!cancelled) setLoadError(errorMessage(error));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme;
    document.documentElement.style.colorScheme =
      data.settings.theme === 'light' ? 'light' : 'dark';
  }, [data.settings.theme]);

  const refreshBackupInfo = useCallback(async () => {
    if (!isDesktop) return;
    try { setInfo(await api.info()); } catch { /* next refresh will retry */ }
  }, []);

  useEffect(() => {
    if (!isDesktop || !ready || loadError) return;
    const timer = window.setInterval(() => void refreshBackupInfo(), 60_000);
    return () => window.clearInterval(timer);
  }, [ready, loadError, refreshBackupInfo]);

  const navigate = useCallback((next: ScreenId, target?: DayTarget | null) => {
    setScreen(next);
    if (next === 'day') setDayTarget(target ?? null);
  }, []);

  const saveRecord = useCallback(
    async (input: DayRecordInput) => {
      try {
        const next = await api.saveRecord(input);
        setData(next);
        void refreshBackupInfo();
        notify('Запись сохранена', 'success');
        return true;
      } catch (error) {
        notify(`Не удалось сохранить: ${errorMessage(error)}`, 'error');
        return false;
      }
    },
    [notify, refreshBackupInfo],
  );

  const deleteRecord = useCallback(
    async (id: string) => {
      try {
        const next = await api.deleteRecord(id);
        setData(next);
        void refreshBackupInfo();
        notify('Запись удалена', 'success');
        return true;
      } catch (error) {
        notify(`Не удалось удалить: ${errorMessage(error)}`, 'error');
        return false;
      }
    },
    [notify, refreshBackupInfo],
  );

  const saveAdjustment = useCallback(
    async (input: AdjustmentInput) => {
      try {
        const next = await api.saveAdjustment(input);
        setData(next);
        void refreshBackupInfo();
        notify('Движение добавлено', 'success');
        return true;
      } catch (error) {
        notify(`Не удалось добавить движение: ${errorMessage(error)}`, 'error');
        return false;
      }
    },
    [notify, refreshBackupInfo],
  );

  const deleteAdjustment = useCallback(
    async (id: string) => {
      try {
        const next = await api.deleteAdjustment(id);
        setData(next);
        void refreshBackupInfo();
        notify('Движение удалено', 'success');
        return true;
      } catch (error) {
        notify(`Не удалось удалить движение: ${errorMessage(error)}`, 'error');
        return false;
      }
    },
    [notify, refreshBackupInfo],
  );

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      try {
        const next = await api.updateSettings(patch);
        setData(next);
        void refreshBackupInfo();
        return true;
      } catch (error) {
        notify(`Не удалось сохранить настройки: ${errorMessage(error)}`, 'error');
        return false;
      }
    },
    [notify, refreshBackupInfo],
  );

  const replaceData = useCallback(
    async (raw: unknown) => {
      try {
        const next = await api.replaceData(raw);
        setData(next);
        void refreshBackupInfo();
        notify('Данные восстановлены из копии', 'success');
      } catch (error) {
        notify(`Не удалось загрузить копию: ${errorMessage(error)}`, 'error');
      }
    },
    [notify, refreshBackupInfo],
  );

  const clearAll = useCallback(async () => {
    try {
      const next = await api.replaceData(createEmptyData());
      setData(next);
      void refreshBackupInfo();
      notify('Все записи удалены', 'success');
    } catch (error) {
      notify(`Не удалось очистить данные: ${errorMessage(error)}`, 'error');
    }
  }, [notify, refreshBackupInfo]);

  const exportCsv = useCallback(
    async (
      records: DayRecord[],
      adjustments: Adjustment[],
      options: {
        from?: string;
        to?: string;
        scopeLabel?: string;
        title?: string;
        extraSummary?: { label: string; value: string | number }[];
      } = {},
    ) => {
      try {
        const content = buildCsv(records, adjustments, {
          ...options,
          commissionRate: data.settings.commissionRate,
        });
        const result = await api.exportFile({
          filename: csvFilename(options.from, options.to),
          content,
          filters: [{ name: 'CSV для Excel', extensions: ['csv'] }],
        });
        if (result.saved) notify('Отчёт сохранён', 'success');
      } catch (error) {
        notify(`Не удалось сохранить отчёт: ${errorMessage(error)}`, 'error');
      }
    },
    [data.settings.commissionRate, notify],
  );

  const exportBackup = useCallback(async () => {
    try {
      const result = await api.exportFile({
        filename: jsonBackupFilename(),
        content: buildJsonBackup(data),
        filters: [{ name: 'Резервная копия JSON', extensions: ['json'] }],
      });
      if (result.saved) notify('Резервная копия сохранена', 'success');
    } catch (error) {
      notify(`Не удалось сохранить копию: ${errorMessage(error)}`, 'error');
    }
  }, [data, notify]);

  const importBackup = useCallback(async () => {
    try {
      const restored = await api.importFile();
      if (!restored) return false;
      if (restored.records.length === 0 && restored.adjustments.length === 0 && (data.records.length > 0 || data.adjustments.length > 0)) {
        notify('В выбранном файле нет записей — данные не изменены', 'error');
        return false;
      }
      await api.replaceData(restored);
      setData(restored);
      void refreshBackupInfo();
      notify(`Загружено записей: ${restored.records.length}`, 'success');
      return true;
    } catch (error) {
      notify(`Не удалось загрузить копию: ${errorMessage(error)}`, 'error');
      return false;
    }
  }, [data.records.length, data.adjustments.length, notify, refreshBackupInfo]);

  const openDataFolder = useCallback(async () => {
    try {
      await api.openDataFolder();
    } catch (error) {
      notify(`Не удалось открыть папку: ${errorMessage(error)}`, 'error');
    }
  }, [notify]);

  const chooseBackupFolder = useCallback(async () => {
    try {
      const result = await api.chooseBackupFolder();
      if (result) { setInfo(result); notify('Папка автоматических копий изменена', 'success'); }
    } catch (error) { notify(`Не удалось выбрать папку копий: ${errorMessage(error)}`, 'error'); }
  }, [notify]);

  const resetBackupFolder = useCallback(async () => {
    try {
      setInfo(await api.resetBackupFolder());
      notify('Папка копий по умолчанию восстановлена', 'success');
    } catch (error) { notify(`Не удалось изменить папку копий: ${errorMessage(error)}`, 'error'); }
  }, [notify]);

  const openExternal = useCallback(
    async (url: string) => {
      try {
        await api.openExternal(url);
      } catch (error) {
        notify(`Не удалось открыть ссылку: ${errorMessage(error)}`, 'error');
      }
    },
    [notify],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      loadError,
      data,
      info,
      isDesktop,
      screen,
      dayTarget,
      toasts,
      navigate,
      saveRecord,
      deleteRecord,
      saveAdjustment,
      deleteAdjustment,
      updateSettings,
      replaceData,
      clearAll,
      notify,
      dismissToast,
      exportCsv,
      exportBackup,
      importBackup,
      openDataFolder,
      chooseBackupFolder,
      resetBackupFolder,
      openExternal,
    }),
    [
      ready,
      loadError,
      data,
      info,
      screen,
      dayTarget,
      toasts,
      navigate,
      saveRecord,
      deleteRecord,
      saveAdjustment,
      deleteAdjustment,
      updateSettings,
      replaceData,
      clearAll,
      notify,
      dismissToast,
      exportCsv,
      exportBackup,
      importBackup,
      openDataFolder,
      chooseBackupFolder,
      resetBackupFolder,
      openExternal,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp должен использоваться внутри AppProvider');
  return context;
}
