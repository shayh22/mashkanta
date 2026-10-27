import { describe, expect, it, vi } from 'vitest';
import type { BorrowerProfileRequest } from './types';
import { ApiError, fetchBaseline, fetchDocumentJob, fetchReference, simulate, uploadApproval } from './api';

/** The in-browser API the screens call: offer simulation, document jobs and reference data. */

const profile: BorrowerProfileRequest = {
  propertyValue: 2_000_000,
  loanAmount: 1_200_000,
  termMonths: 300,
  segment: 'FIRST_HOME',
  monthlyNetIncome: 30_000,
  existingMonthlyObligations: 1_000,
  riskTolerance: 5,
  volatilityCapacity: 1_500,
  liquidityEvents: [],
  primePreference: 0.25,
  stablePreference: 0.5,
  dynamicPreference: 0.25,
  eligibilityAmount: 0,
  eligibilityRate: 0,
};

describe('simulating an offer', () => {
  it('refuses an offer with no tracks', async () => {
    const error = await simulate(profile, []).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'VALIDATION_FAILED', details: ['tracks: must not be empty'] });
  });

  it('prices the tracks, largest first, and a track without a term takes the loan term', async () => {
    const result = await simulate(profile, [
      { type: 'PRIME', amount: 400_000, annualRate: 0.055, termMonths: 240 },
      { type: 'FIXED_UNLINKED', amount: 800_000, annualRate: 0.049 },
    ]);
    expect(result.mix.allocations.map((a) => [a.track, a.termMonths])).toEqual([
      ['FIXED_UNLINKED', 300],
      ['PRIME', 240],
    ]);
    expect(result.mix.totalPrincipal).toBeCloseTo(1_200_000, 0);
    expect(result.mix.allocations.reduce((sum, a) => sum + a.share, 0)).toBeCloseTo(1, 6);
    expect(result.compliance.ltv).toBeCloseTo(0.6, 6);
    expect(result.stress.scenarios.length).toBeGreaterThan(0);
    expect(result.opportunity.tracks).toHaveLength(2);
    expect(result.schedule).toEqual([]);
  });

  it('returns the month-by-month schedule only when asked', async () => {
    const { schedule } = await simulate(profile, [{ type: 'FIXED_UNLINKED', amount: 120_000, annualRate: 0.05, termMonths: 24 }], undefined, true);
    expect(schedule).toHaveLength(24);
    expect(schedule[0]).toMatchObject({ track: 'FIXED_UNLINKED', month: 1, openingBalance: 120_000 });
    expect(schedule.at(-1)!.closingBalance).toBeCloseTo(0, 0);
  });
});

describe('document jobs', () => {
  const approval = new File(
    [['אישור עקרוני אחיד — בנק לאומי', 'קבועה לא צמודה 4.65% 350,000 ₪ 300 חודשים', 'פריים מינוס 0.5 200,000 ₪ 300 חודשים'].join('\n')],
    'approval.txt',
    { type: 'text/plain' },
  );

  it('refuses empty, oversized and unsupported files before reading them', async () => {
    await expect(uploadApproval(new File([], 'empty.pdf'))).rejects.toThrow('הקובץ ריק.');
    const huge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf');
    await expect(uploadApproval(huge)).rejects.toThrow('הקובץ גדול מ-10MB.');
    await expect(uploadApproval(new File(['x'], 'offer.docx'))).rejects.toThrow('ניתן להעלות קבצי PDF בלבד.');
  });

  it('reads an approval in the background and reports the tracks when done', async () => {
    const jobId = await uploadApproval(approval);
    await vi.waitFor(async () => expect((await fetchDocumentJob(jobId)).status).toBe('COMPLETED'));
    const job = await fetchDocumentJob(jobId);
    expect(job.result?.bankCode).toBe('LEUMI');
    expect(job.result?.tracks.map((track) => [track.track, track.amount])).toEqual([
      ['FIXED_UNLINKED', 350_000],
      ['PRIME', 200_000],
    ]);
    expect(job.result?.totalAmount).toBe(550_000);
  });

  it('says so when a job id is unknown', async () => {
    await expect(fetchDocumentJob('no-such-job')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('reference data', () => {
  it('lists the amortization methods and segments, and the baseline rates with today\'s anchors', async () => {
    const reference = await fetchReference();
    expect(reference.methods.map((m) => m.id)).toEqual(['SPITZER', 'EQUAL_PRINCIPAL', 'GRACE', 'BALLOON']);
    expect(reference.segments).toHaveLength(4);
    expect(reference.redactedCategories.length).toBeGreaterThan(0);
    const baseline = await fetchBaseline();
    expect(baseline.rates.length).toBeGreaterThan(0);
    expect(baseline.anchors.prime).toBeGreaterThan(0);
  });
});
