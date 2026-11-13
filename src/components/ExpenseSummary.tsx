import type { DayRecord } from '../../shared/model';
import { expenseCategories } from '../lib/expenses';
import { formatMoney, formatNumber } from '../lib/format';

export function ExpenseSummary({ records, hint }: { records: DayRecord[]; hint: string }) {
  const categories = expenseCategories(records);
  return (
    <section className="card expense-summary" aria-label="Расходы по категориям">
      <div className="card__header">
        <div>
          <h2 className="card__title">Расходы по категориям</h2>
          <p className="card__hint">{hint} · только записанные расходы</p>
        </div>
      </div>
      {categories.length === 0 ? <p className="card__empty">Расходов в выборке нет.</p> : (
        <div className="expense-summary__scroll">
          <table className="expense-summary__table">
            <thead><tr><th scope="col">Категория</th><th scope="col">Расходов</th><th scope="col">Сумма</th></tr></thead>
            <tbody>{categories.map((item) => (
              <tr key={item.category}>
                <th scope="row">{item.category}</th>
                <td>{formatNumber(item.count)}</td>
                <td>{formatMoney(item.amount)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
