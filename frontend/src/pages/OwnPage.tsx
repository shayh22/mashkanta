import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActionPlanReport } from '../components/ActionPlanReport';
import { Disclosure } from '../components/Disclosure';
import { MixExplainer } from '../components/MixExplainer';
import { DebtsTable, TermsCard } from '../components/consolidation/ConsolidationInputs';
import { DebtImporter } from '../components/consolidation/DebtImporter';
import { ConsolidationLoanCard, RecommendedMix } from '../components/own/RecommendedMix';
import { SummaryBar, type SummaryTone } from '../components/SummaryBar';
import { ExistingTracksEditor } from '../components/refinance/ExistingTracksEditor';
import { ProposalEditor, RefinanceSettings } from '../components/refinance/ProposalEditor';
import { TrackVerdicts } from '../components/refinance/TrackVerdicts';
import { Card, CurrencyField, LoadingCard, RangeField, SegmentedControl } from '../components/ui';
import { combinedPlan, refinancePlan } from '../engine/actionPlan';
import { priceMix } from '../engine/amortization';
import { positionFromMix } from '../engine/combined';
import { existingSpecs, offerToProposal, VERDICT_LABELS, type RefinanceVerdict } from '../engine/refinance';
import { ApprovalUploader } from '../components/ApprovalUploader';
import type { DocumentJob } from '../lib/types';
import { scenarioOf } from '../lib/api';
import { refinanceExplainRequest } from '../lib/explainRequest';
import { formatCurrency, formatSignedCurrency } from '../lib/format';
import { usePageTab, type PageTab } from '../lib/pageTabs';
import { bestRoute } from '../lib/routes';
import { useCombinedMove } from '../store/combinedStore';
import { useConsolidation, useConsolidationAnalysis } from '../store/consolidationStore';
import { useFlow, useHasDebts } from '../store/flowStore';
import { newTrackId, tracksValid, useRefinance } from '../store/refinanceStore';
import { useWizard } from '../store/wizardStore';

const loadDetails = () => import('../components/own/OwnDetails');
const FeesDetails = lazy(() => loadDetails().then((module) => ({ default: module.FeesDetails })));
const ConsolidationDetails = lazy(() => loadDetails().then((module) => ({ default: module.ConsolidationDetails })));
const MarketTrends = lazy(() => loadDetails().then((module) => ({ default: module.MarketTrends })));

const Charts = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<LoadingCard message="טוען…" />}>{children}</Suspense>
);

type Screen = 'data' | 'result';

const SCREENS: PageTab<Screen>[] = [
  { id: 'data', label: 'הנתונים שלי' },
  { id: 'result', label: 'התוצאה' },
];

const VERDICT_TONE: Record<RefinanceVerdict, SummaryTone> = {
  IMMEDIATE: 'positive',
  LONG_TERM: 'caution',
  NOT_WORTHWHILE: 'negative',
};

/**
 * For a homeowner, in two screens: what you have (the mortgage, any other loans, the household),
 * then the result — whether to move, the mix chosen for you, and what to do — with everything else
 * folded away underneath. Refinance alone or together with consolidation is decided by the inputs,
 * not by a choice of mode.
 */
