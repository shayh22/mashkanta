import { Area, AreaChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { MarketMonth } from '../../engine/boiMarket';
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

/** The Bank of Israel's average rates, month by month: the three tracks, and prime dashed as the reference. */
export function RatesTrendChart({ history }: { history: readonly MarketMonth[] }) {
  const data = history.map((month) => ({ ...month, label: `${month.month.slice(5, 7)}/${month.month.slice(2, 4)}` }));
  const series = [
    { key: 'fixedUnlinked', name: 'קבועה לא צמודה', color: 'var(--chart-1)' },
    { key: 'fixedLinked', name: 'קבועה צמודה', color: 'var(--chart-2)' },
    { key: 'variableLinked', name: 'משתנה צמודה', color: 'var(--chart-3)' },
    { key: 'prime', name: 'פריים', color: 'rgb(var(--flow-muted))', dashed: true },
  ] as const;
  return (
    <div className="h-56 w-full text-flow-muted" dir="ltr" role="img" aria-label={`הריביות הממוצעות בבנק ישראל מ-${data[0]?.label ?? ''} עד ${data.at(-1)?.label ?? ''}`}>
      <ResponsiveChart width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} reversed minTickGap={20} />
          <YAxis tickFormatter={(value: number) => `${(value * 100).toFixed(1)}%`} tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} width={44} orientation="right" domain={['auto', 'auto']} />
          <Tooltip
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !row) {
                return null;
              }
              return (
                <div className="rounded-xl bg-flow-card px-3 py-2 text-xs text-flow-ink shadow" dir="rtl">
                  <p className="font-bold">{row.label}</p>
                  {series.map((each) =>
                    row[each.key] !== undefined ? (
                      <p key={each.key} className="tabular-nums">
                        {each.name} {((row[each.key] as number) * 100).toFixed(2)}%
                      </p>
                    ) : null,
                  )}
                </div>
              );
            }}
          />
          {series.map((each) => (
            <Line key={each.key} dataKey={each.key} name={each.name} stroke={each.color} strokeWidth={2} strokeDasharray={'dashed' in each ? '5 4' : undefined} dot={false} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveChart>
    </div>
  );
}
