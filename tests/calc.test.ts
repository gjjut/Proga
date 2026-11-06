import { describe, expect, it } from 'vitest';
import type { Adjustment, DayRecord } from '../shared/model';
import { buildDemoData } from '../src/lib/demo';
import { todayIso } from '../src/lib/format';
import {
  cashChainIssues,
  companyBreakdown,
  companyTotals,
  dailySeries,
  dayMetrics,
  filterAdjustments,
  filterRecords,
  recordExpensesTotal,
  sortByDateDesc,
  suggestedCashPrev,
  totalsOf,
} from '../src/lib/calc';

const RATE = 2.75;
/** Стартовые остатки кассы обеих компаний из демо (`tillBase`). */
const PROFILES_START_TILL = [14000, 8000];

function rec(
  partial: Partial<DayRecord> & { company: DayRecord['company']; date: string },
): DayRecord {
  return {
    id: `${partial.company}-${partial.date}`,
    cashPrev: 0,
    terminal: 0,
    cashFact: 0,
    reserve: 0,
    expenses: [],
    note: '',
    createdAt: '2025-11-01T10:00:00.000Z',
    updatedAt: '2025-11-01T10:00:00.000Z',
    ...partial,
  } as DayRecord;
}

function adj(partial: Partial<Adjustment> & { date: string; company: Adjustment['company'] }): Adjustment {
  return {
    id: `${partial.company}-${partial.date}-${partial.target ?? 'cash'}-${partial.direction ?? 'in'}`,
    target: 'cash',
    direction: 'in',
    amount: 0,
    comment: '',
    createdAt: '2025-11-01T10:00:00.000Z',
    ...partial,
  } as Adjustment;
}

const records: DayRecord[] = [
  rec({
    company: 'zaton',
    date: '2025-11-01',
    cashPrev: 10000,
    terminal: 48200,
    cashFact: 9600,
    reserve: 4500,
    expenses: [{ id: 'e1', amount: 3400, comment: 'Корм' }],
  }),
  rec({
    company: 'zaton',
    date: '2025-11-02',
    cashPrev: 9600,
    terminal: 30000,
    cashFact: 20000,
    reserve: 2000,
    expenses: [{ id: 'e2', amount: 1800, comment: 'Бензин' }],
  }),
  rec({
    company: 'artfokus',
    date: '2025-11-02',
    cashPrev: 5000,
    terminal: 20000,
    cashFact: 4000,
    reserve: 3000,
    expenses: [{ id: 'e3', amount: 8000, comment: 'Аренда' }],
  }),
];

describe('dayMetrics', () => {
  it('считает изменение наличных, выручку, комиссию и заработок', () => {
    const metrics = dayMetrics(records[0], RATE);
    expect(metrics.cashChange).toBe(-400);
    expect(metrics.expenses).toBe(3400);
    // Из кассы ушли расходы и НЗ: −400 + 3400 + 4500 = 7500 продано за наличные.
    expect(metrics.cashSales).toBe(7500);
    expect(metrics.revenue).toBe(55700); // 48200 + 7500
    expect(metrics.commission).toBe(1325.5); // 48200 × 2,75%
    // 55700 − 1325,5 − 3400 = 50974,5; то же, что 48200 − 1325,5 − 400 + 4500
    expect(metrics.earned).toBe(50974.5);
    expect(metrics.earned).toBe(
      Math.round((metrics.revenue - metrics.commission - metrics.expenses) * 100) / 100,
    );
  });

  it('расходы не увеличивают заработок: трата уменьшает кассу, а не доход', () => {
    const withoutExpenses = dayMetrics(rec({ company: 'zaton', date: '2025-11-01', cashPrev: 10000, cashFact: 9600, terminal: 1000 }), RATE);
    const withExpenses = dayMetrics(
      rec({
        company: 'zaton',
        date: '2025-11-01',
        cashPrev: 10000,
        cashFact: 9600,
        terminal: 1000,
        expenses: [{ id: 'x', amount: 2500, comment: 'Тест' }],
      }),
      RATE,
    );
    // Выручка растёт на сумму расхода: это восстановление наличной выручки...
    expect(withExpenses.revenue - withoutExpenses.revenue).toBe(2500);
    expect(withExpenses.cashChange).toBe(withoutExpenses.cashChange);
    // ...и тут же вычитается, поэтому заработок от лишней траты не растёт.
    expect(withExpenses.earned).toBe(withoutExpenses.earned);
    // 600 выручки − 27,5 комиссии: касса за день всё равно упала на 400, это не доход.
    expect(withExpenses.earned).toBe(572.5);
  });

  it('на НЗ комиссия не начисляется', () => {
    const metrics = dayMetrics(
      rec({ company: 'zaton', date: '2025-11-01', terminal: 0, cashPrev: 10000, cashFact: 0, reserve: 10000 }),
      RATE,
    );
    expect(metrics.commission).toBe(0);
    // НЗ — не расход: касса ушла в запас, но заработок нулевой, а не минус 10 000.
    expect(metrics.earned).toBe(0);
    expect(metrics.reserve).toBe(10000);
  });

  it('работает с нулевой ставкой', () => {
    const metrics = dayMetrics(records[1], 0);
    expect(metrics.commission).toBe(0);
    // выручка 44200 − расходы 1800
    expect(metrics.earned).toBe(44200 - 1800);
  });
});

