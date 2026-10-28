import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { stabilityOf } from '../../engine/flow/buyProfile';
import type { Answers } from '../../engine/flow/flow';
import { refinanceEstimate } from '../../engine/flow/refinancePlan';
import { VERDICT_LABELS } from '../../engine/refinance';
import { optimize } from '../../lib/api';
import { formatCurrency, formatPercent, formatSignedCurrency } from '../../lib/format';
import { bestRoute, ROUTE_NAME } from '../../lib/routes';
import { useConsolidation } from '../../store/consolidationStore';
import { useMarket } from '../../store/marketStore';
import { isSampleTracks, useRefinance, useRefinanceAnalysis } from '../../store/refinanceStore';
import { DEFAULT_PROFILE, useWizard } from '../../store/wizardStore';

/**
 * The homeowner's result. From the bank's report, the real thing: every track, the early-repayment
 * fee, the switching costs and the better of the two routes. From figures typed in, an estimate —
 * said to be one — with the way to the exact check.
 */
export function RefinanceResult({ answers, onEdit }: { answers: Answers; onEdit: (step: string) => void }) {
  const tracks = useRefinance((state) => state.tracks);
  return isSampleTracks(tracks) ? <Estimate answers={answers} onEdit={onEdit} /> : <Exact answers={answers} />;
}

/** The headline the household asked for: what the payment drops by, or what is saved over the loan. */
function Headline({ answers, monthly, lifetime }: { answers: Answers; monthly: number; lifetime: number }) {
  const byMonth = answers.refinanceGoal === 'LOWER_PAYMENT' || answers.refinanceGoal === undefined;
  if (monthly < 1 && lifetime < 1) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-bold text-flow-muted">מיחזור</span>
        <h3 id="refinance-result" className="text-[32px] font-black leading-tight">
          לא משתלם כרגע
        </h3>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[15px] font-bold text-flow-muted">{byMonth ? 'ההחזר החודשי יורד ב-' : 'חוסכים לאורך כל התקופה'}</span>
      <h3 id="refinance-result" className="text-[48px] font-black leading-none tracking-tight">
        {formatCurrency(byMonth ? monthly : lifetime)}
      </h3>
      <span className="text-[15px] text-flow-muted">
        {byMonth ? `${formatSignedCurrency(lifetime)} לאורך כל התקופה` : `${formatSignedCurrency(monthly)} בחודש`}
      </span>
    </div>
  );
}

/** Today's payment beside the one after, as two bars. */
function TodayAfter({ today, after }: { today: number; after: number }) {
  const top = Math.max(today, after, 1);
  return (
    <div role="img" aria-label={`היום ${formatCurrency(today)}, אחרי ${formatCurrency(after)}`} className="flex flex-col gap-2.5 rounded-[20px] bg-flow-card p-4">
      {[
        { label: 'היום', value: today, color: 'bg-flow-muted/60' },
        { label: 'אחרי', value: after, color: 'bg-flow-strong' },
      ].map((bar) => (
        <div key={bar.label} className="flex items-center gap-3">
          <span className="w-10 shrink-0 text-sm font-bold">{bar.label}</span>
          <span className="h-7 flex-1">
            <span className={`block h-full rounded-lg ${bar.color}`} style={{ width: `${(bar.value / top) * 100}%` }} />
          </span>
          <span className="w-20 shrink-0 text-left text-sm font-extrabold tabular-nums">{formatCurrency(bar.value)}</span>
        </div>
      ))}
    </div>
  );
}

