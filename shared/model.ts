/**
 * Единая модель данных приложения.
 * Модуль используется и в main-процессе (Node), и в рендерере (браузер),
 * поэтому здесь нет ни Node-, ни DOM-специфичного кода.
 *
 * Схема v2 (текущая):
 *   • у записи дня появились «остаток наличных вчера» и «факт в кассе»;
 *   • итог дня = терминал + (факт − вчера) + расходы;
 *   • появились сторонние движения денег (поступления / изъятия);
 *   • комиссия банка задаётся процентом в настройках.
 */

export type CompanyId = 'zaton' | 'artfokus';
export type ThemeMode = 'dim' | 'black';
export type AdjustmentTarget = 'cash' | 'terminal' | 'reserve';
export type AdjustmentDirection = 'in' | 'out';

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
  /** Остаток наличных в кассе на начало дня (из предыдущей записи, можно поправить) */
  cashPrev: number;
  /** Сумма по терминалу за день */
  terminal: number;
  /** Фактическое наличие наличных в кассе на конец дня (включая отложенное в НЗ) */
  cashFact: number;
  /** Сумма, отложенная в НЗ за день */
  reserve: number;
  expenses: Expense[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** Стороннее движение денег: не входит в итог дня и выручку, но меняет остатки. */
export interface Adjustment {
  id: string;
  company: CompanyId;
  date: string;
  target: AdjustmentTarget;
  /** in — положить/поступило, out — забрать/изъято */
  direction: AdjustmentDirection;
  amount: number;
  comment: string;
  createdAt: string;
}

export interface Settings {
  theme: ThemeMode;
  lastCompany: CompanyId;
  /** Ставка комиссии банка по терминалу, в процентах */
  commissionRate: number;
}

export interface AppData {
  schemaVersion: number;
  records: DayRecord[];
  adjustments: Adjustment[];
  settings: Settings;
}

export interface DayRecordInput {
  id?: string;
  company: CompanyId;
  date: string;
  cashPrev: number;
  terminal: number;
  cashFact: number;
  reserve: number;
  expenses: Expense[];
  note?: string;
}

export interface AdjustmentInput {
  id?: string;
  company: CompanyId;
  date: string;
  target: AdjustmentTarget;
  direction: AdjustmentDirection;
  amount: number;
  comment?: string;
}

export const COMPANIES: readonly Company[] = [
  {
    id: 'zaton',
    name: 'Затон Рыбака',
    description: 'Рыболовная база',
    accent: '#FFFFFF',
  },
  {
    id: 'artfokus',
    name: 'Арт Фокус',
    description: 'Творческая студия',
    accent: '#9AA1A8',
  },
] as const;

export const SCHEMA_VERSION = 2;
export const DEFAULT_COMMISSION_RATE = 2.75;

export function isCompanyId(value: unknown): value is CompanyId {
  return value === 'zaton' || value === 'artfokus';
}

export function isAdjustmentTarget(value: unknown): value is AdjustmentTarget {
  return value === 'cash' || value === 'terminal' || value === 'reserve';
}

export function isAdjustmentDirection(value: unknown): value is AdjustmentDirection {
  return value === 'in' || value === 'out';
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
  const n =
    typeof value === 'number'
      ? value
      : Number.parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return round2(n);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Проверяет дату формата YYYY-MM-DD.
 *
 * Важно: нельзя сравнивать с `toISOString()` — дата без времени трактуется как локальная
 * полночь, и в любом часовом поясе восточнее UTC (Москва, Омск, Владивосток…) сдвигается
 * на предыдущий день. Поэтому проверяем компоненты через UTC-конструктор.
 */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
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

interface NormalizedRecord extends Omit<DayRecord, 'cashPrev'> {
  /** null — значения не было в файле, подставим из предыдущей записи компании */
  cashPrev: number | null;
}

function normalizeRecord(raw: unknown): NormalizedRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (!isCompanyId(item.company) || !isIsoDate(item.date)) return null;

  const hasPrev = typeof item.cashPrev === 'number' || typeof item.cashPrev === 'string';
  const cashPrev = hasPrev ? toMoney(item.cashPrev) : null;

  // Совместимость со схемой v1: там поле называлось `cash`.
  const factSource = item.cashFact ?? item.cash;

  return {
    id: typeof item.id === 'string' && item.id ? item.id : newId(),
    company: item.company,
    date: item.date,
    cashPrev,
    terminal: toMoney(item.terminal),
    cashFact: toMoney(factSource),
    reserve: toMoney(item.reserve),
    expenses: normalizeExpenses(item.expenses),
    note: typeof item.note === 'string' ? item.note.trim().slice(0, 1000) : '',
    createdAt: toIsoOrNow(item.createdAt),
    updatedAt: toIsoOrNow(item.updatedAt ?? item.createdAt),
  };
}

function normalizeAdjustment(raw: unknown): Adjustment | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  if (!isCompanyId(item.company) || !isIsoDate(item.date)) return null;
  if (!isAdjustmentTarget(item.target) || !isAdjustmentDirection(item.direction)) return null;
  const amount = toMoney(item.amount);
  if (amount <= 0) return null;

  return {
    id: typeof item.id === 'string' && item.id ? item.id : newId(),
    company: item.company,
    date: item.date,
    target: item.target,
    direction: item.direction,
    amount,
    comment: typeof item.comment === 'string' ? item.comment.trim().slice(0, 400) : '',
    createdAt: toIsoOrNow(item.createdAt),
  };
}

