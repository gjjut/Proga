import {
  COMPANIES,
  DEFAULT_COMMISSION_RATE,
  adjustmentSigned,
  round2,
  type Adjustment,
  type AdjustmentTarget,
  type CompanyId,
  type DayRecord,
} from '../../shared/model';

/**
 * Модель расчётов (схема v2).
 *
 * Запись дня:
 *   изменение наличных = факт в кассе − остаток наличных вчера
 *   итог дня           = терминал + изменение наличных + расходы
 *   комиссия           = терминал × ставка банка
 *   НЗ                 = сумма, отложенная за день
 *   остаток дня        = итог дня − комиссия − НЗ
 *
 * Сводка:
 *   выручка   = Σ итогов дней
 *   комиссия  = Σ комиссий по дням + комиссия с поступлений через терминал
 *   НЗ        = Σ отложено за дни ± движения по НЗ
 *   остаток   = выручка − комиссия − НЗ + движения по наличке + движения по терминалу
 *
 * Движения по наличке, датированные позже последней записи компании, ещё не попали
 * ни в один «факт кассы», поэтому они меняют и наличные, и остаток. Движения внутри
 * уже записанных дней уже сидят в фактическом остатке — второй раз их не считаем.
 */

export interface DayMetrics {
  /** Изменение наличных в кассе за день */
  cashChange: number;
  /** Сумма расходов дня */
  expenses: number;
  /** Итог дня: терминал + изменение наличных + расходы */
  revenue: number;
  /** Комиссия банка по терминалу */
  commission: number;
  /** Отложено в НЗ */
  reserve: number;
  /** Остаток дня: итог − комиссия − НЗ */
  balance: number;
}

export function recordExpensesTotal(record: DayRecord): number {
  return round2(record.expenses.reduce((sum, expense) => sum + expense.amount, 0));
}

export function commissionOf(amount: number, rate: number = DEFAULT_COMMISSION_RATE): number {
  return round2((amount * rate) / 100);
}

export function dayMetrics(
  record: DayRecord,
  commissionRate: number = DEFAULT_COMMISSION_RATE,
): DayMetrics {
  const expenses = recordExpensesTotal(record);
  const cashChange = round2(record.cashFact - record.cashPrev);
  const revenue = round2(record.terminal + cashChange + expenses);
  const commission = commissionOf(record.terminal, commissionRate);
  return {
    cashChange,
    expenses,
    revenue,
    commission,
    reserve: record.reserve,
    balance: round2(revenue - commission - record.reserve),
  };
}

export interface AdjustmentImpact {
  /** Сколько всего положили */
  inTotal: number;
  /** Сколько всего забрали */
  outTotal: number;
  /** Влияние движений по наличке на остаток (уже вне записей) */
  cashNet: number;
  /** Влияние движений по терминалу на остаток (за вычетом комиссии) */
  terminalNet: number;
  /** То же без вычета комиссии — чтобы остаток сходился с показанной комиссией */
  terminalGrossNet: number;
  /** Чистое движение по НЗ: + положили, − забрали */
  reserveNet: number;
  /** Комиссия банка, удержанная с поступлений по терминалу */
  commission: number;
}

/**
 * Где лежат деньги (остатки, а не начисления):
 *   наличные — физический остаток кассы,
 *   терминал — пришло по терминалу минус комиссия банка и изъятия,
 *   НЗ       — отложено в неприкосновенный запас.
 * Общий остаток = наличные + терминал + НЗ.
 */
export interface Pots {
  cash: number;
  terminal: number;
  reserve: number;
  total: number;
  /** Свободные деньги без НЗ: наличные + терминал */
  free: number;
}

export interface Totals {
  /** Выручка: сумма итогов дней */
  revenue: number;
  /** Комиссия банка: по терминалу дней + с поступлений через терминал */
  commission: number;
  /** Расходы за период (справочно) */
  expenses: number;
  /** Неприкосновенный запас: накоплено */
  reserve: number;
  /** Наличные в кассе: фактический остаток + движения после последней записи */
  cash: number;
  /** Свободный остаток: выручка − комиссия − НЗ ± движения */
  balance: number;
  records: number;
  expenseCount: number;
  lastDate: string | null;
  adjustments: AdjustmentImpact;
  commissionRate: number;
  /** Разбивка остатка: наличные / терминал / НЗ */
  pots: Pots;
}

