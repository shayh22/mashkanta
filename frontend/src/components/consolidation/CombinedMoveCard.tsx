import { positionFromMix, type CombinedMove } from '../../engine/combined';
import type { ConsolidationAnalysis } from '../../engine/consolidation';
import { formatCurrency, formatPercent, formatSignedCurrency } from '../../lib/format';
import { useConsolidation } from '../../store/consolidationStore';
import { useCombinedMove, useCombinedSettings } from '../../store/combinedStore';
import { Card, ScrollRegion, Toggle } from '../ui';

const ROUTE_NAME = { INTERNAL: 'מיחזור פנימי', EXTERNAL: 'מעבר לבנק מתחרה' } as const;

/**
 * Consolidating on its own against consolidating together with the refinance. The mortgage figures
 * for both columns come from the refinance inputs, so the comparison isolates what the refinance adds.
 */
export function CombinedComparison() {
  const { move } = useCombinedMove();
  const property = useConsolidation((state) => state.property);
  const setProperty = useConsolidation((state) => state.setProperty);
  const financeCosts = useCombinedSettings((state) => state.financeCosts);
  const setFinanceCosts = useCombinedSettings((state) => state.setFinanceCosts);

  if (!move) {
    return (
      <Card title="איחוד בלבד מול איחוד + מיחזור">
        <p className="text-sm text-ink-soft">השלימו את נתוני המשכנתא (או ייבאו דוח מהבנק) כדי להשוות.</p>
      </Card>
    );
  }

  const current = positionFromMix(move.refinance.current);
  // Any of the four figures the consolidation tests use counts, not just the balance: two
  // mortgages of the same size can differ entirely in payment and variable share.
  const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;
  const outOfSync = !(
    near(current.mortgageBalance, property.mortgageBalance, 0.02 * Math.max(1, current.mortgageBalance)) &&
    near(current.mortgagePayment, property.mortgagePayment, 0.02 * Math.max(1, current.mortgagePayment)) &&
    near(
      current.mortgageVariableBalance,
      property.mortgageVariableBalance,
      0.02 * Math.max(1, current.mortgageBalance),
    ) &&
    near(current.mortgageRemainingMonths, property.mortgageRemainingMonths, 12)
  );

  return (
    <Card
      title="איחוד בלבד מול איחוד + מיחזור"
      subtitle={`ההשוואה משתמשת במשכנתא מנתוני המיחזור (${ROUTE_NAME[move.refinance.route.kind]}). מיחזור משנה את ההחזר הקיים על הנכס (E) ואת חלק המשתנה — ולכן גם את מרווח האיחוד.`}
      action={
        outOfSync ? (
          <button type="button" className="btn-ghost" onClick={() => setProperty(current)}>
            העתקת נתוני המשכנתא לעמוד האיחוד
          </button>
        ) : undefined
      }
    >
      {outOfSync && (
        <p className="mb-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-caution">
          נתוני המשכנתא בעמוד האיחוד (יתרה {formatCurrency(property.mortgageBalance)}, החזר{' '}
          {formatCurrency(property.mortgagePayment)}) שונים מנתוני המיחזור (יתרה{' '}
          {formatCurrency(current.mortgageBalance)}, החזר {formatCurrency(current.mortgagePayment)}). ההשוואה
          משתמשת בנתוני המיחזור.
        </p>
      )}

      <Toggle
        label="לממן את עמלות המיחזור ועלויות המעבר מתוך ההלוואה לכל מטרה"
        hint={`${formatCurrency(move.refinance.upfrontCost)} — אחרת ישולמו במזומן ביום המהלך`}
        checked={financeCosts}
        onChange={setFinanceCosts}
      />

      <ScrollRegion label="השוואת איחוד בלבד מול מהלך משולב" className="mt-5">
        <table className="tabular w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-soft">
              <th className="py-2 text-start font-medium" scope="col">
                מדד
              </th>
              <th className="py-2 text-start font-medium" scope="col">
                איחוד בלבד
              </th>
              <th className="py-2 text-start font-medium" scope="col">
                איחוד + מיחזור
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            <Row label="סך החזר חודשי" move={move} pick={(a) => formatCurrency(a.paymentAfter)} />
            <Row
              label="חמצן תזרימי מול היום"
              move={move}
              pick={(a) => formatSignedCurrency(move.paymentToday - a.paymentAfter)}
              better={(a, b) => a.paymentAfter < b.paymentAfter}
            />
            <Row
              label="PTI לפי 1.10.2026"
              move={move}
              pick={(a) => (a.regulation.ptiExempt ? 'פטור' : formatPercent(a.regulation.pti, 1))}
              better={(a, b) => a.regulation.pti < b.regulation.pti}
            />
            <Row label="LTV מצטבר" move={move} pick={(a) => formatPercent(a.regulation.ltvAfter, 1)} />
            <Row
              label="חלק משתנה מכלל האשראי בנכס"
              move={move}
              pick={(a) => formatPercent(a.regulation.variableShareAfter, 1)}
            />
            <Row
              label="מקסימום לאיחוד (תקרת 40%)"
              move={move}
              pick={(a) => formatCurrency(a.regulation.maxFeasibleLoan)}
              better={(a, b) => a.regulation.maxFeasibleLoan > b.regulation.maxFeasibleLoan}
            />
            <Row
              label="סכום ההלוואה לכל מטרה"
              move={move}
              pick={(a) => formatCurrency(a.allocation.amount)}
            />
            <tr>
              <th className="py-2 text-start font-normal text-ink-muted" scope="row">
                מזומן ביום המהלך
              </th>
              <td className="py-2 font-medium text-ink">{formatCurrency(0)}</td>
              <td className="py-2 font-medium text-ink">{formatCurrency(move.cashUpfront)}</td>
            </tr>
            <Row
              label="היתכנות"
              move={move}
              pick={(a) =>
                a.regulation.bankFeasible ? 'בר-ביצוע' : a.regulation.feasible ? 'מעל 40%' : 'חורג מהוראה 329'
              }
            />
          </tbody>
        </table>
      </ScrollRegion>

      <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
        {move.extraReliefFromRefinance > 0
          ? `המיחזור מוסיף ${formatCurrency(move.extraReliefFromRefinance)} לחודש לחמצן התזרימי`
          : 'המיחזור אינו מוסיף חמצן תזרימי בתנאים שהוגדרו'}
        {move.extraCreditRoom > 1
          ? ` ומגדיל את מרווח האיחוד ב-${formatCurrency(move.extraCreditRoom)}.`
          : '.'}
      </p>
    </Card>
  );
}

