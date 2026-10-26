import { Bar, BarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from 'recharts';
import { ResponsiveChart } from './ResponsiveChart';
import { formatCompact, formatCurrency, formatSignedCurrency } from '../../lib/format';
import { waterfallBars, type WaterfallBar, type WaterfallStep } from '../../lib/waterfall';
import { Card } from '../ui';

const FILL = {
  total: 'var(--chart-1)',
  down: 'rgb(var(--positive))',
  up: 'rgb(var(--negative))',
} as const;

/**
 * The monthly payment as a waterfall: today's total, each change that the move makes, and the
 * total after. A saving is green and steps down; a new payment is red and steps up.
 */
export function WaterfallChart({
  title,
  subtitle,
  start,
  startLabel = 'היום',
  steps,
  endLabel = 'אחרי',
}: {
  title: string;
  subtitle?: string;
  start: number;
  startLabel?: string;
  steps: readonly WaterfallStep[];
  endLabel?: string;
}) {
  const bars = waterfallBars(startLabel, start, steps, endLabel);
  return (
    <Card title={title} subtitle={subtitle}>
      <div className="h-72 w-full text-ink-soft" dir="ltr" role="img" aria-label={`${title}: ${bars.map((bar) => `${bar.label} ${formatCurrency(bar.amount)}`).join(', ')}`}>
        <ResponsiveChart width="100%" height="100%">
          <BarChart data={[...bars].reverse()} margin={{ top: 24, right: 8, left: 8, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} interval={0} />
            <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12, fill: 'currentColor' }} tickLine={false} axisLine={false} width={60} />
            <Tooltip
              cursor={{ fill: 'rgb(var(--surface-sunken))', fillOpacity: 0.6 }}
              content={({ active, payload }) => {
                const bar = payload?.[0]?.payload as WaterfallBar | undefined;
                if (!active || !bar) {
                  return null;
                }
                return (
                  <div className="rounded-xl border border-line bg-surface/95 px-3 py-2 text-xs shadow-card" dir="rtl">
                    <p className="font-semibold text-ink">{bar.label}</p>
                    <p className="tabular text-ink-muted">
                      {bar.kind === 'total' ? formatCurrency(bar.amount) : formatSignedCurrency(bar.amount)} לחודש
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="value" stackId="w" radius={[4, 4, 0, 0]}>
              {[...bars].reverse().map((bar, index) => (
                <Cell key={`${bar.label}-${index}`} fill={FILL[bar.kind]} />
              ))}
              <LabelList
                dataKey="amount"
                position="top"
                formatter={(value: number) => formatCompact(Math.abs(value))}
                style={{ fontSize: 11, fill: 'rgb(var(--ink-muted))' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveChart>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span><span className="me-1 inline-block h-2 w-2 rounded-sm" style={{ background: FILL.total }} aria-hidden />סך החזר</span>
        <span><span className="me-1 inline-block h-2 w-2 rounded-sm" style={{ background: FILL.down }} aria-hidden />ירידה בהחזר</span>
        <span><span className="me-1 inline-block h-2 w-2 rounded-sm" style={{ background: FILL.up }} aria-hidden />תוספת להחזר</span>
      </p>
    </Card>
  );
}