export const EMPTY_IMPACT: AdjustmentImpact = {
  inTotal: 0,
  outTotal: 0,
  cashNet: 0,
  terminalNet: 0,
  terminalGrossNet: 0,
  reserveNet: 0,
  commission: 0,
};

export const EMPTY_TOTALS: Totals = {
  revenue: 0,
  commission: 0,
  expenses: 0,
  reserve: 0,
  cash: 0,
  balance: 0,
  records: 0,
  expenseCount: 0,
  lastDate: null,
  adjustments: { ...EMPTY_IMPACT },
  commissionRate: DEFAULT_COMMISSION_RATE,
  pots: { cash: 0, terminal: 0, reserve: 0, total: 0, free: 0 },
};

function laterRecord(current: DayRecord | undefined, candidate: DayRecord): DayRecord {
  if (!current) return candidate;
  if (candidate.date > current.date) return candidate;
  if (candidate.date < current.date) return current;
  return candidate.updatedAt >= current.updatedAt ? candidate : current;
}

export function lastRecordByCompany(records: DayRecord[]): Map<CompanyId, DayRecord> {
  const map = new Map<CompanyId, DayRecord>();
  for (const record of records) {
    map.set(record.company, laterRecord(map.get(record.company), record));
  }
  return map;
}

export function totalsOf(
  records: DayRecord[],
  adjustments: Adjustment[] = [],
  commissionRate: number = DEFAULT_COMMISSION_RATE,
): Totals {
  if (records.length === 0 && adjustments.length === 0) {
    return { ...EMPTY_TOTALS, commissionRate };
  }

  let revenue = 0;
  let commission = 0;
  let expenses = 0;
  let expenseCount = 0;
  let reserveDeposits = 0;
  let terminalGross = 0;
  let lastDate: string | null = null;

  for (const record of records) {
    const metrics = dayMetrics(record, commissionRate);
    revenue += metrics.revenue;
    commission += metrics.commission;
    expenses += metrics.expenses;
    expenseCount += record.expenses.length;
    reserveDeposits += record.reserve;
    terminalGross += record.terminal;
    if (!lastDate || record.date > lastDate) lastDate = record.date;
  }

  const lastByCompany = lastRecordByCompany(records);

  const impact: AdjustmentImpact = { ...EMPTY_IMPACT };
  let reserveAdjustments = 0;

  for (const adjustment of adjustments) {
    const signed = adjustmentSigned(adjustment);
    if (adjustment.direction === 'in') impact.inTotal += adjustment.amount;
    else impact.outTotal += adjustment.amount;

    if (adjustment.target === 'reserve') {
      reserveAdjustments += signed;
      continue;
    }

    if (adjustment.target === 'terminal') {
      const fee = adjustment.direction === 'in' ? commissionOf(adjustment.amount, commissionRate) : 0;
      impact.commission += fee;
      impact.terminalNet += adjustment.direction === 'in' ? adjustment.amount - fee : -adjustment.amount;
      impact.terminalGrossNet += signed;
      continue;
    }

    // Наличка: учитываем только то, что ещё не попало в фактический остаток записей.
    const lastRecord = lastByCompany.get(adjustment.company);
    if (!lastRecord || adjustment.date > lastRecord.date) {
      impact.cashNet += signed;
    }
  }

  let cash = 0;
  for (const company of COMPANIES) {
    const lastRecord = lastByCompany.get(company.id);
    const base = lastRecord ? lastRecord.cashFact : 0;
    const after = adjustments
      .filter(
        (adjustment) =>
          adjustment.company === company.id &&
          adjustment.target === 'cash' &&
          (!lastRecord || adjustment.date > lastRecord.date),
      )
      .reduce((sum, adjustment) => sum + adjustmentSigned(adjustment), 0);
    cash += base + after;
  }

  const reserve = round2(reserveDeposits + reserveAdjustments);
  // Комиссия в сводке — полная: и по дням, и с поступлений через терминал.
  const commissionTotal = round2(commission + impact.commission);
  const terminalPot = round2(terminalGross - commissionTotal + impact.terminalGrossNet);
  const balance = round2(
    revenue - commissionTotal - reserve + impact.cashNet + impact.terminalGrossNet,
  );

  return {
    revenue: round2(revenue),
    commission: commissionTotal,
    expenses: round2(expenses),
    reserve,
    cash: round2(cash),
    balance,
    records: records.length,
    expenseCount,
    lastDate,
    pots: {
      cash: round2(cash),
      terminal: terminalPot,
      reserve,
      total: round2(round2(cash) + terminalPot + reserve),
      free: round2(round2(cash) + terminalPot),
    },
    adjustments: {
      inTotal: round2(impact.inTotal),
      outTotal: round2(impact.outTotal),
      cashNet: round2(impact.cashNet),
      terminalNet: round2(impact.terminalNet),
      terminalGrossNet: round2(impact.terminalGrossNet),
      reserveNet: round2(reserveAdjustments),
      commission: round2(impact.commission),
    },
    commissionRate,
  };
}

