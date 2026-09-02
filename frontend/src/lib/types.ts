/**
 * TypeScript mirrors of the backend contract.
 *
 * The backend serialises Java records, so every field below is present unless the API is
 * explicitly documented as omitting it (Jackson is configured to drop nulls).
 */

export type TrackType =
  | 'PRIME'
  | 'FIXED_UNLINKED'
  | 'FIXED_LINKED'
  | 'VARIABLE_UNLINKED'
  | 'VARIABLE_LINKED'
  | 'ELIGIBILITY';

export type BuyerSegment = 'FIRST_HOME' | 'UPGRADER' | 'INVESTOR' | 'REFINANCE';

export type AmortizationMethod = 'SPITZER' | 'EQUAL_PRINCIPAL' | 'GRACE' | 'BALLOON';

export type ComplianceLevel = 'OK' | 'WARNING' | 'BLOCKING';

export interface LiquidityEvent {
  month: number;
  amount: number;
  source: string;
  earmarkedForPrepayment: boolean;
}

export interface BorrowerProfileRequest {
  propertyValue: number;
  loanAmount: number;
  termMonths: number;
  segment: BuyerSegment;
  monthlyNetIncome: number;
  existingMonthlyObligations: number;
  riskTolerance: number;
  volatilityCapacity: number;
  liquidityEvents: LiquidityEvent[];
  primePreference: number;
  stablePreference: number;
  dynamicPreference: number;
  eligibilityAmount: number;
  eligibilityRate: number;
}

export interface MacroRequest {
  prime?: number;
  cpiAnnual?: number;
  anchor?: number;
}

export interface TrackRequest {
  type: TrackType;
  amount: number;
  termMonths?: number;
  annualRate: number;
  method?: AmortizationMethod;
  graceMonths?: number;
}

export interface TrackAllocation {
  track: TrackType;
  hebrewName: string;
  amount: number;
  share: number;
  annualRate: number;
  termMonths: number;
  method: AmortizationMethod;
  initialPayment: number;
  maxPayment: number;
  totalPaid: number;
  totalInterest: number;
  totalIndexation: number;
}

export interface YearPoint {
  year: number;
  remainingBalance: number;
  averageMonthlyPayment: number;
  interestPaid: number;
  indexationAccrued: number;
  cumulativeInterest: number;
  cumulativeIndexation: number;
  cumulativePaid: number;
}

export interface MixSummary {
  totalPrincipal: number;
  termMonths: number;
  initialPayment: number;
  maxPayment: number;
  maxPaymentMonth: number;
  totalPaid: number;
  totalInterest: number;
  totalIndexation: number;
  totalCost: number;
  nominalIrr: number;
  realIrr: number;
  weightedInitialRate: number;
  allocations: TrackAllocation[];
  yearly: YearPoint[];
}

export interface ComplianceFinding {
  code: string;
  level: ComplianceLevel;
  title: string;
  message: string;
  actual: number;
  limit: number;
}

export interface ComplianceReport {
  ltv: number;
  maxLtv: number;
  pti: number;
  stressedPti: number;
  dti: number;
  level: ComplianceLevel;
  findings: ComplianceFinding[];
  underwritable: boolean;
}

export interface StressScenario {
  id: string;
  label: string;
  ratePoints: number;
  cpiAnnual: number;
  initialPayment: number;
  maxPayment: number;
  maxPaymentMonth: number;
  paymentAtYear5: number;
  totalPaid: number;
  paymentIncrease: number;
  totalPaidIncrease: number;
  breachesCapacity: boolean;
}

export interface StressMatrix {
  scenarios: StressScenario[];
  worstCase: StressScenario;
  worstIncrease: number;
  anyBreach: boolean;
}

export interface MixProposal {
  id: string;
  name: string;
  description: string;
  recommended: boolean;
  score: number;
  summary: MixSummary;
  compliance: ComplianceReport;
  stress: StressMatrix;
}

export interface MacroScenario {
  primeAnnual: number;
  cpiAnnual: number;
  variableAnchorAnnual: number;
  primeShock: number;
  cpiShock: number;
  anchorShock: number;
  shockStartMonth: number;
  label: string;
  shocked: boolean;
}

