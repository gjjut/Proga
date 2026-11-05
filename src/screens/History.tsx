import { useMemo, useState } from 'react';
import { COMPANIES, companyById, type CompanyId, type DayRecord } from '../../shared/model';
import { CompanyBadge } from '../components/Badge';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  SearchIcon,
  TrashIcon,
} from '../components/Icons';
import { ConfirmDialog } from '../components/Modal';
import {
  dayMetrics,
  filterAdjustments,
  filterRecords,
  sortByDateDesc,
  totalsOf,
} from '../lib/calc';
import {
  formatDateLong,
  formatDateWithWeekday,
  formatMinusMoney,
  formatMoney,
  formatNumber,
  formatPercent,
  formatSignedMoney,
  formatTime,
  lastNDaysRange,
  monthRange,
  recordsLabel,
  todayIso,
} from '../lib/format';
import { useApp } from '../state';

type PresetId = 'month' | '30' | 'all' | 'custom';

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'month', label: 'Этот месяц' },
  { id: '30', label: '30 дней' },
  { id: 'all', label: 'Всё время' },
];

export function History() {
  const { data, navigate, deleteRecord, exportCsv } = useApp();
  const rate = data.settings.commissionRate;

  const [company, setCompany] = useState<CompanyId | 'all'>('all');
  const [preset, setPreset] = useState<PresetId>('month');
  const [from, setFrom] = useState(() => monthRange(0).from);
  const [to, setTo] = useState(() => monthRange(0).to);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const applyPreset = (next: PresetId) => {
    setPreset(next);
    if (next === 'month') {
      const range = monthRange(0);
      setFrom(range.from);
      setTo(range.to);
    } else if (next === '30') {
      const range = lastNDaysRange(30, todayIso());
      setFrom(range.from);
      setTo(range.to);
    } else if (next === 'all') {
      setFrom('');
      setTo('');
    }
  };

  const filtered = useMemo(
    () =>
      sortByDateDesc(
        filterRecords(data.records, {
          company,
          from: from || undefined,
          to: to || undefined,
          query,
        }),
      ),
    [data.records, company, from, to, query],
  );

  const filteredAdjustments = useMemo(
    () =>
      filterAdjustments(data.adjustments, {
        company,
        from: from || undefined,
        to: to || undefined,
      }),
    [data.adjustments, company, from, to],
  );

  const totals = useMemo(
    () => totalsOf(filtered, filteredAdjustments, rate),
    [filtered, filteredAdjustments, rate],
  );
  const deleteTarget = filtered.find((record) => record.id === deleteId) ?? null;

  const toggleExpanded = (id: string) => {
    setExpanded((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const openRecord = (record: DayRecord) => {
    navigate('day', { company: record.company, date: record.date });
  };

  const handleExport = () => {
    if (filtered.length === 0 && filteredAdjustments.length === 0) return;
    const scopeLabel = company === 'all' ? 'Все компании' : `Только ${companyById(company).name}`;
    void exportCsv(filtered, filteredAdjustments, {
      from: from || undefined,
      to: to || undefined,
      scopeLabel,
    });
  };

  return (
    <div className="screen">
      <header className="screen__header">
        <div className="screen__title-wrap">
          <h1 className="screen__title">История</h1>
          <p className="screen__subtitle">
            {recordsLabel(filtered.length)} ·{' '}
            {company === 'all' ? 'обе компании' : companyById(company).name} · комиссия{' '}
            {formatPercent(rate)}
          </p>
        </div>
        <div className="screen__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleExport}
            disabled={filtered.length === 0 && filteredAdjustments.length === 0}
          >
            <DownloadIcon size={17} />
            <span>Экспорт в Excel (CSV)</span>
          </button>
        </div>
      </header>

      <section className="card card--pad filters">
        <div className="filters__group">
          <span className="filters__label">Компания</span>
          <div className="chips">
            <button
              type="button"
              className={`chip${company === 'all' ? ' is-active' : ''}`}
              onClick={() => setCompany('all')}
            >
              Все
            </button>
            {COMPANIES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chip${company === item.id ? ' is-active' : ''}`}
                style={
                  company === item.id
                    ? { borderColor: `${item.accent}80`, color: item.accent }
                    : undefined
                }
                onClick={() => setCompany(item.id)}
              >
                <span className="chip__dot" style={{ background: item.accent }} />
                {item.name}
              </button>
            ))}
          </div>
        </div>

        <div className="filters__group">
          <span className="filters__label">Период</span>
          <div className="chips">
            {PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chip${preset === item.id ? ' is-active' : ''}`}
                onClick={() => applyPreset(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="date-range">
            <label className="date-field date-field--small">
              <span>с</span>
              <input
                type="date"
                className="date-field__input"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPreset('custom');
                }}
                aria-label="Дата с"
              />
            </label>
            <label className="date-field date-field--small">
              <span>по</span>
              <input
                type="date"
                className="date-field__input"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPreset('custom');
                }}
                aria-label="Дата по"
              />
            </label>
          </div>
        </div>

        <div className="filters__group filters__group--search">
          <span className="filters__label">Поиск</span>
          <label className="search-field">
            <SearchIcon size={17} />
            <input
              type="search"
              className="search-field__input"
              placeholder="По комментариям расходов и дня"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Поиск по комментариям"
            />
          </label>
        </div>
      </section>

      <section className="summary-strip">
        <div className="summary-strip__item">
          <span>Выручка</span>
          <strong>{formatMoney(totals.revenue)}</strong>
        </div>
        <div className="summary-strip__item">
          <span>Комиссия</span>
          <strong>{formatMoney(totals.commission)}</strong>
        </div>
        <div className="summary-strip__item">
          <span>Расходы</span>
          <strong>{formatMoney(totals.expenses)}</strong>
        </div>
        <div className="summary-strip__item">
          <span>НЗ</span>
          <strong>{formatMoney(totals.reserve)}</strong>
        </div>
        <div className="summary-strip__item">
          <span>Наличные в кассе</span>
          <strong>{formatMoney(totals.cash)}</strong>
        </div>
        <div className="summary-strip__item">
          <span>Остаток</span>
          <strong className={totals.balance < 0 ? 'is-negative' : ''}>
            {formatMoney(totals.balance)}
          </strong>
        </div>
      </section>

      {filtered.length === 0 ? (
        <section className="card empty-state">
          <div className="empty-state__icon">
            <SearchIcon size={26} />
          </div>
          <h2 className="empty-state__title">Ничего не найдено</h2>
          <p className="empty-state__text">
            Попробуйте изменить период или компанию, сбросить поисковый запрос — или запишите
            первый день.
          </p>
          <button type="button" className="btn btn--primary" onClick={() => navigate('day')}>
            Записать день
          </button>
        </section>
      ) : (
        <div className="record-list">
          {filtered.map((record) => {
            const metrics = dayMetrics(record, rate);
            const meta = companyById(record.company);
            const isOpen = expanded.includes(record.id);
            return (
              <article key={record.id} className="record card">
                <div className="record__head">
                  <div className="record__date">
                    <strong>{formatDateLong(record.date)}</strong>
                    <span>{formatDateWithWeekday(record.date).split(',').slice(-1)[0].trim()}</span>
                  </div>
                  <CompanyBadge company={record.company} />
                  <div className="record__actions">
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => openRecord(record)}>
                      Изменить
                    </button>
                    <button
                      type="button"
                      className="btn btn--icon btn--ghost btn--danger-hover"
                      onClick={() => setDeleteId(record.id)}
                      aria-label={`Удалить запись за ${record.date}`}
                    >
                      <TrashIcon size={17} />
                    </button>
                  </div>
                </div>

                <div className="record__stats record__stats--grid3">
                  <div className="record__stat">
                    <span>Остаток вчера</span>
                    <strong>{formatMoney(record.cashPrev)}</strong>
                  </div>
                  <div className="record__stat">
                    <span>Терминал</span>
                    <strong>{formatMoney(record.terminal)}</strong>
                  </div>
                  <div className="record__stat">
                    <span>Факт в кассе</span>
                    <strong>{formatMoney(record.cashFact)}</strong>
                  </div>
                  <div className="record__stat">
                    <span>Изменение наличных</span>
                    <strong className={metrics.cashChange < 0 ? 'is-negative' : 'is-positive'}>
                      {formatSignedMoney(metrics.cashChange)}
                    </strong>
                  </div>
                  <div className="record__stat">
                    <span>Расходы</span>
                    <strong>{formatMoney(metrics.expenses)}</strong>
                  </div>
                  <div className="record__stat">
                    <span>НЗ</span>
                    <strong>{formatMoney(record.reserve)}</strong>
                  </div>
                  <div className="record__stat">
                    <span>Комиссия {formatPercent(rate)}</span>
                    <strong className={metrics.commission > 0 ? 'is-negative' : undefined}>
                      {formatMinusMoney(metrics.commission)}
                    </strong>
                  </div>
                  <div className="record__stat">
                    <span>Итог дня</span>
                    <strong>{formatMoney(metrics.revenue)}</strong>
                  </div>
                  <div className="record__stat record__stat--total">
                    <span>Остаток дня</span>
                    <strong
                      className={metrics.balance < 0 ? 'is-negative' : ''}
                      style={{ color: metrics.balance < 0 ? undefined : meta.accent }}
                    >
                      {formatMoney(metrics.balance)}
                    </strong>
                  </div>
                </div>

                {record.note ? <p className="record__note">{record.note}</p> : null}

                <div className="record__footer">
                  <button
                    type="button"
                    className={`record__toggle${isOpen ? ' is-open' : ''}`}
                    onClick={() => toggleExpanded(record.id)}
                    aria-expanded={isOpen}
                  >
                    <ChevronDownIcon size={16} />
                    <span>
                      Расходы: {record.expenses.length} · {formatMoney(metrics.expenses)}
                    </span>
                  </button>
                  <span className="record__updated">
                    {record.updatedAt !== record.createdAt
                      ? `изменено ${formatTime(record.updatedAt)}`
                      : `создано ${formatTime(record.createdAt)}`}
                  </span>
                </div>

                {isOpen ? (
                  record.expenses.length > 0 ? (
                    <ul className="expense-view">
                      {record.expenses.map((expense) => (
                        <li key={expense.id}>
                          <span className="expense-view__amount">{formatMoney(expense.amount)}</span>
                          <span className="expense-view__comment">
                            {expense.comment || 'без комментария'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="record__empty-expenses">В этот день расходов не было.</p>
                  )
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {filteredAdjustments.length > 0 ? (
        <section className="card card--pad">
          <div className="card__header" style={{ padding: 0 }}>
            <div>
              <h2 className="card__title">Движения за период</h2>
              <p className="card__hint">
                Поступления и изъятия не входят в выручку — только меняют остатки
              </p>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => navigate('adjustments')}
            >
              <span>Все движения</span>
              <ChevronRightIcon size={16} />
            </button>
          </div>
          <ul className="movement-list movement-list--compact">
            {filteredAdjustments.map((item) => (
              <li key={item.id} className="movement">
                <span className="movement__date">{formatDateWithWeekday(item.date)}</span>
                <CompanyBadge company={item.company} />
                <span className="movement__target">
                  {item.target === 'cash' ? 'Наличные' : item.target === 'terminal' ? 'Терминал' : 'НЗ'}
                  <span className="movement__direction">
                    {item.direction === 'in' ? 'положили' : 'забрали'}
                  </span>
                </span>
                <span className="movement__comment">{item.comment || '—'}</span>
                <span className={`movement__amount movement__amount--${item.direction}`}>
                  {item.direction === 'in' ? '+' : '−'}
                  {formatMoney(item.amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="screen__note">
        Экспорт выгружает текущую выборку: дни, движения денег и итоги по периоду.{' '}
        {totals.records > 0 ? `Записей: ${formatNumber(totals.records)}.` : ''}
      </p>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Удалить запись?"
        description={
          deleteTarget ? (
            <>
              Запись <strong>{companyById(deleteTarget.company).name}</strong> за{' '}
              <strong>{formatDateWithWeekday(deleteTarget.date)}</strong> будет удалена. Сводные
              показатели пересчитаются автоматически.
            </>
          ) : null
        }
        confirmLabel="Удалить"
        onConfirm={() => {
          if (deleteId) void deleteRecord(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