describe('totalsOf', () => {
  it('суммирует выручку, комиссию, расходы, НЗ и заработок', () => {
    const totals = totalsOf(records, [], RATE);
    expect(totals.revenue).toBe(129900);
    expect(totals.commission).toBe(2700.5);
    expect(totals.expenses).toBe(13200);
    expect(totals.reserve).toBe(9500);
    // 129900 − 2700,5 − 13200
    expect(totals.earned).toBe(113999.5);
    expect(totals.records).toBe(3);
    expect(totals.expenseCount).toBe(3);
    expect(totals.lastDate).toBe('2025-11-02');
  });

  it('берёт наличные из последних записей каждой компании', () => {
    expect(totalsOf(records, [], RATE).cash).toBe(20000 + 4000);
  });

  it('считает по одной компании', () => {
    const zaton = companyTotals(records, [], 'zaton', RATE);
    expect(zaton.revenue).toBe(99900);
    expect(zaton.commission).toBe(2150.5);
    expect(zaton.reserve).toBe(6500);
    expect(zaton.cash).toBe(20000);
    expect(zaton.earned).toBe(92549.5); // 99900 − 2150,5 − 5200

    const artfokus = companyTotals(records, [], 'artfokus', RATE);
    expect(artfokus.revenue).toBe(30000);
    expect(artfokus.cash).toBe(4000);
    expect(artfokus.earned).toBe(21450); // 30000 − 550 − 8000
  });

  it('даёт нули на пустом наборе', () => {
    expect(totalsOf([], [], RATE)).toMatchObject({ revenue: 0, earned: 0, cash: 0, records: 0 });
  });

  it('раскладывает по компаниям в порядке COMPANIES', () => {
    const breakdown = companyBreakdown(records, [], RATE);
    expect(breakdown.map((item) => item.company.id)).toEqual(['zaton', 'artfokus']);
  });

  it('показывает отрицательный остаток', () => {
    const totals = totalsOf(
      // Касса за день уменьшилась на 5 000 без записи расхода — это вывод денег, а не продажа.
      [rec({ company: 'zaton', date: '2025-11-03', terminal: 0, cashPrev: 10000, cashFact: 5000, reserve: 0 })],
      [],
      RATE,
    );
    expect(totals.earned).toBeLessThan(0);
  });
});

