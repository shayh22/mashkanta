import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import type { BaselineResponse, MixProposal, OptimizationResponse } from '../lib/types';
import { formatCurrency, formatPercent, formatSignedCurrency, formatTerm } from '../lib/format';
import { MixExplainer } from '../components/MixExplainer';
import { mortgageExplainRequest } from '../lib/explainRequest';
import { useWizard } from '../store/wizardStore';
import { AllocationTable, MixComparison } from '../components/MixComparison';
import { BankComparison } from '../components/BankComparisonCard';
import { CompliancePanel } from '../components/CompliancePanel';
import { ReportExportModal } from '../components/ReportExportModal';
import { MarketBaselinePanel } from '../components/MarketBaselinePanel';
import { Card, LoadingCard, Stat } from '../components/ui';
import { Disclosure } from '../components/Disclosure';

// The charting library is a third of the whole bundle and is only ever reached here, so it is
// split out and fetched while the borrower is reading the headline numbers above it.
const loadAmortization = () => import('../components/AmortizationChart');
const loadScenarios = () => import('../components/ScenarioSimulator');
const AmortizationChart = lazy(() => loadAmortization().then((module) => ({ default: module.AmortizationChart })));
const ScenarioSimulator = lazy(() => loadScenarios().then((module) => ({ default: module.ScenarioSimulator })));

const RELAXED_LABELS: Record<string, string> = {
  VOLATILITY_CAPACITY: 'יכולת הספיגה שהצהרתם עליה — לא נמצא תמהיל שעומד בה',
  PAYMENT_TO_INCOME: 'מגבלת ההחזר מההכנסה — אין תמהיל שנכנס לתקרה של 40%',
  NO_FEASIBLE_MIX: 'לא נמצא תמהיל חוקי כלל בסכום ובתקופה שהוזנו',
};

