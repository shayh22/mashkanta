import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonthTotals } from '../../engine/money/picture';
import { formatCompact, formatCurrency, formatSignedCurrency } from '../../lib/format';
import { ResponsiveChart } from '../charts/ResponsiveChart';
import { monthName, shortDate } from './format';

/** Each month: what came in, what went out, and what was left — the line. */
export function MonthlyFlowChart({ months }: { months: readonly MonthTotals[] }) {
  const data = months.map((month) => ({
    label: monthName(month.month, false),
    income: Math.round(month.income),
    spending: Math.round(month.spending),
    net: Math.round(month.income - month.spending),
  }));
  return (
    <div
      className="h-64 w-full text-ink-soft"
      dir="ltr"
      role="img"
      aria-label={`נכנס ויצא לפי חודש: ${data.map((d) => `${d.label} נכנס ${formatCurrency(d.income)}, יצא ${formatCurrency(d.spending)}`).join('; ')}`}
    >
      <ResponsiveChart width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'currentColor' }} tickLine={false} axisLine={false} reversed />
          <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} width={56} orientation="right" />
          <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.3} />
          <Tooltip
            cursor={{ fill: 'rgb(var(--surface-sunken))', fillOpacity: 0.6 }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !row) {
                return null;
              }
              return (
                <div className="rounded-xl border border-line bg-surface/95 px-3 py-2 text-xs shadow-card" dir="rtl">
                  <p className="font-semibold text-ink">{row.label}</p>
                  <p className="tabular text-ink-muted">נכנס {formatCurrency(row.income)}</p>
                  <p className="tabular text-ink-muted">יצא {formatCurrency(row.spending)}</p>
                  <p className={`tabular font-semibold ${row.net < 0 ? 'text-negative' : 'text-positive'}`}>{formatSignedCurrency(row.net)}</p>
                </div>
              );
            }}
          />
          <Bar dataKey="income" name="נכנס" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="spending" name="יצא" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Line dataKey="net" name="נשאר" stroke="rgb(var(--ink))" strokeWidth={2} dot={{ r: 3 }} type="monotone" />
        </ComposedChart>
      </ResponsiveChart>
    </div>
  );
}

/** The account's balance day by day; the part under zero is the overdraft. */
export function BalanceChart({ balances }: { balances: readonly { date: string; balance: number }[] }) {
  const data = balances.map((point) => ({ label: shortDate(point.date).slice(0, 5), balance: Math.round(point.balance) }));
  const values = data.map((d) => d.balance);
  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);
  // Where zero falls in the gradient: above it teal, below it red.
  const zero = top - bottom > 0 ? top / (top - bottom) : 1;
  const lowest = Math.min(...values);
  return (
    <div
      className="h-52 w-full text-ink-soft"
      dir="ltr"
      role="img"
      aria-label={`יתרת החשבון לאורך התקופה: הנמוכה ${formatCurrency(lowest)}, הגבוהה ${formatCurrency(top)}`}
    >
      <ResponsiveChart width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset={zero} stopColor="var(--chart-1)" stopOpacity={0.08} />
              <stop offset={zero} stopColor="rgb(var(--negative))" stopOpacity={0.12} />
              <stop offset={1} stopColor="rgb(var(--negative))" stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} reversed minTickGap={24} />
          <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} width={56} orientation="right" />
          <ReferenceLine y={0} stroke="rgb(var(--negative))" strokeOpacity={0.6} strokeDasharray="4 4" />
          <Tooltip
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !row) {
                return null;
              }
              return (
                <div className="rounded-xl border border-line bg-surface/95 px-3 py-2 text-xs shadow-card" dir="rtl">
                  <p className="text-ink-soft">{row.label}</p>
                  <p className={`tabular font-semibold ${row.balance < 0 ? 'text-negative' : 'text-ink'}`}>{formatCurrency(row.balance)}</p>
                </div>
              );
            }}
          />
          <Area dataKey="balance" type="stepAfter" stroke="rgb(var(--ink-muted))" strokeWidth={1.5} fill="url(#balance-fill)" />
        </AreaChart>
      </ResponsiveChart>
    </div>
  );
}
