import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMMISSION_RATE,
  SCHEMA_VERSION,
  createEmptyData,
  isIsoDate,
  normalizeData,
  patchSettings,
  removeAdjustment,
  removeRecord,
  upsertAdjustment,
  upsertRecord,
} from '../shared/model';

describe('даты (часовые пояса)', () => {
  it('принимает обычные и високосные даты в любом часовом поясе', () => {
    // Регрессия: раньше дата сравнивалась с toISOString(), и в зоне UTC+N
    // любая дата считалась некорректной («Некорректная дата» при сохранении).
    expect(isIsoDate('2026-11-05')).toBe(true);
    expect(isIsoDate('2026-01-01')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-12-31')).toBe(true);
  });

  it('отвергает несуществующие и неправильно записанные даты', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-11-31')).toBe(false);
    expect(isIsoDate('2026-00-10')).toBe(false);
    expect(isIsoDate('05.11.2026')).toBe(false);
    expect(isIsoDate('2026-11-5')).toBe(false);
    expect(isIsoDate('')).toBe(false);
    expect(isIsoDate(20261105)).toBe(false);
  });

  it('сохраняет запись за сегодняшнюю дату без ошибок', () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`;
    const data = upsertRecord(createEmptyData(), {
      company: 'zaton',
      date: iso,
      cashPrev: 0,
      terminal: 1000,
      cashFact: 1000,
      reserve: 0,
      expenses: [],
    });
    expect(data.records).toHaveLength(1);
    expect(data.records[0].date).toBe(iso);
  });
});

describe('миграция и нормализация', () => {
  it('нормализует мусор в пустое состояние', () => {
    const data = normalizeData(null);
    expect(data.records).toEqual([]);
    expect(data.adjustments).toEqual([]);
    expect(data.settings.theme).toBe('black');
    expect(data.settings.commissionRate).toBe(DEFAULT_COMMISSION_RATE);
    expect(data.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('поднимает старую схему v1: cash → cashFact и заполняет остаток вчера', () => {
    const data = normalizeData({
      schemaVersion: 1,
      records: [
        { company: 'zaton', date: '2025-11-01', terminal: 1000, cash: 5000, reserve: 0 },
        { company: 'zaton', date: '2025-11-02', terminal: 2000, cash: 7000, reserve: 0 },
        { company: 'zaton', date: '2025-11-03', terminal: 3000, cash: 6500, reserve: 0 },
      ],
      settings: { theme: 'black', lastCompany: 'artfokus' },
    });

    expect(data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(data.records.map((record) => record.cashFact)).toEqual([5000, 7000, 6500]);
    expect(data.records.map((record) => record.cashPrev)).toEqual([0, 5000, 7000]);
    expect(data.settings.theme).toBe('black');
    expect(data.settings.lastCompany).toBe('artfokus');
  });

  it('не путает компании при подстановке остатка вчера', () => {
    const data = normalizeData({
      records: [
        { company: 'zaton', date: '2025-11-01', cashFact: 1000 },
        { company: 'artfokus', date: '2025-11-02', cashFact: 4000 },
        { company: 'zaton', date: '2025-11-03', cashFact: 3000 },
      ],
    });
    const zatonLater = data.records.find(
      (record) => record.company === 'zaton' && record.date === '2025-11-03',
    );
    expect(zatonLater?.cashPrev).toBe(1000);
  });

  it('сохраняет явно заданный ноль в остатке вчера', () => {
    const data = normalizeData({
      records: [
        { company: 'zaton', date: '2025-11-01', cashFact: 1000 },
        { company: 'zaton', date: '2025-11-02', cashFact: 2000, cashPrev: 0 },
      ],
    });
    expect(data.records[1].cashPrev).toBe(0);
  });

  it('отбрасывает записи и движения с ошибками', () => {
    const data = normalizeData({
      records: [
        { company: 'unknown', date: '2025-11-01' },
        { company: 'zaton', date: '01.11.2025' },
        { company: 'zaton', date: '2025-11-01', terminal: '5000' },
      ],
      adjustments: [
        { company: 'zaton', date: '2025-11-01', target: 'nope', direction: 'in', amount: 100 },
        { company: 'zaton', date: '2025-11-01', target: 'cash', direction: 'in', amount: 0 },
        { company: 'zaton', date: '2025-11-01', target: 'cash', direction: 'in', amount: 100 },
      ],
    });
    expect(data.records).toHaveLength(1);
    expect(data.adjustments).toHaveLength(1);
  });

  it('не создаёт дубль дня при повторном сохранении', () => {
    let data = createEmptyData();
    data = upsertRecord(data, {
      company: 'zaton',
      date: '2025-11-05',
      cashPrev: 1000,
      terminal: 1000,
      cashFact: 2000,
      reserve: 0,
      expenses: [],
    });
    const firstId = data.records[0].id;
    data = upsertRecord(data, {
      company: 'zaton',
      date: '2025-11-05',
      cashPrev: 1000,
      terminal: 2000,
      cashFact: 2500,
      reserve: 50,
      expenses: [{ id: 'e', amount: 10, comment: 'Тест' }],
    });
    expect(data.records).toHaveLength(1);
    expect(data.records[0].id).toBe(firstId);
    expect(data.records[0].terminal).toBe(2000);
    expect(data.records[0].cashFact).toBe(2500);
    expect(data.records[0].reserve).toBe(50);
  });

  it('позволяет хранить один день для двух разных компаний', () => {
    let data = createEmptyData();
    for (const company of ['zaton', 'artfokus'] as const) {
      data = upsertRecord(data, {
        company,
        date: '2025-11-05',
        cashPrev: 0,
        terminal: 100,
        cashFact: 0,
        reserve: 0,
        expenses: [],
      });
    }
    expect(data.records).toHaveLength(2);
  });

  it('валидирует дату и компанию', () => {
    const data = createEmptyData();
    expect(() =>
      upsertRecord(data, {
        company: 'zaton',
        date: '05.11.2025',
        cashPrev: 0,
        terminal: 1,
        cashFact: 1,
        reserve: 0,
        expenses: [],
      }),
    ).toThrow();
  });
});

describe('движения денег', () => {
  it('добавляет, обновляет и удаляет движение', () => {
    let data = createEmptyData();
    data = upsertAdjustment(data, {
      company: 'zaton',
      date: '2025-11-05',
      target: 'cash',
      direction: 'in',
      amount: 5000,
      comment: 'Внесли',
    });
    expect(data.adjustments).toHaveLength(1);
    const id = data.adjustments[0].id;

    data = upsertAdjustment(data, {
      id,
      company: 'zaton',
      date: '2025-11-05',
      target: 'reserve',
      direction: 'out',
      amount: 3000,
      comment: 'Забрали из НЗ',
    });
    expect(data.adjustments).toHaveLength(1);
    expect(data.adjustments[0].target).toBe('reserve');
    expect(data.adjustments[0].direction).toBe('out');

    data = removeAdjustment(data, id);
    expect(data.adjustments).toHaveLength(0);
  });

  it('не принимает нулевую сумму и плохое направление', () => {
    const data = createEmptyData();
    expect(() =>
      upsertAdjustment(data, {
        company: 'zaton',
        date: '2025-11-05',
        target: 'cash',
        direction: 'in',
        amount: 0,
      }),
    ).toThrow();
    expect(() =>
      upsertAdjustment(data, {
        company: 'zaton',
        date: '2025-11-05',
        target: 'cash',
        direction: 'unknown' as never,
        amount: 10,
      }),
    ).toThrow();
  });

  it('удаляет запись дня', () => {
    let data = upsertRecord(createEmptyData(), {
      company: 'artfokus',
      date: '2025-11-05',
      cashPrev: 0,
      terminal: 100,
      cashFact: 0,
      reserve: 0,
      expenses: [],
    });
    data = removeRecord(data, data.records[0].id);
    expect(data.records).toHaveLength(0);
  });
});

describe('настройки', () => {
  it('сохраняет тему, компанию и ставку комиссии', () => {
    let data = createEmptyData();
    data = patchSettings(data, { theme: 'black', lastCompany: 'artfokus', commissionRate: 3.5 });
    expect(data.settings.theme).toBe('black');
    expect(data.settings.lastCompany).toBe('artfokus');
    expect(data.settings.commissionRate).toBe(3.5);
  });

  it('ограничивает ставку диапазоном 0…100 и игнорирует мусор', () => {
    let data = createEmptyData();
    data = patchSettings(data, { commissionRate: 250 });
    expect(data.settings.commissionRate).toBe(100);
    data = patchSettings(data, { commissionRate: -5 });
    expect(data.settings.commissionRate).toBe(0);
    data = patchSettings(data, { theme: 'неверная' as never });
    expect(data.settings.theme).toBe('black');
  });
});
