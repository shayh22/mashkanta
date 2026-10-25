import { describe, expect, it } from 'vitest';
import type { ExistingTrack } from './prepayment';
import {
  analyseRoute,
  compareRoutes,
  DEFAULT_ROUTES,
  IMMEDIATE_BREAKEVEN_MONTHS,
  likeForLikeProposal,
  totalCosts,
  type ProposedTrack,
  type RefinanceOptions,
} from './refinance';
import { baselineScenario } from './scenario';

const options: RefinanceOptions = {
  scenario: baselineScenario(),
  discountRate: 0.04,
  ltv: 0.5,
  noticeGiven: true,
  dayOfMonth: 20,
  cpiAnnual: 0.024,
};

const existing: ExistingTrack[] = [
  { id: 'a', type: 'FIXED_UNLINKED', balance: 600_000, annualRate: 0.065, remainingMonths: 240, monthsElapsed: 60 },
  { id: 'b', type: 'PRIME', balance: 400_000, annualRate: 0.065, remainingMonths: 240, monthsElapsed: 60 },
];

const cheaper: ProposedTrack[] = [
  { id: 'a', type: 'FIXED_UNLINKED', amount: 600_000, annualRate: 0.049, termMonths: 240 },
  { id: 'b', type: 'PRIME', amount: 400_000, annualRate: 0.05, termMonths: 240 },
];

describe('refinance analysis', () => {
  it('finds the breakeven month exactly where the cumulative path turns non-negative', () => {
    const analysis = analyseRoute(existing, cheaper, DEFAULT_ROUTES.INTERNAL, options);
    expect(analysis.monthlySaving).toBeGreaterThan(0);
    expect(analysis.breakevenMonth).toBeGreaterThan(0);
    const at = analysis.path[analysis.breakevenMonth - 1]!;
    expect(at.cumulativeSaving).toBeGreaterThanOrEqual(0);
    if (analysis.breakevenMonth > 1) {
      expect(analysis.path[analysis.breakevenMonth - 2]!.cumulativeSaving).toBeLessThan(0);
    }
    // The fixed track was priced above today's market, so it carries a real capitalization fee.
    expect(analysis.prepayment.capitalizationFee).toBeGreaterThan(0);
    expect(analysis.upfrontCost).toBeCloseTo(analysis.prepayment.total, 6);
  });

  it('labels a fast payback as immediately worthwhile and a slow one as long-term', () => {
    const analysis = analyseRoute(existing, cheaper, DEFAULT_ROUTES.INTERNAL, options);
    expect(analysis.netPresentValue).toBeGreaterThan(0);
    expect(analysis.verdict).toBe(
      analysis.breakevenMonth <= IMMEDIATE_BREAKEVEN_MONTHS ? 'IMMEDIATE' : 'LONG_TERM',
    );

    // Prime only: no capitalization fee, so a lower rate pays back almost at once.
    const primeOnly = analyseRoute([existing[1]!], [cheaper[1]!], DEFAULT_ROUTES.INTERNAL, options);
    expect(primeOnly.verdict).toBe('IMMEDIATE');
    expect(primeOnly.breakevenMonth).toBe(1);
  });

  it('rejects a switch that saves nothing', () => {
    const same: ProposedTrack[] = existing.map((track) => ({
      id: track.id,
      type: track.type,
      amount: track.balance,
      annualRate: track.annualRate,
      termMonths: track.remainingMonths,
    }));
    const route = { ...DEFAULT_ROUTES.EXTERNAL, rateDelta: 0 };
    const analysis = analyseRoute(existing, same, route, { ...options, noticeGiven: false });
    expect(analysis.monthlySaving).toBeLessThan(1);
    expect(analysis.verdict).toBe('NOT_WORTHWHILE');
  });

  it('charges switching costs on the external route and prices it sharper', () => {
    const comparison = compareRoutes(existing, cheaper, DEFAULT_ROUTES, options);
    expect(comparison.external.switchingCost).toBe(totalCosts(DEFAULT_ROUTES.EXTERNAL.costs));
    expect(comparison.internal.switchingCost).toBe(0);
    expect(comparison.external.proposedPayment).toBeLessThan(comparison.internal.proposedPayment);
    const better =
      comparison.external.netPresentValue > comparison.internal.netPresentValue ? 'EXTERNAL' : 'INTERNAL';
    expect(comparison.best).toBe(better);
  });

  it('carries a directed loan over unchanged and charges no fee on it', () => {
    const withDirected: ExistingTrack[] = [
      ...existing,
      { id: 'c', type: 'ELIGIBILITY', balance: 100_000, annualRate: 0.03, remainingMonths: 200, monthsElapsed: 60 },
    ];
    const proposal = likeForLikeProposal(withDirected, 0.5, 0.3);
    const directed = proposal.find((track) => track.id === 'c')!;
    expect(directed.annualRate).toBe(0.03);
    expect(proposal.find((track) => track.id === 'a')!.annualRate).toBeLessThan(0.065);

    const analysis = analyseRoute(withDirected, proposal, DEFAULT_ROUTES.INTERNAL, options);
    expect(analysis.prepayment.tracks.some((quote) => quote.id === 'c')).toBe(false);
  });

  it('nets the upfront cost out of the lifetime saving', () => {
    const analysis = analyseRoute(existing, cheaper, DEFAULT_ROUTES.EXTERNAL, options);
    expect(analysis.lifetimeSaving).toBeCloseTo(
      analysis.current.totalPaid - analysis.proposed.totalPaid - analysis.upfrontCost,
      4,
    );
    expect(analysis.path.at(-1)!.cumulativeSaving).toBeCloseTo(analysis.lifetimeSaving, 2);
  });
});
