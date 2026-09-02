/**
 * The application's data layer.
 *
 * Every calculation runs in the browser: the engine under `src/engine` is a faithful port of the
 * Java service, verified against it to within floating-point noise. That keeps the deployment a
 * pile of static files — free and unmetered on Cloudflare Pages — removes the network round trip
 * from every recalculation, and means an uploaded approval-in-principle never leaves the device.
 *
 * The functions keep their original asynchronous signatures so components, React Query caches and
 * mutations are unchanged from when this talked to a server.
 */
import {
  MAX_UPLOAD_BYTES,
  extractApproval,
  type DocumentExtraction,
} from '../engine/documents';
import { compareBanks } from '../engine/banks';
import { priceMix, yearlySummary, type MixResult } from '../engine/amortization';
import { BASELINE_RATES, rateFor } from '../engine/baseline';
import { optimize as runOptimizer, type MixProposal as EngineProposal } from '../engine/optimizer';
import { scoreOffer } from '../engine/opportunity';
import { profileRisk, type BorrowerProfile } from '../engine/profile';
import { LIMITS, SEGMENT_MAX_LTV, SEGMENT_NAMES, validate } from '../engine/regulatory';
import { REDACTION_CATEGORIES } from '../engine/redaction';
import { runStressTests, worstPayment } from '../engine/stress';
import { baselineScenario, DEFAULT_ANCHOR, DEFAULT_CPI, DEFAULT_PRIME, type MacroScenario as EngineScenario } from '../engine/scenario';
import { TRACKS, trackFromRate, type TrackSpec } from '../engine/tracks';
import { round2, roundRate } from '../engine/math';
import type {
  AmortizationMethod,
  BaselineResponse,
  BorrowerProfileRequest,
  BuyerSegment,
  DocumentJob,
  MacroAnchors,
  MacroRequest,
  MacroScenario,
  MixSummary,
  MixProposal,
  OptimizationResponse,
  ReferenceResponse,
  ScheduleRow,
  SimulationResponse,
  TrackAllocation,
  TrackRequest,
  TrackType,
} from './types';

/** Kept so existing error handling in the components continues to compile and behave. */
export class ApiError extends Error {
  readonly code: string;
  readonly details: string[];
  readonly status: number;

  constructor(message: string, code = 'ENGINE_ERROR', details: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.status = 400;
  }
}

// ---------------------------------------------------------------------------
// Published anchors
// ---------------------------------------------------------------------------

/**
 * The published economic anchors the app starts from.
 *
 * With no server there is nothing to synchronise them, so they are seeded constants and the UI
 * says so. A borrower can override both prime and inflation in the wizard.
 */
function currentAnchors(): MacroAnchors {
  const today = new Date();
  const lastCpi = new Date(today.getFullYear(), today.getMonth() - (today.getDate() >= 15 ? 0 : 1), 15);
  const nextCpi = new Date(lastCpi.getFullYear(), lastCpi.getMonth() + 1, 15);
  const iso = (date: Date) => date.toISOString().slice(0, 10);

  return {
    prime: DEFAULT_PRIME,
    cpiAnnual: DEFAULT_CPI,
    bondYield5y: DEFAULT_ANCHOR,
    linkedYield5y: 0.018,
    primeUpdatedOn: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
    cpiUpdatedOn: iso(lastCpi),
    nextCpiOn: iso(nextCpi),
    source: 'ערכי בסיס — בנק ישראל והלשכה המרכזית לסטטיסטיקה',
  };
}

function scenarioOf(macro?: MacroRequest): EngineScenario {
  const anchors = currentAnchors();
  return baselineScenario(
    macro?.prime ?? anchors.prime,
    macro?.cpiAnnual ?? anchors.cpiAnnual,
    macro?.anchor ?? anchors.bondYield5y,
  );
}

function toDtoScenario(scenario: EngineScenario): MacroScenario {
  return {
    ...scenario,
    shocked: scenario.primeShock !== 0 || scenario.cpiShock !== 0 || scenario.anchorShock !== 0,
  };
}

