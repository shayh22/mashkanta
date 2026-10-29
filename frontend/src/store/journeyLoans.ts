import { useMemo } from 'react';
import type { ConsumerDebt } from '../engine/consolidation';
import type { CategoryId } from '../engine/money/categories';
import type { LoanPlan } from '../engine/money/decisions';
import type { MonthlyPicture } from '../engine/money/picture';
import { isSampleDebts, useConsolidation } from './consolidationStore';
import { useMoney } from './moneyStore';

/**
 * The household's loans for the journey, from both sources: repayments seen on the statements, and
 * loans read from a loans report (an amortization schedule, a lender's statement) — each loan once,
 * so its repayment is never counted twice (see `matchLoans`).
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
  /** The report loan behind it, and its name in the report. */
  readonly debtId?: string;
  readonly reportLabel?: string;
}

/** A charge on the statements that a report loan could be. */
export interface LoanCandidate {
  readonly name: string;
  readonly monthly: number;
  readonly category: CategoryId;
  /** Filed as a loan or insurance, or charged like one: a standing order, or once in every month. */
  readonly loanLike: boolean;
}

/** "Not on the statements": the household says the loan is paid from an account not uploaded. */
export const NOT_ON_STATEMENTS = 'NONE';

/** Same loan when the payments agree to within 5%, or 30 shekels for a small one. */
export const samePayment = (a: number, b: number) => Math.abs(a - b) <= Math.max(30, 0.05 * Math.max(a, b));

/** Categories whose charges are never one loan's repayment. */
const NOT_A_LOAN: ReadonlySet<CategoryId> = new Set(['HOUSING_LOANS', 'CASH', 'CARD_UNDETAILED', 'GROCERIES', 'FEES']);

/** Where a loan's repayment is filed: as one, or under the insurer that lent from the pension. */
const LOAN_LIKE: ReadonlySet<CategoryId> = new Set(['LOANS', 'INSURANCE']);

/** Every charge on the statements that could be a loan's repayment, loans first. */
export function loanCandidates(picture: MonthlyPicture | undefined): LoanCandidate[] {
  return (picture?.spendingLines ?? [])
    .filter((line) => !NOT_A_LOAN.has(line.id))
    .flatMap((line) =>
      line.payees
        .filter((payee) => payee.monthly >= 50)
        .map((payee) => ({
          name: payee.description,
          monthly: payee.monthly,
          category: line.id,
          loanLike:
            LOAN_LIKE.has(line.id) ||
            payee.standing ||
            (payee.months >= 2 && payee.months === picture!.months.length && payee.count === payee.months),
        })),
    );
}

/**
 * The loans, each once. A report loan is the same loan as a charge on the statements when the
 * household linked them, or — unless it said the loan is paid elsewhere — when the payments agree
 * and the charge looks like a loan's (see `LoanCandidate.loanLike`): a pension loan is charged under
 * the insurer's name, while a shop charge of the same size is not taken for one. The household's
 * links are honoured before any guess. Such a charge takes the report's terms; a report loan with
 * no charge stands on its own; every charge filed as a loan is one, report or not.
 */
export function matchLoans(
  picture: MonthlyPicture | undefined,
  debts: readonly ConsumerDebt[],
  links: Readonly<Record<string, string>> = {},
): JourneyLoan[] {
  const candidates = loanCandidates(picture);
  const reported = debts.filter((debt) => debt.balance > 0 && debt.monthlyPayment > 0);
  const byPayee = new Map<string, ConsumerDebt>();
  // The household's own links first, so a guess never takes the charge it pointed at.
  const ordered = [...reported].sort((a, b) => Number(!links[a.id]) - Number(!links[b.id]));
  for (const debt of ordered) {
    const link = links[debt.id];
    let payee: LoanCandidate | undefined;
    if (link === NOT_ON_STATEMENTS) {
      payee = undefined;
    } else if (link) {
      payee = candidates.find((candidate) => candidate.name === link && !byPayee.has(candidate.name));
    } else {
      // Loans first, then the nearest payment.
      payee = candidates
        .filter((candidate) => candidate.loanLike && !byPayee.has(candidate.name) && samePayment(candidate.monthly, debt.monthlyPayment))
        .sort(
          (a, b) =>
            Number(b.category === 'LOANS') - Number(a.category === 'LOANS') ||
            Math.abs(a.monthly - debt.monthlyPayment) - Math.abs(b.monthly - debt.monthlyPayment),
        )[0];
    }
    if (payee) {
      byPayee.set(payee.name, debt);
    }
  }
  const matched = new Set(byPayee.values());
  const standalone = reported.filter((debt) => !matched.has(debt));
  const fromDebt = (debt: ConsumerDebt) => ({
    defaults: { balance: debt.balance, annualRate: debt.annualRate, remainingMonths: debt.remainingMonths },
    debtId: debt.id,
    reportLabel: debt.label,
  });
  const onStatements = candidates
    .filter((candidate) => candidate.category === 'LOANS' || byPayee.has(candidate.name))
    .map((candidate): JourneyLoan => {
      const debt = byPayee.get(candidate.name);
      return {
        key: debt ? `debt:${debt.id}` : candidate.name,
        name: candidate.name,
        monthly: candidate.monthly,
        fromReport: !!debt,
        onStatements: true,
        ...(debt ? fromDebt(debt) : {}),
      };
    });
  return [
    ...onStatements,
    ...standalone.map((debt): JourneyLoan => ({
      key: `debt:${debt.id}`,
      name: debt.label,
      monthly: debt.monthlyPayment,
      fromReport: true,
      onStatements: false,
      ...fromDebt(debt),
    })),
  ];
}

export function useJourneyLoans(picture: MonthlyPicture | undefined): JourneyLoan[] {
  const debts = useConsolidation((state) => state.debts);
  const links = useMoney((state) => state.loanLinks);
  return useMemo(() => matchLoans(picture, isSampleDebts(debts) ? [] : debts, links), [debts, picture, links]);
}

/**
 * What the household typed for a loan. A report loan keeps its plan under the report's id, linked or
 * not; a charge linked to a report later still finds what was typed under its name.
 */
export function ownPlanOf(loan: JourneyLoan, plans: Readonly<Record<string, LoanPlan>>): LoanPlan | undefined {
  return plans[loan.key] ?? (loan.onStatements ? plans[loan.name] : undefined);
}

/** A loan's plan with the report's terms where the household has typed none. */
export function planOf(loan: JourneyLoan, plans: Readonly<Record<string, LoanPlan>>): LoanPlan {
  const own = ownPlanOf(loan, plans);
  return {
    move: own?.move ?? 'KEEP',
    balance: own?.balance ?? loan.defaults?.balance,
    annualRate: own?.annualRate ?? loan.defaults?.annualRate,
    remainingMonths: own?.remainingMonths ?? loan.defaults?.remainingMonths,
    ...(own?.extendYears !== undefined ? { extendYears: own.extendYears } : {}),
  };
}
