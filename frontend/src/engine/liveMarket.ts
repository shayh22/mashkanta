import type { TrackType } from '../lib/types';
import { seededAverage, setMarketShifts } from './baseline';
import type { LiveMarket } from './boiMarket';
import { DEFAULT_ANCHOR, DEFAULT_PRIME } from './scenario';

/**
 * The live market figures the engine prices against, when they have been fetched.
 *
 * Held at module level because every engine entry point reads the rate table and the anchors
 * synchronously. The market store sets it, and bumps a version that the React layer depends on,
 * so nothing renders against a table that changed underneath it.
 */
let current: LiveMarket | undefined;

export function liveMarket(): LiveMarket | undefined {
  return current;
}

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** `2026-08` → `אוגוסט 2026`. */
export function monthLabel(period: string): string {
  const [year, month] = period.split('-');
  const name = MONTHS[Number(month) - 1];
  return name && year ? `${name} ${year}` : period;
}

/**
 * How far to move each track's seeded distribution so its middle bucket sits on the live average.
 * Prime is moved by the change in margin only; the prime rate itself is applied by `rateFor`.
 * Variable unlinked tracks have no published average and follow the 5-year government yield they
 * re-price against.
 */
export function shiftsFor(market: LiveMarket): Partial<Record<TrackType, number>> {
  const shifts: Partial<Record<TrackType, number>> = {};
  const housing = market.housing;
  if (housing?.fixedUnlinked !== undefined) {
    shifts.FIXED_UNLINKED = housing.fixedUnlinked - seededAverage('FIXED_UNLINKED');
  }
  if (housing?.fixedLinked !== undefined) {
    shifts.FIXED_LINKED = housing.fixedLinked - seededAverage('FIXED_LINKED');
  }
  if (housing?.variableLinked !== undefined) {
    shifts.VARIABLE_LINKED = housing.variableLinked - seededAverage('VARIABLE_LINKED');
  }
  if (housing?.primeMargin !== undefined) {
    shifts.PRIME = housing.primeMargin - (seededAverage('PRIME') - DEFAULT_PRIME);
  }
  if (market.bondYield5y) {
    shifts.VARIABLE_UNLINKED = market.bondYield5y.value - DEFAULT_ANCHOR;
  }
  return shifts;
}

export function applyLiveMarket(market: LiveMarket | undefined): void {
  current = market;
  setMarketShifts(
    market ? shiftsFor(market) : {},
    market?.housing ? `בנק ישראל — ריביות ממוצעות בהלוואות לדיור, ${monthLabel(market.housing.asOf)}` : undefined,
  );
}
