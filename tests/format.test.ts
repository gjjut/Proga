import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatMoney,
  formatNumber,
  lastNDaysRange,
  monthRange,
  parseMoneyInput,
  plural,
  recordsLabel,
} from '../src/lib/format';

describe('parseMoneyInput', () => {
  it('разбирает простые числа и запятую', () => {
    expect(parseMoneyInput('1234')).toBe(1234);
    expect(parseMoneyInput('1234,56')).toBe(1234.56);
    expect(parseMoneyInput('1234.56')).toBe(1234.56);
  });

  it('игнорирует пробелы, неразрывные пробелы и знак рубля', () => {
    expect(parseMoneyInput('1 234,50 ₽')).toBe(1234.5);
    expect(parseMoneyInput('1\u00A0234\u202F567')).toBe(1234567);
  });

  it('разбирает тысячи через запятую', () => {
    expect(parseMoneyInput('1,234,567')).toBe(1234567);
  });

  it('отбрасывает мусор и отрицательные значения', () => {
    expect(parseMoneyInput('abc')).toBe(0);
    expect(parseMoneyInput('')).toBe(0);
    expect(parseMoneyInput('-500')).toBe(500);
    expect(parseMoneyInput('12р34')).toBe(1234);
  });

  it('округляет до копеек', () => {
    expect(parseMoneyInput('10,999')).toBe(11);
  });
});

describe('форматирование', () => {
  it('группирует тысячи и не показывает лишние нули', () => {
    expect(formatNumber(1234.5).replace(/\u00A0/g, ' ')).toBe('1 234,5');
    expect(formatNumber(1000).replace(/\u00A0/g, ' ')).toBe('1 000');
    expect(formatMoney(0)).toContain('₽');
  });

  it('склоняет слово «запись»', () => {
    expect(plural(1, ['запись', 'записи', 'записей'])).toBe('запись');
    expect(plural(3, ['запись', 'записи', 'записей'])).toBe('записи');
    expect(plural(5, ['запись', 'записи', 'записей'])).toBe('записей');
    expect(plural(21, ['запись', 'записи', 'записей'])).toBe('запись');
    expect(plural(11, ['запись', 'записи', 'записей'])).toBe('записей');
    expect(recordsLabel(2)).toContain('2');
  });
});

describe('даты', () => {
  it('сдвигает дни через границу месяца', () => {
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
  });

  it('возвращает границы месяца', () => {
    expect(monthRange(0, '2025-11-05')).toEqual({ from: '2025-11-01', to: '2025-11-30' });
    expect(monthRange(-1, '2025-11-05')).toEqual({ from: '2025-10-01', to: '2025-10-31' });
    expect(monthRange(0, '2024-02-10')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });

  it('считает диапазон последних N дней включительно', () => {
    expect(lastNDaysRange(30, '2025-11-05')).toEqual({ from: '2025-10-07', to: '2025-11-05' });
  });
});