export interface OpportunityTrack {
  track: TrackType;
  hebrewName: string;
  amount: number;
  offeredRate: number;
  medianRate: number;
  bestRate: number;
  percentile: number;
  gapToMedian: number;
}

export interface OpportunityReport {
  score: number;
  grade: string;
  marketPercentile: number;
  offeredWeightedRate: number;
  bestWeightedRate: number;
  totalPaidAsOffered: number;
  totalPaidAtBest: number;
  potentialSaving: number;
  monthlySaving: number;
  tracks: OpportunityTrack[];
  narrative: string;
}

export interface ScheduleRow {
  track: TrackType;
  month: number;
  openingBalance: number;
  indexation: number;
  interest: number;
  principal: number;
  payment: number;
  closingBalance: number;
  annualRate: number;
}

export interface SimulationResponse {
  mix: MixSummary;
  compliance: ComplianceReport;
  stress: StressMatrix;
  opportunity: OpportunityReport;
  schedule: ScheduleRow[];
  macro: MacroScenario;
  computeMillis: number;
}

export interface RiskProfile {
  riskTolerance: number;
  costWeight: number;
  riskWeight: number;
  cpiAversion: number;
  maxVariableShare: number;
  maxPrimeShare: number;
  volatilityCapacity: number;
  prepaymentHorizon: number;
  narrative: string;
}

export interface SavingsComparison {
  againstId: string;
  againstName: string;
  totalPaidSaving: number;
  initialPaymentDelta: number;
  irrDelta: number;
}

export interface TermOption {
  termMonths: number;
  initialPayment: number;
  totalPaid: number;
  nominalIrr: number;
  affordable: boolean;
}

export interface BankQuote {
  code: string;
  hebrewName: string;
  marketShare: number;
  note: string;
  rates: Partial<Record<TrackType, number>>;
  weightedRate: number;
  initialPayment: number;
  maxPayment: number;
  totalPaid: number;
  nominalIrr: number;
  rank: number;
  costAboveBest: number;
}

export interface OptimizationResponse {
  recommended: MixProposal;
  baskets: MixProposal[];
  alternatives: MixProposal[];
  savings: SavingsComparison[];
  riskProfile: RiskProfile;
  termSensitivity: TermOption[];
  bankQuotes: BankQuote[];
  relaxedConstraints: string[];
  macro: MacroScenario;
  candidatesEvaluated: number;
  computeMillis: number;
}

export interface MacroAnchors {
  prime: number;
  cpiAnnual: number;
  bondYield5y: number;
  linkedYield5y: number;
  primeUpdatedOn: string;
  cpiUpdatedOn: string;
  nextCpiOn: string;
  source: string;
}

export interface MarketRate {
  track: TrackType;
  tier: 'UP_TO_45' | 'FROM_45_TO_60' | 'ABOVE_60';
  bestRate: number;
  medianRate: number;
  worstRate: number;
  sampleSize: number;
  source: string;
}

export interface BaselineResponse {
  rates: MarketRate[];
  lastRefreshed: string;
  anchors: MacroAnchors;
}

export interface TrackDescriptor {
  id: TrackType;
  hebrewName: string;
  englishName: string;
  cpiLinked: boolean;
  variableRate: boolean;
  anchorResetMonths: number;
  primeAnchored: boolean;
}

export interface SegmentDescriptor {
  id: BuyerSegment;
  code: string;
  hebrewName: string;
  englishName: string;
  maxLtv: number;
}

export interface ReferenceResponse {
  tracks: TrackDescriptor[];
  segments: SegmentDescriptor[];
  methods: { id: AmortizationMethod; hebrewName: string; englishName: string }[];
  limits: Record<string, number>;
  anchors: MacroAnchors;
  redactedCategories: string[];
}

export interface ParsedTrack {
  track: TrackType;
  hebrewName: string;
  amount: number;
  annualRate: number;
  termMonths: number;
  sourceLine: string;
}

export interface DocumentJob {
  jobId: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  submittedAt: string;
  completedAt?: string;
  redactedSpans: number;
  result?: {
    pageCount: number;
    redactedSpans: number;
    redactionsByCategory: Record<string, number>;
    bankCode?: string;
    totalAmount: number;
    tracks: ParsedTrack[];
    warnings: string[];
  };
  error?: string;
}
