import { describe, expect, it } from 'vitest';
import type { DayRecord } from '../shared/model';
import { buildCsv, csvFilename } from '../src/lib/csv';
import { createEmptyData, normalizeData, patchSettings, removeRecord, upsertRecord } from '../shared/model';

const sample: DayRecord = {
  id: 'r1',
  company: 'zaton',
  date: '2025-11-05',
  terminal: 45000.5,
  cash: 12000,
  reserve: 4000,
  expenses: [
    { id: 'e1', amount: 1200.25, comment: 'Корм; прикормка' },
    { id: 'e2', amount: 800, comment: 'Бензин "Лукойл"' },
  ],
  note: 'Хороший день',
  createdAt: '2025-11-05T19:00:00.000Z',
  updatedAt: '2025-11-05T19:00:00.000Z',
};

describe('buildCsv', () => {
  const csv = buildCsv([sample], { from: '2025-11-01', to: '2025-11-30', scopeLabel: 'Все компании' });

  it('начинается с BOM и использует «;» и CRLF для Excel', () => {
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('\r\n');
    expect(csv.split('\r\n')[0].split(';')[0]).toBe('\uFEFFОтчёт по финансам');
  });

  it('содержит строку данных с запятой в качестве десятичного разделителя', () => {
    expect(csv).toContain('05.11.2025;Затон Рыбака;45000,50;12000,00;4000,00;2000,25;39000,25;2;');
  });

  it('экранирует кавычки и точки с запятой в комментариях', () => {
    expect(csv).toContain('"1200,25 — Корм; прикормка; 800,00 — Бензин ""Лукойл"""');
  });

  it('добавляет строку ИТОГО', () => {
    const totalLine = csv.split('\r\n').find((line) => line.startsWith('ИТОГО'));
    expect(totalLine).toBeDefined();
    expect(totalLine).toContain('45000,50');
    expect(totalLine).toContain('2000,25');
    expect(totalLine).toContain('записей: 1');
  });

  it('корректно формирует имя файла', () => {
    expect(csvFilename('2025-11-01', '2025-11-30')).toBe('Финансы_01-11-2025_30-11-2025.csv');
  });
});

describe('модель данных', () => {
  it('нормализует мусор в пустое состояние', () => {
    expect(normalizeData(null).records).toEqual([]);
    expect(normalizeData({ records: 'nope' }).settings.theme).toBe('dim');
  });

  it('отбрасывает записи без компании или с плохой датой', () => {
    const data = normalizeData({
      records: [
        { company: 'unknown', date: '2025-11-01' },
        { company: 'zaton', date: '01.11.2025' },
        { company: 'zaton', date: '2025-11-01', terminal: '5000' },
      ],
    });
    expect(data.records).toHaveLength(1);
    expect(data.records[0].terminal).toBe(5000);
  });

  it('не создаёт дубль при повторном сохранении того же дня', () => {
    let data = createEmptyData();
    data = upsertRecord(data, {
      company: 'zaton',
      date: '2025-11-05',
      terminal: 1000,
      cash: 0,
      reserve: 0,
      expenses: [],
    });
    const firstId = data.records[0].id;
    data = upsertRecord(data, {
      company: 'zaton',
      date: '2025-11-05',
      terminal: 2000,
      cash: 100,
      reserve: 50,
      expenses: [{ id: 'e', amount: 10, comment: 'Тест' }],
    });
    expect(data.records).toHaveLength(1);
    expect(data.records[0].id).toBe(firstId);
    expect(data.records[0].terminal).toBe(2000);
    expect(data.records[0].reserve).toBe(50);
  });

  it('позволяет хранить один день для двух разных компаний', () => {
    let data = createEmptyData();
    for (const company of ['zaton', 'artfokus'] as const) {
      data = upsertRecord(data, {
        company,
        date: '2025-11-05',
        terminal: 100,
        cash: 0,
        reserve: 0,
        expenses: [],
      });
    }
    expect(data.records).toHaveLength(2);
  });

  it('удаляет запись и сохраняет настройки', () => {
    let data = upsertRecord(createEmptyData(), {
      company: 'artfokus',
      date: '2025-11-05',
      terminal: 100,
      cash: 0,
      reserve: 0,
      expenses: [],
    });
    data = removeRecord(data, data.records[0].id);
    expect(data.records).toHaveLength(0);

    data = patchSettings(data, { theme: 'black', lastCompany: 'artfokus' });
    expect(data.settings.theme).toBe('black');
    expect(data.settings.lastCompany).toBe('artfokus');
    expect(patchSettings(data, { theme: 'неверная' as never }).settings.theme).toBe('black');
  });

  it('чистит пустые строки расходов', () => {
    const data = upsertRecord(createEmptyData(), {
      company: 'zaton',
      date: '2025-11-05',
      terminal: 0,
      cash: 0,
      reserve: 0,
      expenses: [
        { id: 'a', amount: 0, comment: '' },
        { id: 'b', amount: 0, comment: 'Только комментарий' },
      ],
    });
    expect(data.records[0].expenses).toHaveLength(1);
  });
});
