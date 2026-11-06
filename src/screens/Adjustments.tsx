import { useMemo, useState } from 'react';
import {
  COMPANIES,
  companyById,
  DEFAULT_COMMISSION_RATE,
  isIsoDate,
  type AdjustmentDirection,
  type AdjustmentTarget,
  type CompanyId,
} from '../../shared/model';
import {
  ArrowUpRightIcon,
  BanknoteIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  DownloadIcon,
  ShieldIcon,
  TrashIcon,
  WalletIcon,
} from '../components/Icons';
import { CompanyBadge } from '../components/Badge';
import { ConfirmDialog } from '../components/Modal';
import { MoneyInput } from '../components/MoneyInput';
import { commissionOf, filterAdjustments, sortByDateDesc } from '../lib/calc';
import {
  formatDateWithWeekday,
  formatMoney,
  formatPercent,
  formatSignedMoney,
  monthRange,
  parseMoneyInput,
  todayIso,
} from '../lib/format';
import { useApp } from '../state';

const TARGETS: { id: AdjustmentTarget; label: string; hint: string }[] = [
  { id: 'cash', label: 'Наличные', hint: 'касса' },
  { id: 'terminal', label: 'Терминал', hint: 'с комиссией' },
  { id: 'reserve', label: 'НЗ', hint: 'копилка' },
];

/** Влияние движения на свободный остаток. */
export function adjustmentImpact(
  target: AdjustmentTarget,
  direction: AdjustmentDirection,
  amount: number,
  rate: number,
): number {
  if (target === 'cash') return direction === 'in' ? amount : -amount;
  if (target === 'reserve') return direction === 'in' ? -amount : amount;
  return direction === 'in' ? amount - commissionOf(amount, rate) : -amount;
}

