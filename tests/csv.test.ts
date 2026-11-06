import { describe, expect, it } from 'vitest';
import type { Adjustment, DayRecord } from '../shared/model';
import { createEmptyData } from '../shared/model';
import { buildCsv, buildJsonBackup, csvFilename, jsonBackupFilename } from '../src/lib/csv';

const RATE = 2.75;

function record(partial: Partial<DayRecord> = {}): DayRecord {
  return {
    id: 'r1',
    company: 'zaton',
    date: '2025-11-05',
    cashPrev: 10000,
    terminal: 48200,
    cashFact: 14100, // весь нал вечером: 9 600 в кассе + 4 500 в НЗ
    reserve: 4500,
    expenses: [{ id: 'e1', amount: 3400, comment: 'Корм' }],
    note: '',
    createdAt: '2025-11-05T10:00:00.000Z',
    updatedAt: '2025-11-05T10:00:00.000Z',
    ...partial,
  };
}

function adjustment(partial: Partial<Adjustment> = {}): Adjustment {
  return {
    id: 'a1',
    company: 'zaton',
    date: '2025-11-06',
    target: 'cash',
    direction: 'in',
    amount: 15000,
    comment: '',
    createdAt: '2025-11-06T10:00:00.000Z',
    ...partial,
  };
}

describe('buildCsv', () => {
  it('начинается с BOM и использует «;» как разделитель', () => {
    const csv = buildCsv([record()], [], { commissionRate: RATE });
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.split('\r\n')[0]).toContain(';');
  });

  it('пишет шапку отчёта со ставкой комиссии', () => {
    const csv = buildCsv([record()], [], { commissionRate: RATE });
    expect(csv).toContain('Отчёт по финансам;Затон Рыбака и Арт Фокус');
    expect(csv).toContain('Комиссия банка;2,75%');
    expect(csv).toContain('Все компании');
  });

  it('пишет новые колонки записи дня', () => {
    const csv = buildCsv([record()], [], { commissionRate: RATE });
    expect(csv).toContain(
      'Дата;Компания;Остаток вчера, ₽;Терминал, ₽;Нал в кассе, ₽;Изменение наличных, ₽;Итог наличными, ₽;Расходы, ₽;НЗ, ₽;Итог дня, ₽;Комиссия, ₽;Заработано за день, ₽;Кол-во расходов;Расходы (детали);Примечание',
    );
  });

  it('считает строку по формулам', () => {
    const csv = buildCsv([record()], [], { commissionRate: RATE });
    // нал вечером 14100 + расходы 3400 − 10000 = 7500 итог наличными;
    // итог дня 48200 + 7500 = 55700; комиссия 1325,50;
    // заработано 55700 − 1325,50 − 3400 = 50974,50; в кассе после НЗ 9600
    expect(csv).toContain(
      '05.11.2025;Затон Рыбака;10000,00;48200,00;14100,00;-400,00;7500,00;3400,00;4500,00;55700,00;1325,50;50974,50;1;',
    );
  });

  it('экранирует точку с запятой и кавычки в комментариях', () => {
    const csv = buildCsv(
      [record({ expenses: [{ id: 'e', amount: 100, comment: 'Корм; "премиум"' }] })],
      [],
      { commissionRate: RATE },
    );
    expect(csv).toContain('"100,00 — Корм; ""премиум"""');
  });

  it('пишет блок итогов по периоду', () => {
    const csv = buildCsv([record()], [], { commissionRate: RATE });
    expect(csv).toContain('ИТОГИ ПО ПЕРИОДУ');
    expect(csv).toContain('Итог (терминал + наличные);55700,00');
    expect(csv).toContain('Комиссия банка (2,75%);1325,50');
    expect(csv).toContain('Расходы;3400,00');
    expect(csv).toContain('Заработано (итог − комиссия − расходы);50974,50');
    expect(csv).toContain('НЗ накоплено;4500,00');
    expect(csv).toContain('Наличные в кассе;9600,00');
    expect(csv).toContain('На терминале (за вычетом комиссии);46874,50');
    expect(csv).toContain('В НЗ;4500,00');
    // Остаток на сейчас — без НЗ: наличные после НЗ 9 600 + терминал 46 874,50
    expect(csv).toContain('Остаток на сейчас (наличные после НЗ + терминал);56474,50');
  });

  it('выгружает движения отдельным блоком', () => {
    const csv = buildCsv(
      [record()],
      [
        adjustment(),
        adjustment({
          id: 'a2',
          date: '2025-11-07',
          target: 'reserve',
          direction: 'out',
          amount: 3000,
          comment: 'Изъяли из НЗ',
        }),
        adjustment({
          id: 'a3',
          date: '2025-11-08',
          target: 'terminal',
          direction: 'in',
          amount: 24000,
        }),
      ],
      { commissionRate: RATE },
    );

    expect(csv).toContain('ПОСТУПЛЕНИЯ И ИЗЪЯТИЯ');
    expect(csv).toContain(
      'Дата;Компания;Куда;Направление;Сумма, ₽;Влияние на остаток, ₽;Комментарий',
    );
    expect(csv).toContain('06.11.2025;Затон Рыбака;Наличные;Положили;15000,00;15000,00;');
    expect(csv).toContain('07.11.2025;Затон Рыбака;НЗ;Забрали;3000,00;3000,00;Изъяли из НЗ');
    expect(csv).toContain('08.11.2025;Затон Рыбака;Терминал;Положили;24000,00;23340,00;');
    expect(csv).toContain('Движений: положили;39000,00');
    expect(csv).toContain('Движений: забрали;3000,00');
  });

  it('не создаёт блок движений, если их нет', () => {
    const csv = buildCsv([record()], [], { commissionRate: RATE });
    expect(csv).not.toContain('ПОСТУПЛЕНИЯ И ИЗЪЯТИЯ');
  });

  it('добавляет произвольные строки в итоги', () => {
    const csv = buildCsv([record()], [], {
      commissionRate: RATE,
      extraSummary: [{ label: 'Движений', value: 0 }],
    });
    expect(csv).toContain('Движений;0,00');
  });

  it('работает на пустой выборке', () => {
    const csv = buildCsv([], [], { commissionRate: RATE, from: '2025-11-01', to: '2025-11-30' });
    expect(csv).toContain('Период;01.11.2025 — 30.11.2025');
    expect(csv).toContain('Остаток на сейчас (наличные после НЗ + терминал);0,00');
  });
});

describe('имена файлов', () => {
  it('собирает имя CSV по периоду', () => {
    expect(csvFilename('2025-11-01', '2025-11-30')).toBe('Финансы_01-11-2025_30-11-2025.csv');
    expect(csvFilename()).toBe('Финансы_все-даты.csv');
  });

  it('собирает имя JSON-копии', () => {
    expect(jsonBackupFilename()).toMatch(/^Финансы-резервная-копия-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe('buildJsonBackup', () => {
  it('сохраняет схему, записи и настройки', () => {
    const data = createEmptyData();
    data.records.push(record());
    const json = JSON.parse(buildJsonBackup(data));
    expect(json.schemaVersion).toBe(2);
    expect(json.records).toHaveLength(1);
    expect(json.records[0].cashFact).toBe(14100);
    expect(json.records[0].cashPrev).toBe(10000);
    expect(json.settings.commissionRate).toBe(2.75);
    expect(json.app).toBe('ZatonFinance');
    expect(typeof json.exportedAt).toBe('string');
  });
});
