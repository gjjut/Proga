import { useMemo, useState } from 'react';
import { companyById, COMPANIES } from '../../shared/model';
import { RevenueChart } from '../components/Chart';
import {
  ArrowUpRightIcon,
  BanknoteIcon,
  ChevronRightIcon,
  CompanyMark,
  DownloadIcon,
  PenIcon,
  RepeatIcon,
  ShieldIcon,
  TrendUpIcon,
  WalletIcon,
} from '../components/Icons';
import { MoneyStat } from '../components/Stat';
import { CompanyBadge } from '../components/Badge';
import {
  companyBreakdown,
  dailySeries,
  dayMetrics,
  filterAdjustments,
  filterRecords,
  sortByDateDesc,
  totalsOf,
} from '../lib/calc';
import {
  formatDateShort,
  formatDateWithWeekday,
  formatMoney,
  formatNumber,
  formatPercent,
  formatSignedMoney,
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
  const rate = data.settings.commissionRate;

  const range = useMemo(() => resolveRange(period), [period]);
  const periodRecords = useMemo(
    () => (period === 'all' ? data.records : filterRecords(data.records, range)),
    [data.records, period, range],
  );
  const periodAdjustments = useMemo(
    () => (period === 'all' ? data.adjustments : filterAdjustments(data.adjustments, range)),
    [data.adjustments, period, range],
  );

  const totals = useMemo(
    () => totalsOf(periodRecords, periodAdjustments, rate),
    [periodRecords, periodAdjustments, rate],
  );
  const breakdown = useMemo(
    () => companyBreakdown(periodRecords, periodAdjustments, rate),
    [periodRecords, periodAdjustments, rate],
  );
  // График всегда показывает последние 14 дней, независимо от выбранного периода сводки.
  const series = useMemo(() => dailySeries(data.records, 14, today, rate), [data.records, today, rate]);
  const recent = useMemo(() => sortByDateDesc(periodRecords).slice(0, 5), [periodRecords]);
  const recentMovements = useMemo(
    () => sortByDateDesc(periodAdjustments).slice(0, 4),
    [periodAdjustments],
  );
  const periodLabel = PERIODS.find((item) => item.id === period)?.label ?? 'Всё время';
  const hasAnyData = data.records.length > 0 || data.adjustments.length > 0;

  const handleExport = () => {
    if (periodRecords.length === 0 && periodAdjustments.length === 0) return;
    void exportCsv(periodRecords, periodAdjustments, {
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
            {formatDateWithWeekday(today)} · {recordsLabel(periodRecords.length)} · комиссия{' '}
            {formatPercent(rate)}
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
            disabled={periodRecords.length === 0 && periodAdjustments.length === 0}
          >
            <DownloadIcon size={17} />
            <span>Экспорт</span>
          </button>
        </div>
      </header>

      {!hasAnyData ? (
        <section className="card empty-state">
          <div className="empty-state__icon">
            <PenIcon size={26} />
          </div>
          <h2 className="empty-state__title">Записей пока нет</h2>
          <p className="empty-state__text">
            Начните с первого дня: укажите остаток наличных вчера, сумму по терминалу, фактическое
            наличие в кассе, расходы и сумму в НЗ. Сводка появится сразу после сохранения.
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
              <div className="hero__eyebrow">Остаток по двум компаниям · {periodLabel}</div>
              <div className={`hero__value${totals.balance < 0 ? ' is-negative' : ''}`}>
                {formatNumber(totals.balance)}
                <span className="hero__unit">₽</span>
              </div>
              <div className="hero__caption">
                Выручка − комиссия банка {formatPercent(rate)} − НЗ ± движения денег
              </div>
              <div className="hero__meta">
                {totals.records > 0 && totals.lastDate ? (
                  <>
                    <span>Последняя запись {formatDateShort(totals.lastDate)}</span>
                    <span className="dot-sep" />
                    <span>{recordsLabel(totals.records)}</span>
                    {totals.adjustments.inTotal + totals.adjustments.outTotal > 0 ? (
                      <>
                        <span className="dot-sep" />
                        <span>{data.adjustments.length} движ.</span>
                      </>
                    ) : null}
                  </>
                ) : (
                  <span>Нет записей за выбранный период</span>
                )}
              </div>
            </div>
            <div className="hero__stats">
              <MoneyStat label="Выручка" amount={totals.revenue} icon={<TrendUpIcon size={15} />} />
              <MoneyStat
                label={`Комиссия ${formatPercent(rate)}`}
                amount={totals.commission}
                icon={<BanknoteIcon size={15} />}
                hint="терминал и поступления"
              />
              <MoneyStat
                label="В НЗ"
                amount={totals.reserve}
                icon={<ShieldIcon size={15} />}
                hint="неприкосновенный запас"
              />
              <MoneyStat
                label="Наличные в кассе"
                amount={totals.cash}
                icon={<WalletIcon size={15} />}
                hint="факт + движения"
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
                  <CompanyMark letter={company.name.slice(0, 1)} accent={company.accent} size={40} />
                  <div className="company-card__titles">
                    <h2 className="company-card__name">{company.name}</h2>
                    <p className="company-card__meta">{company.description}</p>
                  </div>
                  <span className="company-card__count">{recordsLabel(companyStats.records)}</span>
                </div>

                <div className="company-card__main">
                  <div className="company-card__label">Остаток после комиссии и НЗ</div>
                  <div
                    className={`company-card__value${companyStats.balance < 0 ? ' is-negative' : ''}`}
                  >
                    {formatMoney(companyStats.balance)}
                  </div>
                </div>

                <div className="company-card__grid">
                  <div className="mini-metric">
                    <span className="mini-metric__label">Выручка</span>
                    <span className="mini-metric__value">{formatMoney(companyStats.revenue)}</span>
                  </div>
                  <div className="mini-metric">
                    <span className="mini-metric__label">Комиссия</span>
                    <span className="mini-metric__value">
                      {formatMoney(companyStats.commission)}
                    </span>
                  </div>
                  <div className="mini-metric">
                    <span className="mini-metric__label">НЗ</span>
                    <span className="mini-metric__value">{formatMoney(companyStats.reserve)}</span>
                  </div>
                  <div className="mini-metric">
                    <span className="mini-metric__label">В кассе</span>
                    <span className="mini-metric__value">{formatMoney(companyStats.cash)}</span>
                  </div>
                </div>

                <div className="company-card__footer">
                  <button type="button" className="link-btn" onClick={() => navigate('history')}>
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
                <p className="card__hint">Последние 14 дней · итог дня по записям</p>
              </div>
              <div className="card__total">
                <span>за 14 дней</span>
                <strong>{formatMoney(series.reduce((sum, point) => sum + point.total, 0))}</strong>
              </div>
            </div>
            <RevenueChart points={series} />
          </section>

          <div className="dashboard-columns">
            <section className="card">
              <div className="card__header">
                <div>
                  <h2 className="card__title">Последние записи</h2>
                  <p className="card__hint">{periodLabel}</p>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => navigate('history')}
                >
                  <span>Вся история</span>
                  <ChevronRightIcon size={16} />
                </button>
              </div>

              {recent.length === 0 ? (
                <p className="card__empty">За выбранный период записей нет.</p>
              ) : (
                <ul className="recent">
                  {recent.map((record) => {
                    const metrics = dayMetrics(record, rate);
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
                            <span>
                              {formatDateWithWeekday(record.date).split(',').slice(-1)[0].trim()}
                            </span>
                          </span>
                          <CompanyBadge company={record.company} />
                          <span className="recent__amounts">
                            <span className="recent__amount">{formatMoney(metrics.revenue)}</span>
                            <span className="recent__sub">
                              терминал {formatMoney(record.terminal)} · комиссия{' '}
                              {formatMoney(metrics.commission)}
                            </span>
                          </span>
                          <span
                            className={`recent__balance${
                              metrics.balance < 0 ? ' is-negative' : ''
                            }`}
                          >
                            {formatMoney(metrics.balance)}
                          </span>
                          <span className="recent__chevron" style={{ color: companyById(record.company).accent }}>
                            <ChevronRightIcon size={16} />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="card">
              <div className="card__header">
                <div>
                  <h2 className="card__title">Движения денег</h2>
                  <p className="card__hint">Поступления и изъятия · {periodLabel}</p>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => navigate('adjustments')}
                >
                  <RepeatIcon size={16} />
                  <span>Открыть</span>
                </button>
              </div>

              {recentMovements.length === 0 ? (
                <p className="card__empty">
                  Пока пусто. Здесь можно положить или забрать деньги из кассы, терминала или НЗ,
                  не меняя итоги дня.
                </p>
              ) : (
                <ul className="recent">
                  {recentMovements.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="recent__row"
                        onClick={() => navigate('adjustments')}
                      >
                        <span className="recent__date">
                          <strong>{formatDateShort(item.date)}</strong>
                          <span>
                            {item.target === 'cash'
                              ? 'наличные'
                              : item.target === 'terminal'
                                ? 'терминал'
                                : 'НЗ'}
                          </span>
                        </span>
                        <CompanyBadge company={item.company} />
                        <span className="recent__amounts">
                          <span className="recent__amount">
                            {item.direction === 'in' ? '+' : '−'}
                            {formatMoney(item.amount)}
                          </span>
                          <span className="recent__sub">{item.comment || '—'}</span>
                        </span>
                        <span className="recent__chevron" style={{ color: 'var(--text-tertiary)' }}>
                          <ArrowUpRightIcon size={15} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="summary-strip">
            <div className="summary-strip__item">
              <span>Расходы за период</span>
              <strong>{formatMoney(totals.expenses)}</strong>
            </div>
            <div className="summary-strip__item">
              <span>Строк расходов</span>
              <strong>{totals.expenseCount}</strong>
            </div>
            <div className="summary-strip__item">
              <span>Положили</span>
              <strong className="is-positive">{formatMoney(totals.adjustments.inTotal)}</strong>
            </div>
            <div className="summary-strip__item">
              <span>Забрали</span>
              <strong className={totals.adjustments.outTotal > 0 ? 'is-negative' : undefined}>
                {formatMoney(totals.adjustments.outTotal)}
              </strong>
            </div>
            <div className="summary-strip__item summary-strip__item--muted">
              <span>Движения по остатку</span>
              <strong>
                {formatSignedMoney(totals.adjustments.cashNet + totals.adjustments.terminalGrossNet)}
              </strong>
            </div>
          </section>
        </>
      )}

      {hasAnyData && periodRecords.length === 0 ? (
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
