import {
  DEFAULT_COMMISSION_RATE,
  companyById,
  type Adjustment,
  type AppData,
  type AdjustmentTarget,
  type DayRecord,
} from '../../shared/model';
import { round2 } from '../../shared/model';
import { formatDateShort } from './format';
import { dayMetrics, sortByDateAsc, totalsOf } from './calc';

function escapeCell(value: string): string {
  if (/[;"\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function numCell(value: number): string {
  return round2(value).toFixed(2).replace('.', ',');
}

function row(cells: (string | number)[]): string {
  return cells
    .map((cell) => escapeCell(typeof cell === 'number' ? numCell(cell) : cell))
    .join(';');
}

const TARGET_LABELS: Record<AdjustmentTarget, string> = {
  cash: 'Наличные',
  terminal: 'Терминал',
  reserve: 'НЗ',
};

export interface CsvOptions {
  from?: string;
  to?: string;
  /** Подпись выборки, попадает в шапку отчёта */
  scopeLabel?: string;
  commissionRate?: number;
  /** Заголовок отчёта */
  title?: string;
  /** Строки «Показатель;Значение» в блоке итогов */
  extraSummary?: { label: string; value: string | number }[];
}

function nowStamp(): string {
  const now = new Date();
  const date = `${`${now.getDate()}`.padStart(2, '0')}.${`${now.getMonth() + 1}`.padStart(2, '0')}.${now.getFullYear()}`;
  return `${date} ${`${now.getHours()}`.padStart(2, '0')}:${`${now.getMinutes()}`.padStart(2, '0')}`;
}

/**
 * CSV для Excel: UTF-8 с BOM, разделитель «;», десятичная запятая.
 * Excel открывает такой файл двойным щелчком без «кракозябр» и без импорта.
 */
export function buildCsv(
  records: DayRecord[],
  adjustments: Adjustment[] = [],
  options: CsvOptions = {},
): string {
  const rate = options.commissionRate ?? DEFAULT_COMMISSION_RATE;
  const sorted = sortByDateAsc(records);
  const sortedAdjustments = sortByDateAsc(adjustments);
  const totals = totalsOf(sorted, sortedAdjustments, rate);

  const period =
    options.from && options.to
      ? `${formatDateShort(options.from)} — ${formatDateShort(options.to)}`
      : sorted.length > 0
        ? `${formatDateShort(sorted[0].date)} — ${formatDateShort(sorted[sorted.length - 1].date)}`
        : 'нет данных';

  const lines: string[] = [];
  lines.push(row([options.title ?? 'Отчёт по финансам', 'Затон Рыбака и Арт Фокус']));
  lines.push(row(['Период', period]));
  lines.push(row(['Выборка', options.scopeLabel ?? 'Все компании']));
  lines.push(row(['Комиссия банка', `${numCell(rate)}%`]));
  lines.push(row(['Сформирован', nowStamp()]));
  lines.push('');

  lines.push(
    row([
      'Дата',
      'Компания',
      'Остаток вчера, ₽',
      'Терминал, ₽',
      'Нал в кассе, ₽',
      'Изменение наличных, ₽',
      'Итог наличными, ₽',
      'Расходы, ₽',
      'НЗ, ₽',
      'Итог дня, ₽',
      'Комиссия, ₽',
      'Заработано за день, ₽',
      'Кол-во расходов',
      'Расходы (детали)',
      'Примечание',
    ]),
  );

  for (const record of sorted) {
    const metrics = dayMetrics(record, rate);
    const details = record.expenses
      .map(
        (expense) =>
          `${(Math.round(expense.amount * 100) / 100).toFixed(2).replace('.', ',')} — ${
            expense.comment || 'без комментария'
          }`,
      )
      .join('; ');
    lines.push(
      row([
        formatDateShort(record.date),
        companyById(record.company).name,
        record.cashPrev,
        record.terminal,
        record.cashFact,
        metrics.cashChange,
        metrics.cashSales,
        metrics.expenses,
        record.reserve,
        metrics.revenue,
        metrics.commission,
        metrics.earned,
        String(record.expenses.length),
        details,
        record.note,
      ]),
    );
  }

  if (sortedAdjustments.length > 0) {
    lines.push('');
    lines.push(row(['ПОСТУПЛЕНИЯ И ИЗЪЯТИЯ']));
    lines.push(
      row([
        'Дата',
        'Компания',
        'Куда',
        'Направление',
        'Сумма, ₽',
        'Влияние на остаток, ₽',
        'Комментарий',
      ]),
    );

    for (const adjustment of sortedAdjustments) {
      let impact = 0;
      if (adjustment.target === 'cash') {
        impact = adjustment.direction === 'in' ? adjustment.amount : -adjustment.amount;
      } else if (adjustment.target === 'reserve') {
        impact = adjustment.direction === 'in' ? -adjustment.amount : adjustment.amount;
      } else {
        impact =
          adjustment.direction === 'in'
            ? round2(adjustment.amount - (adjustment.amount * rate) / 100)
            : -adjustment.amount;
      }
      lines.push(
        row([
          formatDateShort(adjustment.date),
          companyById(adjustment.company).name,
          TARGET_LABELS[adjustment.target],
          adjustment.direction === 'in' ? 'Положили' : 'Забрали',
          adjustment.amount,
          impact,
          adjustment.comment,
        ]),
      );
    }
  }

  lines.push('');
  lines.push(row(['ИТОГИ ПО ПЕРИОДУ']));
  lines.push(row(['Показатель', 'Значение, ₽']));
  lines.push(row(['Итог (терминал + наличные)', totals.revenue]));
  lines.push(row([`Комиссия банка (${numCell(rate)}%)`, totals.commission]));
  lines.push(row(['Расходы', totals.expenses]));
  lines.push(row(['Заработано (итог − комиссия − расходы)', totals.earned]));
  lines.push(row(['НЗ накоплено', totals.reserve]));
  lines.push(row(['Наличные в кассе', totals.pots.cash]));
  lines.push(row(['На терминале (за вычетом комиссии)', totals.pots.terminal]));
  lines.push(row(['В НЗ', totals.pots.reserve]));
  lines.push(row(['Остаток на сейчас (наличные после НЗ + терминал)', totals.pots.free]));
  lines.push(row(['Записей дней', totals.records]));
  lines.push(row(['Строк расходов', totals.expenseCount]));

  for (const line of options.extraSummary ?? []) {
    lines.push(row([line.label, line.value]));
  }

  if (totals.adjustments.inTotal > 0 || totals.adjustments.outTotal > 0) {
    lines.push(row(['Движений: положили', totals.adjustments.inTotal]));
    lines.push(row(['Движений: забрали', totals.adjustments.outTotal]));
  }

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function csvFilename(from?: string, to?: string, prefix = 'Финансы'): string {
  const period =
    from && to
      ? `${formatDateShort(from).replace(/\./g, '-')}_${formatDateShort(to).replace(/\./g, '-')}`
      : 'все-даты';
  return `${prefix}_${period}.csv`;
}

export function buildJsonBackup(data: AppData): string {
  return `${JSON.stringify(
    { ...data, exportedAt: new Date().toISOString(), app: 'ZatonFinance' },
    null,
    2,
  )}\n`;
}

export function jsonBackupFilename(): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    `${now.getMonth() + 1}`.padStart(2, '0'),
    `${now.getDate()}`.padStart(2, '0'),
  ].join('-');
  return `Финансы-резервная-копия-${stamp}.json`;
}
