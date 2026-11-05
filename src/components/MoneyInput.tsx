import { formatNumber2, parseMoneyInput } from '../lib/format';

function sanitizeTyping(value: string): string {
  return value.replace(/[^\d\s\u00A0,.]/g, '').replace(/\s{2,}/g, ' ');
}

interface MoneyInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Крупный вариант для главных полей дня */
  large?: boolean;
}

export function MoneyInput({
  id,
  value,
  onChange,
  placeholder = '0',
  ariaLabel,
  large = false,
}: MoneyInputProps) {
  return (
    <div className={large ? 'money-field money-field--large' : 'money-field'}>
      <input
        id={id}
        className="input input--money"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => onChange(sanitizeTyping(event.target.value))}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={() => {
          const parsed = parseMoneyInput(value);
          onChange(parsed > 0 ? formatNumber2(parsed) : '');
        }}
      />
      <span className="money-field__suffix" aria-hidden="true">
        ₽
      </span>
    </div>
  );
}