export function OwnPage() {
  const [screen, setScreen] = usePageTab('own', SCREENS);
  const tracks = useRefinance((state) => state.tracks);
  const ready = tracksValid(tracks);

  useSyncPropertyToConsolidation();

  const go = (next: Screen) => {
    setScreen(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <ScreenSteps screen={screen} canSeeResult={ready} onSelect={go} />
      {screen === 'data' || !ready ? <DataScreen ready={ready} onDone={() => go('result')} /> : <ResultScreen onBack={() => go('data')} />}
    </div>
  );
}

/** Two steps, the current one marked; the result opens once the mortgage is complete. */
function ScreenSteps({
  screen,
  canSeeResult,
  onSelect,
}: {
  screen: Screen;
  canSeeResult: boolean;
  onSelect: (screen: Screen) => void;
}) {
  return (
    <ol className="no-print flex items-center gap-3" aria-label="שלבים">
      {SCREENS.map((item, index) => {
        const current = item.id === screen;
        return (
          <li key={item.id} className="flex flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              disabled={item.id === 'result' && !canSeeResult}
              aria-current={current ? 'step' : undefined}
              className="flex items-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  current ? 'bg-brand-600 text-on-brand' : 'bg-surface-sunken text-ink-soft'
                }`}
              >
                {index + 1}
              </span>
              <span className={current ? 'font-semibold text-ink' : 'text-ink-soft'}>{item.label}</span>
            </button>
            {index < SCREENS.length - 1 && <span className="h-px flex-1 bg-line" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The consolidation tests read the mortgage and the home's value; here both come from the mortgage
 * entered above, so they are copied across rather than typed twice.
 */
function useSyncPropertyToConsolidation() {
  const propertyValue = useRefinance((state) => state.propertyValue);
  const tracks = useRefinance((state) => state.tracks);
  const macro = useWizard((state) => state.macro);
  const property = useConsolidation((state) => state.property);
  const setProperty = useConsolidation((state) => state.setProperty);
  // Pricing the current mortgage alone is cheap; the full refinance analysis is not needed here.
  const position = useMemo(() => {
    const scenario = scenarioOf(macro);
    return tracksValid(tracks) ? positionFromMix(priceMix(existingSpecs(tracks, scenario), scenario)) : undefined;
  }, [tracks, macro]);

  useEffect(() => {
    const next = { value: propertyValue, ...position };
    const changed = (Object.keys(next) as (keyof typeof next)[]).some(
      (key) => Math.abs((property[key] ?? 0) - (next[key] ?? 0)) > 0.5,
    );
    if (changed) {
      setProperty(next);
    }
  }, [propertyValue, position, property, setProperty]);
}

function DataScreen({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const hasDebts = useHasDebts();
  const setHasDebts = useFlow((state) => state.setHasDebts);
  const analysis = useConsolidationAnalysis();

  return (
    <>
      <ExistingTracksEditor />

      <Card title="הלוואות נוספות" term="consolidation">
        <SegmentedControl
          label="יש לכם הלוואות נוספות (רכב, אשראי, מינוס)?"
          value={hasDebts ? 'yes' : 'no'}
          onChange={(value) => setHasDebts(value === 'yes')}
          options={[
            { value: 'no', title: 'אין' },
            { value: 'yes', title: 'יש', subtitle: 'נבדוק אם כדאי לאחד אותן' },
          ]}
        />
      </Card>
      {hasDebts && (
        <>
          <DebtImporter />
          <DebtsTable analysis={analysis} />
        </>
      )}

      <HouseholdCard />

      <div className="no-print flex justify-end">
        <button type="button" className="btn-primary" disabled={!ready} onClick={onDone}>
          לתוצאה <span aria-hidden>←</span>
        </button>
      </div>
      {!ready && <p className="text-end text-xs text-ink-soft">חסרים יתרה, ריבית או תקופה באחד המסלולים.</p>}
    </>
  );
}

/** Income and appetite for risk: what the engine needs to choose the mix. */
function HouseholdCard() {
  const netIncome = useConsolidation((state) => state.netIncome);
  const setNetIncome = useConsolidation((state) => state.setNetIncome);
  const profile = useWizard((state) => state.profile);
  const setProfile = useWizard((state) => state.setProfile);

  return (
    <Card title="משק הבית">
      <div className="grid gap-5 sm:grid-cols-2">
        <CurrencyField
          label="הכנסה חודשית נטו"
          hint="כולל בן/בת זוג"
          value={netIncome}
          min={5_000}
          max={150_000}
          step={500}
          onChange={setNetIncome}
          term="pti"
        />
        <RangeField
          label="נכונות לסיכון"
          value={profile.riskTolerance}
          min={1}
          max={10}
          step={1}
          display={`${profile.riskTolerance} / 10`}
          onChange={(value) => setProfile({ riskTolerance: value })}
          hint={profile.riskTolerance <= 3 ? 'מעדיפים החזר קבוע' : profile.riskTolerance >= 8 ? 'מוכנים לתנודות תמורת חיסכון' : 'איזון'}
        />
        <CurrencyField
          label="יכולת ספיגה חודשית"
          value={profile.volatilityCapacity}
          min={0}
          max={10_000}
          step={100}
          onChange={(value) => setProfile({ volatilityCapacity: value })}
          term="absorption"
        />
      </div>
    </Card>
  );
}

function ResultScreen({ onBack }: { onBack: () => void }) {
  const { comparison, proposal, ltv, perTrack, optimal, move, engine } = useCombinedMove();
  const tracks = useRefinance((state) => state.tracks);
  const setProposalMode = useRefinance((state) => state.setProposalMode);
  const importOffer = useRefinance((state) => state.importOffer);
  const [offering, setOffering] = useState(false);
  const [offerRead, setOfferRead] = useState<number>();
  // Stable, because the uploader reports a finished document from an effect that depends on it.
  const onOfferRead = useCallback(
    (job: DocumentJob) => {
      const read = offerToProposal(job.result?.tracks ?? [], tracks, newTrackId);
      if (read.length > 0) {
        importOffer(read);
        setOfferRead(read.length);
        requestAnimationFrame(() => document.getElementById('recommended-mix')?.scrollIntoView?.({ behavior: 'smooth' }));
      }
    },
    [tracks, importOffer],
  );
  const mode = useRefinance((state) => state.proposalMode);
  const noticeGiven = useRefinance((state) => state.noticeGiven);
  const riskTolerance = useWizard((state) => state.profile.riskTolerance);
  const macro = useWizard((state) => state.macro);
  const hasDebts = useHasDebts();
  const [editing, setEditing] = useState(false);
  // The folded sections draw charts; fetch them with the result so opening one, or printing, is instant.
  useEffect(() => {
    void loadDetails();
  }, []);

  const consolidating = hasDebts && !!move && move.combined.included.length > 0;
  const prime = scenarioOf(macro).primeAnnual;
  const plan = useMemo(() => {
    if (!comparison) {
      return undefined;
    }
    return consolidating && move
      ? combinedPlan(move, comparison, proposal, ltv, prime, noticeGiven)
      : refinancePlan(comparison, proposal, ltv, prime, noticeGiven);
  }, [comparison, consolidating, move, proposal, ltv, prime, noticeGiven]);
  const explainRequest = useMemo(
    () => comparison && refinanceExplainRequest(comparison, proposal, mode, ltv, scenarioOf(macro), riskTolerance),
    [comparison, proposal, mode, ltv, macro, riskTolerance],
  );

  if (!comparison) {
    return null;
  }
  const route = bestRoute(comparison);
  const today = consolidating ? move!.paymentToday : route.currentPayment;
  const after = consolidating ? move!.paymentAfter : route.proposedPayment;
  const blocked = consolidating && !move!.combined.regulation.feasible;
  const reveal = (id: string) =>
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  const openEditor = () => {
    setEditing(true);
    reveal('own-edit-mix');
  };
  const openOffer = () => {
    setOffering(true);
    reveal('own-offer');
  };


  return (
    <>
      <SummaryBar
        label="התוצאה"
        tone={blocked ? 'negative' : VERDICT_TONE[route.verdict]}
        eyebrow={consolidating ? 'מיחזור + איחוד הלוואות' : 'מיחזור המשכנתא'}
        title={blocked ? 'האיחוד בסכום הזה חורג מהוראה 329' : VERDICT_LABELS[route.verdict]}
        figures={[
          { label: 'החזר חודשי', value: formatCurrency(after), note: `היום ${formatCurrency(today)}` },
          {
            label: consolidating ? 'חמצן תזרימי' : 'חיסכון חודשי',
            value: formatSignedCurrency(today - after),
            tone: today - after > 0 ? 'positive' : 'negative',
            term: consolidating ? 'relief' : undefined,
          },
          {
            label: 'נקודת איזון',
            value: route.breakevenMonth > 0 ? `חודש ${route.breakevenMonth}` : 'אין',
            note: `עלות מעבר ${formatCurrency(route.upfrontCost)}`,
            term: 'breakeven',
          },
          {
            label: 'ערך נוכחי נקי',
            value: formatSignedCurrency(route.netPresentValue),
            tone: route.netPresentValue > 0 ? 'positive' : 'negative',
            term: 'npv',
          },
        ]}
      />

      <RecommendedMix
        proposal={proposal}
        route={route}
        mode={mode}
        onChange={openEditor}
        onOffer={openOffer}
        engine={engine}
        onUseEngine={() => setProposalMode('OPTIMAL')}
      />
      {consolidating && <ConsolidationLoanCard analysis={move!.combined} />}
      <MixExplainer request={explainRequest} />
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-soft">פרטים נוספים</h2>
        {plan && (
          <Disclosure title="מה עושים עכשיו — תוכנית פעולה" summary={plan.headline}>
            <ActionPlanReport plan={plan} />
          </Disclosure>
        )}
        <Disclosure
          id="own-offer"
          title="השוואה להצעה מהבנק"
          summary="העלו את הצעת המיחזור (PDF או צילום) — נשווה אותה לתמהיל שהמנוע בוחר"
          open={offering}
          onToggle={setOffering}
        >
          <ApprovalUploader ltv={ltv} onExtracted={onOfferRead} />
          {offerRead !== undefined && (
            <p className="text-sm text-positive" role="status">
              ✓ נקראו {offerRead} מסלולים מההצעה — היא מוצגת למעלה, מול בחירת המנוע.
            </p>
          )}
        </Disclosure>
        <Disclosure
          id="own-edit-mix"
          title="שינוי התמהיל"
          summary="בחירת המנוע, אותו תמהיל במחיר שוק, או הצעה שקיבלתם"
          open={editing}
          onToggle={setEditing}
        >
          <ProposalEditor proposal={proposal} optimal={optimal} />
          {consolidating && <TermsCard analysis={move!.combined} />}
        </Disclosure>
        <Disclosure title="עמלות ונקודת איזון" summary={`עלות מעבר ${formatCurrency(route.upfrontCost)}`}>
          <Charts>
            <FeesDetails comparison={comparison} ltv={ltv} />
          </Charts>
        </Disclosure>
        <Disclosure title="כדאיות לפי מסלול" summary={`${perTrack.filter((track) => track.worthwhile).length} מתוך ${perTrack.length} משתלמים למיחזור`}>
          <TrackVerdicts verdicts={perTrack} />
        </Disclosure>
        {consolidating && (
          <Disclosure title="האיחוד: רגולציה ותזרים" summary="הוראה 329, לפני ואחרי, איחוד בלבד מול משולב">
            <Charts>
              <ConsolidationDetails analysis={move!.combined} />
            </Charts>
          </Disclosure>
        )}
        <Disclosure title="הודעה מוקדמת ועלויות מעבר" summary="ניתנים לעריכה">
          <RefinanceSettings />
        </Disclosure>
        <Disclosure title="מגמות שוק" summary="ריביות ממוצעות בבנק ישראל">
          <Charts>
            <MarketTrends />
          </Charts>
        </Disclosure>
      </div>

      <div className="no-print">
        <button type="button" className="btn-ghost" onClick={onBack}>
          <span aria-hidden>→</span> עריכת הנתונים
        </button>
      </div>
    </>
  );
}
