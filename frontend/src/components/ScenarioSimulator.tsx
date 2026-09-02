import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { StressMatrix } from '../lib/types';
import { formatCompact, formatCurrency, formatSignedCurrency } from '../lib/format';
import { Card } from './ui';

/**
 * The what-if panel: every shock the mix was tested against, and whether it breaks the household.
 *
 * The chart plots the *increase* rather than the absolute payment, because the question a borrower
 * is actually asking is "how much more would I owe", not "what would the payment be".
 */
export function ScenarioSimulator({
  stress,
  capacity,
}: {
  stress: StressMatrix;
  capacity: number;
}) {
  const data = stress.scenarios.map((scenario) => ({
    label: scenario.label,
    shortLabel: scenario.label.replace('אינפלציה שנתית של ', 'מדד ').replace('עליית ריבית של ', 'ריבית +'),
    increase: Math.round(scenario.paymentIncrease),
    maxPayment: scenario.maxPayment,
    breach: scenario.breachesCapacity,
    // A zero here is a result, not a gap: the mix simply carries no exposure to this shock.
    immune: Math.round(scenario.paymentIncrease) <= 0,
  }));
  const immuneCount = data.filter((entry) => entry.immune).length;

  return (
    <Card
      title="סימולטור תרחישים"
      subtitle="כל תמהיל נבחן מול זעזועי ריבית ואינפלציה, ומול יכולת הספיגה שהצהרתם עליה."
      action={
        stress.anyBreach ? (
          <span className="badge-danger">חריגה מיכולת הספיגה</span>
        ) : (
          <span className="badge-ok">עומד בכל התרחישים</span>
        )
      }
    >
      <div className="h-64 w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis
              dataKey="shortLabel"
              tick={{ fontSize: 11, fill: '#64748B' }}
              tickLine={false}
              axisLine={false}
              angle={-35}
              textAnchor="end"
              interval={0}
              height={60}
            />
            <YAxis
              tickFormatter={formatCompact}
              tick={{ fontSize: 12, fill: '#64748B' }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <Tooltip content={<StressTooltip capacity={capacity} />} cursor={{ fill: '#F1F5F9' }} />
            <Bar dataKey="increase" radius={[6, 6, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.label} fill={entry.breach ? '#F43F5E' : '#4F46E5'} />
              ))}
              {/* A bar of height zero draws nothing, which reads as missing data rather than as
                  immunity. This marks those scenarios at the baseline instead. */}
              <LabelList dataKey="increase" content={<ImmuneMarker />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {immuneCount > 0 && (
        <p className="mt-2 text-xs text-emerald-700">
          <span className="me-1 inline-block h-1.5 w-4 rounded-full bg-emerald-500 align-middle" aria-hidden />
          {immuneCount === 1 ? 'תרחיש אחד אינו משפיע' : `${immuneCount} תרחישים אינם משפיעים`} על
          ההחזר כלל — התמהיל אינו חשוף להם. אפס כאן הוא תוצאה, לא נתון חסר.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="card-muted">
          <p className="text-xs text-ink-soft">התרחיש החמור ביותר</p>
          <p className="mt-1 text-sm font-semibold text-ink">{stress.worstCase.label}</p>
          <p className="tabular mt-1 text-lg font-semibold text-ink">
            {formatCurrency(stress.worstCase.maxPayment)} לחודש
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">
            עלייה של {formatSignedCurrency(stress.worstIncrease)} מול ההחזר הראשוני
          </p>
        </div>
        <div className="card-muted">
          <p className="text-xs text-ink-soft">יכולת הספיגה שהוגדרה</p>
          <p className="tabular mt-1 text-lg font-semibold text-ink">{formatCurrency(capacity)}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {stress.anyBreach
              ? 'לפחות תרחיש אחד חורג מהיכולת שהצהרתם עליה — שקלו להגדיל את הרכיב הקבוע.'
              : 'גם בתרחיש החמור ביותר העלייה בהחזר נשארת בגבולות שהגדרתם.'}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-ink-soft">
              <th className="py-2 text-start font-medium">תרחיש</th>
              <th className="py-2 text-start font-medium">החזר שיא</th>
              <th className="py-2 text-start font-medium">בשנה ה-5</th>
              <th className="py-2 text-start font-medium">תוספת לעלות הכוללת</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stress.scenarios.map((scenario) => (
              <tr key={scenario.id} className={scenario.breachesCapacity ? 'bg-rose-50/40' : undefined}>
                <td className="py-2 text-ink-muted">{scenario.label}</td>
                <td className="tabular py-2">{formatCurrency(scenario.maxPayment)}</td>
                <td className="tabular py-2">{formatCurrency(scenario.paymentAtYear5)}</td>
                <td className="tabular py-2 text-ink-soft">
                  {formatSignedCurrency(scenario.totalPaidIncrease)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

interface StressTooltipPayload {
  payload: { label: string; increase: number; maxPayment: number; breach: boolean };
}

function StressTooltip({
  active,
  payload,
  capacity,
}: {
  active?: boolean;
  payload?: StressTooltipPayload[];
  capacity: number;
}) {
  const entry = payload?.[0]?.payload;
  if (!active || !entry) {
    return null;
  }
  return (
    <div dir="rtl" className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-card backdrop-blur">
      <p className="text-xs font-semibold text-ink">{entry.label}</p>
      <p className="tabular mt-1 text-sm text-ink-muted">
        החזר שיא: {formatCurrency(entry.maxPayment)}
      </p>
      <p className="tabular text-sm text-ink-muted">
        תוספת: {formatSignedCurrency(entry.increase)}
      </p>
      {entry.breach && (
        <p className="mt-1 text-xs font-medium text-rose-600">
          מעל יכולת הספיגה ({formatCurrency(capacity)})
        </p>
      )}
    </div>
  );
}

/**
 * Draws an emerald rule on the baseline for a scenario whose impact is exactly zero.
 *
 * Recharts renders nothing at all for a zero-height bar, so without this the inflation scenarios
 * of a mix carrying no CPI-linked principal look like a broken chart — when in fact they are the
 * best news the panel has to report.
 */
function ImmuneMarker(props: { x?: number; y?: number; width?: number; value?: number }) {
  const { x = 0, y = 0, width = 0, value = 0 } = props;
  if (value > 0 || width <= 0) {
    return null;
  }
  return (
    <g>
      <rect x={x} y={y - 3} width={width} height={3} rx={1.5} fill="#10B981" />
      <text
        x={x + width / 2}
        y={y - 8}
        textAnchor="middle"
        fill="#059669"
        fontSize={10}
        fontWeight={600}
      >
        ללא השפעה
      </text>
    </g>
  );
}