/** The results page: the mix and its figures on top; the evidence behind them folded away underneath. */
export function ResultsDashboard({
  result,
  baseline,
  onEdit,
  onAdoptEngineMix,
}: {
  result: OptimizationResponse;
  baseline?: BaselineResponse;
  onEdit: () => void;
  /** For a hand-built mix: re-run with the engine choosing. */
  onAdoptEngineMix?: () => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  // The charts sit in a closed section; fetch them now so opening it, or printing, is instant.
  useEffect(() => {
    void loadAmortization();
    void loadScenarios();
  }, []);
  const { recommended, riskProfile, engineOptimum } = result;
  const manual = result.mode === 'MANUAL';
  const profile = useWizard((state) => state.profile);
  const explainRequest = useMemo(() => mortgageExplainRequest(result, profile), [result, profile]);
  const bestSaving = result.savings.reduce(
    (best, saving) => (saving.totalPaidSaving > best ? saving.totalPaidSaving : best),
    0,
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      {result.relaxedConstraints.length > 0 && (
        <div className="card border-amber-500/30 bg-amber-500/10" role="alert">
          <h2 className="text-sm font-semibold text-caution">לא כל האילוצים ניתנים לקיום</h2>
          <p className="mt-1 text-sm text-caution">
            כדי למצוא תמהיל כלשהו נאלצנו לוותר על האילוצים הבאים. התוצאה שלהלן אינה מייצגת הלוואה
            שניתן לאשר כמות שהיא:
          </p>
          <ul className="mt-2 list-inside list-disc text-sm text-caution">
            {result.relaxedConstraints.map((constraint) => (
              <li key={constraint}>{RELAXED_LABELS[constraint] ?? constraint}</li>
            ))}
          </ul>
        </div>
      )}

      <Card
        title={manual ? 'התמהיל שבניתם' : 'התמהיל המומלץ עבורכם'}
        subtitle={manual ? undefined : riskProfile.narrative}
        action={
          <div className="no-print flex gap-2">
            <button type="button" className="btn-ghost" onClick={onEdit}>
              עריכה
            </button>
            <button type="button" className="btn-primary" onClick={() => setExportOpen(true)}>
              שיתוף
            </button>
          </div>
        }
      >
        <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat
            label="החזר חודשי ראשוני"
            value={formatCurrency(recommended.summary.initialPayment)}
            note={`שיא צפוי: ${formatCurrency(recommended.summary.maxPayment)}`}
          />
          <Stat
            label="עלות כוללת"
            term="totalCost"
            value={formatCurrency(recommended.summary.totalPaid)}
            note={`מתוכם ${formatCurrency(recommended.summary.totalCost)} ריבית והצמדה`}
          />
          <Stat
            label="ריבית כוללת מתואמת"
            term="irr"
            value={formatPercent(recommended.summary.nominalIrr)}
            note={`ריאלית: ${formatPercent(recommended.summary.realIrr)}`}
          />
          <Stat
            label="חיסכון מול הסל היקר"
            value={formatCurrency(bestSaving)}
            tone={bestSaving > 0 ? 'positive' : 'neutral'}
            note={`על פני ${formatTerm(recommended.summary.termMonths)}`}
          />
        </dl>
        {manual && engineOptimum && (
          <EngineYardstick mine={recommended} engine={engineOptimum} onAdopt={onAdoptEngineMix} />
        )}
        <p className="mt-4 text-xs text-ink-soft">
          {manual ? 'לצורך ההשוואה המנוע בחן ' : 'נבחנו '}
          {result.candidatesEvaluated.toLocaleString('he-IL')} תמהילים חוקיים בתוך {result.computeMillis} מילישניות.
        </p>
      </Card>

      <AllocationTable proposal={recommended} />

      <MixExplainer request={explainRequest} />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-soft">פרטים נוספים</h2>
        <Disclosure title="השוואה לסלים האחידים" summary={manual ? 'מול בחירת המנוע ושלושת הסלים' : 'מול שלושת הסלים שכל בנק חייב להציע'}>
          <MixComparison
            recommended={recommended}
            baskets={result.baskets}
            savings={result.savings}
            engineOptimum={engineOptimum}
          />
        </Disclosure>
        <Disclosure title="החזרים ותרחישי קיצון" summary={`החזר שיא ${formatCurrency(recommended.summary.maxPayment)}`}>
          <Suspense fallback={<LoadingCard message="טוען את הגרפים…" />}>
            <AmortizationChart yearly={recommended.summary.yearly} />
            <ScenarioSimulator stress={recommended.stress} capacity={riskProfile.volatilityCapacity} />
          </Suspense>
        </Disclosure>
        <Disclosure title="רגולציה ותקופה" summary="הוראה 329 והשפעת אורך ההלוואה">
          <CompliancePanel compliance={recommended.compliance} />
          <TermSensitivity options={result.termSensitivity} chosen={recommended.summary.termMonths} />
        </Disclosure>
        <Disclosure title="בנקים ושוק" summary="אותו תמהיל בכל בנק, וממוצעי השוק">
          <BankComparison quotes={result.bankQuotes} />
          {result.alternatives.length > 0 && <Alternatives alternatives={result.alternatives} />}
          {baseline && <MarketBaselinePanel baseline={baseline} highlightLtv={recommended.compliance.ltv} />}
        </Disclosure>
      </div>

      <ReportExportModal result={result} open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}

/** Mixes that differ materially from the recommendation, for a different balance of cost and risk. */
function Alternatives({ alternatives }: { alternatives: OptimizationResponse['alternatives'] }) {
  return (
    <Card
      title="חלופות ששקלנו"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {alternatives.map((alternative) => (
          <article key={alternative.id} className="rounded-2xl border border-line p-4">
            <h3 className="text-sm font-semibold text-ink">{alternative.name}</h3>
            <ul className="mt-2 space-y-1 text-xs text-ink-muted">
              {alternative.summary.allocations.map((allocation) => (
                <li key={allocation.track}>
                  {allocation.hebrewName}: {formatPercent(allocation.share, 0)} בריבית{' '}
                  {formatPercent(allocation.annualRate)}
                </li>
              ))}
            </ul>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-ink-soft">החזר ראשוני</dt>
                <dd className="tabular text-sm font-semibold text-ink">
                  {formatCurrency(alternative.summary.initialPayment)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">עלות כוללת</dt>
                <dd className="tabular text-sm font-semibold text-ink">
                  {formatCurrency(alternative.summary.totalPaid)}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </Card>
  );
}

/** A hand-built mix measured against what the engine would have chosen for the same borrower. */
function EngineYardstick({
  mine,
  engine,
  onAdopt,
}: {
  mine: MixProposal;
  engine: MixProposal;
  onAdopt?: () => void;
}) {
  const costGap = mine.summary.totalPaid - engine.summary.totalPaid;
  const paymentGap = mine.summary.initialPayment - engine.summary.initialPayment;
  const peakGap = mine.summary.maxPayment - engine.summary.maxPayment;
  const close = Math.abs(costGap) < 1_000;

  return (
    <section
      aria-label="השוואה לבחירת המנוע"
      className={`mt-5 rounded-xl border p-4 text-sm ${close || costGap < 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/10'}`}
    >
      <p className="font-medium text-ink">
        {close
          ? '✓ התמהיל שלכם כמעט זהה בעלותו לבחירת המנוע.'
          : costGap > 0
            ? `המנוע מצא תמהיל זול ב-${formatCurrency(costGap)} לאורך כל התקופה.`
            : `התמהיל שלכם זול ב-${formatCurrency(-costGap)} מבחירת המנוע — בדרך כלל במחיר של יותר תנודתיות או חריגה מההעדפות.`}
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        החזר ראשוני {formatSignedCurrency(paymentGap)} · החזר שיא {formatSignedCurrency(peakGap)} לעומת המנוע. בחירת
        המנוע:{' '}
        {engine.summary.allocations.map((allocation) => `${allocation.hebrewName} ${formatPercent(allocation.share, 0)}`).join(' · ')}
      </p>
      {onAdopt && !close && (
        <button type="button" className="btn-ghost no-print mt-3" onClick={onAdopt}>
          מעבר לתמהיל של המנוע
        </button>
      )}
    </section>
  );
}

/** The same mix at 15, 20, 25 and 30 years — the single biggest lever on total cost. */
function TermSensitivity({
  options,
  chosen,
}: {
  options: OptimizationResponse['termSensitivity'];
  chosen: number;
}) {
  const cheapest = options.reduce(
    (best, option) => (option.totalPaid < best.totalPaid ? option : best),
    options[0]!,
  );

  return (
    <Card
      title="השפעת התקופה"
      subtitle="אותו תמהיל, תקופות שונות"
    >
      <div className="overflow-x-auto" role="region" aria-label="טבלה" tabIndex={0}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-soft">
              <th className="py-2 text-start font-medium">תקופה</th>
              <th className="py-2 text-start font-medium">החזר חודשי</th>
              <th className="py-2 text-start font-medium">עלות כוללת</th>
              <th className="py-2 text-start font-medium">מול התקופה שנבחרה</th>
              <th className="py-2 text-start font-medium">כשירות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {options.map((option) => {
              const selected = option.termMonths === chosen;
              const chosenOption = options.find((entry) => entry.termMonths === chosen);
              const delta = chosenOption ? option.totalPaid - chosenOption.totalPaid : 0;
              return (
                <tr key={option.termMonths} className={selected ? 'bg-brand-50/50' : undefined}>
                  <td className="py-2.5 font-medium text-ink">
                    {formatTerm(option.termMonths)}
                    {selected && <span className="badge-neutral ms-2">נבחר</span>}
                    {option.termMonths === cheapest.termMonths && !selected && (
                      <span className="badge-ok ms-2">הזול ביותר</span>
                    )}
                  </td>
                  <td className="tabular py-2.5">{formatCurrency(option.initialPayment)}</td>
                  <td className="tabular py-2.5">{formatCurrency(option.totalPaid)}</td>
                  <td className={`tabular py-2.5 ${delta < 0 ? 'text-positive' : 'text-ink-soft'}`}>
                    {delta === 0 ? '—' : formatCurrency(delta)}
                  </td>
                  <td className="py-2.5">
                    {option.affordable ? (
                      <span className="badge-ok">בתוך יחס ההחזר</span>
                    ) : (
                      <span className="badge-danger">מעל 40% מההכנסה</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
