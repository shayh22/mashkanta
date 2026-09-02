import type { OpportunityReport } from '../lib/types';
import { formatCurrency, formatPercent } from '../lib/format';
import { Card } from './ui';

/**
 * The verdict on an offer the borrower already holds: where it sits in the market, and what the
 * gap to a top-decile deal is worth in shekels over the life of the loan.
 */
export function OpportunityPanel({ opportunity }: { opportunity: OpportunityReport }) {
  const tone =
    opportunity.score >= 70 ? 'emerald' : opportunity.score >= 45 ? 'amber' : 'rose';
  const toneClasses = {
    emerald: 'from-emerald-500 to-emerald-600',
    amber: 'from-amber-500 to-amber-600',
    rose: 'from-rose-500 to-rose-600',
  } as const;

  return (
    <Card title="ניקוד ההצעה מול השוק" subtitle="השוואת הריביות שקיבלתם לחלוקת הריביות בפועל בשוק">
      <div className="flex flex-wrap items-center gap-5">
        <div
          className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full bg-gradient-to-br text-white ${toneClasses[tone]}`}
        >
          <span className="tabular text-3xl font-bold">{opportunity.score}</span>
          <span className="text-xs opacity-90">מתוך 100</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink">{opportunity.grade}</p>
          <p className="mt-1 text-sm text-ink-muted">{opportunity.narrative}</p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-ink-soft">ריבית משוקללת שקיבלתם</dt>
          <dd className="tabular mt-0.5 text-lg font-semibold text-ink">
            {formatPercent(opportunity.offeredWeightedRate)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">עשירון עליון בשוק</dt>
          <dd className="tabular mt-0.5 text-lg font-semibold text-emerald-600">
            {formatPercent(opportunity.bestWeightedRate)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">חיסכון פוטנציאלי</dt>
          <dd className="tabular mt-0.5 text-lg font-semibold text-emerald-600">
            {formatCurrency(opportunity.potentialSaving)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">הפרש בהחזר החודשי</dt>
          <dd className="tabular mt-0.5 text-lg font-semibold text-ink">
            {formatCurrency(opportunity.monthlySaving)}
          </dd>
        </div>
      </dl>

      {opportunity.tracks.length > 0 && (
        <ul className="mt-5 space-y-2">
          {opportunity.tracks.map((track) => (
            <li key={track.track} className="rounded-xl bg-slate-50 px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink">{track.hebrewName}</span>
                <span className="tabular text-sm text-ink-muted">
                  {formatPercent(track.offeredRate)} מול ממוצע {formatPercent(track.medianRate)}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full ${
                    track.percentile <= 0.35
                      ? 'bg-emerald-500'
                      : track.percentile <= 0.65
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.max(4, (1 - track.percentile) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {track.gapToMedian > 0
                  ? `יקר ב-${formatPercent(track.gapToMedian)} מהממוצע בשוק`
                  : `זול ב-${formatPercent(Math.abs(track.gapToMedian))} מהממוצע בשוק`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
