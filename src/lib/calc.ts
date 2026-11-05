import { COMPANIES, type CompanyId, type DayRecord } from '../../shared/model';
import { round2 } from '../../shared/model';

export interface Totals {
  /** Выручка: сумма по терминалу */
  revenue: number;
  /** Сумма всех расходов */
  expenses: number;
  /** Отложено в неприкосновенный запас */
  reserve: number;
  /** Свободный остаток: выручка − расходы − НЗ */
  balance: number;
  /** Остаток наличных в кассе по последней записи */
  cash: number;
  /** Количество записей (дней) */
  records: number;
  /** Количество строк расходов */
  expenseCount: number;
  lastDate: string | null;
}

export const EMPTY_TOTALS: Totals = {
  revenue: 0,
  expenses: 0,
  reserve: 0,
  balance: 0,
  cash: 0,
  records: 0,
  expenseCount: 0,
  lastDate: null,
};

export function recordExpensesTotal(record: DayRecord): number {
  return round2(record.expenses.reduce((sum, expense) => sum + expense.amount, 0));
}

/** Итоги за один день: выручка, расходы, НЗ, остаток дня */
export function dayTotals(record: DayRecord): {
  revenue: number;
  expenses: number;
  reserve: number;
  balance: number;
} {
  const expenses = recordExpensesTotal(record);
  return {
    revenue: record.terminal,
    expenses,
    reserve: record.reserve,
    balance: round2(record.terminal - expenses - record.reserve),
  };
}

function laterRecord(current: DayRecord | null, candidate: DayRecord): DayRecord {
  if (!current) return candidate;
  if (candidate.date > current.date) return candidate;
  if (candidate.date < current.date) return current;
  return candidate.updatedAt >= current.updatedAt ? candidate : current;
}

export function totalsOf(records: DayRecord[]): Totals {
  if (records.length === 0) return { ...EMPTY_TOTALS };

  let revenue = 0;
  let expenses = 0;
  let reserve = 0;
  let expenseCount = 0;
  let latest: DayRecord | null = null;
  const latestByCompany = new Map<CompanyId, DayRecord>();

  for (const record of records) {
    revenue += record.terminal;
    reserve += record.reserve;
    expenses += recordExpensesTotal(record);
    expenseCount += record.expenses.length;
    latest = laterRecord(latest, record);
    latestByCompany.set(record.company, laterRecord(latestByCompany.get(record.company) ?? null, record));
  }

  const cash = round2(
    [...latestByCompany.values()].reduce((sum, current) => sum + current.cash, 0),
  );

  return {
    revenue: round2(revenue),
    expenses: round2(expenses),
    reserve: round2(reserve),
    balance: round2(revenue - expenses - reserve),
    cash,
    records: records.length,
    expenseCount,
    lastDate: latest ? latest.date : null,
  };
}

export function companyTotals(records: DayRecord[], company: CompanyId): Totals {
  return totalsOf(records.filter((record) => record.company === company));
}

export interface RecordFilter {
  company?: CompanyId | 'all';
  from?: string;
  to?: string;
  query?: string;
}

export function filterRecords(records: DayRecord[], filter: RecordFilter = {}): DayRecord[] {
  const { company = 'all', from, to, query } = filter;
  const needle = query?.trim().toLowerCase() ?? '';

  return records.filter((record) => {
    if (company !== 'all' && record.company !== company) return false;
    if (from && record.date < from) return false;
    if (to && record.date > to) return false;
    if (needle) {
      const haystack = [
        record.note,
        ...record.expenses.map((expense) => expense.comment),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export function sortByDateDesc(records: DayRecord[]): DayRecord[] {
  return [...records].sort(
    (a, b) => b.date.localeCompare(a.date) || a.company.localeCompare(b.company),
  );
}

export function sortByDateAsc(records: DayRecord[]): DayRecord[] {
  return [...records].sort(
    (a, b) => a.date.localeCompare(b.date) || a.company.localeCompare(b.company),
  );
}

export interface SeriesPoint {
  date: string;
  total: number;
  byCompany: Record<CompanyId, number>;
}

/** Ряды по дням за последние `days` дней (включая сегодня) */
export function dailySeries(
  records: DayRecord[],
  days: number,
  today: string,
): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  const index = new Map<string, SeriesPoint>();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = shiftDate(today, -offset);
    const point: SeriesPoint = {
      date,
      total: 0,
      byCompany: { zaton: 0, artfokus: 0 },
    };
    points.push(point);
    index.set(date, point);
  }

  for (const record of records) {
    const point = index.get(record.date);
    if (!point) continue;
    point.total = round2(point.total + record.terminal);
    point.byCompany[record.company] = round2(point.byCompany[record.company] + record.terminal);
  }

  return points;
}

function shiftDate(isoDate: string, delta: number): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + delta);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Доступные компании с их агрегатами — для главного экрана */
export function companyBreakdown(records: DayRecord[]): {
  company: (typeof COMPANIES)[number];
  totals: Totals;
}[] {
  return COMPANIES.map((company) => ({
    company,
    totals: companyTotals(records, company.id),
  }));
}

export function maxTerminal(records: DayRecord[]): number {
  return records.reduce((max, record) => Math.max(max, record.terminal), 0);
}
