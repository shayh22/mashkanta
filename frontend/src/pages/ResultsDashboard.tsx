import { Suspense, lazy, useEffect, useState } from 'react';
import type { BaselineResponse, OptimizationResponse } from '../lib/types';
import { formatCurrency, formatPercent, formatTerm } from '../lib/format';
import { AllocationTable, MixComparison } from '../components/MixComparison';
import { BankComparison } from '../components/BankComparisonCard';
import { CompliancePanel } from '../components/CompliancePanel';
import { ReportExportModal } from '../components/ReportExportModal';
import { MarketBaselinePanel } from '../components/MarketBaselinePanel';
import { Card, LoadingCard, Stat } from '../components/ui';
import { PageTabs, TabPanel } from '../components/PageTabs';
import { usePageTab, type PageTab } from '../lib/pageTabs';
import { usePrinting } from '../lib/printing';

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

type Section = 'mix' | 'payments' | 'rules' | 'market';

const TABS: PageTab<Section>[] = [
  { id: 'mix', label: 'התמהיל וההשוואה', icon: '🧩' },
  { id: 'payments', label: 'החזרים ותרחישים', icon: '📉' },
  { id: 'rules', label: 'רגולציה ותקופה', icon: '⚖️' },
  { id: 'market', label: 'בנקים ושוק', icon: '🏦' },
];

/** The results page: the recommendation stays on top; the evidence behind it is split into tabs. */
export function ResultsDashboard({
  result,
  baseline,
  onEdit,
}: {
  result: OptimizationResponse;
  baseline?: BaselineResponse;
  onEdit: () => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [section, setSection] = usePageTab('mortgage', TABS);
  const printing = usePrinting();
  // The charts sit on the second tab; fetch them now so a print from any tab has them ready.
  useEffect(() => {
    void loadAmortization();
    void loadScenarios();
  }, []);
  // Every section when printing, so a printed or saved report is complete.
  const shows = (id: Section) => printing || section === id;
  const { recommended, riskProfile } = result;
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
        title="התמהיל המומלץ עבורכם"
        subtitle={riskProfile.narrative}
        action={
          <div className="no-print flex gap-2">
            <button type="button" className="btn-ghost" onClick={onEdit}>
              עריכת הנתונים
            </button>
            <button type="button" className="btn-primary" onClick={() => setExportOpen(true)}>
              שיתוף וייצוא
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
            value={formatCurrency(recommended.summary.totalPaid)}
            note={`מתוכם ${formatCurrency(recommended.summary.totalCost)} ריבית והצמדה`}
          />
          <Stat
            label="ריבית כוללת מתואמת"
            value={formatPercent(recommended.summary.nominalIrr)}
            note={`ריאלית: ${formatPercent(recommended.summary.realIrr)}`}
          />
          <Stat
            label="חיסכון מול הסל היקר ביותר"
            value={formatCurrency(bestSaving)}
            tone={bestSaving > 0 ? 'positive' : 'neutral'}
            note={`על פני ${formatTerm(recommended.summary.termMonths)}`}
          />
        </dl>
        <p className="mt-4 text-xs text-ink-soft">
          נבחנו {result.candidatesEvaluated.toLocaleString('he-IL')} תמהילים חוקיים בתוך{' '}
          {result.computeMillis} מילישניות.
        </p>
      </Card>

      <PageTabs label="פירוט התוצאות" idPrefix="mortgage" tabs={TABS} active={section} onSelect={setSection} />
      <TabPanel idPrefix="mortgage" tabs={TABS} active={section} onSelect={setSection}>
        {shows('mix') && (
          <>
            <AllocationTable proposal={recommended} />
            <MixComparison recommended={recommended} baskets={result.baskets} savings={result.savings} />
          </>
        )}

        {shows('payments') && (
          <Suspense fallback={<LoadingCard message="טוען את הגרפים…" />}>
            <AmortizationChart yearly={recommended.summary.yearly} />
            <ScenarioSimulator stress={recommended.stress} capacity={riskProfile.volatilityCapacity} />
          </Suspense>
        )}

        {shows('rules') && (
          <>
            <CompliancePanel compliance={recommended.compliance} />
            <TermSensitivity options={result.termSensitivity} chosen={recommended.summary.termMonths} />
          </>
        )}

        {shows('market') && (
          <>
            <BankComparison quotes={result.bankQuotes} />
            {result.alternatives.length > 0 && (
              <Card
                title="חלופות ששקלנו"
                subtitle="תמהילים שונים מהותית מהמומלץ, אם תעדיפו איזון אחר בין עלות לתנודתיות."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  {result.alternatives.map((alternative) => (
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
            )}
            {baseline && <MarketBaselinePanel baseline={baseline} highlightLtv={recommended.compliance.ltv} />}
          </>
        )}
      </TabPanel>

      <p className="pb-8 text-center text-xs text-ink-soft">
        המידע באתר הוא כלי השוואה עצמאי המבוסס על נתונים ציבוריים בלבד ואינו מהווה ייעוץ פיננסי,
        ייעוץ משכנתאות או הצעה מחייבת מטעם גורם כלשהו.
      </p>

      <ReportExportModal result={result} open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
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
      subtitle="אותו תמהיל בדיוק, בתקופות שונות. קיצור התקופה מייקר את ההחזר החודשי ומוזיל דרמטית את העלות הכוללת."
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
