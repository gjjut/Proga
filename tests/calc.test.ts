import { describe, expect, it } from 'vitest';
import type { Adjustment, DayRecord } from '../shared/model';
import {
  companyBreakdown,
  companyTotals,
  dailySeries,
  dayMetrics,
  filterAdjustments,
  filterRecords,
  recordExpensesTotal,
  sortByDateDesc,
  suggestedCashPrev,
  totalsOf,
} from '../src/lib/calc';

const RATE = 2.75;

function rec(
  partial: Partial<DayRecord> & { company: DayRecord['company']; date: string },
): DayRecord {
  return {
    id: `${partial.company}-${partial.date}`,
    cashPrev: 0,
    terminal: 0,
    cashFact: 0,
    reserve: 0,
    expenses: [],
    note: '',
    createdAt: '2025-11-01T10:00:00.000Z',
    updatedAt: '2025-11-01T10:00:00.000Z',
    ...partial,
  } as DayRecord;
}

function adj(partial: Partial<Adjustment> & { date: string; company: Adjustment['company'] }): Adjustment {
  return {
    id: `${partial.company}-${partial.date}-${partial.target ?? 'cash'}-${partial.direction ?? 'in'}`,
    target: 'cash',
    direction: 'in',
    amount: 0,
    comment: '',
    createdAt: '2025-11-01T10:00:00.000Z',
    ...partial,
  } as Adjustment;
}

const records: DayRecord[] = [
  rec({
    company: 'zaton',
    date: '2025-11-01',
    cashPrev: 10000,
    terminal: 48200,
    cashFact: 9600,
    reserve: 4500,
    expenses: [{ id: 'e1', amount: 3400, comment: 'Корм' }],
  }),
  rec({
    company: 'zaton',
    date: '2025-11-02',
    cashPrev: 9600,
    terminal: 30000,
    cashFact: 20000,
    reserve: 2000,
    expenses: [{ id: 'e2', amount: 1800, comment: 'Бензин' }],
  }),
  rec({
    company: 'artfokus',
    date: '2025-11-02',
    cashPrev: 5000,
    terminal: 20000,
    cashFact: 4000,
    reserve: 3000,
    expenses: [{ id: 'e3', amount: 8000, comment: 'Аренда' }],
  }),
];

describe('dayMetrics', () => {
  it('считает изменение наличных, итог дня, комиссию и остаток', () => {
    const metrics = dayMetrics(records[0], RATE);
    expect(metrics.cashChange).toBe(-400);
    expect(metrics.expenses).toBe(3400);
    expect(metrics.revenue).toBe(51200); // 48200 − 400 + 3400
    expect(metrics.commission).toBe(1325.5); // 48200 × 2,75%
    expect(metrics.balance).toBe(45374.5); // 51200 − 1325,5 − 4500
  });

  it('не вычитает расходы из фактических денег повторно', () => {
    const withoutExpenses = dayMetrics(rec({ company: 'zaton', date: '2025-11-01', cashPrev: 10000, cashFact: 9600, terminal: 1000 }), RATE);
    const withExpenses = dayMetrics(
      rec({
        company: 'zaton',
        date: '2025-11-01',
        cashPrev: 10000,
        cashFact: 9600,
        terminal: 1000,
        expenses: [{ id: 'x', amount: 2500, comment: 'Тест' }],
      }),
      RATE,
    );
    // Расход добавляется в итог дня (он был оплачен из кассы), а не вычитается из факта.
    expect(withExpenses.revenue - withoutExpenses.revenue).toBe(2500);
    expect(withExpenses.cashChange).toBe(withoutExpenses.cashChange);
  });

  it('на НЗ комиссия не начисляется', () => {
    const metrics = dayMetrics(
      rec({ company: 'zaton', date: '2025-11-01', terminal: 0, cashPrev: 0, cashFact: 0, reserve: 10000 }),
      RATE,
    );
    expect(metrics.commission).toBe(0);
    expect(metrics.balance).toBe(-10000);
  });

  it('работает с нулевой ставкой', () => {
    const metrics = dayMetrics(records[1], 0);
    expect(metrics.commission).toBe(0);
    expect(metrics.balance).toBe(42200 - 2000);
  });
});

