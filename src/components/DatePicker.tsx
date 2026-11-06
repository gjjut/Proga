import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons';
import { formatDateWithWeekday, todayIso } from '../lib/format';

const MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** «2026-11-06» → { y: 2026, m: 11, d: 6 } (месяц с единицы). */
function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** День недели, где понедельник — 0. Считаем в UTC, чтобы не зависеть от пояса. */
function weekdayIndex(y: number, m: number, d: number): number {
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function monthKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`;
}

interface DatePickerProps {
  /** Значение в ISO: «2026-11-06». */
  value: string;
  onChange: (iso: string) => void;
  /** Верхняя граница (например, сегодня): дни позже недоступны. */
  max?: string;
  /** Нижняя граница. */
  min?: string;
  /** `nav` — крупная кнопка с датой, `field` — компактное поле в фильтрах. */
  variant?: 'nav' | 'field';
  /** Подпись слева для варианта `field` («с», «по»). */
  label?: string;
  ariaLabel?: string;
}

/**
 * Календарь в стиле приложения вместо системного попапа `<input type="date">`:
 * тот рисовался браузером и выбивался из чёрно-белой темы.
 */
export function DatePicker({
  value,
  onChange,
  max,
  min,
  variant = 'nav',
  label,
  ariaLabel,
}: DatePickerProps) {
  const today = todayIso();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const parsed = parseIso(value) ?? parseIso(today)!;
    return { y: parsed.y, m: parsed.m };
  });
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = parseIso(value);
  const todayParts = parseIso(today)!;

  // При открытии всегда показываем месяц выбранной даты.
  useEffect(() => {
    if (!open) return;
    const parsed = parseIso(value) ?? parseIso(today)!;
    setView({ y: parsed.y, m: parsed.m });
  }, [open, value, today]);

  // Закрытие по клику мимо и по Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const cells = useMemo(() => {
    const total = daysInMonth(view.y, view.m);
    const lead = weekdayIndex(view.y, view.m, 1);
    const items: { key: string; iso?: string; day?: number }[] = [];
    for (let i = 0; i < lead; i += 1) items.push({ key: `blank-${i}` });
    for (let day = 1; day <= total; day += 1) {
      items.push({ key: isoOf(view.y, view.m, day), iso: isoOf(view.y, view.m, day), day });
    }
    return items;
  }, [view]);

  const shiftMonth = (delta: number) => {
    setView((current) => {
      const index = current.m - 1 + delta;
      const y = current.y + Math.floor(index / 12);
      const m = ((index % 12) + 12) % 12 + 1;
      return { y, m };
    });
  };

  const maxParts = max ? parseIso(max) : null;
  const minParts = min ? parseIso(min) : null;
  const viewKey = monthKey(view.y, view.m);
  const nextDisabled = maxParts ? viewKey >= monthKey(maxParts.y, maxParts.m) : false;
  const prevDisabled = minParts ? viewKey <= monthKey(minParts.y, minParts.m) : false;

  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  const display = selected
    ? formatDateWithWeekday(value).replace(' г.', '')
    : 'выберите дату';

  return (
    <div className={`date-pick date-pick--${variant}`} ref={rootRef}>
      {label ? <span className="date-pick__label">{label}</span> : null}
      <button
        type="button"
        className="date-pick__trigger"
        onClick={() => setOpen((current) => !current)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {variant === 'nav' ? <CalendarIcon size={15} /> : null}
        <span>{display}</span>
      </button>

      {open ? (
        <div className="date-pop" role="dialog" aria-label={ariaLabel ?? 'Календарь'}>
          <div className="date-pop__head">
            <button
              type="button"
              className="btn btn--icon btn--ghost btn--sm"
              onClick={() => shiftMonth(-1)}
              disabled={prevDisabled}
              aria-label="Предыдущий месяц"
            >
              <ChevronLeftIcon size={16} />
            </button>
            <span className="date-pop__title">
              {MONTHS[view.m - 1]} {view.y}
            </span>
            <button
              type="button"
              className="btn btn--icon btn--ghost btn--sm"
              onClick={() => shiftMonth(1)}
              disabled={nextDisabled}
              aria-label="Следующий месяц"
            >
              <ChevronRightIcon size={16} />
            </button>
          </div>

          <div className="date-pop__grid">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="date-pop__dow">
                {weekday}
              </span>
            ))}

            {cells.map((cell) => {
              if (!cell.iso) return <span key={cell.key} className="date-pop__blank" />;
              const disabled =
                (max ? cell.iso > max : false) || (min ? cell.iso < min : false);
              const isSelected = cell.iso === value;
              const isToday =
                view.y === todayParts.y && view.m === todayParts.m && cell.day === todayParts.d;
              return (
                <button
                  key={cell.key}
                  type="button"
                  className={`date-pop__day${isSelected ? ' is-selected' : ''}${
                    isToday ? ' is-today' : ''
                  }`}
                  data-date={cell.iso}
                  disabled={disabled}
                  aria-label={`${cell.day} ${MONTHS[view.m - 1]} ${view.y}`}
                  aria-pressed={isSelected}
                  onClick={() => pick(cell.iso!)}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="date-pop__foot">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => pick(max && max < today ? max : today)}
              disabled={max ? today > max : false}
            >
              Сегодня
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
