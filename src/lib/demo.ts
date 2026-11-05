import {
  newId,
  type Adjustment,
  type AdjustmentDirection,
  type AdjustmentTarget,
  type AppData,
  type CompanyId,
  type DayRecord,
  type Expense,
} from '../../shared/model';
import { round2 } from '../../shared/model';

/**
 * Демонстрационный набор данных.
 * Используется ТОЛЬКО браузерным адаптером (превью в dev-режиме), чтобы интерфейс
 * не выглядел пустым. В настоящем десктопном приложении данные всегда начинаются с нуля.
 */

interface DemoProfile {
  company: CompanyId;
  base: number;
  spread: number;
  cashShare: number;
  reserveShare: number;
  startTill: number;
  expenses: { comment: string; min: number; max: number }[];
}

const PROFILES: DemoProfile[] = [
  {
    company: 'zaton',
    base: 46000,
    spread: 16000,
    cashShare: 0.14,
    reserveShare: 0.07,
    startTill: 18400,
    expenses: [
      { comment: 'Закупка корма и прикормки', min: 3200, max: 9800 },
      { comment: 'Бензин для генератора', min: 1800, max: 4600 },
      { comment: 'Зарплата егеря', min: 6000, max: 9000 },
      { comment: 'Ремонт лодки, мастерская на Ленина', min: 2500, max: 12000 },
      { comment: 'Лёд для хранения улова', min: 900, max: 2600 },
      { comment: 'Электричество за месяц', min: 2400, max: 5200 },
    ],
  },
  {
    company: 'artfokus',
    base: 28000,
    spread: 11000,
    cashShare: 0.1,
    reserveShare: 0.09,
    startTill: 9600,
    expenses: [
      { comment: 'Аренда студии', min: 8000, max: 12000 },
      { comment: 'Материалы для съёмки', min: 2200, max: 7400 },
      { comment: 'Подписка на софт', min: 1200, max: 3200 },
      { comment: 'Оплата фотографу', min: 4000, max: 11000 },
      { comment: 'Печать баннеров, типография «Пиксель»', min: 1500, max: 6800 },
      { comment: 'Продвижение в соцсетях', min: 2000, max: 6000 },
    ],
  },
];

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoShift(baseIso: string, delta: number): string {
  const date = new Date(`${baseIso}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

export function buildDemoData(todayIso: string, days = 42): AppData {
  const random = mulberry32(20260101);
  const records: DayRecord[] = [];

  for (const profile of PROFILES) {
    let till = profile.startTill;

    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = isoShift(todayIso, -offset);
      const weekday = new Date(`${date}T12:00:00`).getDay();
      // Выходные пропускаем чаще, чем будни.
      const skipChance = weekday === 0 || weekday === 6 ? 0.45 : 0.08;
      if (random() < skipChance) continue;

      const terminal = Math.round((profile.base + (random() - 0.5) * profile.spread) / 100) * 100;
      if (terminal <= 0) continue;

      const expenseRows: Expense[] = [];
      const expenseCount = Math.floor(random() * 3) + (weekday === 5 ? 2 : 1);
      for (let i = 0; i < expenseCount; i += 1) {
        const template = profile.expenses[Math.floor(random() * profile.expenses.length)];
        const amount = Math.round((template.min + random() * (template.max - template.min)) / 50) * 50;
        expenseRows.push({ id: newId(), amount, comment: template.comment });
      }
      const expenseSum = expenseRows.reduce((sum, expense) => sum + expense.amount, 0);

      const cashSales = Math.round((terminal * profile.cashShare * (0.7 + random())) / 100) * 100;
      const cashPrev = round2(till);
      // НЗ остаётся в кассе, поэтому уменьшает факт только на сумму расходов.
      const cashFact = Math.max(0, round2(cashPrev + cashSales - expenseSum));
      till = cashFact;

      const createdAt = new Date(`${date}T19:30:00`).toISOString();
      records.push({
        id: newId(),
        company: profile.company,
        date,
        cashPrev,
        terminal,
        cashFact,
        reserve: Math.round((terminal * profile.reserveShare) / 100) * 100,
        expenses: expenseRows,
        note:
          random() > 0.88
            ? profile.company === 'zaton'
              ? 'Хороший клёв, две группы рыбаков'
              : 'Сдали проект, клиент доволен'
            : '',
        createdAt,
        updatedAt: createdAt,
      });
    }
  }

  records.sort((a, b) => a.date.localeCompare(b.date) || a.company.localeCompare(b.company));

  // Сторонние движения денег — на дни без записей, чтобы были видны в остатках.
  const takenDates = new Set(records.map((record) => `${record.company}|${record.date}`));
  const adjustments: Adjustment[] = [];

  const addAdjustment = (
    company: CompanyId,
    baseDate: string,
    target: AdjustmentTarget,
    direction: AdjustmentDirection,
    amount: number,
    comment: string,
  ) => {
    let date = baseDate;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (!takenDates.has(`${company}|${date}`)) break;
      date = isoShift(date, -1);
    }
    if (takenDates.has(`${company}|${date}`)) return;
    takenDates.add(`${company}|${date}`);
    adjustments.push({
      id: newId(),
      company,
      date,
      target,
      direction,
      amount,
      comment,
      createdAt: new Date(`${date}T12:00:00`).toISOString(),
    });
  };

  addAdjustment('zaton', isoShift(todayIso, -9), 'cash', 'in', 15000, 'Внесли личные деньги на корм');
  addAdjustment('zaton', isoShift(todayIso, -4), 'cash', 'out', 22000, 'Забрали выручку на счёт');
  addAdjustment('zaton', isoShift(todayIso, -2), 'reserve', 'in', 10000, 'Переложили в НЗ');
  addAdjustment('artfokus', isoShift(todayIso, -7), 'terminal', 'in', 24000, 'Оплата по счёту от клиента');
  addAdjustment('artfokus', isoShift(todayIso, -3), 'reserve', 'out', 8000, 'Взяли из НЗ на аренду');
  addAdjustment('artfokus', isoShift(todayIso, -1), 'cash', 'in', 6000, 'Вернули остаток с закупки');

  return {
    schemaVersion: 2,
    records,
    adjustments,
    settings: { theme: 'black', lastCompany: 'zaton', commissionRate: 2.75 },
  };
}
