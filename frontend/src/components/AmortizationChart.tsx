import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { YearPoint } from '../lib/types';
import { formatCompact, formatCurrency } from '../lib/format';
import { Card } from './ui';

type View = 'balance' | 'payment';

/**
 * The amortization chart: principal decay against cumulative interest, or the payment path.
 *
 * Two views rather than one dual-axis chart — a shekel balance and a shekel payment differ by two
 * orders of magnitude, and forcing them onto shared axes makes the smaller series unreadable.
 */
export function AmortizationChart({ yearly, title }: { yearly: YearPoint[]; title?: string }) {
  const [view, setView] = useState<View>('balance');

  return (
    <Card
      title={title ?? 'לוח סילוקין'}
      subtitle={
        view === 'balance'
          ? 'ירידת יתרת הקרן מול הריבית וההצמדה שנצברו'
          : 'ההחזר החודשי הממוצע בכל שנה'
      }
      action={
        <div className="no-print flex rounded-lg bg-slate-100 p-0.5">
          {(
            [
              ['balance', 'יתרה'],
              ['payment', 'החזר'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                view === key ? 'bg-white text-ink shadow-sm' : 'text-ink-soft'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      <div className="h-72 w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          {view === 'balance' ? (
            <AreaChart data={yearly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#4F46E5" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="interestFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.26} />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#64748B' }} tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={formatCompact}
                tick={{ fontSize: 12, fill: '#64748B' }}
                tickLine={false}
                axisLine={false}
                width={64}
              />
              <Tooltip content={<ChartTooltip unitLabel="שנה" />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="remainingBalance"
                name="יתרת קרן"
                stroke="#4F46E5"
                strokeWidth={2}
                fill="url(#balanceFill)"
              />
              <Area
                type="monotone"
                dataKey="cumulativeInterest"
                name="ריבית מצטברת"
                stroke="#F59E0B"
                strokeWidth={2}
                fill="url(#interestFill)"
              />
            </AreaChart>
          ) : (
            <LineChart data={yearly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#64748B' }} tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={formatCompact}
                tick={{ fontSize: 12, fill: '#64748B' }}
                tickLine={false}
                axisLine={false}
                width={64}
              />
              <Tooltip content={<ChartTooltip unitLabel="שנה" />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="averageMonthlyPayment"
                name="החזר חודשי ממוצע"
                stroke="#4F46E5"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="indexationAccrued"
                name="הצמדה שנתית"
                stroke="#F43F5E"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

interface TooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
}

/** RTL tooltip with shekel formatting; Recharts' default renders LTR with raw numbers. */
function ChartTooltip({
  active,
  payload,
  label,
  unitLabel,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  unitLabel: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  return (
    <div dir="rtl" className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-card backdrop-blur">
      <p className="mb-1.5 text-xs font-semibold text-ink">
        {unitLabel} {label}
      </p>
      <ul className="space-y-1">
        {payload.map((item) => (
          <li key={item.name} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ background: item.color }} aria-hidden />
            <span className="text-ink-soft">{item.name}</span>
            <span className="tabular font-medium text-ink">
              {formatCurrency(Number(item.value ?? 0))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
