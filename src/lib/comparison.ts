import { COMPANIES, round2, type Adjustment, type CompanyId, type DayRecord } from '../../shared/model';
import { filterAdjustments, filterRecords, totalsOf, type Totals } from './calc';
import { monthRange } from './format';

interface ComparisonSide {
  from: string;
  to: string;
  recordCount: number;
  movementCount: number;
  totals: Totals;
  hasData: boolean;
}

export interface MonthComparison {
  label: string;
  current: ComparisonSide;
  previous: ComparisonSide;
  difference: { revenue: number; expenses: number; earned: number } | null;
}

/** Equal calendar-day windows, excluding future dates, even at the end of a longer month. */
export function comparisonRanges(today: string): {
  current: { from: string; to: string };
  previous: { from: string; to: string };
} {
  const current = monthRange(0, today);
  const previous = monthRange(-1, today);
  const day = Math.min(Number(today.slice(8, 10)), Number(previous.to.slice(8, 10)));
  const suffix = String(day).padStart(2, '0');
  return {
    current: { from: current.from, to: `${current.from.slice(0, 8)}${suffix}` },
    previous: { from: previous.from, to: `${previous.from.slice(0, 8)}${suffix}` },
  };
}

export function monthlyComparison(
  records: DayRecord[],
  adjustments: Adjustment[],
  today: string,
  commissionRate: number,
): MonthComparison[] {
  const ranges = comparisonRanges(today);
  const groups: { label: string; company: CompanyId | 'all' }[] = [
    { label: 'Все компании', company: 'all' },
    ...COMPANIES.map((company) => ({ label: company.name, company: company.id })),
  ];
  return groups.map(({ label, company }) => {
    function side(range: { from: string; to: string }): ComparisonSide {
      const periodRecords = filterRecords(records, { ...range, company });
      const movements = filterAdjustments(adjustments, { ...range, company });
      return {
        ...range,
        recordCount: periodRecords.length,
        movementCount: movements.length,
        totals: totalsOf(periodRecords, movements, commissionRate),
        hasData: periodRecords.length > 0,
      };
    }
    const current = side(ranges.current);
    const previous = side(ranges.previous);
    return {
      label, current, previous,
      difference: current.hasData && previous.hasData ? {
        revenue: round2(current.totals.revenue - previous.totals.revenue),
        expenses: round2(current.totals.expenses - previous.totals.expenses),
        earned: round2(current.totals.earned - previous.totals.earned),
      } : null,
    };
  });
}