function toBorrower(request: BorrowerProfileRequest): BorrowerProfile {
  // Preferences are a three-way split; normalise so 30/30/30 is not treated as 90% of a loan.
  const prime = Math.max(0, request.primePreference ?? 0.25);
  const stable = Math.max(0, request.stablePreference ?? 0.5);
  const dynamic = Math.max(0, request.dynamicPreference ?? 0.25);
  const sum = prime + stable + dynamic;

  return {
    ...request,
    liquidityEvents: request.liquidityEvents ?? [],
    primePreference: sum > 0 ? prime / sum : 0,
    stablePreference: sum > 0 ? stable / sum : 0,
    dynamicPreference: sum > 0 ? dynamic / sum : 0,
  };
}

// ---------------------------------------------------------------------------
// Adapters from engine values to the shapes the components already render
// ---------------------------------------------------------------------------

function toAllocationDto(allocation: EngineProposal['allocations'][number]): TrackAllocation {
  return {
    track: allocation.track,
    hebrewName: allocation.hebrewName,
    amount: round2(allocation.amount),
    share: roundRate(allocation.share),
    annualRate: roundRate(allocation.annualRate),
    termMonths: allocation.termMonths,
    method: allocation.method,
    initialPayment: round2(allocation.initialPayment),
    maxPayment: round2(allocation.maxPayment),
    totalPaid: round2(allocation.totalPaid),
    totalInterest: round2(allocation.totalInterest),
    totalIndexation: round2(allocation.totalIndexation),
  };
}

function toSummary(result: MixResult, allocations: EngineProposal['allocations']): MixSummary {
  return {
    totalPrincipal: round2(result.totalPrincipal),
    termMonths: result.termMonths,
    initialPayment: round2(result.initialPayment),
    maxPayment: round2(result.maxPayment),
    maxPaymentMonth: result.maxPaymentMonth,
    totalPaid: round2(result.totalPaid),
    totalInterest: round2(result.totalInterest),
    totalIndexation: round2(result.totalIndexation),
    totalCost: round2(result.totalPaid - result.totalPrincipal),
    nominalIrr: roundRate(result.nominalIrr),
    realIrr: roundRate(result.realIrr),
    weightedInitialRate: roundRate(result.weightedInitialRate),
    allocations: allocations.map(toAllocationDto),
    yearly: yearlySummary(result).map((point) => ({
      year: point.year,
      remainingBalance: round2(point.remainingBalance),
      averageMonthlyPayment: round2(point.averageMonthlyPayment),
      interestPaid: round2(point.interestPaid),
      indexationAccrued: round2(point.indexationAccrued),
      cumulativeInterest: round2(point.cumulativeInterest),
      cumulativeIndexation: round2(point.cumulativeIndexation),
      cumulativePaid: round2(point.cumulativePaid),
    })),
  };
}

/** The engine works in readonly values; the response types are mutable, so copy at the boundary. */
function toStressDto(stress: ReturnType<typeof runStressTests>) {
  return { ...stress, scenarios: [...stress.scenarios] };
}

function toProposalDto(proposal: EngineProposal): MixProposal {
  return {
    id: proposal.id,
    name: proposal.name,
    description: proposal.description,
    recommended: proposal.recommended,
    score: proposal.score,
    summary: toSummary(proposal.result, proposal.allocations),
    compliance: proposal.compliance,
    stress: toStressDto(proposal.stress),
  };
}

// ---------------------------------------------------------------------------
// Public API — same names and signatures as the HTTP client it replaces
// ---------------------------------------------------------------------------

