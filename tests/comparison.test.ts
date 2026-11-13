import { describe, expect, it } from 'vitest';
import type { Adjustment, DayRecord } from '../shared/model';
import { comparisonRanges, monthlyComparison } from '../src/lib/comparison';

const rec = (date: string, company: DayRecord['company'], terminal: number, cashFact: number, cashPrev: number, expense: number, reserve: number): DayRecord => ({
  id: `${date}-${company}`, date, company, terminal, cashFact, cashPrev, reserve,
  expenses: [{ id: 'expense', amount: expense, comment: '' }], note: '',
  createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
});
const adj = (date: string, company: Adjustment['company'], amount: number): Adjustment => ({
  id: `${date}-${company}`, date, company, target: 'terminal', direction: 'in', amount, comment: '', createdAt: '2025-01-01T00:00:00Z',
});

describe('сравнение месяцев', () => {
  it('берёт равное число дней и ограничивает более длинный месяц', () => {
    expect(comparisonRanges('2026-03-31')).toEqual({ current: { from: '2026-03-01', to: '2026-03-28' }, previous: { from: '2026-02-01', to: '2026-02-28' } });
    expect(comparisonRanges('2028-03-31').previous.to).toBe('2028-02-29');
    expect(comparisonRanges('2026-01-05')).toEqual({ current: { from: '2026-01-01', to: '2026-01-05' }, previous: { from: '2025-12-01', to: '2025-12-05' } });
  });

  it('считает итог, расходы и заработок по тем же формулам, отдельно по компаниям', () => {
    const records = [
      rec('2025-12-02', 'zaton', 1000, 2000, 1000, 500, 100),
      rec('2026-01-02', 'zaton', 2000, 2500, 1000, 300, 500),
      rec('2026-01-03', 'artfokus', 100, 0, 0, 0, 0),
      rec('2026-01-06', 'zaton', 500000, 0, 0, 0, 0),
      rec('2025-12-06', 'zaton', 900000, 0, 0, 0, 0),
    ];
    const groups = monthlyComparison(records, [adj('2026-01-03', 'zaton', 100), adj('2026-01-06', 'zaton', 20000)], '2026-01-05', 2.75);
    const [all, zaton, art] = groups;
    expect(zaton.current.recordCount).toBe(1);
    expect(zaton.current.movementCount).toBe(1);
    expect(zaton.current.totals.revenue).toBe(3800);
    expect(zaton.previous.totals.revenue).toBe(2500);
    expect(zaton.current.totals.earned).toBe(3442.25);
    expect(zaton.previous.totals.earned).toBe(1972.5);
    expect(zaton.difference).toEqual({ revenue: 1300, expenses: -200, earned: 1469.75 });
    expect(all.current.totals.revenue).toBe(3900);
    expect(all.current.totals.earned).toBe(3539.5);
    expect(art.previous.hasData).toBe(false);
    expect(art.difference).toBeNull();
  });

  it('различает нулевые показатели и отсутствие записей, учитывает движения без записей', () => {
    const data = monthlyComparison([rec('2026-01-01', 'zaton', 0, 0, 0, 0, 0)], [adj('2025-12-01', 'zaton', 100)], '2026-01-01', 2.75);
    expect(data[1].current.hasData).toBe(true);
    expect(data[1].previous.hasData).toBe(false);
    expect(data[1].previous.recordCount).toBe(0);
    expect(data[1].previous.totals.earned).toBe(-2.75);
    expect(data[1].difference).toBeNull();
    expect(data[2].difference).toBeNull();
  });
});
