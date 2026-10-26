import { afterEach, describe, expect, it } from 'vitest';
import { allPurposeMargin, ALL_PURPOSE_MARGIN } from './actionPlan';
import { currentBaselineRates, rateFor } from './baseline';
import { marketFromBoi, type LiveMarket } from './boiMarket';
import br from './__fixtures__/boi/br.csv?raw';
import loans from './__fixtures__/boi/loans.csv?raw';
import mortgages from './__fixtures__/boi/mortgages.csv?raw';
import zcm from './__fixtures__/boi/zcm.csv?raw';
import { applyLiveMarket, liveMarket, monthLabel, shiftsFor } from './liveMarket';

const AUGUST = marketFromBoi(
  { br, zcm, mortgages, loans },
  new Date('2026-10-26T08:00:00Z'),
);

describe('live market', () => {
  afterEach(() => applyLiveMarket(undefined));

  it('leaves the table where it is when the live averages match the seed', () => {
    const shifts = shiftsFor(AUGUST);
    for (const track of ['FIXED_UNLINKED', 'FIXED_LINKED', 'VARIABLE_LINKED', 'PRIME'] as const) {
      expect(shifts[track]).toBeCloseTo(0, 10);
    }
  });

  it('moves each track onto the new published average, spread and LTV steps intact', () => {
    const before = rateFor('FIXED_UNLINKED', 0.7, 300);
    const market: LiveMarket = { ...AUGUST, housing: { ...AUGUST.housing!, asOf: '2026-09', fixedUnlinked: 0.05 } };
    applyLiveMarket(market);
    const after = rateFor('FIXED_UNLINKED', 0.7, 300);

    expect(after.medianRate - before.medianRate).toBeCloseTo(0.05 - 0.0462, 10);
    expect(after.worstRate - after.bestRate).toBeCloseTo(before.worstRate - before.bestRate, 10);
    expect(liveMarket()).toBe(market);
    const row = currentBaselineRates().find((entry) => entry.track === 'FIXED_UNLINKED');
    expect(row?.source).toContain('ספטמבר 2026');
  });

  it('re-prices prime tracks by margin, leaving the prime rate itself to the caller', () => {
    const before = rateFor('PRIME', 0.5, 300, 0.0475).medianRate;
    applyLiveMarket({ ...AUGUST, housing: { ...AUGUST.housing!, primeMargin: 0.0029 } });
    expect(rateFor('PRIME', 0.5, 300, 0.0475).medianRate).toBeCloseTo(before - 0.002, 10);
  });

  it('follows the 5-year yield for variable unlinked tracks, which have no published average', () => {
    const before = rateFor('VARIABLE_UNLINKED', 0.5, 300).medianRate;
    applyLiveMarket(AUGUST);
    expect(rateFor('VARIABLE_UNLINKED', 0.5, 300).medianRate - before).toBeCloseTo(
      AUGUST.bondYield5y!.value - 0.042,
      10,
    );
  });

  it('takes the all-purpose negotiation ceiling from the published margin', () => {
    expect(allPurposeMargin()).toEqual(ALL_PURPOSE_MARGIN);
    applyLiveMarket({ ...AUGUST, allPurpose: { asOf: '2026-08', variableMarginOverPrime: 0.02 } });
    expect(allPurposeMargin().ceiling).toBe(0.02);
    expect(allPurposeMargin().target).toBeCloseTo(0.015, 10);
  });

  it('names months in Hebrew', () => {
    expect(monthLabel('2026-08')).toBe('אוגוסט 2026');
  });

  it('shows prime rows in the table at the prime in force, as the engine prices them', () => {
    applyLiveMarket(AUGUST);
    const row = currentBaselineRates(0.045).find((entry) => entry.track === 'PRIME' && entry.tier === 'FROM_45_TO_60')!;
    expect(row.medianRate).toBeCloseTo(rateFor('PRIME', 0.5, 300, 0.045).medianRate, 10);
  });
});
