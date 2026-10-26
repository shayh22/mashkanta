import { describe, expect, it } from 'vitest';
import type { TrackType } from '../lib/types';
import { priceMix } from './amortization';
import type { BorrowerProfile } from './profile';
import { LIMITS, SEGMENT_MAX_LTV, validate } from './regulatory';
import { baselineScenario } from './scenario';
import { trackFromRate } from './tracks';

const scenario = baselineScenario(0.06, 0.024, 0.042);

const RATES: Record<TrackType, number> = {
  PRIME: 0.055,
  FIXED_UNLINKED: 0.049,
  FIXED_LINKED: 0.035,
  VARIABLE_UNLINKED: 0.047,
  VARIABLE_LINKED: 0.034,
  ELIGIBILITY: 0.03,
};

/** A mix of `amount` split by share, every track over `termMonths`. */
const mixOf = (shares: Partial<Record<TrackType, number>>, amount = 1_200_000, termMonths = 300) =>
  priceMix(
    (Object.entries(shares) as [TrackType, number][]).map(([track, share]) =>
      trackFromRate(track, amount * share, termMonths, RATES[track], scenario),
    ),
    scenario,
  );

const borrower = (patch: Partial<BorrowerProfile> = {}): BorrowerProfile => ({
  propertyValue: 2_000_000,
  loanAmount: 1_200_000,
  termMonths: 300,
  segment: 'FIRST_HOME',
  monthlyNetIncome: 40_000,
  existingMonthlyObligations: 0,
  riskTolerance: 5,
  volatilityCapacity: 1_500,
  liquidityEvents: [],
  primePreference: 0.25,
  stablePreference: 0.5,
  dynamicPreference: 0.25,
  eligibilityAmount: 0,
  eligibilityRate: 0,
  ...patch,
});

const THIRDS = { PRIME: 1 / 3, FIXED_UNLINKED: 1 / 3, FIXED_LINKED: 1 / 3 };
const findingOf = (report: ReturnType<typeof validate>, code: string) => report.findings.find((f) => f.code === code)!;

