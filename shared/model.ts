/**
 * Единая модель данных приложения.
 * Модуль используется и в main-процессе (Node), и в рендерере (браузер),
 * поэтому здесь нет ни Node-, ни DOM-специфичного кода.
 */

export type CompanyId = 'zaton' | 'artfokus';
export type ThemeMode = 'dim' | 'black';

export interface Company {
  id: CompanyId;
  name: string;
  description: string;
  accent: string;
}

export interface Expense {
  id: string;
  amount: number;
  comment: string;
}

export interface DayRecord {
  id: string;
  company: CompanyId;
  /** Локальная дата в формате YYYY-MM-DD */
  date: string;
  /** Сумма по терминалу — выручка дня */
  terminal: number;
  /** Остаток наличных в кассе на конец дня */
  cash: number;
  /** Сумма, отложенная в неприкосновенный запас */
  reserve: number;
  expenses: Expense[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  theme: ThemeMode;
  lastCompany: CompanyId;
}

export interface AppData {
  schemaVersion: number;
  records: DayRecord[];
  settings: Settings;
}

export const COMPANIES: readonly Company[] = [
  {
    id: 'zaton',
    name: 'Затон Рыбака',
    description: 'Рыболовная база',
    accent: '#1D9BF0',
  },
  {
    id: 'artfokus',
    name: 'Арт Фокус',
    description: 'Творческая студия',
    accent: '#F91880',
  },
] as const;

export const SCHEMA_VERSION = 1;

export function isCompanyId(value: unknown): value is CompanyId {
  return value === 'zaton' || value === 'artfokus';
}

export function companyById(id: CompanyId): Company {
  return COMPANIES.find((company) => company.id === id) ?? COMPANIES[0];
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dim' || value === 'black';
}

export function newId(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toMoney(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return round2(n);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && value === date.toISOString().slice(0, 10);
}

function toIsoOrNow(value: unknown): string {
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function normalizeExpenses(raw: unknown): Expense[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      id: typeof item.id === 'string' && item.id ? item.id : newId(),
      amount: toMoney(item.amount),
      comment: typeof item.comment === 'string' ? item.comment.trim().slice(0, 400) : '',
    }))
    .filter((item) => item.amount > 0 || item.comment.length > 0);
}

function normalizeRecord(raw: unknown): DayRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (!isCompanyId(item.company) || !isIsoDate(item.date)) return null;
  return {
    id: typeof item.id === 'string' && item.id ? item.id : newId(),
    company: item.company,
    date: item.date,
    terminal: toMoney(item.terminal),
    cash: toMoney(item.cash),
    reserve: toMoney(item.reserve),
    expenses: normalizeExpenses(item.expenses),
    note: typeof item.note === 'string' ? item.note.trim().slice(0, 1000) : '',
    createdAt: toIsoOrNow(item.createdAt),
    updatedAt: toIsoOrNow(item.updatedAt ?? item.createdAt),
  };
}

/**
 * Приводит любой (в том числе повреждённый или сторонний) объект к валидному AppData.
 * Гарантирует уникальность пары (company, date): при конфликте остаётся более свежая запись.
 */
export function normalizeData(raw: unknown): AppData {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const rawRecords = Array.isArray(source.records) ? source.records : [];
  const byKey = new Map<string, DayRecord>();

  for (const candidate of rawRecords) {
    const record = normalizeRecord(candidate);
    if (!record) continue;
    const key = `${record.company}__${record.date}`;
    const existing = byKey.get(key);
    if (!existing || existing.updatedAt < record.updatedAt) {
      byKey.set(key, record);
    }
  }

  const settingsSource = (typeof source.settings === 'object' && source.settings !== null
    ? source.settings
    : {}) as Record<string, unknown>;

  return {
    schemaVersion: SCHEMA_VERSION,
    records: [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date)),
    settings: {
      theme: isThemeMode(settingsSource.theme) ? settingsSource.theme : 'dim',
      lastCompany: isCompanyId(settingsSource.lastCompany) ? settingsSource.lastCompany : 'zaton',
    },
  };
}

export function createEmptyData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    records: [],
    settings: { theme: 'dim', lastCompany: 'zaton' },
  };
}

export function recordKey(company: CompanyId, date: string): string {
  return `${company}__${date}`;
}

/* ─────────────────────────── Мутации данных ─────────────────────────── */

export interface DayRecordInput {
  id?: string;
  company: CompanyId;
  date: string;
  terminal: number;
  cash: number;
  reserve: number;
  expenses: Expense[];
  note?: string;
}

/** Создаёт или обновляет запись дня. Инвариант: одна запись на пару (company, date). */
export function upsertRecord(data: AppData, input: DayRecordInput): AppData {
  if (!isCompanyId(input.company)) throw new Error('Неизвестная компания');
  if (!isIsoDate(input.date)) throw new Error('Некорректная дата');

  const expenses: Expense[] = Array.isArray(input.expenses)
    ? input.expenses
        .map((expense) => ({
          id: expense.id || newId(),
          amount: toMoney(expense.amount),
          comment: typeof expense.comment === 'string' ? expense.comment.trim().slice(0, 400) : '',
        }))
        .filter((expense) => expense.amount > 0 || expense.comment.length > 0)
    : [];

  const now = new Date().toISOString();
  const records = [...data.records];
  const byId = input.id ? records.findIndex((record) => record.id === input.id) : -1;
  const byDay = records.findIndex(
    (record) => record.company === input.company && record.date === input.date,
  );
  const index = byId >= 0 ? byId : byDay;

  if (index >= 0) {
    const previous = records[index];
    records[index] = {
      ...previous,
      company: input.company,
      date: input.date,
      terminal: toMoney(input.terminal),
      cash: toMoney(input.cash),
      reserve: toMoney(input.reserve),
      expenses,
      note: typeof input.note === 'string' ? input.note.trim().slice(0, 1000) : '',
      updatedAt: now,
    };
  } else {
    records.push({
      id: newId(),
      company: input.company,
      date: input.date,
      terminal: toMoney(input.terminal),
      cash: toMoney(input.cash),
      reserve: toMoney(input.reserve),
      expenses,
      note: typeof input.note === 'string' ? input.note.trim().slice(0, 1000) : '',
      createdAt: now,
      updatedAt: now,
    });
  }

  // Страховка от дублей, если запись перенесли на другую дату/компанию.
  const seen = new Set<string>();
  const unique = records.filter((record) => {
    const key = recordKey(record.company, record.date);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => a.date.localeCompare(b.date) || a.company.localeCompare(b.company));
  return { ...data, records: unique };
}

export function removeRecord(data: AppData, id: string): AppData {
  return { ...data, records: data.records.filter((record) => record.id !== id) };
}

export function patchSettings(data: AppData, patch: Partial<Settings>): AppData {
  const settings: Settings = { ...data.settings };
  if (isThemeMode(patch.theme)) settings.theme = patch.theme;
  if (isCompanyId(patch.lastCompany)) settings.lastCompany = patch.lastCompany;
  return { ...data, settings };
}