describe('totalsOf', () => {
  it('суммирует выручку, комиссию, НЗ и остаток', () => {
    const totals = totalsOf(records, [], RATE);
    expect(totals.revenue).toBe(120400);
    expect(totals.commission).toBe(2700.5);
    expect(totals.reserve).toBe(9500);
    expect(totals.balance).toBe(108199.5);
    expect(totals.records).toBe(3);
    expect(totals.expenseCount).toBe(3);
    expect(totals.lastDate).toBe('2025-11-02');
  });

  it('берёт наличные из последних записей каждой компании', () => {
    expect(totalsOf(records, [], RATE).cash).toBe(20000 + 4000);
  });

  it('считает по одной компании', () => {
    const zaton = companyTotals(records, [], 'zaton', RATE);
    expect(zaton.revenue).toBe(93400);
    expect(zaton.commission).toBe(2150.5);
    expect(zaton.reserve).toBe(6500);
    expect(zaton.cash).toBe(20000);
    expect(zaton.balance).toBe(84749.5);

    const artfokus = companyTotals(records, [], 'artfokus', RATE);
    expect(artfokus.revenue).toBe(27000);
    expect(artfokus.cash).toBe(4000);
    expect(artfokus.balance).toBe(23450);
  });

  it('даёт нули на пустом наборе', () => {
    expect(totalsOf([], [], RATE)).toMatchObject({ revenue: 0, balance: 0, cash: 0, records: 0 });
  });

  it('раскладывает по компаниям в порядке COMPANIES', () => {
    const breakdown = companyBreakdown(records, [], RATE);
    expect(breakdown.map((item) => item.company.id)).toEqual(['zaton', 'artfokus']);
  });

  it('показывает отрицательный остаток', () => {
    const totals = totalsOf(
      [rec({ company: 'zaton', date: '2025-11-03', terminal: 1000, cashPrev: 0, cashFact: 0, reserve: 9000 })],
      [],
      RATE,
    );
    expect(totals.balance).toBeLessThan(0);
  });
});

describe('движения денег', () => {
  it('поступление налички после последней записи увеличивает кассу и остаток', () => {
    const adjustments = [adj({ company: 'zaton', date: '2025-11-05', target: 'cash', direction: 'in', amount: 15000 })];
    const totals = totalsOf(records, adjustments, RATE);
    expect(totals.cash).toBe(24000 + 15000);
    expect(totals.balance).toBe(108199.5 + 15000);
    expect(totals.adjustments.cashNet).toBe(15000);
    expect(totals.adjustments.inTotal).toBe(15000);
  });

  it('изъятие налички уменьшает остаток', () => {
    const adjustments = [adj({ company: 'zaton', date: '2025-11-05', target: 'cash', direction: 'out', amount: 7000 })];
    const totals = totalsOf(records, adjustments, RATE);
    expect(totals.cash).toBe(24000 - 7000);
    expect(totals.balance).toBe(108199.5 - 7000);
    expect(totals.adjustments.outTotal).toBe(7000);
  });

  it('не учитывает наличку внутри уже записанных дней дважды', () => {
    const adjustments = [adj({ company: 'zaton', date: '2025-11-01', target: 'cash', direction: 'in', amount: 5000 })];
    const totals = totalsOf(records, adjustments, RATE);
    expect(totals.cash).toBe(24000);
    expect(totals.balance).toBe(108199.5);
  });

  it('НЗ копится с учётом движений', () => {
    const adjustments = [
      adj({ company: 'zaton', date: '2025-11-04', target: 'reserve', direction: 'in', amount: 10000 }),
      adj({ company: 'artfokus', date: '2025-11-04', target: 'reserve', direction: 'out', amount: 3000 }),
    ];
    const totals = totalsOf(records, adjustments, RATE);
    expect(totals.reserve).toBe(9500 + 10000 - 3000);
    expect(totals.balance).toBe(108199.5 - 10000 + 3000);
    expect(totals.adjustments.reserveNet).toBe(7000);
  });

  it('поступление через терминал идёт в остаток за вычетом комиссии', () => {
    const totals = totalsOf(
      records,
      [adj({ company: 'artfokus', date: '2025-11-06', target: 'terminal', direction: 'in', amount: 24000 })],
      RATE,
    );
    expect(totals.adjustments.commission).toBe(660); // 24000 × 2,75%
    expect(totals.adjustments.terminalNet).toBe(23340);
    expect(totals.adjustments.terminalGrossNet).toBe(24000);
    // Комиссия в сводке учитывает и поступления через терминал.
    expect(totals.commission).toBe(2700.5 + 660);
    expect(totals.balance).toBe(108199.5 + 23340);
  });

  it('изъятие через терминал не облагается комиссией', () => {
    const totals = totalsOf(
      records,
      [adj({ company: 'artfokus', date: '2025-11-06', target: 'terminal', direction: 'out', amount: 5000 })],
      RATE,
    );
    expect(totals.adjustments.terminalNet).toBe(-5000);
    expect(totals.adjustments.terminalGrossNet).toBe(-5000);
    expect(totals.adjustments.commission).toBe(0);
    expect(totals.commission).toBe(2700.5);
  });

  it('не меняет выручку', () => {
    const adjustments = [
      adj({ company: 'zaton', date: '2025-11-05', target: 'cash', direction: 'in', amount: 15000 }),
      adj({ company: 'zaton', date: '2025-11-05', target: 'terminal', direction: 'in', amount: 9000 }),
    ];
    expect(totalsOf(records, adjustments, RATE).revenue).toBe(120400);
  });
});

