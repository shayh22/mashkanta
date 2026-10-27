/**
 * "What changed since you were last here" — the alert half of the smart report. Each visit leaves a
 * snapshot of the market figures and of the borrower's own results in the browser; the next visit
 * compares against it. Nothing is sent anywhere: the snapshot never leaves the device.
 */

export interface VisitSnapshot {
  /** ISO timestamp. */
  readonly at: string;
  readonly market: {
    readonly prime?: number;
    readonly fixedUnlinked?: number;
    readonly fixedLinked?: number;
    readonly variableLinked?: number;
    /** The month the housing averages describe. */
    readonly housingAsOf?: string;
  };
  /** Present only once the borrower has used the refinance check with a complete mortgage. */
  readonly refinance?: {
    readonly monthlySaving: number;
    readonly netPresentValue: number;
    /** Which proposal the figures are for; figures for a different one are not comparable. */
    readonly mode?: string;
  };
  /** Present only once the borrower has used the consolidation check. */
  readonly consolidation?: {
    readonly monthlyRelief: number;
    readonly maxFeasibleLoan: number;
  };
}

export type ChangeTone = 'good' | 'bad' | 'neutral';

export interface VisitChange {
  readonly id: string;
  readonly label: string;
  readonly from: number;
  readonly to: number;
  /** How the figure is shown: a rate in percentage points, or shekels. */
  readonly unit: 'rate' | 'ils';
  /** Whether the change is good news for the borrower. */
  readonly tone: ChangeTone;
}

/** Changes smaller than these are noise, not news. */
export const THRESHOLDS = { rate: 0.0005, ils: 50 } as const;

/** Rates going down are good for a borrower; savings, relief and room going up are. */
const RATES = [
  ['prime', 'ריבית הפריים'],
  ['fixedUnlinked', 'ממוצע קבועה לא צמודה'],
  ['fixedLinked', 'ממוצע קבועה צמודה'],
  ['variableLinked', 'ממוצע משתנה צמודה'],
] as const;

export function compareVisits(previous: VisitSnapshot, current: VisitSnapshot): VisitChange[] {
  const changes: VisitChange[] = [];

  for (const [key, label] of RATES) {
    const from = previous.market[key];
    const to = current.market[key];
    if (from !== undefined && to !== undefined && Math.abs(to - from) >= THRESHOLDS.rate) {
      changes.push({ id: key, label, from, to, unit: 'rate', tone: to < from ? 'good' : 'bad' });
    }
  }

  const money = (id: string, label: string, from?: number, to?: number) => {
    if (from !== undefined && to !== undefined && Math.abs(to - from) >= THRESHOLDS.ils) {
      changes.push({ id, label, from, to, unit: 'ils', tone: to > from ? 'good' : 'bad' });
    }
  };
  // A different proposal (the engine's mix, the same mix re-priced, an offer) is a different
  // question, not news: its figures are compared only against the same kind of proposal.
  const sameProposal = previous.refinance?.mode === current.refinance?.mode;
  if (sameProposal) {
    money('refinanceSaving', 'החיסכון החודשי במיחזור', previous.refinance?.monthlySaving, current.refinance?.monthlySaving);
    money('refinanceNpv', 'הערך הנוכחי הנקי של המיחזור', previous.refinance?.netPresentValue, current.refinance?.netPresentValue);
  }
  money('consolidationRelief', 'החמצן התזרימי באיחוד', previous.consolidation?.monthlyRelief, current.consolidation?.monthlyRelief);
  money('consolidationRoom', 'המקסימום לאיחוד', previous.consolidation?.maxFeasibleLoan, current.consolidation?.maxFeasibleLoan);

  return changes;
}

/** A new monthly publication of the housing averages, worth saying even when the figures barely moved. */
export function newPublication(previous: VisitSnapshot, current: VisitSnapshot): string | undefined {
  const before = previous.market.housingAsOf;
  const now = current.market.housingAsOf;
  return before && now && now > before ? now : undefined;
}