function Facts({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="flex flex-col overflow-hidden rounded-[20px] bg-flow-card">
      {rows.map(([label, value]) => (
        <div key={label} className="flex min-h-14 items-center justify-between gap-3 border-b border-flow-line px-4 last:border-b-0">
          <dt className="text-[15px] font-bold">{label}</dt>
          <dd className="text-[15px] font-extrabold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Actions({ share }: { share: string }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <a href="#/own/result" className="flex min-h-[52px] items-center justify-center rounded-full border-2 border-flow-ink px-3 text-base font-extrabold">
        כל הפרטים
      </a>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(share)}`}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-[52px] items-center justify-center rounded-full border-2 border-flow-ink px-3 text-base font-extrabold"
      >
        שיתוף בוואטסאפ
      </a>
    </div>
  );
}

/** From the uploaded report: the homeowner path's own analysis, with the questionnaire's answers in it. */
function Exact({ answers }: { answers: Answers }) {
  // The answers are the household's, entered once: the home's value, the income and the appetite for risk.
  useEffect(() => {
    if (typeof answers.homeValue === 'number') {
      useRefinance.getState().setPropertyValue(answers.homeValue);
    }
    if (typeof answers.netIncome === 'number') {
      useConsolidation.getState().setNetIncome(answers.netIncome);
    }
    const stability = stabilityOf(answers);
    const wizard = useWizard.getState();
    wizard.setProfile({ riskTolerance: stability.riskTolerance });
    wizard.setPreferences(stability.primePreference, stability.stablePreference, stability.dynamicPreference);
  }, [answers]);
  const { comparison } = useRefinanceAnalysis();
  if (!comparison) {
    return null;
  }
  const route = bestRoute(comparison);
  const breakeven = route.breakevenMonth > 0 ? `${route.breakevenMonth} חודשים` : 'לא מחזיר את עצמו';
  return (
    <section aria-label="המיחזור" className="flex flex-col gap-3.5">
      <Headline answers={answers} monthly={route.monthlySaving} lifetime={route.lifetimeSaving} />
      <span className="self-start rounded-full bg-flow-pick px-3 py-1 text-sm font-bold text-flow-strong">{VERDICT_LABELS[route.verdict]}</span>
      <TodayAfter today={route.currentPayment} after={route.proposedPayment} />
      <Facts
        rows={[
          ['הדרך המשתלמת', ROUTE_NAME[comparison.best]],
          ['עלות המעבר, כולל עמלות', formatCurrency(route.upfrontCost)],
          ['מחזיר את עצמו תוך', breakeven],
        ]}
      />
      <Actions
        share={[
          'בדיקת המיחזור שלי מ"מפתח כלכלי":',
          `החזר היום ${formatCurrency(route.currentPayment)}, אחרי ${formatCurrency(route.proposedPayment)}`,
          `עלות המעבר ${formatCurrency(route.upfrontCost)} · ${VERDICT_LABELS[route.verdict]}`,
        ].join('\n')}
      />
      <p className="text-xs leading-relaxed text-flow-muted">לפי דוח היתרות וריביות השוק של בנק ישראל. אינו ייעוץ ואינו הצעה של בנק.</p>
    </section>
  );
}

/** From figures typed in: the rate they imply, against the engine's mix for the same balance and term. */
function Estimate({ answers, onEdit }: { answers: Answers; onEdit: (step: string) => void }) {
  const macro = useWizard((state) => state.macro);
  const market = useMarket((state) => state.version);
  const estimate = useMemo(() => refinanceEstimate(answers, DEFAULT_PROFILE), [answers]);
  const profile = estimate?.kind === 'ESTIMATE' ? estimate.profile : undefined;
  const result = useQuery({
    queryKey: ['flow-refinance', profile, macro, market],
    queryFn: () => optimize(profile!, macro, 0.5),
    enabled: !!profile,
    staleTime: Infinity,
    retry: false,
  });

  if (!estimate) {
    // Typed in nothing to estimate from: the report was put off.
    return (
      <section aria-label="המיחזור" className="flex flex-col gap-3 rounded-[20px] bg-flow-card p-5">
        <h3 id="refinance-result" className="text-[24px] font-black leading-tight">
          לבדיקת המיחזור חסרים פרטי המשכנתא
        </h3>
        <button type="button" onClick={() => onEdit('mortgageHow')} className="min-h-12 self-start rounded-full bg-flow-strong px-5 text-base font-extrabold text-flow-on-strong">
          להשלים
        </button>
      </section>
    );
  }
  if (estimate.kind === 'IMPLAUSIBLE') {
    return (
      <section aria-label="המיחזור" role="alert" className="flex flex-col gap-2 rounded-[20px] bg-flow-accent/25 p-5">
        <h3 id="refinance-result" className="text-[22px] font-black leading-tight">
          ההחזר והיתרה לא מסתדרים
        </h3>
        <p className="text-[15px]">בהחזר הזה היתרה לא נפרעת בזמן שנשאר. בדקו את המספרים, או העלו את דוח היתרות.</p>
        <button type="button" onClick={() => onEdit('mortgageHow')} className="min-h-11 self-start font-bold underline underline-offset-4">
          לבדוק את המספרים
        </button>
      </section>
    );
  }
  const { current } = estimate;
  const proposed = result.data?.recommended.summary;
  return (
    <section aria-label="המיחזור" className="flex flex-col gap-3.5">
      {result.isPending && (
        <p role="status" className="rounded-[20px] bg-flow-card p-5 text-base text-flow-muted">
          בודק מה השוק מציע לכם…
        </p>
      )}
      {result.isError && (
        <p role="alert" className="rounded-[20px] bg-flow-card p-5 text-base text-negative">
          החישוב לא הצליח.
        </p>
      )}
      {proposed && (
        <>
          <Headline
            answers={answers}
            monthly={current.payment - proposed.initialPayment}
            lifetime={current.payment * current.months - proposed.totalPaid}
          />
          <TodayAfter today={current.payment} after={proposed.initialPayment} />
          <Facts
            rows={[
              ['הריבית שלכם, בערך', formatPercent(current.rate)],
              ['תמהיל חדש היום', formatPercent(proposed.weightedInitialRate)],
            ]}
          />
          <div className="flex flex-col gap-1.5 rounded-2xl bg-flow-accent/25 p-3.5 text-[15px]">
            <span className="font-extrabold">הערכה ממה שמילאתם</span>
            <span>בלי עמלת פירעון מוקדם ועלויות מעבר: הן תלויות בכל מסלול. עם דוח היתרות נחשב בדיוק.</span>
            <button type="button" onClick={() => onEdit('mortgageHow')} className="min-h-11 self-start font-bold underline underline-offset-4">
              להעלות את הדוח
            </button>
          </div>
          <Actions
            share={[
              'הערכת המיחזור שלי מ"מפתח כלכלי":',
              `החזר היום ${formatCurrency(current.payment)}, בתמהיל חדש ${formatCurrency(proposed.initialPayment)}`,
              `ריבית בערך ${formatPercent(current.rate)} מול ${formatPercent(proposed.weightedInitialRate)} היום`,
            ].join('\n')}
          />
        </>
      )}
    </section>
  );
}
