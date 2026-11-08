// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { MonthComparison } from '../src/components/MonthComparison';
import { upsertRecord, createEmptyData } from '../shared/model';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('показывает диапазоны и отсутствие данных вместо мнимой разницы с нулём', async () => {
  const records = upsertRecord(createEmptyData(), { company: 'zaton', date: '2026-03-28', cashFact: 100, cashPrev: 0, terminal: 100, reserve: 0, expenses: [] }).records;
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<MonthComparison records={records} adjustments={[]} today="2026-03-31" commissionRate={2.75} />));
  expect(container.textContent).toContain('01.03.2026 — 28.03.2026');
  expect(container.textContent).toContain('01.02.2026 — 28.02.2026');
  expect(container.textContent).toContain('Нет записей');
  expect(container.querySelectorAll('tbody')).toHaveLength(3);
  const zatonRows = container.querySelectorAll('tbody')[1].querySelectorAll('tr');
  expect(zatonRows[2].querySelectorAll('td')[2].textContent).toBe('—');
  await act(async () => root.unmount());
});