describe('движения денег', () => {
  it('поступление налички после последней записи увеличивает кассу, но не заработок', () => {
    const adjustments = [adj({ company: 'zaton', date: '2025-11-05', target: 'cash', direction: 'in', amount: 15000 })];
    const totals = totalsOf(records, adjustments, RATE);
    expect(totals.cash).toBe(24000 + 15000);
    expect(totals.earned).toBe(113999.5);
    expect(totals.pots.total).toBe(128999.5 + 15000);
    expect(totals.adjustments.cashNet).toBe(15000);
    expect(totals.adjustments.inTotal).toBe(15000);
  });

  it('изъятие налички уменьшает остаток', () => {
    const adjustments = [adj({ company: 'zaton', date: '2025-11-05', target: 'cash', direction: 'out', amount: 7000 })];
    const totals = totalsOf(records, adjustments, RATE);
    expect(totals.cash).toBe(24000 - 7000);
    expect(totals.pots.total).toBe(128999.5 - 7000);
    expect(totals.adjustments.outTotal).toBe(7000);
  });

  it('не учитывает наличку внутри уже записанных дней дважды', () => {
    const adjustments = [adj({ company: 'zaton', date: '2025-11-01', target: 'cash', direction: 'in', amount: 5000 })];
    const totals = totalsOf(records, adjustments, RATE);
    expect(totals.cash).toBe(24000);
    expect(totals.pots.total).toBe(128999.5);
  });

  it('перекладывание в НЗ двигает деньги из кассы, а не создаёт их', () => {
    const adjustments = [
      adj({ company: 'zaton', date: '2025-11-04', target: 'reserve', direction: 'in', amount: 10000 }),
      adj({ company: 'artfokus', date: '2025-11-04', target: 'reserve', direction: 'out', amount: 3000 }),
    ];
    const totals = totalsOf(records, adjustments, RATE);
    expect(totals.reserve).toBe(9500 + 10000 - 3000);
    // НЗ — это отложенное, оно не уменьшает заработок, а переезжает в отдельный «карман».
    expect(totals.earned).toBe(113999.5);
    expect(totals.pots.reserve).toBe(16500);
    // Из кассы ушло 10 000 (zaton) и вернулось 3 000 (artfokus).
    expect(totals.pots.cash).toBe(24000 - 10000 + 3000);
    expect(totals.adjustments.cashNet).toBe(-7000);
    // Итог не меняется: деньги не появились и не исчезли, они просто лежат в другом месте.
    expect(totals.pots.total).toBe(128999.5);
  });

  it('поступление через терминал идёт в остаток за вычетом комиссии', () => {
    const totals = totalsOf(
      records,
      [adj({ company: 'artfokus', date: '2025-11-06', target: 'terminal', direction: 'in', amount: 24000 })],
      RATE,
    );
    expect(totals.adjustments.commission).toBe(660); // 24000 × 2,75%
    expect(totals.adjustments.terminalNet).toBe(23340);
    expect(totals.adjustments.terminalGrossNet).toBe(24000);
    // Комиссия в сводке учитывает и поступления через терминал.
    expect(totals.commission).toBe(2700.5 + 660);
    // Комиссию с поступления банк действительно удержал — она уменьшает заработок.
    expect(totals.earned).toBe(113999.5 - 660);
    expect(totals.pots.total).toBe(128999.5 + 23340);
  });

  it('изъятие через терминал не облагается комиссией', () => {
    const totals = totalsOf(
      records,
      [adj({ company: 'artfokus', date: '2025-11-06', target: 'terminal', direction: 'out', amount: 5000 })],
      RATE,
    );
    expect(totals.adjustments.terminalNet).toBe(-5000);
    expect(totals.adjustments.terminalGrossNet).toBe(-5000);
    expect(totals.adjustments.commission).toBe(0);
    expect(totals.commission).toBe(2700.5);
  });

  it('сходится: остатки = стартовая касса + заработано ± движения', () => {
    const adjustments = [
      adj({ company: 'zaton', date: '2025-11-05', target: 'cash', direction: 'in', amount: 15000 }),
    ];
    const totals = totalsOf(records, adjustments, RATE);
    const opening = 10000 + 5000; // cashPrev первых записей обеих компаний
    expect(opening + totals.earned + 15000).toBe(totals.pots.total);
    expect(totals.pots.free + totals.pots.reserve).toBe(totals.pots.total);
  });

  it('не меняет выручку', () => {
    const adjustments = [
      adj({ company: 'zaton', date: '2025-11-05', target: 'cash', direction: 'in', amount: 15000 }),
      adj({ company: 'zaton', date: '2025-11-05', target: 'terminal', direction: 'in', amount: 9000 }),
    ];
    expect(totalsOf(records, adjustments, RATE).revenue).toBe(129900);
  });
});

describe('цепочка наличных', () => {
  it('не находит разрывов, когда остаток перенесён верно', () => {
    expect(cashChainIssues(records, [])).toEqual([]);
  });

  it('находит разрыв, если «касса вчера» не равна прошлому факту', () => {
    const broken = records.map((record) =>
      record.company === 'zaton' && record.date === '2025-11-02'
        ? { ...record, cashPrev: record.cashPrev + 5000 }
        : record,
    );
    const issues = cashChainIssues(broken, []);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      company: 'zaton',
      date: '2025-11-02',
      entered: 14600,
      expected: 9600,
      gap: 5000,
    });
  });

  it('учитывает движения по кассе между записями', () => {
    const extended = [
      ...records,
      rec({ company: 'zaton', date: '2025-11-06', cashPrev: 23000, cashFact: 23000 }),
    ];
    // 20 000 (факт 02.11) + 3 000 внесли = 23 000 — разрыва нет
    const explained = [adj({ company: 'zaton', date: '2025-11-03', target: 'cash', direction: 'in', amount: 3000 })];
    expect(cashChainIssues(extended, explained)).toEqual([]);
    // без движения те же 23 000 — это «появившиеся» деньги
    expect(cashChainIssues(extended, [])[0]).toMatchObject({ date: '2025-11-06', gap: 3000 });
  });
});

