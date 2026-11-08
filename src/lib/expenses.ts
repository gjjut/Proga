import { normalizeExpenseCategory, round2, type DayRecord } from '../../shared/model';

export interface CategoryTotal {
  category: string;
  amount: number;
  count: number;
}

/** Groups names case-insensitively; old expenses remain explicitly unclassified. */
export function expenseCategories(records: DayRecord[]): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();
  for (const record of records) {
    for (const expense of record.expenses) {
      const name = normalizeExpenseCategory(expense.category);
      const key = name ? `named:${name.toLocaleLowerCase('ru-RU')}` : 'uncategorized';
      const current = totals.get(key) ?? { category: name || 'Без категории', amount: 0, count: 0 };
      current.amount = round2(current.amount + expense.amount);
      current.count += 1;
      totals.set(key, current);
    }
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category, 'ru'));
}
