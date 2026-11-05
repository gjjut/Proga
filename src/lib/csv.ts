import { companyById, type AppData, type DayRecord } from '../../shared/model';
import { round2 } from '../../shared/model';
import { formatDateShort } from './format';
import { sortByDateAsc, totalsOf } from './calc';

function escapeCell(value: string): string {
  if (/[;"\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function row(cells: (string | number)[]): string {
  return cells
    .map((cell) => escapeCell(typeof cell === 'number' ? numCell(cell) : cell))
    .join(';');
}

function numCell(value: number): string {
  return round2(value).toFixed(2).replace('.', ',');
}

export interface CsvOptions {
  from?: string;
  to?: string;
  /** Подпись выборки, попадает в шапку отчёта */
  scopeLabel?: string;
}

/**
 * CSV для Excel: UTF-8 с BOM, разделитель «;», десятичная запятая.
 * Excel открывает такой файл двойным щелчком без «кракозябр» и без импорта.
 */
export function buildCsv(records: DayRecord[], options: CsvOptions = {}): string {
  const sorted = sortByDateAsc(records);
  const totals = totalsOf(sorted);
  const period =
    options.from && options.to
      ? `${formatDateShort(options.from)} — ${formatDateShort(options.to)}`
      : sorted.length > 0
        ? `${formatDateShort(sorted[0].date)} — ${formatDateShort(sorted[sorted.length - 1].date)}`
        : 'нет данных';

  const now = new Date();
  const createdAt = `${formatDateShort(
    `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`,
  )} ${`${now.getHours()}`.padStart(2, '0')}:${`${now.getMinutes()}`.padStart(2, '0')}`;

  const lines: string[] = [];
  lines.push(row(['Отчёт по финансам', 'Затон Рыбака и Арт Фокус']));
  lines.push(row(['Период', period]));
  lines.push(row(['Выборка', options.scopeLabel ?? 'Все компании']));
  lines.push(row(['Сформирован', createdAt]));
  lines.push('');
  lines.push(
    row([
      'Дата',
      'Компания',
      'Терминал, ₽',
      'Наличные в кассе, ₽',
      'НЗ, ₽',
      'Расходы, ₽',
      'Остаток за день, ₽',
      'Кол-во расходов',
      'Расходы (детали)',
      'Примечание',
    ]),
  );

  for (const record of sorted) {
    const expenses = round2(record.expenses.reduce((sum, expense) => sum + expense.amount, 0));
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
        record.terminal,
        record.cash,
        record.reserve,
        expenses,
        round2(record.terminal - expenses - record.reserve),
        String(record.expenses.length),
        details,
        record.note,
      ]),
    );
  }

  lines.push('');
  lines.push(
    row([
      'ИТОГО',
      '',
      totals.revenue,
      totals.cash,
      totals.reserve,
      totals.expenses,
      totals.balance,
      String(totals.expenseCount),
      `записей: ${totals.records}`,
      '',
    ]),
  );
  lines.push(row(['Свободный остаток', 'Выручка − Расходы − НЗ', totals.balance]));

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function csvFilename(from?: string, to?: string): string {
  const period =
    from && to
      ? `${formatDateShort(from).replace(/\./g, '-')}_${formatDateShort(to).replace(/\./g, '-')}`
      : 'все-даты';
  return `Финансы_${period}.csv`;
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
