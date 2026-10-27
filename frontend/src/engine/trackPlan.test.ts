import { describe, expect, it } from 'vitest';
import { quotePrepayment, type ExistingTrack } from './prepayment';
import { analyseRoute, DEFAULT_ROUTES, likeForLikeProposal, marketAverageFor } from './refinance';
import { baselineScenario } from './scenario';
import { analyseTrackPlan, isGoodRate, type TrackPlanOptions } from './trackPlan';

const options: TrackPlanOptions = {
  scenario: baselineScenario(),
  discountRate: 0.04,
  ltv: 0.5,
  noticeGiven: true,
  dayOfMonth: 20,
  cpiAnnual: 0.024,
  percentile: 0.5,
  route: DEFAULT_ROUTES.INTERNAL,
};

// A dear fixed track, a prime track, and a fixed linked track taken when rates were low.
const tracks: ExistingTrack[] = [
  { id: 'dear', type: 'FIXED_UNLINKED', balance: 500_000, annualRate: 0.068, remainingMonths: 240, monthsElapsed: 60 },
  { id: 'prime', type: 'PRIME', balance: 300_000, annualRate: 0.0625, remainingMonths: 240, monthsElapsed: 60 },
  { id: 'cheap', type: 'FIXED_LINKED', balance: 250_000, annualRate: 0.022, remainingMonths: 200, monthsElapsed: 60 },
];

describe('a plan track by track', () => {
  it('changes nothing, costs nothing, when every track is kept', () => {
    const plan = analyseTrackPlan(tracks, {}, options);
    expect(plan.unchanged).toBe(true);
    expect(plan.upfront).toBe(0);
    expect(plan.proposedPayment).toBeCloseTo(plan.currentPayment, 6);
    expect(plan.verdict).toBe('NOT_WORTHWHILE');
  });

  it('marks a track below today’s market as worth keeping', () => {
    const prime = options.scenario.primeAnnual;
    expect(isGoodRate(tracks[2]!, options.ltv, prime)).toBe(true);
    expect(isGoodRate(tracks[0]!, options.ltv, prime)).toBe(false);
    expect(tracks[2]!.annualRate).toBeLessThan(marketAverageFor(tracks[2]!, options.ltv, prime));
  });

  it('refinancing one track matches refinancing that track alone, the others untouched', () => {
    const plan = analyseTrackPlan(tracks, { dear: { kind: 'REFINANCE', type: 'FIXED_UNLINKED', termMonths: 240 } }, options);
    const alone = analyseRoute(
      tracks,
      likeForLikeProposal(tracks, options.ltv, 0.5, new Set(['prime', 'cheap']), options.scenario.primeAnnual),
      DEFAULT_ROUTES.INTERNAL,
      options,
    );
    expect(plan.fees.total).toBeCloseTo(alone.prepayment.total, 2);
    expect(plan.proposedPayment).toBeCloseTo(alone.proposedPayment, 2);
    expect(plan.netPresentValue).toBeCloseTo(alone.netPresentValue, 0);
    expect(plan.proposal.find((track) => track.id === 'cheap')).toMatchObject({ carriedOver: true, annualRate: 0.022 });
  });

  it('can move a track into another kind and term', () => {
    const plan = analyseTrackPlan(tracks, { prime: { kind: 'REFINANCE', type: 'FIXED_UNLINKED', termMonths: 300 } }, options);
    const moved = plan.proposal.find((track) => track.id === 'prime:new')!;
    expect(moved).toMatchObject({ type: 'FIXED_UNLINKED', amount: 300_000, termMonths: 300 });
    // Prime carries no capitalization fee: only the operational fee, with notice given.
    expect(plan.fees.capitalizationFee).toBe(0);
  });

  it('repays part of a track from savings: the fee is on that part only, the rest keeps its rate and end date', () => {
    const plan = analyseTrackPlan(tracks, { dear: { kind: 'PREPAY', amount: 100_000 } }, options);
    expect(plan.cash).toBe(100_000);
    const rest = plan.proposal.find((track) => track.id === 'dear')!;
    expect(rest).toMatchObject({ amount: 400_000, annualRate: 0.068, termMonths: 240, carriedOver: true });
    const wholeTrackFee = quotePrepayment([tracks[0]!], (t) => marketAverageFor(t, 0.5, options.scenario.primeAnnual), options).total;
    expect(plan.fees.total).toBeLessThan(wholeTrackFee);
    expect(plan.upfront).toBeCloseTo(100_000 + plan.fees.total, 6);
    expect(plan.monthlySaving).toBeGreaterThan(0);
  });

  it('charges the no-notice fee on cash repaid but not on what the same bank lends again', () => {
    const noNotice = { ...options, noticeGiven: false };
    const refinance = analyseTrackPlan(tracks, { prime: { kind: 'REFINANCE', type: 'PRIME', termMonths: 240 } }, noNotice);
    const prepay = analyseTrackPlan(tracks, { prime: { kind: 'PREPAY', amount: 300_000 } }, noNotice);
    expect(refinance.fees.noticeFee).toBe(0);
    expect(prepay.fees.noticeFee).toBeCloseTo(300_000 * 0.001, 6);
  });

  it('never refinances an eligibility loan, and caps a prepayment at the balance', () => {
    const withDirected: ExistingTrack[] = [
      ...tracks,
      { id: 'elig', type: 'ELIGIBILITY', balance: 80_000, annualRate: 0.03, remainingMonths: 200, monthsElapsed: 60 },
    ];
    const plan = analyseTrackPlan(
      withDirected,
      { elig: { kind: 'REFINANCE', type: 'PRIME', termMonths: 200 }, prime: { kind: 'PREPAY', amount: 1_000_000 } },
      options,
    );
    expect(plan.proposal.find((track) => track.id === 'elig')).toMatchObject({ carriedOver: true, type: 'ELIGIBILITY' });
    expect(plan.cash).toBe(300_000);
    expect(plan.proposal.some((track) => track.id === 'prime')).toBe(false);
  });

  it('adds the bank’s switching costs only when something is refinanced', () => {
    const route = { ...DEFAULT_ROUTES.INTERNAL, costs: { fileOpening: 500, appraisal: 0, registration: 0, legal: 0 } };
    expect(analyseTrackPlan(tracks, { dear: { kind: 'PREPAY', amount: 10_000 } }, { ...options, route }).switchingCost).toBe(0);
    expect(analyseTrackPlan(tracks, { dear: { kind: 'REFINANCE', type: 'FIXED_UNLINKED', termMonths: 240 } }, { ...options, route }).switchingCost).toBe(500);
  });
});