describe('Directive 329 checks', () => {
  it('passes a plain thirds mix at 60% LTV and a modest payment', () => {
    const mix = mixOf(THIRDS);
    const report = validate(borrower(), mix, mix.initialPayment);
    expect(report.level).toBe('OK');
    expect(report.underwritable).toBe(true);
    expect(report.findings.map((f) => f.code)).toEqual([
      'LTV',
      'DTI',
      'DTI_STRESS',
      'TERM',
      'PRIME_SHARE',
      'VARIABLE_SHARE',
      'FIXED_FLOOR',
    ]);
    expect(report.ltv).toBeCloseTo(0.6, 10);
  });

  describe('loan to value, per segment', () => {
    const at = (segment: BorrowerProfile['segment'], ltv: number) => {
      const mix = mixOf(THIRDS);
      return findingOf(validate(borrower({ segment, loanAmount: 2_000_000 * ltv }), mix, mix.initialPayment), 'LTV');
    };

    it.each(Object.entries(SEGMENT_MAX_LTV))('blocks %s above its ceiling, warns just under it', (segment, max) => {
      const seg = segment as BorrowerProfile['segment'];
      expect(at(seg, max + 0.01).level).toBe('BLOCKING');
      expect(at(seg, max).level).toBe('WARNING');
      expect(at(seg, max - 0.03).level).toBe('OK');
    });

    it('names the largest loan the ceiling allows', () => {
      expect(at('INVESTOR', 0.6).message).toContain((1_000_000).toLocaleString('he-IL'));
    });
  });

  describe('payment to income', () => {
    const mix = mixOf(THIRDS);
    const withDti = (dti: number, obligations = 0) =>
      validate(borrower({ monthlyNetIncome: (mix.initialPayment + obligations) / dti, existingMonthlyObligations: obligations }), mix, mix.initialPayment);

    it('is green up to 30%, a warning to 40%, and blocking above', () => {
      expect(findingOf(withDti(0.3), 'DTI').level).toBe('OK');
      expect(findingOf(withDti(0.35), 'DTI').level).toBe('WARNING');
      expect(findingOf(withDti(0.4), 'DTI').level).toBe('WARNING');
      expect(findingOf(withDti(0.41), 'DTI').level).toBe('BLOCKING');
      expect(withDti(0.41).underwritable).toBe(false);
    });

    it('counts existing obligations in DTI but not in PTI', () => {
      const report = withDti(0.35, 3_000);
      expect(report.dti).toBeCloseTo(0.35, 10);
      expect(report.pti).toBeCloseTo((0.35 * mix.initialPayment) / (mix.initialPayment + 3_000), 10);
    });

    it('only warns when the stress scenario alone breaks 40%', () => {
      const income = mix.initialPayment / 0.3;
      const report = validate(borrower({ monthlyNetIncome: income }), mix, income * 0.45);
      expect(findingOf(report, 'DTI_STRESS').level).toBe('WARNING');
      expect(report.stressedPti).toBeCloseTo(0.45, 10);
      expect(report.level).toBe('WARNING');
      expect(report.underwritable).toBe(true);
    });
  });

  it('blocks a term beyond 30 years', () => {
    const ok = mixOf(THIRDS, 1_200_000, 360);
    const long = mixOf(THIRDS, 1_200_000, 372);
    expect(findingOf(validate(borrower(), ok, ok.initialPayment), 'TERM').level).toBe('OK');
    const blocked = findingOf(validate(borrower(), long, long.initialPayment), 'TERM');
    expect(blocked.level).toBe('BLOCKING');
    expect(blocked.actual).toBeCloseTo(31, 10);
  });

  describe('mix shape', () => {
    const check = (shares: Partial<Record<TrackType, number>>) => {
      const mix = mixOf(shares);
      return validate(borrower(), mix, mix.initialPayment);
    };

    it('caps prime at two thirds, with a tolerance for rounding', () => {
      expect(findingOf(check({ PRIME: 0.666, FIXED_UNLINKED: 0.334 }), 'PRIME_SHARE').level).toBe('OK');
      expect(findingOf(check({ PRIME: 0.7, FIXED_UNLINKED: 0.3 }), 'PRIME_SHARE').level).toBe('BLOCKING');
    });

    it('counts five-year variable tracks with prime against the variable cap', () => {
      const report = check({ PRIME: 0.4, VARIABLE_LINKED: 0.3, FIXED_LINKED: 0.3 });
      expect(findingOf(report, 'PRIME_SHARE').level).toBe('OK');
      expect(findingOf(report, 'VARIABLE_SHARE').level).toBe('BLOCKING');
      expect(findingOf(report, 'VARIABLE_SHARE').actual).toBeCloseTo(0.7, 10);
    });

    it('requires a third fixed to maturity, and counts eligibility as fixed', () => {
      expect(findingOf(check({ PRIME: 0.4, VARIABLE_UNLINKED: 0.3, FIXED_UNLINKED: 0.3 }), 'FIXED_FLOOR').level).toBe('BLOCKING');
      expect(findingOf(check({ PRIME: 0.4, VARIABLE_UNLINKED: 0.25, ELIGIBILITY: 0.35 }), 'FIXED_FLOOR').level).toBe('OK');
      expect(findingOf(check({ PRIME: 2 / 3 - 0.004, FIXED_UNLINKED: 1 / 3 + 0.004 }), 'FIXED_FLOOR').level).toBe('OK');
    });

    it('takes the worst finding as the overall level', () => {
      const report = check({ PRIME: 0.8, FIXED_UNLINKED: 0.2 });
      expect(report.level).toBe('BLOCKING');
      expect(report.findings.filter((f) => f.level === 'BLOCKING').map((f) => f.code)).toEqual([
        'PRIME_SHARE',
        'VARIABLE_SHARE',
        'FIXED_FLOOR',
      ]);
      expect(LIMITS.MAX_PRIME_SHARE).toBeCloseTo(2 / 3, 10);
    });
  });
});
