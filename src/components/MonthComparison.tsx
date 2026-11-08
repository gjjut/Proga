import { monthlyComparison } from '../lib/comparison';
import { formatDateShort, formatMoney, formatSignedMoney, recordsLabel } from '../lib/format';
import type { Adjustment, DayRecord } from '../../shared/model';

const metrics = [
  { key: 'revenue', label: 'Итог' },
  { key: 'expenses', label: 'Расходы' },
  { key: 'earned', label: 'Заработано' },
] as const;

export function MonthComparison({ records, adjustments, today, commissionRate }: {
  records: DayRecord[];
  adjustments: Adjustment[];
  today: string;
  commissionRate: number;
}) {
  const groups = monthlyComparison(records, adjustments, today, commissionRate);
  const { current, previous } = groups[0];
  return (
    <section className="card comparison" aria-labelledby="comparison-title">
      <div className="card__header">
        <div>
          <h2 id="comparison-title" className="card__title">Сравнение месяцев</h2>
          <p className="card__hint">Одинаковые дни месяца · независимо от периода вверху</p>
        </div>
      </div>
      <p className="comparison__note">Периоды одинаковой длины, будущие дни не учитываются. Суммы — по внесённым записям, пропущенные дни не восполняются. Если записей дня нет, сравнение не рассчитывается. Комиссия с поступлений через терминал учитывается в заработке.</p>
      <div className="comparison__scroll">
        <table className="comparison__table">
          <thead>
            <tr>
              <th scope="col">Показатель</th>
              <th scope="col">Этот месяц<br /><span>{formatDateShort(current.from)} — {formatDateShort(current.to)}</span></th>
              <th scope="col">Прошлый месяц<br /><span>{formatDateShort(previous.from)} — {formatDateShort(previous.to)}</span></th>
              <th scope="col">Разница<br /><span>этот − прошлый</span></th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.label}>
              <tr className="comparison__group"><th colSpan={4} scope="rowgroup">{group.label}</th></tr>
              <tr className="comparison__counts">
                <th scope="row">Данные</th>
                {[group.current, group.previous].map((side) => (
                  <td key={side.from}>{side.hasData ? `${recordsLabel(side.recordCount)} · ${side.movementCount} движ.` : `Нет записей · ${side.movementCount} движ.`}</td>
                ))}
                <td>—</td>
              </tr>
              {metrics.map(({ key, label }) => (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td>{group.current.hasData ? formatMoney(group.current.totals[key]) : '—'}</td>
                  <td>{group.previous.hasData ? formatMoney(group.previous.totals[key]) : '—'}</td>
                  <td>{group.difference ? formatSignedMoney(group.difference[key]) : '—'}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
