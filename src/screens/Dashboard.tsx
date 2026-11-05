import { useMemo, useState } from 'react';
import { companyById, COMPANIES } from '../../shared/model';
import { RevenueChart } from '../components/Chart';
import {
  BanknoteIcon,
  ChevronRightIcon,
  CompanyMark,
  DownloadIcon,
  PenIcon,
  ShieldIcon,
  TrendUpIcon,
  WalletIcon,
} from '../components/Icons';
import { MoneyStat } from '../components/Stat';
import { CompanyBadge } from '../components/Badge';
import {
  companyBreakdown,
  dailySeries,
  filterRecords,
  recordExpensesTotal,
  sortByDateDesc,
  totalsOf,
} from '../lib/calc';
import {
  formatDateWithWeekday,
  formatMoney,
  formatNumber,
  formatDateShort,
  lastNDaysRange,
  monthRange,
  recordsLabel,
  todayIso,
} from '../lib/format';
import { useApp } from '../state';

type PeriodId = 'month' | 'prev' | '30' | 'all';

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'month', label: 'Этот месяц' },
  { id: 'prev', label: 'Прошлый месяц' },
  { id: '30', label: '30 дней' },
  { id: 'all', label: 'Всё время' },
];

function resolveRange(period: PeriodId): { from?: string; to?: string } {
  if (period === 'month') return monthRange(0);
  if (period === 'prev') return monthRange(-1);
  if (period === '30') return lastNDaysRange(30);
  return {};
}

