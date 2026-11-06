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
  adjustments: {
    id: string;
    company: string;
    date: string;
    target: string;
    direction: string;
    amount: number;
  }[];
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

const MONTHS_RU = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

/** Выбрать дату через встроенный календарь: открыть, долистать месяц, кликнуть день. */
async function pickDate(iso: string) {
  const [year, month] = iso.split('-').map(Number);
  await act(async () => {
    container.querySelector<HTMLButtonElement>('button[aria-label="Дата записи"]')?.click();
  });
  await settle(10);

  const now = new Date();
  let shift = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
  while (shift !== 0) {
    const label = shift > 0 ? 'Предыдущий месяц' : 'Следующий месяц';
    await act(async () => {
      container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click();
    });
    shift += shift > 0 ? -1 : 1;
  }

  expect(container.querySelector('.date-pop__title')?.textContent ?? '').toContain(
    `${MONTHS_RU[month - 1]} `,
  );

  await act(async () => {
    container.querySelector<HTMLButtonElement>(`button[data-date="${iso}"]`)?.click();
  });
  await settle(20);

  expect(container.querySelector('.date-pop')).toBeNull();
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
    expect(text).toContain('Остаток на сейчас');
    expect(text).toContain('Итог');
    expect(text).toContain('Наличные');
    expect(text).toContain('На терминале');
    expect(text).toContain('В НЗ');
    expect(text).toContain('Заработано');
    expect(text).toContain('Динамика итога');
    // Остаток на сейчас = наличные + терминал; НЗ показывается отдельно, вне остатка.
    expect(container.querySelectorAll('.pots__item')).toHaveLength(2);
    expect(text).toContain('в НЗ отдельно');
    expect(container.querySelectorAll('.company-card')).toHaveLength(2);
    expect(container.querySelectorAll('.chart__col').length).toBe(14);
    // Цепочка наличных в демо сходится — предупреждения о разрыве нет.
    expect(text).toContain('Цепочка наличных сходится');
    expect(container.querySelector('.balance-check--warn')).toBeNull();
  });

  it('показывает остаток кассы на конец дня', async () => {
    await navTo('Запись дня');
    const bar = container.querySelector('.day-bar')?.textContent ?? '';
    expect(bar).toContain('Нал вечером');
    expect(bar).toContain('В кассе после НЗ');
    expect(bar).toContain('Касса за день');
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
    expect(container.querySelector('.day-bar')).not.toBeNull();
    expect(container.textContent).toContain('Заработано за день');
    expect(container.textContent).toContain('Касса вчера');
    expect(container.textContent).toContain('Нал в кассе');

    await pickDate('2024-05-06');

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

    // Панель дня: терминал 48 200, касса 9 600 − 5 000 = 4 600, НЗ 4 500, расходы 3 400.
    const summaryText = container.querySelector('.day-bar')?.textContent ?? '';
    expect(summaryText).toContain('Заработано за день');
    expect(summaryText).toMatch(/48\s200/);
    // Итог дня = нал вечером 9 600 + расходы 3 400 + терминал 48 200 − вчера 5 000 = 56 200;
    // заработано 56 200 − 1 325,5 − 3 400 = 51 474,5; в кассе после НЗ 9 600 − 4 500 = 5 100
    expect(summaryText).toMatch(/51\s474,5/);
    expect(summaryText).toMatch(/5\s100/);
    // Итог не должен включать НЗ: раньше «наличная выручка» восстанавливала ещё и 4 500.
    expect(summaryText).not.toMatch(/55\s974,5/);

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

  it('открывает свой календарь в стиле приложения и выбирает день', async () => {
    await navTo('Запись дня');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Дата записи"]')?.click();
    });
    await settle(20);

    const popover = container.querySelector('.date-pop');
    expect(popover).not.toBeNull();
    expect(popover?.getAttribute('role')).toBe('dialog');
    expect(container.querySelectorAll('.date-pop__dow')).toHaveLength(7);

    const todayCell = container.querySelector<HTMLButtonElement>('.date-pop__day.is-today');
    expect(todayCell).not.toBeNull();
    await act(async () => {
      todayCell?.click();
    });
    await settle(20);

    expect(container.querySelector('.date-pop')).toBeNull();
  });

  it('в фильтрах истории тот же календарь', async () => {
    await navTo('История');

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Дата с"]');
    expect(trigger).not.toBeNull();
    await act(async () => {
      trigger?.click();
    });
    await settle(20);

    expect(container.querySelector('.date-pop')).not.toBeNull();
    expect(container.querySelectorAll('.date-pop__day').length).toBeGreaterThan(27);
  });

  it('добавляет движение денег, не меняя выручку', async () => {
    await navTo('Запись дня');
    await pickDate('2024-05-07');
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
    const adjustmentsBefore = stored().adjustments.map((item) => item.id);

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
    expect(data.adjustments).toHaveLength(adjustmentsBefore.length + 1);
    // В демо-данных уже есть движения на ту же сумму, поэтому ищем по id.
    const added = data.adjustments.filter((item) => !adjustmentsBefore.includes(item.id));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ target: 'cash', direction: 'in', amount: 15000 });

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
    expect(container.textContent).toContain('Нал вечером');
    expect(container.textContent).toContain('Заработано за день');
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
