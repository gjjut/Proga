// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from '../src/App';
import { AppProvider } from '../src/state';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STORAGE_KEY = 'zaton-finance:data:v1';

interface StoredData {
  records: {
    company: string;
    date: string;
    cashPrev: number;
    terminal: number;
    cashFact: number;
    reserve: number;
    expenses: { amount: number; comment: string }[];
  }[];
  adjustments: { company: string; date: string; target: string; direction: string; amount: number }[];
  settings: { theme?: string; commissionRate?: number };
}

let container: HTMLDivElement;
let root: Root;

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((button) =>
    (button.textContent ?? '').trim().includes(text),
  );
}

function moneyByLabel(label: string): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
}

function stored(): StoredData {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as StoredData;
}

async function settle(ms = 25) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function navTo(label: string) {
  await act(async () => {
    buttonByText(label)?.click();
  });
  await settle(60);
}

beforeEach(async () => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <AppProvider>
        <App />
      </AppProvider>,
    );
  });
  await settle(80);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('Приложение целиком', () => {
  it('показывает главный экран с двумя компаниями и сводкой', () => {
    const text = container.textContent ?? '';
    expect(text).toContain('Главное');
    expect(text).toContain('Затон Рыбака');
    expect(text).toContain('Арт Фокус');
    expect(text).toContain('Общий остаток');
    expect(text).toContain('Выручка');
    expect(text).toContain('Наличные');
    expect(text).toContain('На терминале');
    expect(text).toContain('В НЗ');
    expect(text).toContain('Динамика выручки');
    expect(container.querySelectorAll('.pots__item')).toHaveLength(3);
    expect(container.querySelectorAll('.company-card')).toHaveLength(2);
    expect(container.querySelectorAll('.chart__col').length).toBe(14);
  });

  it('показывает в меню все пять разделов', () => {
    const labels = [...container.querySelectorAll('.nav__item')].map((item) =>
      (item.textContent ?? '').trim(),
    );
    expect(labels).toEqual([
      'Главное',
      'Запись дня',
      'Поступления',
      'История',
      'Настройки',
    ]);
  });

  it('сохраняет день по новой схеме и считает итог', async () => {
    await navTo('Запись дня');
    expect(container.querySelector('.day-summary')).not.toBeNull();
    expect(container.textContent).toContain('Итог дня');
    expect(container.textContent).toContain('Было вчера');
    expect(container.textContent).toContain('Стало (факт)');

    const dateInput = container.querySelector<HTMLInputElement>('input[type="date"]');
    expect(dateInput).not.toBeNull();
    if (dateInput) setInputValue(dateInput, '2024-05-06');
    await settle();

    const prevInput = moneyByLabel('Остаток наличных предыдущего дня');
    const terminalInput = moneyByLabel('Сумма по терминалу');
    const factInput = moneyByLabel('Фактическое наличие наличных в кассе');
    const reserveInput = moneyByLabel('Сумма, положенная в НЗ');
    expect(prevInput).not.toBeNull();
    expect(terminalInput).not.toBeNull();
    expect(factInput).not.toBeNull();
    expect(reserveInput).not.toBeNull();
    await act(async () => {
      if (prevInput) setInputValue(prevInput, '5000');
      if (terminalInput) setInputValue(terminalInput, '48200');
      if (factInput) setInputValue(factInput, '9600');
      if (reserveInput) setInputValue(reserveInput, '4500');
    });
    await settle();

    const expenseInputs = [...container.querySelectorAll<HTMLInputElement>('.expense-row .input--money')];
    const comment = container.querySelector<HTMLInputElement>('.expense-row__comment');
    await act(async () => {
      if (expenseInputs[0]) setInputValue(expenseInputs[0], '3400');
      if (comment) setInputValue(comment, 'Корм для рыбалки');
    });
    await settle();

    // Итог дня в панели справа: 48200 + (9600 − 5000) + 3400 = 56200
    const summaryText = container.querySelector('.day-summary')?.textContent ?? '';
    expect(summaryText).toContain('Итог дня');
    expect(summaryText).toMatch(/56\s?200/);
    // Остаток дня: 56 200 − 1 325,50 − 4 500 = 50 374,50
    expect(summaryText).toMatch(/50\s374,5/);

    await act(async () => {
      buttonByText('Сохранить день')?.click();
    });
    await settle(150);

    expect(container.textContent).toContain('Запись сохранена');
    const saved = stored().records.find((record) => record.date === '2024-05-06');
    expect(saved).toBeDefined();
    expect(saved?.cashPrev).toBe(5000);
    expect(saved?.terminal).toBe(48200);
    expect(saved?.cashFact).toBe(9600);
    expect(saved?.reserve).toBe(4500);
    expect(saved?.expenses[0]).toMatchObject({ amount: 3400, comment: 'Корм для рыбалки' });
  });

  it('добавляет движение денег, не меняя выручку', async () => {
    await navTo('Запись дня');
    const dateInput = container.querySelector<HTMLInputElement>('input[type="date"]');
    if (dateInput) setInputValue(dateInput, '2024-05-07');
    await settle();
    const prevInput = moneyByLabel('Остаток наличных предыдущего дня');
    const terminalInput = moneyByLabel('Сумма по терминалу');
    const factInput = moneyByLabel('Фактическое наличие наличных в кассе');
    await act(async () => {
      if (prevInput) setInputValue(prevInput, '10000');
      if (terminalInput) setInputValue(terminalInput, '20000');
      if (factInput) setInputValue(factInput, '10000');
    });
    await settle();
    await act(async () => {
      buttonByText('Сохранить день')?.click();
    });
    await settle(150);

    const revenueBefore = 20000; // 20000 + (10000 − 10000)
    const adjustmentsBefore = stored().adjustments.length;

    await navTo('Поступления');
    expect(container.textContent).toContain('Новое движение');
    expect(container.textContent).toContain('Влияние на свободный остаток');

    const amountInput = container.querySelector<HTMLInputElement>('.adjust-form input.input--money');
    expect(amountInput).not.toBeNull();
    await act(async () => {
      if (amountInput) setInputValue(amountInput, '15000');
    });
    await settle();

    const submit = container.querySelector<HTMLButtonElement>('.adjust-form__footer .btn--primary');
    expect(submit).not.toBeNull();
    await act(async () => {
      submit?.click();
    });
    await settle(150);

    expect(container.textContent).toContain('Движение добавлено');
    const data = stored();
    expect(data.adjustments).toHaveLength(adjustmentsBefore + 1);
    expect(data.adjustments[data.adjustments.length - 1]).toMatchObject({
      target: 'cash',
      direction: 'in',
      amount: 15000,
    });

    const record = data.records.find((item) => item.date === '2024-05-07');
    expect(record?.terminal).toBe(revenueBefore);
    expect(record?.cashFact).toBe(10000);
  });

  it('открывает историю с новыми колонками', async () => {
    await navTo('История');

    expect(container.textContent).toContain('История');
    expect(container.querySelector('.record-list')).not.toBeNull();
    expect(container.querySelectorAll('.record').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('Остаток вчера');
    expect(container.textContent).toContain('Факт в кассе');
    expect(container.textContent).toContain('Остаток дня');
    expect(container.textContent).toContain('Экспорт в Excel (CSV)');
    expect(container.querySelectorAll('.record__stat').length).toBeGreaterThanOrEqual(9);
  });

  it('фильтрует историю по компании', async () => {
    await navTo('История');

    const before = container.querySelectorAll('.record').length;
    const companyChip = [...container.querySelectorAll<HTMLButtonElement>('.chip')].find((chip) =>
      (chip.textContent ?? '').includes('Арт Фокус'),
    );
    await act(async () => {
      companyChip?.click();
    });
    await settle();

    const after = container.querySelectorAll('.record').length;
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
    expect(container.querySelector('.screen__subtitle')?.textContent).toContain('Арт Фокус');
  });

  it('стартует в чёрной теме и переключает на белую', async () => {
    // Чёрно-белая тема — тема по умолчанию.
    expect(document.documentElement.dataset.theme).toBe('black');

    await navTo('Настройки');

    expect(container.textContent).toContain('Оформление');
    expect(container.textContent).toContain('Чёрная');
    expect(container.textContent).toContain('Белая');
    expect(container.textContent).toContain('Комиссия банка');
    expect(container.textContent).toContain('Как считаются показатели');

    await act(async () => {
      buttonByText('Белая')?.click();
    });
    await settle(80);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(stored().settings?.theme).toBe('light');

    await act(async () => {
      buttonByText('Чёрная')?.click();
    });
    await settle(80);
    expect(document.documentElement.dataset.theme).toBe('black');
    expect(stored().settings?.theme).toBe('black');

    const rateInput = container.querySelector<HTMLInputElement>('.rate-field .input');
    expect(rateInput).not.toBeNull();
    await act(async () => {
      if (rateInput) setInputValue(rateInput, '3,5');
    });
    await settle();
    await act(async () => {
      buttonByText('Применить ставку')?.click();
    });
    await settle(120);

    expect(stored().settings?.commissionRate).toBe(3.5);
    expect(container.textContent).toContain('Ставка комиссии обновлена');
    expect(stored().settings?.commissionRate).toBe(3.5);
  });
});