export function companyTotals(
  records: DayRecord[],
  adjustments: Adjustment[],
  company: CompanyId,
  commissionRate: number = DEFAULT_COMMISSION_RATE,
): Totals {
  return totalsOf(
    records.filter((record) => record.company === company),
    adjustments.filter((adjustment) => adjustment.company === company),
    commissionRate,
  );
}

/**
 * Рекомендуемый «остаток наличных вчера»: фактический остаток кассы последней записи
 * компании плюс движения по наличке, случившиеся между ней и выбранной датой.
 */
export function suggestedCashPrev(
  records: DayRecord[],
  adjustments: Adjustment[],
  company: CompanyId,
  date: string,
): number {
  const earlier = records
    .filter((record) => record.company === company && record.date < date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt));
  const last = earlier[earlier.length - 1] ?? null;
  const base = last ? last.cashFact : 0;
  const baseDate = last ? last.date : '0000-01-01';

  const movements = adjustments
    .filter(
      (adjustment) =>
        adjustment.company === company &&
        adjustment.target === 'cash' &&
        adjustment.date > baseDate &&
        adjustment.date < date,
    )
    .reduce((sum, adjustment) => sum + adjustmentSigned(adjustment), 0);

  return round2(base + movements);
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
      const haystack = [record.note, ...record.expenses.map((expense) => expense.comment)]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export function filterAdjustments(
  adjustments: Adjustment[],
  filter: Omit<RecordFilter, 'query'> & { target?: AdjustmentTarget | 'all' } = {},
): Adjustment[] {
  const { company = 'all', from, to, target = 'all' } = filter;
  return adjustments.filter((adjustment) => {
    if (company !== 'all' && adjustment.company !== company) return false;
    if (target !== 'all' && adjustment.target !== target) return false;
    if (from && adjustment.date < from) return false;
    if (to && adjustment.date > to) return false;
    return true;
  });
}

export function sortByDateDesc<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.date.localeCompare(a.date));
}

export function sortByDateAsc<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.date.localeCompare(b.date));
}

export interface SeriesPoint {
  date: string;
  total: number;
  byCompany: Record<CompanyId, number>;
}

/** Ряды по дням за последние `days` дней (включая сегодня): выручка = итог дня. */
export function dailySeries(
  records: DayRecord[],
  days: number,
  today: string,
  commissionRate: number = DEFAULT_COMMISSION_RATE,
): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  const index = new Map<string, SeriesPoint>();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = shiftDate(today, -offset);
    const point: SeriesPoint = { date, total: 0, byCompany: { zaton: 0, artfokus: 0 } };
    points.push(point);
    index.set(date, point);
  }

  for (const record of records) {
    const point = index.get(record.date);
    if (!point) continue;
    const revenue = dayMetrics(record, commissionRate).revenue;
    point.total = round2(point.total + revenue);
    point.byCompany[record.company] = round2(point.byCompany[record.company] + revenue);
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

export function companyBreakdown(
  records: DayRecord[],
  adjustments: Adjustment[],
  commissionRate: number = DEFAULT_COMMISSION_RATE,
): { company: (typeof COMPANIES)[number]; totals: Totals }[] {
  return COMPANIES.map((company) => ({
    company,
    totals: companyTotals(records, adjustments, company.id, commissionRate),
  }));
}
