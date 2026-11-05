import { describe, expect, it } from 'vitest';
import type { DayRecord } from '../shared/model';
import {
  companyBreakdown,
  companyTotals,
  dailySeries,
  dayTotals,
  filterRecords,
  recordExpensesTotal,
  sortByDateDesc,
  totalsOf,
} from '../src/lib/calc';

function record(partial: Partial<DayRecord> & { company: DayRecord['company']; date: string }): DayRecord {
  return {
    id: `${partial.company}-${partial.date}`,
    terminal: 0,
    cash: 0,
    reserve: 0,
    expenses: [],
    note: '',
    createdAt: '2025-11-01T10:00:00.000Z',
    updatedAt: '2025-11-01T10:00:00.000Z',
    ...partial,
  } as DayRecord;
}

const records: DayRecord[] = [
  record({
    company: 'zaton',
    date: '2025-11-01',
    terminal: 50000,
    cash: 12000,
    reserve: 5000,
    expenses: [
      { id: 'e1', amount: 3000, comment: 'Корм' },
      { id: 'e2', amount: 2000, comment: 'Бензин' },
    ],
  }),
  record({
    company: 'zaton',
    date: '2025-11-02',
    terminal: 30000,
    cash: 9000,
    reserve: 2000,
    expenses: [{ id: 'e3', amount: 1000, comment: 'Лёд' }],
  }),
  record({
    company: 'artfokus',
    date: '2025-11-02',
    terminal: 20000,
    cash: 4000,
    reserve: 3000,
    expenses: [{ id: 'e4', amount: 8000, comment: 'Аренда студии' }],
  }),
];

describe('totalsOf', () => {
  it('суммирует выручку, расходы, НЗ и остаток', () => {
    const totals = totalsOf(records);
    expect(totals.revenue).toBe(100000);
    expect(totals.expenses).toBe(14000);
    expect(totals.reserve).toBe(10000);
    expect(totals.balance).toBe(76000);
    expect(totals.records).toBe(3);
    expect(totals.expenseCount).toBe(4);
    expect(totals.lastDate).toBe('2025-11-02');
  });

  it('берёт наличные из последней по дате записи', () => {
    expect(totalsOf(records).cash).toBe(9000 + 4000);
  });

  it('считает по компании отдельно', () => {
    const zaton = companyTotals(records, 'zaton');
    expect(zaton.revenue).toBe(80000);
    expect(zaton.expenses).toBe(6000);
    expect(zaton.reserve).toBe(7000);
    expect(zaton.balance).toBe(67000);
    expect(zaton.cash).toBe(9000);

    const artfokus = companyTotals(records, 'artfokus');
    expect(artfokus.revenue).toBe(20000);
    expect(artfokus.balance).toBe(9000);
  });

  it('даёт нули на пустом наборе', () => {
    expect(totalsOf([])).toMatchObject({ revenue: 0, expenses: 0, reserve: 0, balance: 0, records: 0 });
  });

  it('показывает отрицательный остаток', () => {
    const totals = totalsOf([
      record({
        company: 'zaton',
        date: '2025-11-03',
        terminal: 1000,
        expenses: [{ id: 'x', amount: 5000, comment: 'Ремонт' }],
      }),
    ]);
    expect(totals.balance).toBe(-4000);
  });

  it('раскладывает по компаниям в порядке COMPANIES', () => {
    const breakdown = companyBreakdown(records);
    expect(breakdown.map((item) => item.company.id)).toEqual(['zaton', 'artfokus']);
    expect(breakdown[0].totals.revenue).toBe(80000);
  });
});

describe('dayTotals и расходы', () => {
  it('считает остаток дня', () => {
    const totals = dayTotals(records[0]);
    expect(totals.expenses).toBe(5000);
    expect(totals.balance).toBe(40000);
  });

  it('складывает расходы с копейками без плавающих ошибок', () => {
    const value = recordExpensesTotal(
      record({
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

describe('filterRecords', () => {
  it('фильтрует по компании', () => {
    expect(filterRecords(records, { company: 'artfokus' })).toHaveLength(1);
  });

  it('фильтрует по диапазону дат включительно', () => {
    expect(filterRecords(records, { from: '2025-11-02', to: '2025-11-02' })).toHaveLength(2);
    expect(filterRecords(records, { from: '2025-11-03' })).toHaveLength(0);
  });

  it('ищет по комментариям расходов без учёта регистра', () => {
    expect(filterRecords(records, { query: 'корм' })).toHaveLength(1);
    expect(filterRecords(records, { query: 'АРЕНДА' })).toHaveLength(1);
    expect(filterRecords(records, { query: 'нет такого' })).toHaveLength(0);
  });
});

describe('график и сортировка', () => {
  it('строит непрерывный ряд за N дней', () => {
    const series = dailySeries(records, 3, '2025-11-03');
    expect(series.map((point) => point.date)).toEqual(['2025-11-01', '2025-11-02', '2025-11-03']);
    expect(series[0].total).toBe(50000);
    expect(series[1].total).toBe(50000);
    expect(series[2].total).toBe(0);
    expect(series[1].byCompany.zaton).toBe(30000);
    expect(series[1].byCompany.artfokus).toBe(20000);
  });

  it('сортирует записи по убыванию даты', () => {
    expect(sortByDateDesc(records).map((item) => item.date)).toEqual([
      '2025-11-02',
      '2025-11-02',
      '2025-11-01',
    ]);
  });
});
