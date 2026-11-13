import { describe, expect, it } from 'vitest';
import { createEmptyData, normalizeData, parseBackupData, upsertRecord } from '../shared/model';
import { expenseCategories } from '../src/lib/expenses';
import { dayMetrics, filterRecords, totalsOf } from '../src/lib/calc';
import { buildCsv, buildJsonBackup } from '../src/lib/csv';

const base = { company: 'zaton' as const, date: '2026-01-02', cashPrev: 1000, cashFact: 1600, terminal: 2000, reserve: 200 };

describe('категории расходов', () => {
  it('не присваивает категории старым данным и не меняет расчёты после миграции', () => {
    const old = { schemaVersion: 2, records: [{ ...base, id: 'r1', createdAt: '2026-01-02T12:00:00Z', updatedAt: '2026-01-02T12:00:00Z', expenses: [{ id: 'a', amount: 125, comment: 'Корм' }] }], adjustments: [] };
    const migrated = normalizeData(old);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.records[0].expenses[0]).toEqual({ id: 'a', amount: 125, comment: 'Корм' });
    expect(expenseCategories(migrated.records)).toEqual([{ category: 'Без категории', count: 1, amount: 125 }]);
    expect(dayMetrics(migrated.records[0]).revenue).toBe(2725);
    expect(dayMetrics(migrated.records[0]).earned).toBe(2545);
    expect(parseBackupData(old).records).toEqual(migrated.records);
  });

  it('сохраняет категории в записях и копии, суммирует без учёта регистра', () => {
    const first = upsertRecord(createEmptyData(), { ...base, expenses: [
      { id: 'a', amount: 10.1, comment: 'рыба', category: '  Закупки  ' },
      { id: 'b', amount: 0.2, comment: 'снасти', category: 'закупки' },
      { id: 'c', amount: 3, comment: 'без категории' },
      { id: 'd', amount: 1, comment: '', category: 'Без категории' },
    ] });
    expect(first.records[0].expenses[0].category).toBe('Закупки');
    expect(first.records[0].expenses[3].category).toBeUndefined();
    expect(expenseCategories(first.records)).toEqual([
      { category: 'Закупки', amount: 10.3, count: 2 },
      { category: 'Без категории', amount: 4, count: 2 },
    ]);
    expect(totalsOf(first.records).expenses).toBe(14.3);
    expect(parseBackupData(JSON.parse(buildJsonBackup(first)))).toEqual(first);
    expect(filterRecords(first.records, { query: 'ЗАКУПКИ' })).toHaveLength(1);
    expect(filterRecords(first.records, { query: 'аренда' })).toHaveLength(0);
  });

  it('выгружает сводку, категорию и комментарий, безопасно обрабатывает специальные символы', () => {
    const data = upsertRecord(createEmptyData(), { ...base, expenses: [
      { id: 'a', amount: 123, comment: 'Товар; "новый"', category: '=ОПАСНО' },
      { id: 'b', amount: 77, comment: 'Прочее' },
    ] });
    const csv = buildCsv(data.records);
    expect(csv).toContain('РАСХОДЫ ПО КАТЕГОРИЯМ');
    expect(csv).toContain('Категория: =ОПАСНО;1,00;123,00');
    expect(csv).toContain('Категория: Без категории;1,00;77,00');
    expect(csv).toContain('123,00 — =ОПАСНО · Товар; ""новый""');
    expect(csv).toContain('Расходы;200,00');
  });
});
