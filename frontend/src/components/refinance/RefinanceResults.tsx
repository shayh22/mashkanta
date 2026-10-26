import {
  explainVerdict,
  VERDICT_LABELS,
  type RefinanceComparison,
  type RefinanceVerdict,
  type RouteAnalysis,
} from '../../engine/refinance';
import { formatCurrency, formatPercent, formatSignedCurrency } from '../../lib/format';
import { bestRoute, ROUTE_NAME } from '../../lib/routes';
import { TRACK_LABEL } from '../../lib/trackOptions';
import { ScrollRegion, Card, Stat } from '../ui';
import { BreakevenChart } from './BreakevenChart';
import { WaterfallChart } from '../charts/WaterfallChart';
import { RiskPanel } from '../charts/RiskGauge';
import { cpiRisk, ltvRisk, primeRisk } from '../../engine/risk';
import { TRACKS } from '../../engine/tracks';
import type { TrackType } from '../../lib/types';
import type { WaterfallStep } from '../../lib/waterfall';

const VERDICT_STYLE: Record<RefinanceVerdict, { box: string; icon: string }> = {
  IMMEDIATE: { box: 'border-emerald-500/30 bg-emerald-500/10 text-positive', icon: '✓' },
  LONG_TERM: { box: 'border-amber-500/30 bg-amber-500/10 text-caution', icon: '!' },
  NOT_WORTHWHILE: { box: 'border-rose-500/30 bg-rose-500/10 text-negative', icon: '✕' },
};


function months(value: number): string {
  return value === 0 ? 'לא מושגת' : `חודש ${value}`;
}

/** The verdict and its reasoning, at the head of the results. */
export function RefinanceVerdict({ comparison }: { comparison: RefinanceComparison }) {
  const best = bestRoute(comparison);
  const style = VERDICT_STYLE[best.verdict];
  return (
    <section
      className={`animate-fade-up rounded-2xl border p-5 ${style.box}`}
      aria-live="polite"
      aria-label="המלצת מיחזור"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface/70 text-lg font-bold" aria-hidden>
          {style.icon}
        </span>
        <div>
          <p className="text-xs font-medium">הדרך המשתלמת יותר: {ROUTE_NAME[comparison.best]}</p>
          <h2 className="text-lg font-bold">{VERDICT_LABELS[best.verdict]}</h2>
          <p className="mt-1 text-sm">{explainVerdict(best)}</p>
        </div>
      </div>
    </section>
  );
}

/** Refinancing at the current bank against moving to a competitor, figure by figure. */
export function RouteComparison({ comparison }: { comparison: RefinanceComparison }) {
  const best = bestRoute(comparison);
  return (
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

      <ScrollRegion label="השוואת הדרכים" className="mt-6">
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
      </ScrollRegion>
    </Card>
  );
}

/** Where the saving comes from and how the new mix carries risk. */
export function RefinanceCharts({ comparison, ltv }: { comparison: RefinanceComparison; ltv: number }) {
  const best = bestRoute(comparison);
  return (
    <>
      <BreakevenChart comparison={comparison} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <WaterfallChart
            title="ההחזר החודשי — לפני ואחרי"
            subtitle={`המעבר מההחזר היום להחזר אחרי ${ROUTE_NAME[comparison.best]}, מסלול אחר מסלול.`}
            start={best.currentPayment}
            steps={trackSteps(best)}
            endLabel="אחרי מיחזור"
          />
        </div>
        <div className="min-w-0">
          <RiskPanel
            title="מד סיכון — התמהיל החדש"
            indicators={[
              ltvRisk(ltv),
              primeRisk(shareOf(best, (type) => TRACKS[type].variableRate)),
              cpiRisk(shareOf(best, (type) => TRACKS[type].cpiLinked)),
            ]}
          />
        </div>
      </div>
    </>
  );
}

/** The fee breakdown for the better route. */
export function RefinanceFees({ comparison }: { comparison: RefinanceComparison }) {
  return <FeeBreakdown analysis={bestRoute(comparison)} />;
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
      term="prepaymentFee"
    >
      <ScrollRegion label="טבלה">
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
                  {track.source === 'BANK' && <span className="badge-neutral ms-1.5">דוח הבנק</span>}
                  {track.exemption && <span className="block text-xs font-normal text-ink-soft">{track.exemption}</span>}
                </th>
                <td className="py-2">{formatCurrency(track.balance)}</td>
                <td className="py-2">
                  {formatPercent(track.marketAverageRate)} / {formatPercent(track.referenceRate)}
                </td>
                <td className="py-2">
                  {formatCurrency(track.capitalizationFee)}
                  {track.seniorityDiscount > 0 && track.grossCapitalizationFee > 0 && (
                    <span className="block text-xs text-positive">
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
      </ScrollRegion>

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

/** Share of the replacement mix's principal in tracks matching the predicate. */
function shareOf(analysis: RouteAnalysis, predicate: (type: TrackType) => boolean): number {
  const total = analysis.proposed.totalPrincipal;
  if (total <= 0) {
    return 0;
  }
  return analysis.proposed.tracks.filter((track) => predicate(track.type)).reduce((sum, track) => sum + track.amount, 0) / total;
}

/** The change in first-month payment per track type, current against proposed. */
function trackSteps(analysis: RouteAnalysis): WaterfallStep[] {
  const byType = new Map<TrackType, number>();
  for (const track of analysis.current.tracks) {
    byType.set(track.type, (byType.get(track.type) ?? 0) - track.initialPayment);
  }
  for (const track of analysis.proposed.tracks) {
    byType.set(track.type, (byType.get(track.type) ?? 0) + track.initialPayment);
  }
  return [...byType.entries()].map(([type, delta]) => ({ label: TRACK_LABEL[type], delta }));
}
