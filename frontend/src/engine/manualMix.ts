import type { TrackType } from '../lib/types';
import { LIMITS } from './regulatory';

/**
 * A mix the borrower builds by hand: a share of the loan per track. The shares cover the part of
 * the loan that is not an eligibility loan — that part is locked at its subsidised terms whichever
 * way the mix is chosen.
 */
export type ManualShares = Partial<Record<TrackType, number>>;

/** Tracks a hand-built mix may use, in the order the editor lists them. */
export const MANUAL_TRACKS: readonly TrackType[] = [
  'PRIME',
  'FIXED_UNLINKED',
  'FIXED_LINKED',
  'VARIABLE_UNLINKED',
  'VARIABLE_LINKED',
];

export const DEFAULT_MANUAL_SHARES: ManualShares = { PRIME: 1 / 3, FIXED_UNLINKED: 1 / 3, FIXED_LINKED: 1 / 3 };

const FIXED: ReadonlySet<TrackType> = new Set(['FIXED_UNLINKED', 'FIXED_LINKED']);
const VARIABLE: ReadonlySet<TrackType> = new Set(['PRIME', 'VARIABLE_UNLINKED', 'VARIABLE_LINKED']);

export function sharesTotal(shares: ManualShares): number {
  return MANUAL_TRACKS.reduce((sum, track) => sum + Math.max(0, shares[track] ?? 0), 0);
}

/** Scales the shares to sum to one and drops the empty ones; undefined when there is nothing to scale. */
export function normaliseShares(shares: ManualShares): ManualShares | undefined {
  const total = sharesTotal(shares);
  if (!(total > 0)) {
    return undefined;
  }
  const out: ManualShares = {};
  for (const track of MANUAL_TRACKS) {
    const share = Math.max(0, shares[track] ?? 0) / total;
    if (share > 0) {
      out[track] = share;
    }
  }
  return out;
}

export interface ManualMixCheck {
  /** Shares of the whole loan, eligibility included. */
  readonly primeShare: number;
  readonly variableShare: number;
  readonly fixedShare: number;
  /** Blocking: the shares do not add up to the loan. */
  readonly totalError?: string;
  /** Rules of the Bank of Israel's Directive 329 the mix breaks. */
  readonly violations: readonly string[];
}

/**
 * Checks a hand-built mix against the shape rules as the borrower edits it. `lockedShare` is the
 * eligibility loan's share of the whole loan; it is fixed rate, so it counts towards the fixed floor.
 */
export function checkManualMix(shares: ManualShares, lockedShare = 0): ManualMixCheck {
  const total = sharesTotal(shares);
  const free = 1 - lockedShare;
  const part = (set: ReadonlySet<TrackType>) =>
    MANUAL_TRACKS.filter((track) => set.has(track)).reduce((sum, track) => sum + Math.max(0, shares[track] ?? 0), 0) *
    (total > 0 ? free / total : 0);

  const primeShare = Math.max(0, shares.PRIME ?? 0) * (total > 0 ? free / total : 0);
  const variableShare = part(VARIABLE);
  const fixedShare = part(FIXED) + lockedShare;

  const violations: string[] = [];
  const tolerance = LIMITS.SHARE_TOLERANCE;
  if (primeShare > LIMITS.MAX_PRIME_SHARE + tolerance) {
    violations.push('מסלול הפריים עולה על שני שלישים מההלוואה.');
  }
  if (variableShare > LIMITS.MAX_VARIABLE_SHARE + tolerance) {
    violations.push('המסלולים בריבית משתנה (כולל פריים) עולים על שני שלישים מההלוואה.');
  }
  if (fixedShare < LIMITS.MIN_FIXED_SHARE - tolerance) {
    violations.push('פחות משליש מההלוואה בריבית קבועה לכל התקופה.');
  }

  return {
    primeShare,
    variableShare,
    fixedShare,
    totalError:
      Math.abs(total - 1) > 0.005
        ? `החלוקה מסתכמת ב-${Math.round(total * 100)}% — צריך בדיוק 100%.`
        : undefined,
    violations,
  };
}
