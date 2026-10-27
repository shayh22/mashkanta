import { useMemo } from 'react';
import type { LoanPlan } from '../engine/money/decisions';
import type { MonthlyPicture } from '../engine/money/picture';
import { isSampleDebts, useConsolidation } from './consolidationStore';
import { useMoney } from './moneyStore';

/**
 * The household's loans for the journey, from both sources: repayments seen on the statements, and
 * loans read from a loans report (an amortization schedule, a lender's statement). A report loan
 * whose payment matches a repayment on the statements is the same loan: its terms fill that
 * repayment's card, so nothing is typed twice. A report loan with no match stands on its own —
 * likely paid from an account not uploaded.
 */

export interface JourneyLoan {
  /** Where its plan is kept in the store. */
  readonly key: string;
  readonly name: string;
  readonly monthly: number;
  /** Terms from a report, used until the household types its own. */
  readonly defaults?: { readonly balance: number; readonly annualRate: number; readonly remainingMonths: number };
  readonly fromReport: boolean;
  /** Whether its payment is already among the statements' spending. */
  readonly onStatements: boolean;
}

/** Same loan when the payments agree to within 3%, or 20 shekels for a small one. */
const samePayment = (a: number, b: number) => Math.abs(a - b) <= Math.max(20, 0.03 * Math.max(a, b));

export function useJourneyLoans(picture: MonthlyPicture | undefined): JourneyLoan[] {
  const debts = useConsolidation((state) => state.debts);
  return useMemo(() => {
    const reported = isSampleDebts(debts) ? [] : debts.filter((debt) => debt.balance > 0 && debt.monthlyPayment > 0);
    const payees = picture?.spendingLines.find((line) => line.id === 'LOANS')?.payees.filter((payee) => payee.monthly >= 50) ?? [];
    const used = new Set<string>();
    const loans: JourneyLoan[] = payees.map((payee) => {
      const match = reported.find((debt) => !used.has(debt.id) && samePayment(debt.monthlyPayment, payee.monthly));
      if (match) {
        used.add(match.id);
      }
      return {
        key: payee.description,
        name: payee.description,
        monthly: payee.monthly,
        fromReport: !!match,
        onStatements: true,
        ...(match ? { defaults: { balance: match.balance, annualRate: match.annualRate, remainingMonths: match.remainingMonths } } : {}),
      };
    });
    for (const debt of reported) {
      if (!used.has(debt.id)) {
        loans.push({
          key: `debt:${debt.id}`,
          name: debt.label,
          monthly: debt.monthlyPayment,
          fromReport: true,
          onStatements: false,
          defaults: { balance: debt.balance, annualRate: debt.annualRate, remainingMonths: debt.remainingMonths },
        });
      }
    }
    return loans;
  }, [debts, picture]);
}

/** A loan's plan with the report's terms where the household has typed none. */
export function planOf(loan: JourneyLoan, plans: Readonly<Record<string, LoanPlan>>): LoanPlan {
  const own = plans[loan.key];
  return {
    move: own?.move ?? 'KEEP',
    balance: own?.balance ?? loan.defaults?.balance,
    annualRate: own?.annualRate ?? loan.defaults?.annualRate,
    remainingMonths: own?.remainingMonths ?? loan.defaults?.remainingMonths,
    ...(own?.extendYears !== undefined ? { extendYears: own.extendYears } : {}),
  };
}

/** Whether the household has loaded anything of its own: statements, a mortgage report, loans. */
export function useDocumentsStatus() {
  const files = useMoney((state) => state.files);
  const debts = useConsolidation((state) => state.debts);
  return {
    statements: files.filter((file) => file.statement).length,
    loans: isSampleDebts(debts) ? 0 : debts.length,
  };
}
