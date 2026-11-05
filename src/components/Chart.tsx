import { useState } from 'react';
import { COMPANIES } from '../../shared/model';
import type { SeriesPoint } from '../lib/calc';
import { formatChartLabel, formatDateShort, formatMoney, formatNumber } from '../lib/format';

export function RevenueChart({ points }: { points: SeriesPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((point) => point.total));

  return (
    <div className="chart">
      <div className="chart__legend">
        {COMPANIES.map((company) => (
          <span key={company.id} className="chart__legend-item">
            <span className="chart__legend-dot" style={{ background: company.accent }} />
            {company.name}
          </span>
        ))}
        <span className="chart__legend-max">макс. {formatMoney(max)}</span>
      </div>

      <div className="chart__plot">
        <div className="chart__grid-layer" aria-hidden="true">
          {[0, 1, 2, 3].map((line) => (
            <span key={line} className="chart__grid" style={{ bottom: `${line * (100 / 3)}%` }} />
          ))}
        </div>

        <div className="chart__bars">
          {points.map((point, index) => {
            const heightPercent = point.total > 0 ? Math.max((point.total / max) * 100, 3) : 0;
            return (
              <div
                key={point.date}
                className={`chart__col${hover === index ? ' is-hover' : ''}`}
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
              >
                <div className="chart__stack" style={{ height: `${heightPercent}%` }}>
                  {COMPANIES.map((company) => {
                    const value = point.byCompany[company.id];
                    if (value <= 0) return null;
                    const share = point.total > 0 ? (value / point.total) * 100 : 0;
                    return (
                      <span
                        key={company.id}
                        className="chart__seg"
                        style={{ height: `${share}%`, background: company.accent }}
                      />
                    );
                  })}
                </div>
                {hover === index ? (
                  <div className="chart__tip">
                    <span className="chart__tip-date">{formatDateShort(point.date)}</span>
                    <strong className="chart__tip-total">{formatMoney(point.total)}</strong>
                    {COMPANIES.map((company) => (
                      <span key={company.id} className="chart__tip-row">
                        <span className="chart__legend-dot" style={{ background: company.accent }} />
                        {company.name}
                        <b>{formatNumber(point.byCompany[company.id])}</b>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="chart__axis" aria-hidden="true">
        {points.map((point, index) => (
          <span key={point.date}>{index % 2 === 0 ? formatChartLabel(point.date) : ''}</span>
        ))}
      </div>
    </div>
  );
}
