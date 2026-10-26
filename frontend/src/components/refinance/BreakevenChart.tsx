import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { RefinanceComparison } from '../../engine/refinance';
import { formatCompact, formatCurrency, formatSignedCurrency } from '../../lib/format';
import { Card } from '../ui';

interface Point {
  month: number;
  internal: number;
  external: number;
}

/** Every third month is plenty for a curve and keeps a 30-year path to ~120 points. */
function sample(comparison: RefinanceComparison): Point[] {
  const internal = comparison.internal.path;
  const external = comparison.external.path;
  const length = Math.max(internal.length, external.length);
  const points: Point[] = [];
  for (let i = 0; i < length; i++) {
    const month = i + 1;
    if (month !== 1 && month % 3 !== 0 && month !== length) {
      continue;
    }
    points.push({
      month,
      internal: internal[Math.min(i, internal.length - 1)]?.cumulativeSaving ?? 0,
      external: external[Math.min(i, external.length - 1)]?.cumulativeSaving ?? 0,
    });
  }
  return points;
}

/**
 * Cumulative saving net of every upfront cost. Both routes start below zero by exactly what the
 * switch costs on day one; where a line crosses zero is its breakeven month.
 */
export function BreakevenChart({ comparison }: { comparison: RefinanceComparison }) {
  const data = sample(comparison);
  const marks = [
    { month: comparison.internal.breakevenMonth, color: 'var(--chart-1)' },
    { month: comparison.external.breakevenMonth, color: 'var(--chart-2)' },
  ].filter((mark) => mark.month > 0);

  return (
    <Card
      title="עקומת נקודת האיזון"
      subtitle="חיסכון מצטבר בהחזרים בניכוי עמלות הפירעון ועלויות המעבר. המקום שבו הקו חוצה את האפס הוא נקודת האיזון."
    >
      <div className="h-72 w-full text-ink-soft" dir="ltr" role="img" aria-label="גרף חיסכון מצטבר לאורך החודשים בשני מסלולי המיחזור">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} vertical={false} />
            <XAxis
              dataKey="month"
              type="number"
              domain={[1, 'dataMax']}
              ticks={yearTicks(data)}
              tick={{ fontSize: 12, fill: 'currentColor' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(month: number) => `${month / 12}`}
              label={{ value: 'שנים', position: 'insideBottomRight', offset: -2, fontSize: 11, fill: 'currentColor' }}
            />
            <YAxis
              tickFormatter={formatCompact}
              tick={{ fontSize: 12, fill: 'currentColor' }}
              tickLine={false}
              axisLine={false}
              width={68}
            />
            <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.45} />
            {marks.map((mark) => (
              <ReferenceLine key={mark.color} x={mark.month} stroke={mark.color} strokeDasharray="4 4" />
            ))}
            <Tooltip content={<BreakevenTooltip />} cursor={{ stroke: 'currentColor', strokeOpacity: 0.3 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="internal" name="מיחזור פנימי" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="external" name="בנק מתחרה" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        עלות ביום המעבר: פנימי {formatCurrency(comparison.internal.upfrontCost)} · מתחרה{' '}
        {formatCurrency(comparison.external.upfrontCost)}
      </p>
    </Card>
  );
}

/** A tick every year on short horizons, every five on long ones. */
function yearTicks(data: Point[]): number[] {
  const last = data.at(-1)?.month ?? 12;
  const step = last > 15 * 12 ? 60 : last > 6 * 12 ? 24 : 12;
  const ticks: number[] = [];
  for (let month = step; month <= last; month += step) {
    ticks.push(month);
  }
  return ticks;
}

function BreakevenTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: number;
}) {
  if (!active || !payload?.length || label === undefined) {
    return null;
  }
  return (
    <div className="rounded-xl border border-line bg-surface/95 px-3 py-2 text-xs shadow-card backdrop-blur" dir="rtl">
      <p className="mb-1 font-semibold text-ink">חודש {label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 text-ink-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} aria-hidden />
          {entry.name}: <span className="tabular font-medium text-ink">{formatSignedCurrency(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}
