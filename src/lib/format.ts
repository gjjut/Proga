const numberFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const numberFormatter2 = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const NBSP = '\u00A0';

/** 1234.5 → «1 234,5» */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return numberFormatter.format(value);
}

/** 1234.5 → «1 234,50» */
export function formatNumber2(value: number): string {
  if (!Number.isFinite(value)) return '0,00';
  return numberFormatter2.format(value);
}

/** 1234.5 → «1 234,50 ₽» */
export function formatMoney(value: number): string {
  return `${formatNumber(value)}${NBSP}₽`;
}

/** 1234.5 → «1 234,50 ₽» (два знака после запятой) */
export function formatMoney2(value: number): string {
  return `${formatNumber2(value)}${NBSP}₽`;
}

/** Компактная запись для подписей графиков: 125000 → «125 тыс.» */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${formatNumber(value / 1_000_000)}${NBSP}млн`;
  if (abs >= 1_000) return `${formatNumber(value / 1_000)}${NBSP}тыс.`;
  return formatNumber(value);
}

/**
 * Разбирает пользовательский ввод суммы: «1 234,56 ₽», «1234.56», «12,5».
 * Возвращает неотрицательное число, округлённое до копеек.
 */
export function parseMoneyInput(raw: string): number {
  let cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned) return 0;

  const parts = cleaned.split(/[.,]/);
  if (parts.length > 1) {
    const tail = parts[parts.length - 1];
    // «1,234,567» и «1.234.567» — разделители тысяч, а не копейки.
    const isThousands =
      parts.length > 2 &&
      tail.length === 3 &&
      parts.slice(0, -1).every((part) => part.length >= 1 && part.length <= 3);
    cleaned = isThousands ? parts.join('') : `${parts.slice(0, -1).join('')}.${tail}`;
  }

  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100) / 100;
}

/** Строка для поля ввода суммы (без «₽», с запятой) */
export function moneyToInput(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '';
  return formatNumber2(value);
}

function localIso(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayIso(): string {
  return localIso(new Date());
}

export function addDays(isoDate: string, delta: number): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return localIso(date);
}

export function addMonths(isoDate: string, delta: number): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setMonth(date.getMonth() + delta);
  return localIso(date);
}

function toDate(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`);
}

const longDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const weekdayFormatter = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });

/** «5 ноября 2025» */
export function formatDateLong(isoDate: string): string {
  return longDateFormatter.format(toDate(isoDate));
}

/** «05.11.2025» */
export function formatDateShort(isoDate: string): string {
  return shortDateFormatter.format(toDate(isoDate));
}

/** «5 ноября 2025, ср» */
export function formatDateWithWeekday(isoDate: string): string {
  const weekday = weekdayFormatter.format(toDate(isoDate)).replace('.', '');
  return `${formatDateLong(isoDate)}, ${weekday}`;
}

/** «ноябрь 2025» */
export function formatMonthYear(isoDate: string): string {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(toDate(isoDate));
}

export function formatTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** «05.11, ср» — компактная подпись на графике */
export function formatChartLabel(isoDate: string): string {
  const date = toDate(isoDate);
  const day = `${date.getDate()}`.padStart(2, '0');
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${day}.${month}`;
}

/** Границы месяца (offset 0 — текущий, -1 — прошлый) */
export function monthRange(offset = 0, base = todayIso()): { from: string; to: string } {
  const date = toDate(base);
  const first = new Date(date.getFullYear(), date.getMonth() + offset, 1);
  const last = new Date(date.getFullYear(), date.getMonth() + offset + 1, 0);
  return { from: localIso(first), to: localIso(last) };
}

export function lastNDaysRange(days: number, base = todayIso()): { from: string; to: string } {
  return { from: addDays(base, -(days - 1)), to: base };
}

/** Русское склонение: plural(3, ['запись', 'записи', 'записей']) → «записи» */
export function plural(count: number, forms: [string, string, string]): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export function recordsLabel(count: number): string {
  return `${formatNumber(count)} ${plural(count, ['запись', 'записи', 'записей'])}`;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 2.75 → «2,75%» */
export function formatPercent(value: number): string {
  return `${formatNumber(value)}%`;
}

/** Сумма со знаком: 1500 → «+1 500 ₽», −1500 → «−1 500 ₽» */
export function formatSignedMoney(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatMoney(Math.abs(value))}`;
}
