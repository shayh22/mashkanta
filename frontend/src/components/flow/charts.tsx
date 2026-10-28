import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import type { YearPoint } from '../../engine/amortization';
import { formatCompact, formatCurrency } from '../../lib/format';
import { ResponsiveChart } from '../charts/ResponsiveChart';

/**
 * The questionnaire's charts, loaded with the first screen that draws one: Recharts is too heavy
 * for the questions themselves.
 */

/** A loan from today to its end: the balance going down, and the interest and indexation paid on the way. */
export function DebtPathChart({ start, yearly }: { start: number; yearly: readonly YearPoint[] }) {
  const data = [{ year: 0, balance: Math.round(start), cost: 0 }].concat(
    yearly.map((point) => ({ year: point.year, balance: Math.round(point.remainingBalance), cost: Math.round(point.cumulativeInterest + point.cumulativeIndexation) })),
  );
  const last = data.at(-1)!;
  // Today, every five years, and the end.
  const ticks = [...new Set([0, ...data.map((point) => point.year).filter((year) => year % 5 === 0), last.year])];
  return (
    <div
      className="h-52 w-full text-flow-muted"
      dir="ltr"
      role="img"
      aria-label={`היתרה יורדת מ-${formatCurrency(data[0]!.balance)} לאפס בתוך ${last.year} שנים, ובדרך משלמים ${formatCurrency(last.cost)} ריבית והצמדה`}
    >
      <ResponsiveChart width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey="year" ticks={ticks} interval={0} tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} reversed tickFormatter={(year: number) => (year === 0 ? 'היום' : `${year}`)} />
          <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} width={48} orientation="right" />
          <Tooltip
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !row) {
                return null;
              }
              return (
                <div className="rounded-xl bg-flow-card px-3 py-2 text-xs text-flow-ink shadow" dir="rtl">
                  <p className="font-bold">{row.year === 0 ? 'היום' : `אחרי ${row.year} שנים`}</p>
                  <p className="tabular-nums">יתרה {formatCurrency(row.balance)}</p>
                  <p className="tabular-nums">ריבית והצמדה עד אז {formatCurrency(row.cost)}</p>
                </div>
              );
            }}
          />
          <Area dataKey="balance" type="monotone" stroke="rgb(var(--flow-strong))" strokeWidth={2} fill="rgb(var(--flow-strong))" fillOpacity={0.18} isAnimationActive={false} />
          <Area dataKey="cost" type="monotone" stroke="rgb(var(--flow-accent))" strokeWidth={2} fill="rgb(var(--flow-accent))" fillOpacity={0.25} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveChart>
    </div>
  );
}

export { BalanceChart, MonthlyFlowChart } from '../money/flowCharts';