export function Adjustments() {
  const { data, saveAdjustment, deleteAdjustment, navigate, exportCsv, notify } = useApp();
  const rate = data.settings.commissionRate || DEFAULT_COMMISSION_RATE;

  const [company, setCompany] = useState<CompanyId>(data.settings.lastCompany);
  const [date, setDate] = useState(todayIso());
  const [target, setTarget] = useState<AdjustmentTarget>('cash');
  const [direction, setDirection] = useState<AdjustmentDirection>('in');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [filterCompany, setFilterCompany] = useState<CompanyId | 'all'>('all');
  const [period, setPeriod] = useState<'month' | 'all'>('month');

  const range = useMemo<{ from?: string; to?: string }>(
    () => (period === 'month' ? monthRange(0) : {}),
    [period],
  );

  const visible = useMemo(
    () =>
      sortByDateDesc(
        filterAdjustments(data.adjustments, {
          company: filterCompany,
          from: range.from,
          to: range.to,
        }),
      ),
    [data.adjustments, filterCompany, range],
  );

  const amountValue = parseMoneyInput(amount);
  const impact = adjustmentImpact(target, direction, amountValue, rate);
  const deleteTarget = data.adjustments.find((item) => item.id === deleteId) ?? null;

  const visibleImpact = visible.reduce(
    (sum, item) => sum + adjustmentImpact(item.target, item.direction, item.amount, rate),
    0,
  );
  const visibleIn = visible
    .filter((item) => item.direction === 'in')
    .reduce((sum, item) => sum + item.amount, 0);
  const visibleOut = visible
    .filter((item) => item.direction === 'out')
    .reduce((sum, item) => sum + item.amount, 0);

  const resetForm = () => {
    setAmount('');
    setComment('');
  };

  const handleSubmit = async () => {
    if (!isIsoDate(date)) {
      notify('Проверьте дату: выберите день в календаре', 'error');
      return;
    }
    if (amountValue <= 0) {
      notify('Укажите сумму больше нуля', 'error');
      return;
    }
    setSaving(true);
    const ok = await saveAdjustment({
      company,
      date,
      target,
      direction,
      amount: amountValue,
      comment,
    });
    setSaving(false);
    if (ok) resetForm();
  };

  const handleExport = () => {
    if (visible.length === 0) return;
    void exportCsv([], visible, {
      from: range.from,
      to: range.to,
      scopeLabel: filterCompany === 'all' ? 'Все компании' : companyById(filterCompany).name,
      title: 'Поступления и изъятия',
      extraSummary: [
        { label: 'Всего положили', value: visibleIn.toFixed(2).replace('.', ',') },
        { label: 'Всего забрали', value: visibleOut.toFixed(2).replace('.', ',') },
        { label: 'Влияние на остаток', value: visibleImpact.toFixed(2).replace('.', ',') },
      ],
    });
  };

  return (
    <div className="screen">
      <header className="screen__header">
        <div className="screen__title-wrap">
          <h1 className="screen__title">Поступления и изъятия</h1>
          <p className="screen__subtitle">
            Сторонние движения денег · не меняют итог дня
          </p>
        </div>
        <div className="screen__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleExport}
            disabled={visible.length === 0}
          >
            <DownloadIcon size={17} />
            <span>Экспорт</span>
          </button>
        </div>
      </header>

      <section className="card card--pad">
        <div className="form-block__head">
          <h2 className="form-block__title">Новое движение</h2>
          <p className="form-block__hint">
            Положить или забрать деньги из кассы, терминала или НЗ
          </p>
        </div>

        <div className="adjust-form">
          <div className="adjust-form__row">
            <div className="company-picker company-picker--compact">
              {COMPANIES.map((item) => {
                const active = company === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`company-option company-option--sm${active ? ' is-active' : ''}`}
                    style={{ ['--option-accent' as string]: item.accent }}
                    onClick={() => setCompany(item.id)}
                    aria-pressed={active}
                  >
                    <span className="company-option__dot" style={{ background: item.accent }} />
                    <span className="company-option__text">
                      <strong>{item.name}</strong>
                    </span>
                    <span className="company-option__check">
                      {active ? <CheckIcon size={16} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <label className="date-field">
              <CalendarIcon size={17} />
              <input
                type="date"
                className="date-field__input"
                value={date}
                onChange={(event) => {
                  if (event.target.value) setDate(event.target.value);
                }}
                aria-label="Дата движения"
              />
            </label>
          </div>

          <div className="adjust-form__row">
            <div className="segmented" role="group" aria-label="Куда">
              {TARGETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`segmented__item${target === item.id ? ' is-active' : ''}`}
                  onClick={() => setTarget(item.id)}
                  aria-pressed={target === item.id}
                >
                  <span>{item.label}</span>
                  <small>{item.hint}</small>
                </button>
              ))}
            </div>

            <div className={`direction-toggle direction-toggle--${direction}`}>
              <button
                type="button"
                className={`direction-toggle__item${direction === 'in' ? ' is-active' : ''}`}
                onClick={() => setDirection('in')}
                aria-pressed={direction === 'in'}
              >
                <ArrowUpRightIcon size={16} />
                Положить
              </button>
              <button
                type="button"
                className={`direction-toggle__item${direction === 'out' ? ' is-active' : ''}`}
                onClick={() => setDirection('out')}
                aria-pressed={direction === 'out'}
              >
                <ArrowUpRightIcon size={16} />
                Забрать
              </button>
            </div>
          </div>

          <div className="adjust-form__row adjust-form__row--main">
            <label className="field adjust-form__amount">
              <span className="field__label">Сумма</span>
              <MoneyInput value={amount} onChange={setAmount} large ariaLabel="Сумма движения" />
            </label>
            <label className="field adjust-form__comment">
              <span className="field__label">Комментарий</span>
              <input
                className="input"
                type="text"
                maxLength={400}
                value={comment}
                placeholder="Например, «внесли личные деньги» или «забрали на счёт»"
                onChange={(event) => setComment(event.target.value)}
              />
            </label>
          </div>

          <div className="adjust-form__footer">
            <div className="adjust-preview">
              <span className="adjust-preview__label">
                {target === 'terminal' ? 'Влияние на терминал' : 'Влияние на остаток в кассе'}
              </span>
              <strong
                className={`adjust-preview__value${
                  impact < 0 ? ' is-negative' : impact > 0 ? ' is-positive' : ''
                }`}
              >
                {formatSignedMoney(impact)}
              </strong>
              {target === 'terminal' && amountValue > 0 ? (
                <span className="adjust-preview__hint">
                  комиссия {formatPercent(rate)}: −{formatMoney(commissionOf(amountValue, rate))}
                </span>
              ) : null}
              {target === 'reserve' ? (
                <span className="adjust-preview__hint">
                  сумма попадёт в копилку НЗ
                </span>
              ) : null}
            </div>

            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() => void handleSubmit()}
              disabled={saving || amountValue <= 0}
            >
              <BanknoteIcon size={18} />
              <span>{direction === 'in' ? 'Положить' : 'Забрать'}</span>
            </button>
          </div>
        </div>
      </section>

      <section className="summary-strip">
        <div className="summary-strip__item">
          <span>Положили</span>
          <strong className="is-positive">{formatMoney(visibleIn)}</strong>
        </div>
        <div className="summary-strip__item">
          <span>Забрали</span>
          <strong className={visibleOut > 0 ? 'is-negative' : undefined}>
            {formatMoney(visibleOut)}
          </strong>
        </div>
        <div className="summary-strip__item">
          <span>Влияние на остаток</span>
          <strong className={visibleImpact < 0 ? 'is-negative' : ''}>
            {formatSignedMoney(visibleImpact)}
          </strong>
        </div>
        <div className="summary-strip__item summary-strip__item--muted">
          <span>Движений</span>
          <strong>{visible.length}</strong>
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <h2 className="card__title">Журнал движений</h2>
            <p className="card__hint">
              {period === 'month' ? 'Этот месяц' : 'Всё время'} · {visible.length} шт.
            </p>
          </div>
          <div className="screen__actions">
            <div className="chips">
              <button
                type="button"
                className={`chip${filterCompany === 'all' ? ' is-active' : ''}`}
                onClick={() => setFilterCompany('all')}
              >
                Все
              </button>
              {COMPANIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`chip${filterCompany === item.id ? ' is-active' : ''}`}
                  onClick={() => setFilterCompany(item.id)}
                >
                  <span className="chip__dot" style={{ background: item.accent }} />
                  {item.name}
                </button>
              ))}
            </div>
            <div className="chips">
              <button
                type="button"
                className={`chip${period === 'month' ? ' is-active' : ''}`}
                onClick={() => setPeriod('month')}
              >
                Месяц
              </button>
              <button
                type="button"
                className={`chip${period === 'all' ? ' is-active' : ''}`}
                onClick={() => setPeriod('all')}
              >
                Всё время
              </button>
            </div>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="card__empty">
            Движений пока нет. Добавьте первое — например, «положить в НЗ» или «забрать наличные
            на счёт».
          </p>
        ) : (
          <ul className="movement-list">
            {visible.map((item) => {
              const itemImpact = adjustmentImpact(item.target, item.direction, item.amount, rate);
              return (
                <li key={item.id} className="movement">
                  <span
                    className={`movement__badge movement__badge--${item.direction}`}
                    aria-hidden="true"
                  >
                    {item.target === 'cash' ? (
                      <WalletIcon size={16} />
                    ) : item.target === 'terminal' ? (
                      <BanknoteIcon size={16} />
                    ) : (
                      <ShieldIcon size={16} />
                    )}
                  </span>
                  <span className="movement__date">{formatDateWithWeekday(item.date)}</span>
                  <CompanyBadge company={item.company} />
                  <span className="movement__target">
                    {item.target === 'cash' ? 'Наличные' : item.target === 'terminal' ? 'Терминал' : 'НЗ'}
                    <span className="movement__direction">
                      {item.direction === 'in' ? 'положили' : 'забрали'}
                    </span>
                  </span>
                  <span className="movement__comment">{item.comment || '—'}</span>
                  <span
                    className={`movement__amount movement__amount--${item.direction}`}
                    title={`Влияние на остаток: ${formatSignedMoney(itemImpact)}`}
                  >
                    {item.direction === 'in' ? '+' : '−'}
                    {formatMoney(item.amount)}
                  </span>
                  <button
                    type="button"
                    className="btn btn--icon btn--ghost btn--danger-hover"
                    onClick={() => setDeleteId(item.id)}
                    aria-label="Удалить движение"
                  >
                    <TrashIcon size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="screen__note">
        Движения не попадают в итог дня — они меняют только остатки на главном экране.{' '}
        <button type="button" className="link-btn" onClick={() => navigate('dashboard')}>
          К сводке
          <ChevronRightIcon size={14} />
        </button>
      </p>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Удалить движение?"
        description={
          deleteTarget ? (
            <>
              Движение <strong>{formatSignedMoney(deleteTarget.amount)}</strong> (
              {deleteTarget.target === 'cash' ? 'наличные' : deleteTarget.target === 'terminal' ? 'терминал' : 'НЗ'}
              ) от <strong>{formatDateWithWeekday(deleteTarget.date)}</strong> будет удалено.
            </>
          ) : null
        }
        confirmLabel="Удалить"
        onConfirm={() => {
          if (deleteId) void deleteAdjustment(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