export function Dashboard() {
  const { data, navigate, exportCsv } = useApp();
  const [period, setPeriod] = useState<PeriodId>('month');
  const today = todayIso();

  const range = useMemo(() => resolveRange(period), [period]);
  const periodRecords = useMemo(
    () => (period === 'all' ? data.records : filterRecords(data.records, range)),
    [data.records, period, range],
  );

  const totals = useMemo(() => totalsOf(periodRecords), [periodRecords]);
  const breakdown = useMemo(() => companyBreakdown(periodRecords), [periodRecords]);
  const series = useMemo(() => dailySeries(periodRecords, 14, today), [periodRecords, today]);
  const recent = useMemo(() => sortByDateDesc(periodRecords).slice(0, 5), [periodRecords]);
  const periodLabel = PERIODS.find((item) => item.id === period)?.label ?? 'Всё время';
  const hasAnyRecords = data.records.length > 0;

  const handleExport = () => {
    if (periodRecords.length === 0) return;
    void exportCsv(periodRecords, {
      from: range.from,
      to: range.to,
      scopeLabel: `${periodLabel} · все компании`,
    });
  };

  return (
    <div className="screen">
      <header className="screen__header">
        <div className="screen__title-wrap">
          <h1 className="screen__title">Главное</h1>
          <p className="screen__subtitle">
            {formatDateWithWeekday(today)} · {recordsLabel(periodRecords.length)}
          </p>
        </div>
        <div className="screen__actions">
          <div className="chips" role="group" aria-label="Период">
            {PERIODS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chip${period === item.id ? ' is-active' : ''}`}
                onClick={() => setPeriod(item.id)}
                aria-pressed={period === item.id}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleExport}
            disabled={periodRecords.length === 0}
          >
            <DownloadIcon size={17} />
            <span>Экспорт</span>
          </button>
        </div>
      </header>

      {!hasAnyRecords ? (
        <section className="card empty-state">
          <div className="empty-state__icon">
            <PenIcon size={26} />
          </div>
          <h2 className="empty-state__title">Записей пока нет</h2>
          <p className="empty-state__text">
            Начните с первого дня: укажите сумму по терминалу, наличные в кассе, отложенное в НЗ
            и расходы. Сводка появится сразу после сохранения.
          </p>
          <button type="button" className="btn btn--primary" onClick={() => navigate('day')}>
            <PenIcon size={18} />
            <span>Записать день</span>
          </button>
        </section>
      ) : (
        <>
          <section className="hero card">
            <div className="hero__main">
              <div className="hero__eyebrow">Итого по двум компаниям · {periodLabel}</div>
              <div className={`hero__value${totals.balance < 0 ? ' is-negative' : ''}`}>
                {formatNumber(totals.balance)}
                <span className="hero__unit">₽</span>
              </div>
              <div className="hero__caption">
                Свободный остаток: выручка − расходы − НЗ
              </div>
              <div className="hero__meta">
                {totals.records > 0 && totals.lastDate ? (
                  <>
                    <span>Последняя запись {formatDateShort(totals.lastDate)}</span>
                    <span className="dot-sep" />
                    <span>{recordsLabel(totals.records)}</span>
                  </>
                ) : (
                  <span>Нет записей за выбранный период</span>
                )}
              </div>
            </div>
            <div className="hero__stats">
              <MoneyStat label="Выручка" amount={totals.revenue} icon={<TrendUpIcon size={15} />} />
              <MoneyStat label="Расходы" amount={totals.expenses} icon={<BanknoteIcon size={15} />} />
              <MoneyStat
                label="В НЗ"
                amount={totals.reserve}
                icon={<ShieldIcon size={15} />}
                accent="#1D9BF0"
              />
              <MoneyStat
                label="Наличные в кассе"
                amount={totals.cash}
                icon={<WalletIcon size={15} />}
                hint="по последней записи"
              />
            </div>
          </section>

          <div className="company-grid">
            {breakdown.map(({ company, totals: companyStats }) => (
              <article
                key={company.id}
                className="company-card card"
                style={{ ['--company-accent' as string]: company.accent }}
              >
                <span className="company-card__ribbon" />
                <div className="company-card__head">
                  <CompanyMark
                    letter={company.name.slice(0, 1)}
                    accent={company.accent}
                    size={40}
                  />
                  <div className="company-card__titles">
                    <h2 className="company-card__name">{company.name}</h2>
                    <p className="company-card__meta">{company.description}</p>
                  </div>
                  <span className="company-card__count">{recordsLabel(companyStats.records)}</span>
                </div>

                <div className="company-card__main">
                  <div className="company-card__label">Выручка</div>
                  <div className="company-card__value">{formatMoney(companyStats.revenue)}</div>
                </div>

                <div className="company-card__grid">
                  <div className="mini-metric">
                    <span className="mini-metric__label">Расходы</span>
                    <span className="mini-metric__value">{formatMoney(companyStats.expenses)}</span>
                  </div>
                  <div className="mini-metric">
                    <span className="mini-metric__label">НЗ</span>
                    <span className="mini-metric__value">{formatMoney(companyStats.reserve)}</span>
                  </div>
                  <div className="mini-metric">
                    <span className="mini-metric__label">Остаток</span>
                    <span
                      className={`mini-metric__value${companyStats.balance < 0 ? ' is-negative' : ''}`}
                    >
                      {formatMoney(companyStats.balance)}
                    </span>
                  </div>
                  <div className="mini-metric">
                    <span className="mini-metric__label">В кассе</span>
                    <span className="mini-metric__value">{formatMoney(companyStats.cash)}</span>
                  </div>
                </div>

                <div className="company-card__footer">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => navigate('history', null)}
                  >
                    История компании
                    <ChevronRightIcon size={15} />
                  </button>
                  <button
                    type="button"
                    className="link-btn link-btn--accent"
                    onClick={() => navigate('day', { company: company.id, date: today })}
                  >
                    Записать день
                    <PenIcon size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>

          <section className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Динамика выручки</h2>
                <p className="card__hint">Последние 14 дней · сумма по терминалу</p>
              </div>
              <div className="card__total">
                <span>за 14 дней</span>
                <strong>{formatMoney(series.reduce((sum, point) => sum + point.total, 0))}</strong>
              </div>
            </div>
            <RevenueChart points={series} />
          </section>

          <section className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Последние записи</h2>
                <p className="card__hint">{periodLabel}</p>
              </div>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('history')}>
                <span>Вся история</span>
                <ChevronRightIcon size={16} />
              </button>
            </div>

            {recent.length === 0 ? (
              <p className="card__empty">За выбранный период записей нет.</p>
            ) : (
              <ul className="recent">
                {recent.map((record) => {
                  const meta = companyById(record.company);
                  const expenses = recordExpensesTotal(record);
                  return (
                    <li key={record.id}>
                      <button
                        type="button"
                        className="recent__row"
                        onClick={() =>
                          navigate('day', { company: record.company, date: record.date })
                        }
                      >
                        <span className="recent__date">
                          <strong>{formatDateShort(record.date)}</strong>
                          <span>{formatDateWithWeekday(record.date).split(',').slice(-1)[0].trim()}</span>
                        </span>
                        <CompanyBadge company={record.company} />
                        <span className="recent__amounts">
                          <span className="recent__amount">{formatMoney(record.terminal)}</span>
                          <span className="recent__sub">
                            расходы {formatMoney(expenses)} · НЗ {formatMoney(record.reserve)}
                          </span>
                        </span>
                        <span
                          className={`recent__balance${
                            record.terminal - expenses - record.reserve < 0 ? ' is-negative' : ''
                          }`}
                        >
                          {formatMoney(record.terminal - expenses - record.reserve)}
                        </span>
                        <span className="recent__chevron" style={{ color: meta.accent }}>
                          <ChevronRightIcon size={16} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {hasAnyRecords && periodRecords.length === 0 ? (
        <p className="screen__note">
          За период «{periodLabel}» записей нет —{' '}
          <button type="button" className="link-btn" onClick={() => setPeriod('all')}>
            показать всё время
          </button>
          .
        </p>
      ) : null}

      <footer className="screen__footer">
        {COMPANIES.map((company) => (
          <span key={company.id} className="screen__footer-item">
            <span className="chart__legend-dot" style={{ background: company.accent }} />
            {company.name}
          </span>
        ))}
        <span className="screen__footer-note">Данные хранятся только на этом компьютере</span>
      </footer>
    </div>
  );
}
