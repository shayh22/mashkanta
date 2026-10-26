import { describe, expect, it } from 'vitest';
import type { ExistingTrack } from './prepayment';
import {
  analyseRoute,
  compareRoutes,
  DEFAULT_ROUTES,
  IMMEDIATE_BREAKEVEN_MONTHS,
  likeForLikeProposal,
  totalCosts,
  trackByTrack,
  withKeptTracks,
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
  {
    id: 'a',
    type: 'FIXED_UNLINKED',
    balance: 600_000,
    annualRate: 0.065,
    remainingMonths: 240,
    monthsElapsed: 60,
  },
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
      {
        id: 'c',
        type: 'ELIGIBILITY',
        balance: 100_000,
        annualRate: 0.03,
        remainingMonths: 200,
        monthsElapsed: 60,
      },
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

describe('partial refinance', () => {
  // Discounting the saving above today's average rate makes re-pricing a fixed track at the median
  // worth less than its capitalization fee, while prime carries no such fee.
  const strict: RefinanceOptions = { ...options, discountRate: 0.06 };
  const mixed: ExistingTrack[] = [
    {
      id: 'prime',
      type: 'PRIME',
      balance: 500_000,
      annualRate: 0.0675,
      remainingMonths: 300,
      monthsElapsed: 24,
    },
    {
      id: 'fixed',
      type: 'FIXED_UNLINKED',
      balance: 500_000,
      annualRate: 0.06,
      remainingMonths: 300,
      monthsElapsed: 24,
    },
  ];

  it('prices each track on its own and separates the ones that pay', () => {
    const verdicts = trackByTrack(mixed, 0.5, strict);
    const prime = verdicts.find((v) => v.id === 'prime')!;
    const fixed = verdicts.find((v) => v.id === 'fixed')!;
    expect(prime.worthwhile).toBe(true);
    expect(fixed.fee).toBeGreaterThan(prime.fee);
    expect(fixed.worthwhile).toBe(false);
  });

  it('keeping the losing track beats refinancing everything', () => {
    const full = analyseRoute(mixed, likeForLikeProposal(mixed, 0.5, 0.5), DEFAULT_ROUTES.INTERNAL, strict);
    const kept = new Set(['fixed']);
    const partial = analyseRoute(
      mixed,
      likeForLikeProposal(mixed, 0.5, 0.5, kept),
      DEFAULT_ROUTES.INTERNAL,
      strict,
    );
    expect(partial.netPresentValue).toBeGreaterThan(full.netPresentValue);
    expect(partial.prepayment.tracks.map((quote) => quote.id)).toEqual(['prime']);
    // The kept track's payment is the same on both sides.
    const keptTrack = partial.proposed.tracks.find((track) => track.type === 'FIXED_UNLINKED')!;
    expect(keptTrack.initialRate).toBe(0.06);
  });

  it('never applies a competitor rate edge to a track carried over unchanged', () => {
    const directed: ExistingTrack[] = [
      {
        id: 'e',
        type: 'ELIGIBILITY',
        balance: 100_000,
        annualRate: 0.03,
        remainingMonths: 200,
        monthsElapsed: 60,
      },
    ];
    const analysis = analyseRoute(
      directed,
      likeForLikeProposal(directed, 0.5, 0.3),
      DEFAULT_ROUTES.EXTERNAL,
      options,
    );
    expect(analysis.monthlySaving).toBeCloseTo(0, 6);
    expect(analysis.prepayment.tracks).toHaveLength(0);
  });

  it('adds kept tracks to a hand-entered proposal without duplicating them', () => {
    const manual: ProposedTrack[] = [
      { id: 'prime', type: 'PRIME', amount: 500_000, annualRate: 0.06, termMonths: 300 },
      { id: 'fixed', type: 'FIXED_UNLINKED', amount: 500_000, annualRate: 0.05, termMonths: 300 },
    ];
    const merged = withKeptTracks(manual, mixed, new Set(['fixed']));
    expect(merged).toHaveLength(2);
    expect(merged.find((track) => track.id === 'fixed')).toMatchObject({
      carriedOver: true,
      annualRate: 0.06,
    });
  });
});

describe('manual proposals and eligibility loans', () => {
  it('carries an eligibility loan over even when the hand-entered proposal leaves it out', () => {
    const existing: ExistingTrack[] = [
      { id: 'p', type: 'PRIME', balance: 300_000, annualRate: 0.06, remainingMonths: 240, monthsElapsed: 30 },
      {
        id: 'e',
        type: 'ELIGIBILITY',
        balance: 100_000,
        annualRate: 0.03,
        remainingMonths: 240,
        monthsElapsed: 30,
      },
    ];
    const manual: ProposedTrack[] = [
      { id: 'p', type: 'PRIME', amount: 300_000, annualRate: 0.055, termMonths: 240 },
    ];
    const proposal = withKeptTracks(manual, existing, new Set());
    expect(proposal.find((track) => track.id === 'e')).toMatchObject({ carriedOver: true, annualRate: 0.03 });
    // The saving is the prime re-pricing only, not the whole eligibility payment.
    const analysis = analyseRoute(existing, proposal, DEFAULT_ROUTES.INTERNAL, options);
    const primeOnly = analyseRoute([existing[0]!], manual, DEFAULT_ROUTES.INTERNAL, options);
    expect(analysis.monthlySaving).toBeCloseTo(primeOnly.monthlySaving, 6);
  });
});
