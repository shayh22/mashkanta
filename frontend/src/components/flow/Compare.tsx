import type { Answers } from '../../engine/flow/flow';
import type { RefinanceComparison } from '../../engine/refinance';
import { VERDICT_LABELS } from '../../engine/refinance';
import { formatCurrency, formatPercent } from '../../lib/format';
import { bestRoute, ROUTE_NAME } from '../../lib/routes';
import type { OptimizationResponse } from '../../lib/types';
import { isSampleTracks, useRefinance, useRefinanceAnalysis } from '../../store/refinanceStore';
import { useBuyResult, useRefinanceEstimate } from './hooks';
import { Panel, Rows } from './parts';

/**
 * The banks side by side: for the mix the engine chose, what each bank's rates make of it — the
 * first payment and what it costs over the loan above the cheapest — and, for a refinance, the
 * two ways to do it.
 */

/** Each bank's price for the same mix, cheapest first. */
function BankRanking({ title, data }: { title: string; data: OptimizationResponse }) {
  const banks = [...data.bankQuotes].sort((a, b) => a.rank - b.rank);
  if (banks.length === 0) {
    return null;
  }
  const top = Math.max(1, ...banks.map((bank) => bank.costAboveBest));
  return (
    <Panel title={title}>
      <ul className="flex flex-col">
        {banks.map((bank, index) => (
          <li key={bank.code} className="flex flex-col gap-1 border-b border-flow-line py-2.5 last:border-b-0">
            <span className="flex items-center justify-between gap-2 text-[15px]">
              <span className="font-extrabold">{bank.hebrewName}</span>
              <span className="font-bold tabular-nums">
                {formatPercent(bank.weightedRate)} · {formatCurrency(bank.initialPayment)}
              </span>
            </span>
            {index === 0 ? (
              <span className="text-sm font-bold text-flow-strong">הזול לתמהיל הזה</span>
            ) : (
              <span className="flex items-center gap-2 text-sm text-flow-muted">
                <span aria-hidden className="h-1.5 w-16 shrink-0 rounded-full bg-flow-pick">
                  <span className="block h-full rounded-full bg-flow-accent" style={{ width: `${(bank.costAboveBest / top) * 100}%` }} />
                </span>
                יקר ב-{formatCurrency(bank.costAboveBest)} לאורך התקופה
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-flow-muted">ריבית משוקללת והחזר ראשון, לפי הריביות שכל בנק דיווח לבנק ישראל. ההצעה בפועל נקבעת מול הבנק.</p>
    </Panel>
  );
}

export function BuyBanks({ answers }: { answers: Answers }) {
  const { plan, result } = useBuyResult(answers);
  const data = result.data;
  if (plan?.kind !== 'LOAN') {
    return null;
  }
  if (!data) {
    return (
      <p role="status" className="rounded-[20px] bg-flow-card p-5 text-base text-flow-muted">
        {result.isError ? 'החישוב לא הצליח.' : 'משווה בין הבנקים…'}
      </p>
    );
  }
  return (
    <>
      <BankRanking title="הבנקים, לתמהיל הזה" data={data} />
      {data.savings.length > 0 && (
        <Panel title="מול הסלים האחידים של הבנקים">
          <Rows
            rows={data.savings.map((saving) => [
              saving.againstName,
              saving.totalPaidSaving >= 0 ? `חוסך ${formatCurrency(saving.totalPaidSaving)}` : `יקר ב-${formatCurrency(-saving.totalPaidSaving)}`,
            ])}
          />
        </Panel>
      )}
    </>
  );
}

export function RefinanceBanks({ answers }: { answers: Answers }) {
  const tracks = useRefinance((state) => state.tracks);
  return isSampleTracks(tracks) ? <EstimateBanks answers={answers} /> : <ExactRoutes />;
}

function EstimateBanks({ answers }: { answers: Answers }) {
  const { estimate, result } = useRefinanceEstimate(answers);
  if (estimate?.kind !== 'ESTIMATE') {
    return null;
  }
  return result.data ? (
    <BankRanking title="הבנקים, לתמהיל החדש" data={result.data} />
  ) : (
    <p role="status" className="rounded-[20px] bg-flow-card p-5 text-base text-flow-muted">
      {result.isError ? 'החישוב לא הצליח.' : 'משווה בין הבנקים…'}
    </p>
  );
}

function ExactRoutes() {
  const { comparison } = useRefinanceAnalysis();
  return comparison ? <RoutesPanel comparison={comparison} /> : null;
}

/** Refinancing at the bank the mortgage is with, or moving to another: each with its saving, cost and payback. */
export function RoutesPanel({ comparison }: { comparison: RefinanceComparison }) {
  const route = bestRoute(comparison);
  return (
    <Panel title="שתי הדרכים">
      <div className="grid grid-cols-2 gap-2.5">
        {(['INTERNAL', 'EXTERNAL'] as const).map((kind) => {
          const each = kind === 'INTERNAL' ? comparison.internal : comparison.external;
          const best = comparison.best === kind;
          return (
            <div key={kind} className={`flex flex-col gap-1 rounded-2xl p-3 ${best ? 'border-2 border-flow-strong bg-flow-pick' : 'border border-flow-line'}`}>
              <span className="text-[15px] font-extrabold">{ROUTE_NAME[kind]}</span>
              {best && <span className="text-xs font-bold text-flow-strong">המשתלמת</span>}
              <span className="text-sm">{formatCurrency(each.monthlySaving)} בחודש</span>
              <span className="text-sm">עלות {formatCurrency(each.upfrontCost)}</span>
              <span className="text-sm text-flow-muted">{each.breakevenMonth > 0 ? `מחזיר תוך ${each.breakevenMonth} חודשים` : 'לא מחזיר את עצמו'}</span>
            </div>
          );
        })}
      </div>
      <span className="self-start rounded-full bg-flow-pick px-3 py-1 text-sm font-bold text-flow-strong">{VERDICT_LABELS[route.verdict]}</span>
    </Panel>
  );
}