export async function fetchReference(): Promise<ReferenceResponse> {
  const methods: { id: AmortizationMethod; hebrewName: string; englishName: string }[] = [
    { id: 'SPITZER', hebrewName: 'לוח שפיצר', englishName: 'Spitzer annuity' },
    { id: 'EQUAL_PRINCIPAL', hebrewName: 'קרן שווה', englishName: 'Equal principal' },
    { id: 'GRACE', hebrewName: 'גרייס חלקי', englishName: 'Partial grace (interest only)' },
    { id: 'BALLOON', hebrewName: 'בלון / גרייס מלא', englishName: 'Balloon (full deferral)' },
  ];

  const segmentCodes: Record<BuyerSegment, string> = {
    FIRST_HOME: 'SEG-01',
    UPGRADER: 'SEG-02',
    INVESTOR: 'SEG-03',
    REFINANCE: 'SEG-04',
  };

  return {
    tracks: (Object.keys(TRACKS) as TrackType[]).map((id) => ({
      id,
      hebrewName: TRACKS[id].hebrewName,
      englishName: TRACKS[id].englishName,
      cpiLinked: TRACKS[id].cpiLinked,
      variableRate: TRACKS[id].variableRate,
      anchorResetMonths: TRACKS[id].anchorResetMonths,
      primeAnchored: TRACKS[id].primeAnchored,
    })),
    segments: (Object.keys(SEGMENT_MAX_LTV) as BuyerSegment[]).map((id) => ({
      id,
      code: segmentCodes[id],
      hebrewName: SEGMENT_NAMES[id],
      englishName: id,
      maxLtv: SEGMENT_MAX_LTV[id],
    })),
    methods,
    limits: {
      ptiWarning: LIMITS.PTI_WARNING,
      ptiCeiling: LIMITS.PTI_CEILING,
      maxPrimeShare: LIMITS.MAX_PRIME_SHARE,
      maxVariableShare: LIMITS.MAX_VARIABLE_SHARE,
      minFixedShare: LIMITS.MIN_FIXED_SHARE,
      maxTermMonths: LIMITS.MAX_TERM_MONTHS,
      minTermMonths: LIMITS.MIN_TERM_MONTHS,
    },
    anchors: currentAnchors(),
    redactedCategories: [...REDACTION_CATEGORIES],
  };
}

export async function fetchBaseline(): Promise<BaselineResponse> {
  return {
    rates: BASELINE_RATES.map((entry) => ({ ...entry })),
    lastRefreshed: new Date().toISOString().slice(0, 10),
    anchors: currentAnchors(),
  };
}

export async function optimize(
  profile: BorrowerProfileRequest,
  macro?: MacroRequest,
  percentile?: number,
): Promise<OptimizationResponse> {
  const borrower = toBorrower(profile);
  const scenario = scenarioOf(macro);
  const risk = profileRisk(borrower);
  const result = runOptimizer(borrower, risk, scenario, percentile ?? 0.5);

  const allocation = new Map<TrackType, number>();
  for (const track of result.recommended.allocations) {
    allocation.set(track.track, (allocation.get(track.track) ?? 0) + track.share);
  }

  return {
    recommended: toProposalDto(result.recommended),
    baskets: result.baskets.map(toProposalDto),
    alternatives: result.alternatives.map(toProposalDto),
    savings: result.savings.map((saving) => ({ ...saving })),
    riskProfile: result.riskProfile,
    termSensitivity: result.termSensitivity.map((option) => ({ ...option })),
    bankQuotes: compareBanks(
      allocation,
      borrower.loanAmount,
      borrower.termMonths,
      borrower.loanAmount / borrower.propertyValue,
      scenario,
    ),
    relaxedConstraints: [...result.relaxedConstraints],
    macro: toDtoScenario(scenario),
    candidatesEvaluated: result.candidatesEvaluated,
    computeMillis: result.computeMillis,
  };
}

