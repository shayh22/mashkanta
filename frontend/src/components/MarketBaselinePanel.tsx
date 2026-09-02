import type { BaselineResponse, TrackType } from '../lib/types';
import { formatPercent } from '../lib/format';
import { Card } from './ui';

const TIER_LABELS = {
  UP_TO_45: 'עד 45%',
  FROM_45_TO_60: '45%–60%',
  ABOVE_60: 'מעל 60%',
} as const;

const TRACK_NAMES: Record<TrackType, string> = {
  PRIME: 'פריים',
  FIXED_UNLINKED: 'קבועה לא צמודה',
  FIXED_LINKED: 'קבועה צמודה',
  VARIABLE_UNLINKED: 'משתנה לא צמודה',
  VARIABLE_LINKED: 'משתנה צמודה',
  ELIGIBILITY: 'זכאות',
};

const TRACK_ORDER: TrackType[] = [
  'PRIME',
  'FIXED_UNLINKED',
  'FIXED_LINKED',
  'VARIABLE_UNLINKED',
  'VARIABLE_LINKED',
];

/**
 * The market baseline table: what each track actually costs, by LTV bucket.
 *
 * Showing the top decile beside the average is the point — a borrower who only sees the average
 * has no way of knowing there is a better price to ask for.
 */
export function MarketBaselinePanel({ baseline, highlightLtv }: { baseline: BaselineResponse; highlightLtv?: number }) {
  const highlightTier =
    highlightLtv === undefined
      ? undefined
      : highlightLtv <= 0.45
        ? 'UP_TO_45'
        : highlightLtv <= 0.6
          ? 'FROM_45_TO_60'
          : 'ABOVE_60';

  return (
    <Card
      title="בסיס נתוני השוק"
      subtitle={`ריביות ממוצעות לפי מסלול ושיעור מימון · עודכן ${baseline.lastRefreshed}`}
      action={<span className="badge-neutral">פריים {formatPercent(baseline.anchors.prime)}</span>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-ink-soft">
              <th className="py-2 text-start font-medium">מסלול</th>
              {(Object.keys(TIER_LABELS) as (keyof typeof TIER_LABELS)[]).map((tier) => (
                <th
                  key={tier}
                  className={`py-2 text-start font-medium ${tier === highlightTier ? 'text-brand-600' : ''}`}
                >
                  {TIER_LABELS[tier]}
                  {tier === highlightTier && <span className="ms-1">•</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {TRACK_ORDER.map((track) => (
              <tr key={track}>
                <td className="py-2.5 font-medium text-ink">{TRACK_NAMES[track]}</td>
                {(Object.keys(TIER_LABELS) as (keyof typeof TIER_LABELS)[]).map((tier) => {
                  const rate = baseline.rates.find((entry) => entry.track === track && entry.tier === tier);
                  if (!rate) {
                    return <td key={tier} className="py-2.5 text-ink-soft">—</td>;
                  }
                  return (
                    <td key={tier} className={`py-2.5 ${tier === highlightTier ? 'bg-brand-50/60' : ''}`}>
                      <span className="tabular block font-medium text-ink">
                        {formatPercent(rate.medianRate)}
                      </span>
                      <span className="tabular block text-xs text-emerald-600">
                        עשירון עליון {formatPercent(rate.bestRate)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        מקור: טבלת הריביות הממוצעות של בנק ישראל, משוקללת עם נתונים אנונימיים שנתרמו על ידי לווים.
        השורה העליונה בכל תא היא הממוצע בשוק; השורה הירוקה היא מה שניתן להשיג במשא ומתן טוב.
      </p>
    </Card>
  );
}
