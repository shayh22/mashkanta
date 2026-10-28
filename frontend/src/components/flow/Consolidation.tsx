import { useEffect } from 'react';
import { positionFromMix } from '../../engine/combined';
import type { Answers, Goal } from '../../engine/flow/flow';
import { formatCurrency, formatPercent, formatTerm } from '../../lib/format';
import { isSampleDebts, useConsolidation, useConsolidationAnalysis } from '../../store/consolidationStore';
import { useMonthlyPicture } from '../../store/moneyStore';
import { useQuestionnaire } from '../../store/questionnaireStore';
import { useMortgageToday } from './outcomes';
import { Panel, Rows } from './parts';

/**
 * Folding the loans into the mortgage, in full: which loans the engine would fold in and why, the
 * new all-purpose loan against the home, what it does to the month and what it costs in all, and
 * whether it passes the Bank of Israel's tests — the share of income, the share of the home's value
 * and the variable part — as amended on 1.10.2026. It can join the decisions as one.
 */

const ACTIONS = { CONSOLIDATE: 'כדאי לאחד', KEEP: 'עדיף להשאיר', OPTIONAL: 'אפשר כך או כך' } as const;

/** The consolidation's view of the home and the mortgage, from the questionnaire's answers. */
function useSyncPosition(answers: Answers, goals: readonly Goal[]) {
  const hasMortgage = goals.includes('REFINANCE') || answers.hasMortgage === 'YES';
  const mortgage = useMortgageToday(answers, hasMortgage);
  const picture = useMonthlyPicture();
  const value = typeof answers.homeValue === 'number' ? answers.homeValue : undefined;
  const income = typeof answers.netIncome === 'number' ? answers.netIncome : picture?.income;
  useEffect(() => {
    const store = useConsolidation.getState();
    if (mortgage) {
      store.setProperty({ ...positionFromMix(mortgage.mix), ...(value ? { value } : {}), priorAllPurposeBalance: 0 });
    }
    if (income && income > 0) {
      store.setNetIncome(Math.round(income));
    }
  }, [mortgage, value, income]);
  return { ready: !!mortgage && !!value };
}

export function ConsolidationPanel({ answers, goals }: { answers: Answers; goals: readonly Goal[] }) {
  const { ready } = useSyncPosition(answers, goals);
  const debts = useConsolidation((state) => state.debts);
  const updateDebt = useConsolidation((state) => state.updateDebt);
  const applyRecommendations = useConsolidation((state) => state.applyRecommendations);
  const analysis = useConsolidationAnalysis();
  const counted = useQuestionnaire((state) => state.consolidate);
  const setCounted = useQuestionnaire((state) => state.setConsolidate);
  if (!ready || debts.length === 0 || isSampleDebts(debts)) {
    return null;
  }
  const r = analysis.regulation;
  const verdict = !r.feasible ? 'לא עומד בכללי בנק ישראל כפי שהוגדר' : !r.bankFeasible ? 'עומד בכללים, אבל מעל ה-40% שבנקים מאשרים בדרך כלל' : 'עומד בכללי בנק ישראל';
  const recommendation = (id: string) => analysis.recommendations.find((each) => each.id === id);
  const { allocation } = analysis;
  return (
    <Panel title="לאחד את ההלוואות לתוך המשכנתא">
      <p className="text-sm text-flow-muted">הלוואה לכל מטרה בשעבוד הדירה, שמחליפה את ההלוואות שתסמנו. ההחזר יורד, אבל התקופה ארוכה יותר.</p>
      <ul className="flex flex-col">
        {debts.map((debt) => {
          const advice = recommendation(debt.id);
          return (
            <li key={debt.id} className="border-b border-flow-line last:border-b-0">
              <label className="flex min-h-14 cursor-pointer items-start gap-3 py-2.5">
                <input
                  type="checkbox"
                  checked={debt.include}
                  onChange={() => updateDebt(debt.id, { include: !debt.include })}
                  className="mt-1 h-5 w-5 shrink-0 accent-[rgb(var(--flow-strong))]"
                />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-[15px] font-extrabold">
                    {debt.label}
                    {advice && <span className="rounded-full bg-flow-pick px-2 py-0.5 text-xs font-bold text-flow-strong">{ACTIONS[advice.action]}</span>}
                  </span>
                  <span className="text-sm tabular-nums text-flow-muted">
                    {formatCurrency(debt.balance)} · {formatPercent(debt.annualRate)} · {formatCurrency(debt.monthlyPayment)} בחודש
                  </span>
                  {advice?.reason && <span className="text-xs text-flow-muted">{advice.reason}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={() => applyRecommendations(allocation.blendedRate)} className="no-print min-h-11 self-start text-sm font-bold underline underline-offset-4">
        לסמן לפי ההמלצה
      </button>

      {analysis.included.length > 0 && (
        <>
          <Rows
            rows={[
              ['ההחזרים היום', formatCurrency(analysis.paymentBefore)],
              ['אחרי האיחוד', formatCurrency(analysis.paymentAfter), true],
              ['פנוי כל חודש', formatCurrency(analysis.monthlyRelief), true],
              ['ההלוואה החדשה', `${formatCurrency(allocation.amount)} · ${formatPercent(allocation.blendedRate)} · ${formatTerm(allocation.termMonths)}`],
              ['עולה יותר בסך הכל', formatCurrency(Math.max(0, analysis.extraLifetimeCost))],
            ]}
          />
          <section aria-label="כללי בנק ישראל" className={`flex flex-col gap-1.5 rounded-2xl p-3 ${r.feasible && r.bankFeasible ? 'bg-flow-pick' : 'bg-flow-accent/25'}`}>
            <span role="status" className="text-[15px] font-extrabold">
              {verdict}
            </span>
            <Rows
              rows={[
                ['החזרים מההכנסה', Number.isFinite(r.pti) ? formatPercent(r.pti, 1) : '—'],
                ['מימון מערך הדירה, אחרי', formatPercent(r.ltvAfter, 1)],
                ['הכי הרבה שאפשר לאחד', formatCurrency(r.maxFeasibleLoan)],
              ]}
            />
            {r.findings
              .filter((finding) => finding.level !== 'OK')
              .map((finding) => (
                <span key={finding.code} className="text-sm">
                  <b>{finding.title}</b> {finding.message}
                </span>
              ))}
          </section>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[15px] font-bold">
            <input type="checkbox" checked={counted} onChange={() => setCounted(!counted)} className="h-5 w-5 accent-[rgb(var(--flow-strong))]" />
            לכלול את האיחוד בהחלטות
          </label>
        </>
      )}
      <p className="text-xs leading-relaxed text-flow-muted">לפי הוראה 329 של בנק ישראל כפי שתוקנה ב-1.10.2026. הבנק בודק בעצמו; אינו ייעוץ.</p>
    </Panel>
  );
}