export async function simulate(
  profile: BorrowerProfileRequest,
  tracks: TrackRequest[],
  macro?: MacroRequest,
  includeSchedule = false,
): Promise<SimulationResponse> {
  const started = performance.now();
  const borrower = toBorrower(profile);
  const scenario = scenarioOf(macro);

  if (tracks.length === 0) {
    throw new ApiError('לא הוזנו מסלולים לחישוב.', 'VALIDATION_FAILED', ['tracks: must not be empty']);
  }

  const specs: TrackSpec[] = tracks.map((track) =>
    trackFromRate(
      track.type,
      track.amount,
      track.termMonths && track.termMonths > 0 ? track.termMonths : borrower.termMonths,
      track.annualRate,
      scenario,
      track.method ?? 'SPITZER',
      track.graceMonths ?? 0,
    ),
  );

  const risk = profileRisk(borrower);
  const result = priceMix(specs, scenario);
  const stress = runStressTests(specs, scenario, result, risk.volatilityCapacity);
  const compliance = validate(borrower, result, worstPayment(stress));
  const opportunity = scoreOffer(specs, borrower.loanAmount / borrower.propertyValue, scenario);

  const allocations = result.tracks
    .map((track) => ({
      track: track.type,
      hebrewName: TRACKS[track.type].hebrewName,
      amount: track.amount,
      share: result.totalPrincipal > 0 ? track.amount / result.totalPrincipal : 0,
      annualRate: track.initialRate,
      termMonths: track.termMonths,
      method: track.method,
      initialPayment: track.initialPayment,
      maxPayment: track.maxPayment,
      totalPaid: track.totalPaid,
      totalInterest: track.totalInterest,
      totalIndexation: track.totalIndexation,
    }))
    .sort((a, b) => b.amount - a.amount);

  const schedule: ScheduleRow[] = includeSchedule
    ? result.tracks.flatMap((track) =>
        track.schedule.map((row) => ({
          track: track.type,
          month: row.month,
          openingBalance: round2(row.openingBalance),
          indexation: round2(row.indexation),
          interest: round2(row.interest),
          principal: round2(row.principal),
          payment: round2(row.payment),
          closingBalance: round2(row.closingBalance),
          annualRate: roundRate(row.annualRate),
        })),
      )
    : [];

  return {
    mix: toSummary(result, allocations),
    compliance,
    stress: toStressDto(stress),
    opportunity: { ...opportunity, tracks: [...opportunity.tracks] },
    schedule,
    macro: toDtoScenario(scenario),
    computeMillis: Math.round(performance.now() - started),
  };
}

// ---------------------------------------------------------------------------
// Documents — extracted locally, kept behind the original job-polling shape
// ---------------------------------------------------------------------------

/**
 * Extraction is now local and fast, but the uploader polls for a job. Keeping that contract means
 * the component is unchanged and the UI still shows honest progress for a large PDF.
 */
const jobs = new Map<string, DocumentJob>();

function toJobResult(extraction: DocumentExtraction): NonNullable<DocumentJob['result']> {
  return {
    pageCount: extraction.pageCount,
    redactedSpans: extraction.redactedSpans,
    redactionsByCategory: { ...extraction.redactionsByCategory },
    bankCode: extraction.bankCode,
    totalAmount: extraction.totalAmount,
    tracks: extraction.tracks.map((track) => ({ ...track })),
    warnings: [...extraction.warnings],
  };
}

export async function uploadApproval(file: File, _ltv: number, _contribute: boolean): Promise<string> {
  if (file.size === 0) {
    throw new ApiError('הקובץ ריק.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError('הקובץ גדול מ-10MB.');
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith('.pdf') && !name.endsWith('.txt')) {
    throw new ApiError('ניתן להעלות קבצי PDF בלבד.');
  }

  const jobId = crypto.randomUUID();
  jobs.set(jobId, {
    jobId,
    status: 'PROCESSING',
    submittedAt: new Date().toISOString(),
    redactedSpans: 0,
  });

  const prime = currentAnchors().prime;
  void extractApproval(file, prime)
    .then((extraction) => {
      jobs.set(jobId, {
        jobId,
        status: 'COMPLETED',
        submittedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        redactedSpans: extraction.redactedSpans,
        result: toJobResult(extraction),
      });
    })
    .catch((error: unknown) => {
      jobs.set(jobId, {
        jobId,
        status: 'FAILED',
        submittedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        redactedSpans: 0,
        error: error instanceof Error ? error.message : 'עיבוד המסמך נכשל.',
      });
    });

  return jobId;
}

export async function fetchDocumentJob(jobId: string): Promise<DocumentJob> {
  const job = jobs.get(jobId);
  if (!job) {
    throw new ApiError('לא נמצאה בקשת עיבוד עם המזהה שנשלח.', 'NOT_FOUND');
  }
  return job;
}

/** The market rate distribution for one track, used by the offer review screen. */
export { rateFor };
