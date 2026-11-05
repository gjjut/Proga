import { useEffect, useMemo, useRef, useState } from 'react';
import {
  COMPANIES,
  companyById,
  isIsoDate,
  newId,
  round2,
  type CompanyId,
  type DayRecordInput,
} from '../../shared/model';
import {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CompanyMark,
  InfoIcon,
  PenIcon,
  PlusIcon,
  RepeatIcon,
  TrashIcon,
  WalletIcon,
} from '../components/Icons';
import { MoneyInput } from '../components/MoneyInput';
import { ConfirmDialog } from '../components/Modal';
import {
  commissionOf,
  suggestedCashPrev,
} from '../lib/calc';
import {
  addDays,
  formatDateWithWeekday,
  formatMoney,
  formatMinusMoney,
  formatPercent,
  formatSignedMoney,
  moneyToInput,
  parseMoneyInput,
  todayIso,
} from '../lib/format';
import { useApp } from '../state';

interface ExpenseDraft {
  key: string;
  amount: string;
  comment: string;
}

function emptyExpense(): ExpenseDraft {
  return { key: newId(), amount: '', comment: '' };
}

export function DayEntry() {
  const {
    data,
    dayTarget,
    saveRecord,
    deleteRecord,
    updateSettings,
    navigate,
    notify,
  } = useApp();
  const rate = data.settings.commissionRate;

  const [company, setCompany] = useState<CompanyId>(
    dayTarget?.company ?? data.settings.lastCompany,
  );
  const [date, setDate] = useState(dayTarget?.date ?? todayIso());
  const [cashPrev, setCashPrev] = useState('');
  const [terminal, setTerminal] = useState('');
  const [cashFact, setCashFact] = useState('');
  const [reserve, setReserve] = useState('');
  const [note, setNote] = useState('');
  const [expenses, setExpenses] = useState<ExpenseDraft[]>([emptyExpense()]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const loadedKey = useRef('');

  const existing = useMemo(
    () => data.records.find((record) => record.company === company && record.date === date) ?? null,
    [data.records, company, date],
  );

  const suggested = useMemo(
    () => suggestedCashPrev(data.records, data.adjustments, company, date),
    [data.records, data.adjustments, company, date],
  );

  // Подхватываем существующую запись выбранного дня или заполняем форму под новую.
  useEffect(() => {
    const key = `${company}|${date}|${existing?.id ?? 'new'}|${existing?.updatedAt ?? ''}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;

    if (existing) {
      setCashPrev(moneyToInput(existing.cashPrev));
      setTerminal(moneyToInput(existing.terminal));
      setCashFact(moneyToInput(existing.cashFact));
      setReserve(moneyToInput(existing.reserve));
      setNote(existing.note);
      setExpenses(
        existing.expenses.length > 0
          ? existing.expenses.map((expense) => ({
              key: expense.id,
              amount: moneyToInput(expense.amount),
              comment: expense.comment,
            }))
          : [emptyExpense()],
      );
    } else {
      setCashPrev(moneyToInput(suggested));
      setTerminal('');
      setCashFact('');
      setReserve('');
      setNote('');
      setExpenses([emptyExpense()]);
    }
    setDirty(false);
    // suggested меняется вместе с company/date; перезаполнять по нему не нужно
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, date, existing]);

  const prevValue = parseMoneyInput(cashPrev);
  const terminalValue = parseMoneyInput(terminal);
  const factValue = parseMoneyInput(cashFact);
  const reserveValue = parseMoneyInput(reserve);
  const expensesValue = expenses.reduce((sum, expense) => sum + parseMoneyInput(expense.amount), 0);

  const cashChange = round2(factValue - prevValue);
  const revenue = round2(terminalValue + cashChange + expensesValue);
  const commission = commissionOf(terminalValue, rate);
  const dayBalance = round2(revenue - commission - reserveValue);
  const suggestDiffers = !existing && Math.abs(suggested - prevValue) > 0.005;
  const storedPrevDiffers =
    existing !== null && Math.abs(suggested - existing.cashPrev) > 0.005;

  const companyMeta = companyById(company);
  const isToday = date === todayIso();

  const patchExpense = (key: string, patch: Partial<ExpenseDraft>) => {
    setExpenses((current) =>
      current.map((expense) => (expense.key === key ? { ...expense, ...patch } : expense)),
    );
    setDirty(true);
  };

  const addExpense = () => {
    setExpenses((current) => [...current, emptyExpense()]);
    setDirty(true);
  };

  const removeExpense = (key: string) => {
    setExpenses((current) => {
      const next = current.filter((expense) => expense.key !== key);
      return next.length > 0 ? next : [emptyExpense()];
    });
    setDirty(true);
  };

  const fillSuggestedPrev = () => {
    setCashPrev(moneyToInput(suggested));
    setDirty(true);
  };

  const resetForm = () => {
    loadedKey.current = '';
    if (existing) {
      setCashPrev(moneyToInput(existing.cashPrev));
      setTerminal(moneyToInput(existing.terminal));
      setCashFact(moneyToInput(existing.cashFact));
      setReserve(moneyToInput(existing.reserve));
      setNote(existing.note);
      setExpenses(
        existing.expenses.length > 0
          ? existing.expenses.map((expense) => ({
              key: expense.id,
              amount: moneyToInput(expense.amount),
              comment: expense.comment,
            }))
          : [emptyExpense()],
      );
      loadedKey.current = `${company}|${date}|${existing.id}|${existing.updatedAt}`;
    } else {
      setCashPrev(moneyToInput(suggested));
      setTerminal('');
      setCashFact('');
      setReserve('');
      setNote('');
      setExpenses([emptyExpense()]);
      loadedKey.current = `${company}|${date}|new|`;
    }
    setDirty(false);
  };

  const handleSave = async () => {
    if (!isIsoDate(date)) {
      notify('Проверьте дату: выберите день в календаре', 'error');
      return;
    }
    if (terminalValue <= 0 && factValue <= 0 && reserveValue <= 0 && expensesValue <= 0 && prevValue <= 0) {
      notify('Заполните хотя бы одно поле: терминал, кассу, НЗ или расходы', 'error');
      return;
    }

    const input: DayRecordInput = {
      id: existing?.id,
      company,
      date,
      cashPrev: prevValue,
      terminal: terminalValue,
      cashFact: factValue,
      reserve: reserveValue,
      note,
      expenses: expenses.map((expense) => ({
        id: expense.key,
        amount: parseMoneyInput(expense.amount),
        comment: expense.comment.trim(),
      })),
    };

    setSaving(true);
    const ok = await saveRecord(input);
    setSaving(false);
    if (ok) {
      setDirty(false);
      if (data.settings.lastCompany !== company) void updateSettings({ lastCompany: company });
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    const ok = await deleteRecord(existing.id);
    setConfirmDelete(false);
    if (ok) {
      loadedKey.current = '';
      setCashPrev(moneyToInput(suggested));
      setTerminal('');
      setCashFact('');
      setReserve('');
      setNote('');
      setExpenses([emptyExpense()]);
      setDirty(false);
    }
  };

  return (
    <div className="screen">
      <header className="screen__header">
        <div className="screen__title-wrap">
          <h1 className="screen__title">Запись дня</h1>
          <p className="screen__subtitle">
            {formatDateWithWeekday(date)} · {companyMeta.name}
          </p>
        </div>
        <div className="screen__actions">
          {dirty ? <span className="dirty-dot">Изменения не сохранены</span> : null}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('adjustments')}>
            <RepeatIcon size={16} />
            <span>Движения</span>
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('history')}>
            <ClockIcon size={16} />
            <span>История</span>
          </button>
        </div>
      </header>

      <div className="day-layout">
        <section className="card card--pad">
          <div className="form-block">
            <div className="form-block__head">
              <h2 className="form-block__title">Компания</h2>
              <p className="form-block__hint">Все поля дня сохраняются под выбранной компанией</p>
            </div>
            <div className="company-picker">
              {COMPANIES.map((item) => {
                const active = company === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`company-option${active ? ' is-active' : ''}`}
                    style={{ ['--option-accent' as string]: item.accent }}
                    onClick={() => setCompany(item.id)}
                    aria-pressed={active}
                  >
                    <CompanyMark letter={item.name.slice(0, 1)} accent={item.accent} size={42} />
                    <span className="company-option__text">
                      <strong>{item.name}</strong>
                      <small>{item.description}</small>
                    </span>
                    <span className="company-option__check">
                      {active ? <CheckIcon size={18} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-block">
            <div className="form-block__head">
              <h2 className="form-block__title">Дата</h2>
              <p className="form-block__hint">Одна запись на день для каждой компании</p>
            </div>
            <div className="date-row">
              <button
                type="button"
                className="btn btn--icon btn--ghost"
                onClick={() => setDate(addDays(date, -1))}
                aria-label="Предыдущий день"
              >
                <ChevronLeftIcon size={18} />
              </button>
              <label className="date-field">
                <CalendarIcon size={17} />
                <input
                  type="date"
                  className="date-field__input"
                  value={date}
                  max={todayIso()}
                  onChange={(event) => {
                    if (event.target.value) setDate(event.target.value);
                  }}
                  aria-label="Дата записи"
                />
              </label>
              <button
                type="button"
                className="btn btn--icon btn--ghost"
                onClick={() => setDate(addDays(date, 1))}
                disabled={isToday}
                aria-label="Следующий день"
              >
                <ChevronRightIcon size={18} />
              </button>
              <button
                type="button"
                className={`chip${isToday ? ' is-active' : ''}`}
                onClick={() => setDate(todayIso())}
              >
                Сегодня
              </button>
            </div>
          </div>

          <div className="form-block">
            <div className="form-block__head">
              <h2 className="form-block__title">Касса и терминал</h2>
              <p className="form-block__hint">
                Итог дня = терминал + изменение наличных + расходы
              </p>
            </div>
            <div className="money-grid">
              <label className="field">
                <span className="field__label">Остаток наличных вчера</span>
                <MoneyInput
                  value={cashPrev}
                  onChange={(value) => {
                    setCashPrev(value);
                    setDirty(true);
                  }}
                  large
                  ariaLabel="Остаток наличных предыдущего дня"
                />
                <span className="field__hint">
                  {suggestDiffers || storedPrevDiffers ? (
                    <button type="button" className="suggest-link" onClick={fillSuggestedPrev}>
                      Подставить {formatMoney(suggested)}
                    </button>
                  ) : (
                    'Подставлен из предыдущей записи'
                  )}
                </span>
              </label>
              <label className="field">
                <span className="field__label">Сумма по терминалу</span>
                <MoneyInput
                  value={terminal}
                  onChange={(value) => {
                    setTerminal(value);
                    setDirty(true);
                  }}
                  large
                  ariaLabel="Сумма по терминалу"
                />
                <span className="field__hint">
                  Комиссия банка {formatPercent(rate)}: −{formatMoney(commission)}
                </span>
              </label>
              <label className="field">
                <span className="field__label">Факт наличных в кассе</span>
                <MoneyInput
                  value={cashFact}
                  onChange={(value) => {
                    setCashFact(value);
                    setDirty(true);
                  }}
                  large
                  ariaLabel="Фактическое наличие наличных в кассе"
                />
                <span className="field__hint">
                  Сколько наличных реально в кассе на конец дня
                </span>
              </label>
              <label className="field">
                <span className="field__label">Положено в НЗ</span>
                <MoneyInput
                  value={reserve}
                  onChange={(value) => {
                    setReserve(value);
                    setDirty(true);
                  }}
                  large
                  ariaLabel="Сумма, положенная в НЗ"
                />
                <span className="field__hint">Комиссия на НЗ не начисляется</span>
              </label>
            </div>
          </div>

          <div className="form-block">
            <div className="form-block__head form-block__head--row">
              <div>
                <h2 className="form-block__title">Расходы</h2>
                <p className="form-block__hint">
                  Сумма и комментарий «на что и куда» · из фактических денег не вычитаются
                </p>
              </div>
              <span className="form-block__sum">Итого: {formatMoney(expensesValue)}</span>
            </div>

            <div className="expense-list">
              {expenses.map((expense, index) => (
                <div className="expense-row" key={expense.key}>
                  <span className="expense-row__index">{index + 1}</span>
                  <div className="expense-row__amount">
                    <MoneyInput
                      value={expense.amount}
                      onChange={(value) => patchExpense(expense.key, { amount: value })}
                      ariaLabel={`Сумма расхода ${index + 1}`}
                    />
                  </div>
                  <input
                    className="input expense-row__comment"
                    type="text"
                    value={expense.comment}
                    maxLength={400}
                    placeholder="На что и куда — например, «корм, база на Ленина»"
                    aria-label={`Комментарий к расходу ${index + 1}`}
                    onChange={(event) => patchExpense(expense.key, { comment: event.target.value })}
                  />
                  <button
                    type="button"
                    className="btn btn--icon btn--ghost btn--danger-hover"
                    onClick={() => removeExpense(expense.key)}
                    aria-label={`Удалить расход ${index + 1}`}
                  >
                    <TrashIcon size={17} />
                  </button>
                </div>
              ))}
            </div>

            <button type="button" className="btn btn--ghost btn--sm add-expense" onClick={addExpense}>
              <PlusIcon size={16} />
              <span>Добавить расход</span>
            </button>
          </div>

          <div className="form-block">
            <label className="field">
              <span className="field__label">Комментарий к дню</span>
              <textarea
                className="input textarea"
                value={note}
                maxLength={1000}
                rows={2}
                placeholder="Необязательно: важные детали дня"
                onChange={(event) => {
                  setNote(event.target.value);
                  setDirty(true);
                }}
              />
            </label>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              <PenIcon size={18} />
              <span>{existing ? 'Обновить запись' : 'Сохранить день'}</span>
            </button>
            <button type="button" className="btn btn--ghost" onClick={resetForm}>
              Сбросить
            </button>
            {existing ? (
              <>
                <button
                  type="button"
                  className="btn btn--ghost btn--danger-hover"
                  onClick={() => setConfirmDelete(true)}
                >
                  <TrashIcon size={17} />
                  <span>Удалить запись</span>
                </button>
                <span className="form-actions__note">
                  Запись за {formatDateWithWeekday(existing.date)} уже есть — сохранение обновит её
                </span>
              </>
            ) : null}
          </div>
        </section>

        <aside className="day-summary card">
          <div className="day-summary__head">
            <h2 className="day-summary__title">Итоги дня</h2>
            <span
              className="company-badge"
              style={{
                color: companyMeta.accent,
                borderColor: `${companyMeta.accent}4D`,
                background: `${companyMeta.accent}14`,
              }}
            >
              {companyMeta.name}
            </span>
          </div>

          <div className="day-summary__main">
            <span className="day-summary__label">Остаток за день</span>
            <span className={`day-summary__value${dayBalance < 0 ? ' is-negative' : ''}`}>
              {formatMoney(dayBalance)}
            </span>
            <span className="day-summary__caption">итог дня − комиссия − НЗ</span>
          </div>

          <div className="day-summary__rows">
            <div className="summary-row">
              <span>Итог дня</span>
              <strong>{formatMoney(revenue)}</strong>
            </div>
            <div className="summary-row">
              <span>
                <WalletIcon size={15} /> Изменение наличных
              </span>
              <strong className={cashChange < 0 ? 'is-negative' : 'is-positive'}>
                {formatSignedMoney(cashChange)}
              </strong>
            </div>
            <div className="summary-row">
              <span>Терминал</span>
              <strong>{formatMoney(terminalValue)}</strong>
            </div>
            <div className="summary-row">
              <span>Расходы ({expenses.length})</span>
              <strong>{formatMoney(expensesValue)}</strong>
            </div>
            <div className="summary-row">
              <span>Комиссия банка {formatPercent(rate)}</span>
              <strong>{formatMinusMoney(commission)}</strong>
            </div>
            <div className="summary-row">
              <span>В НЗ</span>
              <strong>{formatMinusMoney(reserveValue)}</strong>
            </div>
          </div>

          <div className="day-summary__hint">
            <InfoIcon size={15} />
            <span>
              Расходы не уменьшают факт кассы — они уже учтены в «Факт наличных». Комиссия
              начисляется только на терминал.
            </span>
          </div>

          <button type="button" className="btn btn--ghost btn--block" onClick={() => navigate('dashboard')}>
            Перейти к сводке
            <ChevronRightIcon size={16} />
          </button>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Удалить запись?"
        description={
          <>
            Запись <strong>{companyMeta.name}</strong> за{' '}
            <strong>{formatDateWithWeekday(date)}</strong> будет удалена безвозвратно. Сводные
            показатели пересчитаются сразу.
          </>
        }
        confirmLabel="Удалить"
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
