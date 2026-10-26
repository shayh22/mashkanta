import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MarketMonth } from '../engine/boiMarket';
import { monthLabel } from '../engine/liveMarket';
import { formatPercent } from '../lib/format';
import { useMarket } from '../store/marketStore';
import { Card, ScrollRegion } from './ui';

type SeriesKey = Exclude<keyof MarketMonth, 'month'>;

/**
 * Prime is the reference the tracks are read against, so it is drawn as a neutral dashed line
 * rather than taking a categorical hue; the three tracks use the validated chart series.
 */
const SERIES: { key: SeriesKey; name: string; color: string; dashed?: boolean }[] = [
  { key: 'fixedUnlinked', name: 'קבועה לא צמודה', color: 'var(--chart-1)' },
  { key: 'fixedLinked', name: 'קבועה צמודה', color: 'var(--chart-2)' },
  { key: 'variableLinked', name: 'משתנה צמודה', color: 'var(--chart-3)' },
  { key: 'prime', name: 'ריבית הפריים', color: 'rgb(var(--ink-soft))', dashed: true },
];

/** `2026-08` → `08/26`, short enough for twelve ticks on a phone. */
const shortMonth = (month: string) => `${month.slice(5, 7)}/${month.slice(2, 4)}`;

/** Change from the first month that has the figure to the last, in percentage points. */
function change(history: readonly MarketMonth[], key: SeriesKey): number | undefined {
  const values = history.map((month) => month[key]).filter((value): value is number => value !== undefined);
  return values.length >= 2 ? values.at(-1)! - values[0]! : undefined;
}

/** Gridlines on whole half-points spanning every value, so the axis reads 3.0%, 3.5%, 4.0% … */
function halfPointTicks(history: readonly MarketMonth[]): number[] {
  const values = history.flatMap((month) => SERIES.map((series) => month[series.key])).filter(
    (value): value is number => value !== undefined,
  );
  const low = Math.floor(Math.min(...values) / 0.005) * 0.005;
  const high = Math.ceil(Math.max(...values) / 0.005) * 0.005;
  const ticks: number[] = [];
  for (let tick = low; tick <= high + 1e-9; tick += 0.005) {
    ticks.push(Math.round(tick * 1e4) / 1e4);
  }
  return ticks;
}

const dayMonthYear = (iso: string) => {
  const [year, month, day] = iso.split('-');
  return `${Number(day)}.${Number(month)}.${year}`;
};

const describe = (delta: number) =>
  Math.abs(delta) < 0.0005
    ? 'ללא שינוי'
    : `${delta < 0 ? 'ירידה' : 'עלייה'} של ${(Math.abs(delta) * 100).toFixed(2)} נק'`;

/**
 * The last twelve published months of average mortgage rates, with prime alongside — whether the
 * market is moving toward or away from the borrower, which bears on when to refinance.
 */
export function MarketTrends() {
  const history = useMarket((state) => state.market?.history);
  const currentPrime = useMarket((state) => state.market?.prime);

  if (!history || history.length < 2) {
    return null;
  }

  const first = history[0]!.month;
  const ticks = halfPointTicks(history);
  const last = history.at(-1)!.month;

  return (
    <Card
      title="מגמות בשוק המשכנתאות"
      subtitle={`ריביות ממוצעות בהלוואות חדשות לדיור, ${monthLabel(first)} – ${monthLabel(last)} · בנק ישראל`}
    >
      {/* Doubles as the legend: each series' line style beside its name and its change. */}
      <ul className="mb-4 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2" aria-label="מקרא ושינוי בתקופה">
        {SERIES.map((series) => {
          const delta = change(history, series.key);
          return delta === undefined ? null : (
            <li key={series.key} className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 shrink-0"
                style={{
                  background: series.dashed
                    ? `repeating-linear-gradient(90deg, ${series.color} 0 4px, transparent 4px 7px)`
                    : series.color,
                }}
              />
              <span className="text-ink-muted">{series.name}:</span>
              <span className="font-medium text-ink">{describe(delta)}</span>
            </li>
          );
        })}
      </ul>

      <div
        className="h-64 w-full text-ink-soft"
        dir="ltr"
        role="img"
        aria-label={`גרף ריביות ממוצעות לפי מסלול וריבית הפריים, ${monthLabel(first)} עד ${monthLabel(last)}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[...history]} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={shortMonth}
              tick={{ fontSize: 12, fill: 'currentColor' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={12}
            />
            <YAxis
              tickFormatter={(value: number) => formatPercent(value, 1)}
              tick={{ fontSize: 12, fill: 'currentColor' }}
              tickLine={false}
              axisLine={false}
              width={48}
              ticks={ticks}
              domain={[ticks[0]!, ticks.at(-1)!]}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'currentColor', strokeOpacity: 0.3 }} />
            {SERIES.map((series) => (
              <Line
                key={series.key}
                // Prime moves in discrete steps on rate decisions; the averages drift month to month.
                type={series.key === 'prime' ? 'stepAfter' : 'monotone'}
                dataKey={series.key}
                name={series.name}
                stroke={series.color}
                strokeWidth={2}
                strokeDasharray={series.dashed ? '5 4' : undefined}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {currentPrime && (
        <p className="mt-2 text-xs text-ink-soft">
          הפריים כיום: {formatPercent(currentPrime.value)} (בתוקף מ-{dayMonthYear(currentPrime.since)}). ממוצעי המסלולים
          מתפרסמים בפיגור של כחודשיים.
        </p>
      )}

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-brand-700">הצגת הנתונים כטבלה</summary>
        <ScrollRegion label="טבלת מגמות הריבית" className="mt-2">
          <table className="tabular w-full min-w-[480px] text-xs">
            <thead>
              <tr className="border-b border-line text-ink-soft">
                <th className="py-1.5 text-start font-medium" scope="col">
                  חודש
                </th>
                {SERIES.map((series) => (
                  <th key={series.key} className="py-1.5 text-start font-medium" scope="col">
                    {series.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {history.map((month) => (
                <tr key={month.month}>
                  <th className="py-1.5 text-start font-normal text-ink-muted" scope="row">
                    {monthLabel(month.month)}
                  </th>
                  {SERIES.map((series) => (
                    <td key={series.key} className="py-1.5 text-ink">
                      {month[series.key] === undefined ? '—' : formatPercent(month[series.key]!)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </details>
    </Card>
  );
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg" dir="rtl">
      <p className="mb-1 font-medium text-ink">{monthLabel(label)}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 text-ink-muted">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: entry.color }} />
          {entry.name}: <span className="font-medium text-ink">{formatPercent(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}