describe('suggestedCashPrev', () => {
  it('берёт факт последней записи компании', () => {
    expect(suggestedCashPrev(records, [], 'zaton', '2025-11-03')).toBe(20000);
  });

  it('добавляет движения по наличке между записями', () => {
    const adjustments = [
      adj({ company: 'zaton', date: '2025-11-03', target: 'cash', direction: 'in', amount: 15000 }),
      adj({ company: 'zaton', date: '2025-11-03', target: 'reserve', direction: 'in', amount: 9000 }),
    ];
    expect(suggestedCashPrev(records, adjustments, 'zaton', '2025-11-04')).toBe(35000);
  });

  it('не видит чужие компании и будущие движения', () => {
    const adjustments = [
      adj({ company: 'artfokus', date: '2025-11-03', target: 'cash', direction: 'in', amount: 15000 }),
      adj({ company: 'zaton', date: '2025-11-09', target: 'cash', direction: 'in', amount: 15000 }),
    ];
    expect(suggestedCashPrev(records, adjustments, 'zaton', '2025-11-05')).toBe(20000);
  });

  it('для первого дня возвращает 0 без записей', () => {
    expect(suggestedCashPrev([], [], 'zaton', '2025-11-01')).toBe(0);
  });
});

describe('фильтры и ряды', () => {
  it('фильтрует записи по компании и датам', () => {
    expect(filterRecords(records, { company: 'artfokus' })).toHaveLength(1);
    expect(filterRecords(records, { from: '2025-11-02', to: '2025-11-02' })).toHaveLength(2);
    expect(filterRecords(records, { query: 'корм' })).toHaveLength(1);
  });

  it('фильтрует движения по цели и компании', () => {
    const adjustments = [
      adj({ company: 'zaton', date: '2025-11-05', target: 'cash', amount: 100 }),
      adj({ company: 'zaton', date: '2025-11-05', target: 'reserve', amount: 200 }),
      adj({ company: 'artfokus', date: '2025-11-05', target: 'cash', amount: 300 }),
    ];
    expect(filterAdjustments(adjustments, { target: 'cash' })).toHaveLength(2);
    expect(filterAdjustments(adjustments, { company: 'zaton' })).toHaveLength(2);
    expect(filterAdjustments(adjustments, { target: 'cash', company: 'zaton' })).toHaveLength(1);
  });

  it('строит ряд по итогам дня', () => {
    const series = dailySeries(records, 2, '2025-11-02', RATE);
    expect(series.map((point) => point.date)).toEqual(['2025-11-01', '2025-11-02']);
    expect(series[0].total).toBe(51200);
    expect(series[1].total).toBe(42200 + 27000);
    expect(series[1].byCompany.zaton).toBe(42200);
    expect(series[1].byCompany.artfokus).toBe(27000);
  });

  it('сортирует по убыванию даты', () => {
    expect(sortByDateDesc(records)[0].date).toBe('2025-11-02');
  });

  it('складывает расходы без плавающих ошибок', () => {
    const value = recordExpensesTotal(
      rec({
        company: 'zaton',
        date: '2025-11-04',
        expenses: [
          { id: 'a', amount: 0.1, comment: '' },
          { id: 'b', amount: 0.2, comment: '' },
        ],
      }),
    );
    expect(value).toBe(0.3);
  });
});
