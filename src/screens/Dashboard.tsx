import { useMemo, useState } from 'react';
import { companyById, COMPANIES } from '../../shared/model';
import { RevenueChart } from '../components/Chart';
import {
  ArrowUpRightIcon,
  BanknoteIcon,
  CheckIcon,
  ChevronRightIcon,
  CompanyMark,
  DownloadIcon,
  InfoIcon,
  PenIcon,
  ReceiptIcon,
  RepeatIcon,
  TrendUpIcon,
  WalletIcon,
} from '../components/Icons';
import { MoneyStat } from '../components/Stat';
import { CompanyBadge } from '../components/Badge';
import {
  cashChainIssues,
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
  // Остатки (где лежат деньги) — состояние на сейчас, они не зависят от периода:
  // иначе при переключении «этот месяц / прошлый» сумма в кассе «прыгала».
  const current = useMemo(
    () => totalsOf(data.records, data.adjustments, rate),
    [data.records, data.adjustments, rate],
  );
  // Цепочка наличных: «касса вчера» каждой записи должна совпадать с прошлым фактом.
  const chainIssues = useMemo(
    () => cashChainIssues(data.records, data.adjustments),
    [data.records, data.adjustments],
  );
  const currentBreakdown = useMemo(
    () => companyBreakdown(data.records, data.adjustments, rate),
    [data.records, data.adjustments, rate],
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

  // Остатки показываем раздельно и не складываем: наличные — это остаток,
  // терминал остатком не считается, потому что уходит в банк.
  const cashNow = current.pots.cash;
  const terminalNow = current.pots.terminal;

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
              <div className="hero__eyebrow">Деньги на сейчас</div>

              <div className="hero__pots">
                <div className="hero__pot">
                  <div className="hero__pot-label">
                    <WalletIcon size={15} />
                    <span>Наличные в кассе</span>
                  </div>
                  <div className={`hero__pot-value${cashNow < 0 ? ' is-negative' : ''}`}>
                    {formatNumber(cashNow)}
                    <span className="hero__unit">₽</span>
                  </div>
                  <div className="hero__pot-hint">нал вечером − НЗ · рабочий остаток</div>
                </div>

                <div className="hero__pot hero__pot--terminal">
                  <div className="hero__pot-label">
                    <BanknoteIcon size={15} />
                    <span>На терминале</span>
                  </div>
                  <div className="hero__pot-value">
                    {formatNumber(terminalNow)}
                    <span className="hero__unit">₽</span>
                  </div>
                  <div className="hero__pot-hint">уходит в банк · не остаток кассы</div>
                </div>
              </div>

              <div className="hero__note">
                в НЗ отдельно <strong>{formatMoney(current.pots.reserve)}</strong> — отложенные
                деньги, в остаток не входят
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
              <MoneyStat label="Итог" amount={totals.revenue} icon={<TrendUpIcon size={15} />} />
              <MoneyStat
                label={`Комиссия ${formatPercent(rate)}`}
                amount={totals.commission}
                icon={<BanknoteIcon size={15} />}
                hint="терминал и поступления"
              />
              <MoneyStat
                label="Расходы"
                amount={totals.expenses}
                icon={<ReceiptIcon size={15} />}
                hint={`${totals.expenseCount} строк`}
              />
              <MoneyStat
                label={`Заработано · ${periodLabel.toLowerCase()}`}
                amount={totals.earned}
                icon={<WalletIcon size={15} />}
                hint="итог − комиссия − расходы"
              />
            </div>
          </section>

          {chainIssues.length > 0 ? (
            <section className="balance-check balance-check--warn">
              <div className="balance-check__head">
                <InfoIcon size={16} />
                <strong>Остаток наличных расходится</strong>
                <span className="balance-check__count">{chainIssues.length}</span>
              </div>
              <p className="balance-check__text">
                «Касса вчера» в записи не равна остатку прошлой записи компании (нал минус НЗ).
                Из-за этого наличные «прибавляются» или пропадают. Укажите движение в
                «Поступлениях» (например, «забрали на счёт») или поправьте остаток в записи дня.
              </p>
              <ul className="balance-check__list">
                {chainIssues.slice(0, 3).map((issue) => (
                  <li key={`${issue.company}|${issue.date}`}>
                    <button
                      type="button"
                      className="balance-check__item"
                      onClick={() => navigate('day', { company: issue.company, date: issue.date })}
                    >
                      <span className="balance-check__date">
                        {formatDateShort(issue.date)} · {companyById(issue.company).name}
                      </span>
                      <span className="balance-check__gap">
                        {formatSignedMoney(issue.gap)}
                      </span>
                      <span className="balance-check__detail">
                        в записи {formatMoney(issue.entered)} · ожидалось{' '}
                        {formatMoney(issue.expected)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {chainIssues.length > 3 ? (
                <span className="balance-check__more">и ещё {chainIssues.length - 3}</span>
              ) : null}
            </section>
          ) : (
            <div className="balance-check">
              <CheckIcon size={14} />
              <span>
                Цепочка наличных сходится: «касса вчера» в каждой записи равна остатку после НЗ
                прошлого дня — деньги никуда не пропадают
              </span>
            </div>
          )}

          <div className="company-grid">
            {breakdown.map(({ company, totals: companyStats }) => {
              const nowPots =
                currentBreakdown.find((item) => item.company.id === company.id)?.totals.pots ??
                companyStats.pots;
              return (
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
                  <div className="company-card__label">Остаток в кассе</div>
                  <div
                    className={`company-card__value${nowPots.cash < 0 ? ' is-negative' : ''}`}
                  >
                    {formatMoney(nowPots.cash)}
                  </div>
                </div>

                <div className="company-card__grid">
                  <div className="mini-metric">
                    <span className="mini-metric__label">На терминале</span>
                    <span className="mini-metric__value">{formatMoney(nowPots.terminal)}</span>
                    <span className="mini-metric__hint">уходит в банк</span>
                  </div>
                  <div className="mini-metric">
                    <span className="mini-metric__label">В НЗ</span>
                    <span className="mini-metric__value">{formatMoney(nowPots.reserve)}</span>
                    <span className="mini-metric__hint">отложено, вне остатка</span>
                  </div>
                  <div className="mini-metric">
                    <span className="mini-metric__label">Итог · {periodLabel.toLowerCase()}</span>
                    <span className="mini-metric__value">{formatMoney(companyStats.revenue)}</span>
                    <span className="mini-metric__hint">терминал + наличные</span>
                  </div>
                  <div className="mini-metric">
                    <span className="mini-metric__label">
                      Заработано · {periodLabel.toLowerCase()}
                    </span>
                    <span className="mini-metric__value">{formatMoney(companyStats.earned)}</span>
                    <span className="mini-metric__hint">без комиссии и расходов</span>
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
              );
            })}
          </div>

          <section className="card">
            <div className="card__header">
              <div>
                <h2 className="card__title">Динамика итога</h2>
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
                            className={`recent__balance${metrics.earned < 0 ? ' is-negative' : ''}`}
                          >
                            {formatMoney(metrics.earned)}
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
