import type { ReactNode } from 'react';
import { formatMoney } from '../lib/format';

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  accent?: string;
  negative?: boolean;
  large?: boolean;
}

export function StatTile({ label, value, hint, icon, accent, negative, large }: StatTileProps) {
  return (
    <div className={`stat${large ? ' stat--large' : ''}`}>
      <div className="stat__label">
        {icon ? <span className="stat__icon">{icon}</span> : null}
        <span>{label}</span>
      </div>
      <div
        className={`stat__value${negative ? ' is-negative' : ''}`}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {hint ? <div className="stat__hint">{hint}</div> : null}
    </div>
  );
}

export function MoneyStat({
  label,
  amount,
  hint,
  icon,
  accent,
  large,
}: {
  label: string;
  amount: number;
  hint?: string;
  icon?: ReactNode;
  accent?: string;
  large?: boolean;
}) {
  return (
    <StatTile
      label={label}
      value={formatMoney(amount)}
      hint={hint}
      icon={icon}
      accent={accent}
      negative={amount < 0}
      large={large}
    />
  );
}
