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
  /** Какая доля оборота приходит наличными (нужна, чтобы касса не упиралась в ноль). */
  cashShare: number;
  reserveShare: number;
  /** Остаток кассы, к которому возвращаются после сдачи денег на счёт. */
  tillBase: number;
  /** Выше этого остатка деньги из кассы забирают на счёт. */
  tillTop: number;
  /** Выше этой суммы деньги с терминала изымают на счёт. */
  terminalCap: number;
  expenses: { comment: string; min: number; max: number }[];
}

const PROFILES: DemoProfile[] = [
  {
    company: 'zaton',
    base: 46000,
    spread: 16000,
    cashShare: 0.26,
    reserveShare: 0.07,
    tillBase: 14000,
    tillTop: 32000,
    terminalCap: 160000,
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
    cashShare: 0.2,
    reserveShare: 0.09,
    tillBase: 8000,
    tillTop: 22000,
    terminalCap: 110000,
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

/** Круглая сумма до сотни рублей вниз — так числа в демо выглядят «живыми», а не машинными. */
function round100(value: number): number {
  return Math.round(value / 100) * 100;
}

export function buildDemoData(todayIso: string, days = 42): AppData {
  const random = mulberry32(20260101);
  const records: DayRecord[] = [];
  const adjustments: Adjustment[] = [];

  for (const profile of PROFILES) {
    // Касса тянется из дня в день по цепочке: вчерашний факт → сегодняшний факт.
    let till = profile.tillBase;
    let onTerminal = 0;

    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = isoShift(todayIso, -offset);
      const weekday = new Date(`${date}T12:00:00`).getDay();
      const isWeekend = weekday === 0 || weekday === 6;
      const dayOff = random() < (isWeekend ? 0.45 : 0.08);

      // В день без записи хозяин разбирается с деньгами: сдаёт излишек кассы на счёт
      // и иногда перекладывает часть в НЗ. Движения только в такие дни — тогда
      // они не спорят с фактическим остатком записанного дня.
      if (dayOff) {
        if (till > profile.tillTop) {
          const amount = round100(till - profile.tillBase);
          if (amount >= 1000) {
            adjustments.push({
              id: newId(),
              company: profile.company,
              date,
              target: 'cash',
              direction: 'out',
              amount,
              comment: 'Сдали деньги на счёт',
              createdAt: new Date(`${date}T12:00:00`).toISOString(),
            });
            till = round2(till - amount);
          }
        }
        if (random() < 0.12 && till > 6000) {
          const amount = round100(till * 0.25);
          if (amount >= 1000) {
            adjustments.push({
              id: newId(),
              company: profile.company,
              date,
              target: 'reserve',
              direction: 'in',
              amount,
              comment: 'Переложили часть кассы в НЗ',
              createdAt: new Date(`${date}T13:00:00`).toISOString(),
            });
            till = round2(till - amount);
          }
        }
        continue;
      }

      const terminal = round100(profile.base + (random() - 0.5) * profile.spread);
      if (terminal <= 0) continue;

      const expenseRows: Expense[] = [];
      const expenseCount = Math.floor(random() * 3) + (weekday === 5 ? 2 : 1);
      for (let i = 0; i < expenseCount; i += 1) {
        const template = profile.expenses[Math.floor(random() * profile.expenses.length)];
        const amount = Math.round((template.min + random() * (template.max - template.min)) / 50) * 50;
        expenseRows.push({ id: newId(), amount, comment: template.comment });
      }
      const reserve = round100(terminal * profile.reserveShare);

      const cashPrev = round2(till);
      // Наличных продали столько, чтобы покрыть расходы, НЗ и оставить в кассе прибавку.
      // В «тесный» день прибавка отрицательная — касса проседает, это нормально.
      const tight = random() < 0.22;
      const raw =
        (tight ? -1 : 1) * round100(400 + random() * (profile.base * profile.cashShare * 0.12));
      const margin = Math.max(raw, 500 - cashPrev);
      // В кассе вечером лежит и рабочий остаток, и отложенное в НЗ — так и считает хозяин.
      const cashFact = round2(cashPrev + margin + reserve);
      till = round2(cashPrev + margin);

      // Деньги с терминала периодически изымают на счёт — иначе «на терминале» копится вечно.
      onTerminal += terminal - round100((terminal * 2.75) / 100);
      if (onTerminal > profile.terminalCap) {
        adjustments.push({
          id: newId(),
          company: profile.company,
          date,
          target: 'terminal',
          direction: 'out',
          amount: round100(onTerminal - profile.terminalCap),
          comment: 'Изъяли с терминала на счёт',
          createdAt: new Date(`${date}T20:00:00`).toISOString(),
        });
        onTerminal = profile.terminalCap;
      }

      const createdAt = new Date(`${date}T19:30:00`).toISOString();
      records.push({
        id: newId(),
        company: profile.company,
        date,
        cashPrev,
        terminal,
        cashFact,
        reserve,
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

  // Сторонние поступления — на дни без записей, чтобы не спорить с фактом кассы.
  const takenDates = new Set(records.map((record) => `${record.company}|${record.date}`));
  const addAdjustment = (
    company: CompanyId,
    baseDate: string,
    target: AdjustmentTarget,
    direction: AdjustmentDirection,
    amount: number,
    comment: string,
  ) => {
    let date = baseDate;
    for (let attempt = 0; attempt < 10; attempt += 1) {
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

  addAdjustment('zaton', isoShift(todayIso, -9), 'terminal', 'in', 12000, 'Оплата по счёту от клиента');
  addAdjustment('artfokus', isoShift(todayIso, -7), 'terminal', 'in', 24000, 'Оплата по счёту от клиента');

  adjustments.sort((a, b) => a.date.localeCompare(b.date));

  return {
    schemaVersion: 2,
    records,
    adjustments,
    settings: { theme: 'black', lastCompany: 'zaton', commissionRate: 2.75 },
  };
}
