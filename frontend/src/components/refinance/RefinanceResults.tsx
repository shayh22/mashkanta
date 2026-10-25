import {
  explainVerdict,
  VERDICT_LABELS,
  type RefinanceComparison,
  type RefinanceVerdict,
  type RouteAnalysis,
} from '../../engine/refinance';
import { formatCurrency, formatPercent, formatSignedCurrency } from '../../lib/format';
import { TRACK_LABEL } from '../../lib/trackOptions';
import { Card, Stat } from '../ui';
import { BreakevenChart } from './BreakevenChart';

const VERDICT_STYLE: Record<RefinanceVerdict, { box: string; icon: string }> = {
  IMMEDIATE: { box: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800', icon: '✓' },
  LONG_TERM: { box: 'border-amber-500/30 bg-amber-500/10 text-amber-800', icon: '!' },
  NOT_WORTHWHILE: { box: 'border-rose-500/30 bg-rose-500/10 text-rose-800', icon: '✕' },
};

const ROUTE_NAME = { INTERNAL: 'מיחזור פנימי', EXTERNAL: 'בנק מתחרה' } as const;

function months(value: number): string {
  return value === 0 ? 'לא מושגת' : `חודש ${value}`;
}

/** The decision first, then the numbers behind it, then the fee detail. */
export function RefinanceResults({ comparison }: { comparison: RefinanceComparison }) {
  const best = comparison.best === 'EXTERNAL' ? comparison.external : comparison.internal;
  const style = VERDICT_STYLE[best.verdict];

  return (
    <div className="space-y-5">
      <section
        className={`animate-fade-up rounded-2xl border p-5 ${style.box}`}
        aria-live="polite"
        aria-label="המלצת מיחזור"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 text-lg font-bold" aria-hidden>
            {style.icon}
          </span>
          <div>
            <p className="text-xs font-medium opacity-80">הדרך המשתלמת יותר: {ROUTE_NAME[comparison.best]}</p>
            <h2 className="text-lg font-bold">{VERDICT_LABELS[best.verdict]}</h2>
            <p className="mt-1 text-sm">{explainVerdict(best)}</p>
          </div>
        </div>
      </section>

      <Card title="השוואת הדרכים">
        <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label="החזר חודשי היום" value={formatCurrency(best.currentPayment)} />
          <Stat
            label="החזר אחרי מיחזור"
            value={formatCurrency(best.proposedPayment)}
            note={`${formatSignedCurrency(-best.monthlySaving)} בחודש`}
            tone={best.monthlySaving > 0 ? 'positive' : 'negative'}
          />
          <Stat label="עלות ביום המעבר" value={formatCurrency(best.upfrontCost)} note="עמלות + עלויות מעבר" />
          <Stat
            label="ערך נוכחי נקי"
            value={formatSignedCurrency(best.netPresentValue)}
            tone={best.netPresentValue > 0 ? 'positive' : 'negative'}
          />
        </dl>

        <div className="-mx-1 mt-6 overflow-x-auto px-1">
          <table className="w-full min-w-[480px] text-sm">
            <caption className="sr-only">השוואת מיחזור פנימי מול מעבר לבנק מתחרה</caption>
            <thead>
              <tr className="border-b border-line text-xs text-ink-soft">
                <th className="py-2 text-start font-medium" scope="col">מדד</th>
                {(['internal', 'external'] as const).map((key) => (
                  <th key={key} className="py-2 text-start font-medium" scope="col">
                    {ROUTE_NAME[comparison[key].route.kind]}
                    {comparison.best === comparison[key].route.kind && (
                      <span className="badge-ok ms-2">עדיף</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-line/60">
              <Row label="החזר חודשי ראשון" pick={(a) => formatCurrency(a.proposedPayment)} comparison={comparison} />
              <Row label="חיסכון חודשי" pick={(a) => formatSignedCurrency(a.monthlySaving)} comparison={comparison} />
              <Row label="עמלות פירעון מוקדם" pick={(a) => formatCurrency(a.prepayment.total)} comparison={comparison} />
              <Row label="עלויות מעבר" pick={(a) => formatCurrency(a.switchingCost)} comparison={comparison} />
              <Row label="נקודת איזון" pick={(a) => months(a.breakevenMonth)} comparison={comparison} />
              <Row label="חיסכון כולל נטו" pick={(a) => formatSignedCurrency(a.lifetimeSaving)} comparison={comparison} />
              <Row label="ערך נוכחי נקי" pick={(a) => formatSignedCurrency(a.netPresentValue)} comparison={comparison} />
              <Row label="פסיקה" pick={(a) => VERDICT_LABELS[a.verdict]} comparison={comparison} />
            </tbody>
          </table>
        </div>
      </Card>

      <BreakevenChart comparison={comparison} />

      <FeeBreakdown analysis={best} />
    </div>
  );
}

function Row({
  label,
  pick,
  comparison,
}: {
  label: string;
  pick: (analysis: RouteAnalysis) => string;
  comparison: RefinanceComparison;
}) {
  return (
    <tr>
      <th className="py-2 text-start font-normal text-ink-muted" scope="row">
        {label}
      </th>
      <td className="py-2 font-medium text-ink">{pick(comparison.internal)}</td>
      <td className="py-2 font-medium text-ink">{pick(comparison.external)}</td>
    </tr>
  );
}

/** Every fee component per track, so the borrower can check the bank's own figure line by line. */
function FeeBreakdown({ analysis }: { analysis: RouteAnalysis }) {
  const quote = analysis.prepayment;
  const waits = quote.tracks.filter((track) => track.monthsToNextDiscount !== undefined);

  return (
    <Card
      title="פירוט עמלות הפירעון המוקדם"
      subtitle="לפי צו הבנקאות (פירעון מוקדם של הלוואה לדיור). עמלת ההיוון מחושבת מול הריבית הממוצעת שבנק ישראל מפרסם היום."
    >
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="tabular w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-soft">
              <th className="py-2 text-start font-medium" scope="col">מסלול</th>
              <th className="py-2 text-start font-medium" scope="col">יתרה</th>
              <th className="py-2 text-start font-medium" scope="col">ממוצע היום / ייחוס</th>
              <th className="py-2 text-start font-medium" scope="col">היוון (אחרי הנחה)</th>
              <th className="py-2 text-start font-medium" scope="col">אי-הודעה</th>
              <th className="py-2 text-start font-medium" scope="col">מדד ממוצע</th>
              <th className="py-2 text-start font-medium" scope="col">סה"כ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {quote.tracks.map((track) => (
              <tr key={track.id}>
                <th className="py-2 text-start font-medium text-ink" scope="row">
                  {TRACK_LABEL[track.type]}
                  {track.exemption && <span className="block text-xs font-normal text-ink-soft">{track.exemption}</span>}
                </th>
                <td className="py-2">{formatCurrency(track.balance)}</td>
                <td className="py-2">
                  {formatPercent(track.marketAverageRate)} / {formatPercent(track.referenceRate)}
                </td>
                <td className="py-2">
                  {formatCurrency(track.capitalizationFee)}
                  {track.seniorityDiscount > 0 && track.grossCapitalizationFee > 0 && (
                    <span className="block text-xs text-emerald-700">
                      הנחת ותק {formatPercent(track.seniorityDiscount, 0)} מתוך {formatCurrency(track.grossCapitalizationFee)}
                    </span>
                  )}
                </td>
                <td className="py-2">{formatCurrency(track.noticeFee)}</td>
                <td className="py-2">{formatCurrency(track.cpiFee)}</td>
                <td className="py-2 font-semibold text-ink">{formatCurrency(track.total)}</td>
              </tr>
            ))}
            <tr>
              <th className="py-2 text-start font-medium text-ink" scope="row">עמלה תפעולית</th>
              <td className="py-2" colSpan={5} />
              <td className="py-2 font-semibold text-ink">{formatCurrency(quote.operationalFee)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t border-line">
              <th className="py-2 text-start font-semibold text-ink" scope="row">סך העמלות</th>
              <td colSpan={5} />
              <td className="py-2 text-base font-bold text-ink">{formatCurrency(quote.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {waits.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-ink-muted">
          {waits.map((track) => (
            <li key={track.id}>
              ⏳ {TRACK_LABEL[track.type]}: בעוד {track.monthsToNextDiscount} חודשים ההנחה על עמלת ההיוון עולה ל-
              {formatPercent(track.nextDiscount ?? 0, 0)} — חיסכון של כ-
              {formatCurrency(
                track.grossCapitalizationFee * ((track.nextDiscount ?? 0) - track.seniorityDiscount),
              )}
              .
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