describe('демо-данные', () => {
  it('сходятся: остаток = стартовая касса + заработано ± движения, цепочка без разрывов', () => {
    const data = buildDemoData(todayIso());
    const totals = totalsOf(data.records, data.adjustments, RATE);

    const opening = PROFILES_START_TILL.reduce((sum, value) => sum + value, 0);
    const lastDate: Record<string, string> = {};
    for (const record of data.records) {
      if (!lastDate[record.company] || record.date > lastDate[record.company]) {
        lastDate[record.company] = record.date;
      }
    }
    const movements = data.adjustments.reduce((sum, adjustment) => {
      // Перекладывание в НЗ итог не меняет, а движения внутри записанных дней уже в факте.
      if (adjustment.target === 'reserve') return sum;
      if (adjustment.target === 'cash' && !(adjustment.date > (lastDate[adjustment.company] ?? ''))) {
        return sum;
      }
      return sum + (adjustment.direction === 'in' ? adjustment.amount : -adjustment.amount);
    }, 0);

    expect(opening + totals.earned + movements).toBeCloseTo(totals.pots.total, 2);
    expect(cashChainIssues(data.records, data.adjustments)).toEqual([]);
  });
});

describe('suggestedCashPrev', () => {
  it('берёт факт последней записи компании', () => {
    expect(suggestedCashPrev(records, [], 'zaton', '2025-11-03')).toBe(20000);
  });

  it('добавляет движения по наличке между записями', () => {
    const adjustments = [
      adj({ company: 'zaton', date: '2025-11-03', target: 'cash', direction: 'in', amount: 15000 }),
      adj({ company: 'zaton', date: '2025-11-03', target: 'reserve', direction: 'in', amount: 9000 }),
    ];
    // Факт 20 000 + 15 000 внесли в кассу − 9 000 переложили в НЗ = 26 000
    expect(suggestedCashPrev(records, adjustments, 'zaton', '2025-11-04')).toBe(26000);
  });

  it('не видит чужие компании и будущие движения', () => {
    const adjustments = [
      adj({ company: 'artfokus', date: '2025-11-03', target: 'cash', direction: 'in', amount: 15000 }),
      adj({ company: 'zaton', date: '2025-11-09', target: 'cash', direction: 'in', amount: 15000 }),
    ];
    expect(suggestedCashPrev(records, adjustments, 'zaton', '2025-11-05')).toBe(20000);
  });

  it('для первого дня возвращает 0 без записей', () => {
    expect(suggestedCashPrev([], [], 'zaton', '2025-11-01')).toBe(0);
  });
});

describe('фильтры и ряды', () => {
  it('фильтрует записи по компании и датам', () => {
    expect(filterRecords(records, { company: 'artfokus' })).toHaveLength(1);
    expect(filterRecords(records, { from: '2025-11-02', to: '2025-11-02' })).toHaveLength(2);
    expect(filterRecords(records, { query: 'корм' })).toHaveLength(1);
  });

  it('фильтрует движения по цели и компании', () => {
    const adjustments = [
      adj({ company: 'zaton', date: '2025-11-05', target: 'cash', amount: 100 }),
      adj({ company: 'zaton', date: '2025-11-05', target: 'reserve', amount: 200 }),
      adj({ company: 'artfokus', date: '2025-11-05', target: 'cash', amount: 300 }),
    ];
    expect(filterAdjustments(adjustments, { target: 'cash' })).toHaveLength(2);
    expect(filterAdjustments(adjustments, { company: 'zaton' })).toHaveLength(2);
    expect(filterAdjustments(adjustments, { target: 'cash', company: 'zaton' })).toHaveLength(1);
  });

  it('строит ряд по итогам дня', () => {
    const series = dailySeries(records, 2, '2025-11-02', RATE);
    expect(series.map((point) => point.date)).toEqual(['2025-11-01', '2025-11-02']);
    expect(series[0].total).toBe(55700);
    expect(series[1].total).toBe(44200 + 30000);
    expect(series[1].byCompany.zaton).toBe(44200);
    expect(series[1].byCompany.artfokus).toBe(30000);
  });

  it('сортирует по убыванию даты', () => {
    expect(sortByDateDesc(records)[0].date).toBe('2025-11-02');
  });

  it('складывает расходы без плавающих ошибок', () => {
    const value = recordExpensesTotal(
      rec({
        company: 'zaton',
        date: '2025-11-04',
        expenses: [
          { id: 'a', amount: 0.1, comment: '' },
          { id: 'b', amount: 0.2, comment: '' },
        ],
      }),
    );
    expect(value).toBe(0.3);
  });
});