/**
 * Приводит любой (в том числе повреждённый, сторонний или старой схемы) объект
 * к валидному AppData. Гарантирует уникальность пары (company, date) среди записей.
 */
export function normalizeData(raw: unknown): AppData {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const rawRecords = Array.isArray(source.records) ? source.records : [];
  const byKey = new Map<string, NormalizedRecord>();

  for (const candidate of rawRecords) {
    const record = normalizeRecord(candidate);
    if (!record) continue;
    const key = recordKey(record.company, record.date);
    const existing = byKey.get(key);
    if (!existing || existing.updatedAt < record.updatedAt) {
      byKey.set(key, record);
    }
  }

  // Подставляем «остаток вчера» из предыдущей записи той же компании (миграция v1 → v2).
  const sorted = [...byKey.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.company.localeCompare(b.company),
  );
  const lastFact = new Map<CompanyId, number>();
  const records: DayRecord[] = sorted.map((record) => {
    const cashPrev = record.cashPrev ?? lastFact.get(record.company) ?? 0;
    lastFact.set(record.company, record.cashFact);
    return { ...record, cashPrev };
  });

  const adjustments = (Array.isArray(source.adjustments) ? source.adjustments : [])
    .map(normalizeAdjustment)
    .filter((item): item is Adjustment => item !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const settingsSource = (
    typeof source.settings === 'object' && source.settings !== null ? source.settings : {}
  ) as Record<string, unknown>;

  const rawRate = Number.parseFloat(String(settingsSource.commissionRate ?? ''));
  const commissionRate = Number.isFinite(rawRate)
    ? round2(Math.min(100, Math.max(0, rawRate)))
    : DEFAULT_COMMISSION_RATE;

  return {
    schemaVersion: SCHEMA_VERSION,
    records,
    adjustments,
    settings: {
      theme: isThemeMode(settingsSource.theme) ? settingsSource.theme : 'black',
      lastCompany: isCompanyId(settingsSource.lastCompany) ? settingsSource.lastCompany : 'zaton',
      commissionRate,
    },
  };
}

export function createEmptyData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    records: [],
    adjustments: [],
    settings: { theme: 'black', lastCompany: 'zaton', commissionRate: DEFAULT_COMMISSION_RATE },
  };
}

export function recordKey(company: CompanyId, date: string): string {
  return `${company}__${date}`;
}

/** Знак движения: «положить» → +, «забрать» → −. */
export function adjustmentSigned(adjustment: Adjustment): number {
  return adjustment.direction === 'in' ? adjustment.amount : -adjustment.amount;
}

/* ─────────────────────────── Мутации данных ─────────────────────────── */

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

  const base = {
    company: input.company,
    date: input.date,
    cashPrev: toMoney(input.cashPrev),
    terminal: toMoney(input.terminal),
    cashFact: toMoney(input.cashFact),
    reserve: toMoney(input.reserve),
    expenses,
    note: typeof input.note === 'string' ? input.note.trim().slice(0, 1000) : '',
  };

  if (index >= 0) {
    records[index] = { ...records[index], ...base, updatedAt: now };
  } else {
    records.push({ id: newId(), ...base, createdAt: now, updatedAt: now });
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

export function upsertAdjustment(data: AppData, input: AdjustmentInput): AppData {
  if (!isCompanyId(input.company)) throw new Error('Неизвестная компания');
  if (!isIsoDate(input.date)) throw new Error('Некорректная дата');
  if (!isAdjustmentTarget(input.target)) throw new Error('Неизвестный тип движения');
  if (!isAdjustmentDirection(input.direction)) throw new Error('Неизвестное направление');

  const amount = toMoney(input.amount);
  if (amount <= 0) throw new Error('Сумма должна быть больше нуля');

  const base = {
    company: input.company,
    date: input.date,
    target: input.target,
    direction: input.direction,
    amount,
    comment: typeof input.comment === 'string' ? input.comment.trim().slice(0, 400) : '',
  };

  const adjustments = [...data.adjustments];
  const index = input.id ? adjustments.findIndex((item) => item.id === input.id) : -1;

  if (index >= 0) {
    adjustments[index] = { ...adjustments[index], ...base };
  } else {
    adjustments.push({ id: newId(), ...base, createdAt: new Date().toISOString() });
  }

  adjustments.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  return { ...data, adjustments };
}

export function removeAdjustment(data: AppData, id: string): AppData {
  return { ...data, adjustments: data.adjustments.filter((item) => item.id !== id) };
}

export function patchSettings(data: AppData, patch: Partial<Settings>): AppData {
  const settings: Settings = { ...data.settings };
  if (isThemeMode(patch.theme)) settings.theme = patch.theme;
  if (isCompanyId(patch.lastCompany)) settings.lastCompany = patch.lastCompany;
  if (typeof patch.commissionRate === 'number' && Number.isFinite(patch.commissionRate)) {
    settings.commissionRate = round2(Math.min(100, Math.max(0, patch.commissionRate)));
  }
  return { ...data, settings };
}