function Row({
  label,
  move,
  pick,
  better,
}: {
  label: string;
  move: CombinedMove;
  pick: (analysis: ConsolidationAnalysis) => string;
  /** True when the first argument is the better of the two; highlights the winning column. */
  better?: (a: ConsolidationAnalysis, b: ConsolidationAnalysis) => boolean;
}) {
  const combinedWins = better?.(move.combined, move.consolidationOnly) ?? false;
  const aloneWins = better?.(move.consolidationOnly, move.combined) ?? false;
  return (
    <tr>
      <th className="py-2 text-start font-normal text-ink-muted" scope="row">
        {label}
      </th>
      <td className={`py-2 font-medium ${aloneWins ? 'text-positive' : 'text-ink'}`}>
        {pick(move.consolidationOnly)}
      </td>
      <td className={`py-2 font-medium ${combinedWins ? 'text-positive' : 'text-ink'}`}>
        {pick(move.combined)}
      </td>
    </tr>
  );
}

/** A pointer from the single-move pages to the combined one. */
export function CombinedLinkCard() {
  return (
    <section className="card flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-ink">🔀 מיחזור ואיחוד באותו מהלך</h2>
        <p className="mt-1 text-sm text-ink-soft">
          מיחזור המשכנתא משנה את מגבלות האיחוד (PTI ו-⅔ משתנה). ראו את שני המהלכים יחד, עם תוכנית פעולה אחת.
        </p>
      </div>
      <a href="#/combined" className="btn-primary">
        למהלך המשולב
      </a>
    </section>
  );
}
