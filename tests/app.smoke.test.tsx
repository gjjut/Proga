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

let container: HTMLDivElement;
let root: Root;

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((button) =>
    (button.textContent ?? '').includes(text),
  );
}

async function settle(ms = 25) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
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
  await settle(60);
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
    expect(text).toContain('Итого по двум компаниям');
    expect(text).toContain('Свободный остаток');
    expect(text).toContain('Динамика выручки');
    expect(container.querySelectorAll('.company-card')).toHaveLength(2);
    expect(container.querySelectorAll('.chart__col').length).toBe(14);
  });

  it('переключается на экран записи дня и сохраняет запись', async () => {
    const navButton = buttonByText('Запись дня');
    expect(navButton).toBeDefined();
    await act(async () => {
      navButton?.click();
    });
    await settle();

    expect(container.querySelector('.day-summary')).not.toBeNull();
    expect(container.textContent).toContain('Итоги дня');

    const dateInput = container.querySelector<HTMLInputElement>('input[type="date"]');
    expect(dateInput).not.toBeNull();
    if (dateInput) {
      setInputValue(dateInput, '2024-05-06');
    }
    await settle();

    const moneyInputs = [...container.querySelectorAll<HTMLInputElement>('input.input--money')];
    expect(moneyInputs.length).toBeGreaterThanOrEqual(4);
    await act(async () => {
      setInputValue(moneyInputs[0], '54321');
      setInputValue(moneyInputs[1], '7000');
      setInputValue(moneyInputs[2], '3000');
      setInputValue(moneyInputs[3], '1500');
    });
    await settle();

    const comment = container.querySelector<HTMLInputElement>('.expense-row__comment');
    if (comment) {
      await act(async () => {
        setInputValue(comment, 'Корм для рыбалки');
      });
    }
    await settle();

    const saveButton = buttonByText('Сохранить день');
    expect(saveButton).toBeDefined();
    await act(async () => {
      saveButton?.click();
    });
    await settle(120);

    expect(container.textContent).toContain('Запись сохранена');
    const stored = JSON.parse(localStorage.getItem('zaton-finance:data:v1') ?? '{}') as {
      records: { date: string; terminal: number; expenses: { comment: string }[] }[];
    };
    const saved = stored.records.find((record) => record.date === '2024-05-06');
    expect(saved).toBeDefined();
    expect(saved?.terminal).toBe(54321);
    expect(saved?.expenses[0]?.comment).toBe('Корм для рыбалки');
  });

  it('открывает историю и находит сохранённую запись', async () => {
    await act(async () => {
      buttonByText('История')?.click();
    });
    await settle();

    expect(container.textContent).toContain('История');
    expect(container.querySelector('.record-list')).not.toBeNull();
    expect(container.querySelectorAll('.record').length).toBeGreaterThan(0);
    expect(container.textContent).toContain('Экспорт в Excel (CSV)');
  });

  it('переключает тему в настройках', async () => {
    await act(async () => {
      buttonByText('Настройки')?.click();
    });
    await settle();

    expect(container.textContent).toContain('Оформление');
    expect(container.textContent).toContain('Lights out');

    const lightsOut = buttonByText('Lights out');
    await act(async () => {
      lightsOut?.click();
    });
    await settle(60);

    expect(document.documentElement.dataset.theme).toBe('black');
    const stored = JSON.parse(localStorage.getItem('zaton-finance:data:v1') ?? '{}') as {
      settings?: { theme?: string };
    };
    expect(stored.settings?.theme).toBe('black');
  });

  it('фильтрует историю по компании', async () => {
    await act(async () => {
      buttonByText('История')?.click();
    });
    await settle();

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
});
