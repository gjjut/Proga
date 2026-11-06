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
 * Модель расчётов (схема v3).
 *
 * Деньги лежат в трёх разных местах, и каждый кошелёк считается отдельно:
 *   наличные в кассе  — рабочий остаток («факт в кассе» БЕЗ суммы в НЗ),
 *   на терминале      — пришло по терминалу минус комиссия банка,
 *   НЗ                — отложено в неприкосновенный запас.
 * Поэтому общий остаток = наличные + терминал + НЗ, и ничего не считается дважды.
 *
 * Запись дня:
 *   изменение наличных = факт в кассе − остаток наличных вчера
 *   наличная выручка   = изменение наличных + расходы + НЗ
 *                        (расходы и НЗ физически ушли из кассы, поэтому в факте их нет:
 *                         восстанавливаем, сколько было продано за наличные)
 *   выручка дня        = терминал + наличная выручка
 *   комиссия           = терминал × ставка банка
 *   ЗАРАБОТАНО ЗА ДЕНЬ = выручка − комиссия − расходы
 *                      = терминал − комиссия + изменение наличных + НЗ
 *
 * Ключевое: расходы сами по себе ничего не «прибавляют» — они входят в выручку только
 * как часть восстановления наличной выручки и тут же вычитаются. Потратил больше —
 * в кассе осталось меньше, значит и заработал меньше.
 *
 * НЗ — не расход, а перекладывание своих денег: заработок оно не уменьшает,
 * но эти деньги недоступны, поэтому в остатках показаны отдельным кошельком.
 *
 * Сводка за период:
 *   выручка    = Σ выручки дней
 *   комиссия   = Σ комиссий по дням + комиссия с поступлений через терминал
 *   расходы    = Σ расходов дней
 *   НЗ         = Σ отложено за дни ± движения по НЗ
 *   заработано = выручка − комиссия − расходы
 *   остатки    = состояние на сейчас (не зависят от периода)
 *
 * Контроль: остаток на сейчас = стартовый остаток кассы + заработано за всё время
 *           ± движения денег. Движения — не заработок, они меняют только остатки.
 */

export interface DayMetrics {
  /** Изменение наличных в кассе за день */
  cashChange: number;
  /** Наличная выручка: изменение наличных + расходы + НЗ */
  cashSales: number;
  /** Сумма расходов дня */
  expenses: number;
  /** Выручка дня: терминал + наличная выручка */
  revenue: number;
  /** Комиссия банка по терминалу */
  commission: number;
  /** Отложено в НЗ */
  reserve: number;
  /** Заработано за день: выручка − комиссия − расходы */
  earned: number;
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
  // Из кассы ушли и расходы, и отложенное в НЗ — значит, столько было продано за наличные.
  const cashSales = round2(cashChange + expenses + record.reserve);
  const revenue = round2(record.terminal + cashSales);
  const commission = commissionOf(record.terminal, commissionRate);
  return {
    cashChange,
    cashSales,
    expenses,
    revenue,
    commission,
    reserve: record.reserve,
    earned: round2(revenue - commission - expenses),
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
  /** Выручка за период: сумма выручки дней (терминал + наличная выручка) */
  revenue: number;
  /** Комиссия банка: по терминалу дней + с поступлений через терминал */
  commission: number;
  /** Расходы за период */
  expenses: number;
  /** Неприкосновенный запас: накоплено */
  reserve: number;
  /** Наличные в кассе: фактический остаток + движения после последней записи */
  cash: number;
  /** Заработано за период: выручка − комиссия − расходы (движения не в счёт) */
  earned: number;
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
  earned: 0,
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
  // НЗ не вычитаем: это не расход, а переложенные в запас свои же деньги.
  // Комиссию с поступлений через терминал вычитаем: банк действительно её удержал.
  const earned = round2(revenue - commissionTotal - expenses);

  return {
    revenue: round2(revenue),
    commission: commissionTotal,
    expenses: round2(expenses),
    reserve,
    cash: round2(cash),
    earned,
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
