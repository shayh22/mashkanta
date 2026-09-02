import { create } from 'zustand';
import type { BorrowerProfileRequest, BuyerSegment, LiquidityEvent, MacroRequest } from '../lib/types';

/** The regulatory LTV ceiling per segment, mirrored client-side so the sliders can bound themselves. */
export const SEGMENT_MAX_LTV: Record<BuyerSegment, number> = {
  FIRST_HOME: 0.75,
  UPGRADER: 0.7,
  INVESTOR: 0.5,
  REFINANCE: 0.7,
};

export const SEGMENT_LABELS: Record<BuyerSegment, { title: string; subtitle: string }> = {
  FIRST_HOME: { title: 'דירה ראשונה', subtitle: 'עד 75% מימון' },
  UPGRADER: { title: 'משפרי דיור', subtitle: 'עד 70% מימון' },
  INVESTOR: { title: 'משקיע', subtitle: 'עד 50% מימון' },
  REFINANCE: { title: 'מיחזור משכנתא', subtitle: 'עד 70% מימון' },
};

/**
 * The regulatory ceiling on the loan for a given property value and segment.
 *
 * The clamp is applied to a *copy* of what the user asked for, never to the stored request: a
 * borrower who switches to Investor to see the investor ceiling and switches back must get their
 * original loan amount back, not a silently reduced one.
 */
function clampToCeiling(requested: number, propertyValue: number, segment: BuyerSegment): number {
  return Math.min(requested, propertyValue * SEGMENT_MAX_LTV[segment]);
}

const DEFAULT_PROFILE: BorrowerProfileRequest = {
  propertyValue: 2_400_000,
  loanAmount: 1_680_000,
  termMonths: 300,
  segment: 'FIRST_HOME',
  monthlyNetIncome: 32_000,
  existingMonthlyObligations: 1_500,
  riskTolerance: 5,
  volatilityCapacity: 1_500,
  liquidityEvents: [],
  primePreference: 0.25,
  stablePreference: 0.5,
  dynamicPreference: 0.25,
  eligibilityAmount: 0,
  eligibilityRate: 0.03,
};

interface WizardState {
  step: number;
  profile: BorrowerProfileRequest;
  /**
   * The loan amount the user actually asked for, before any regulatory clamp.
   * `profile.loanAmount` is this value clamped to the current ceiling; keeping the two apart is
   * what lets the amount come back when the ceiling rises again.
   */
  requestedLoanAmount: number;
  macro: MacroRequest;
  /** Where in the market rate distribution to price: 0.5 is the published average. */
  percentile: number;
  submitted: boolean;

  setProfile: (patch: Partial<BorrowerProfileRequest>) => void;
  setSegment: (segment: BuyerSegment) => void;
  setMacro: (patch: MacroRequest) => void;
  setPercentile: (percentile: number) => void;
  setPreferences: (prime: number, stable: number, dynamic: number) => void;
  addLiquidityEvent: (event: LiquidityEvent) => void;
  removeLiquidityEvent: (index: number) => void;
  goTo: (step: number) => void;
  next: () => void;
  back: () => void;
  submit: () => void;
  reset: () => void;
}

export const TOTAL_STEPS = 3;

export const useWizard = create<WizardState>((set) => ({
  step: 1,
  profile: DEFAULT_PROFILE,
  requestedLoanAmount: DEFAULT_PROFILE.loanAmount,
  macro: {},
  percentile: 0.5,
  submitted: false,

  setProfile: (patch) =>
    set((state) => {
      const profile = { ...state.profile, ...patch };
      // Typing a loan amount is a new request; changing anything else only re-derives the clamp,
      // so raising the property value restores an amount an earlier ceiling had cut.
      const requestedLoanAmount =
        patch.loanAmount === undefined ? state.requestedLoanAmount : patch.loanAmount;
      profile.loanAmount = clampToCeiling(requestedLoanAmount, profile.propertyValue, profile.segment);
      return { profile, requestedLoanAmount };
    }),

  setSegment: (segment) =>
    set((state) => ({
      profile: {
        ...state.profile,
        segment,
        loanAmount: clampToCeiling(state.requestedLoanAmount, state.profile.propertyValue, segment),
      },
    })),

  setMacro: (patch) => set((state) => ({ macro: { ...state.macro, ...patch } })),

  setPercentile: (percentile) => set({ percentile }),

  setPreferences: (prime, stable, dynamic) =>
    set((state) => ({
      profile: {
        ...state.profile,
        primePreference: prime,
        stablePreference: stable,
        dynamicPreference: dynamic,
      },
    })),

  addLiquidityEvent: (event) =>
    set((state) => ({
      profile: {
        ...state.profile,
        liquidityEvents: [...state.profile.liquidityEvents, event].sort((a, b) => a.month - b.month),
      },
    })),

  removeLiquidityEvent: (index) =>
    set((state) => ({
      profile: {
        ...state.profile,
        liquidityEvents: state.profile.liquidityEvents.filter((_, i) => i !== index),
      },
    })),

  goTo: (step) => set({ step: Math.min(TOTAL_STEPS, Math.max(1, step)) }),
  next: () => set((state) => ({ step: Math.min(TOTAL_STEPS, state.step + 1) })),
  back: () => set((state) => ({ step: Math.max(1, state.step - 1) })),
  submit: () => set({ submitted: true }),
  reset: () =>
    set({
      step: 1,
      profile: DEFAULT_PROFILE,
      requestedLoanAmount: DEFAULT_PROFILE.loanAmount,
      macro: {},
      percentile: 0.5,
      submitted: false,
    }),
}));

/** Metrics the wizard shows live, without a round trip to the backend. */
export function useDerivedMetrics() {
  const profile = useWizard((state) => state.profile);
  const requestedLoanAmount = useWizard((state) => state.requestedLoanAmount);
  const ltv = profile.loanAmount / profile.propertyValue;
  const maxLtv = SEGMENT_MAX_LTV[profile.segment];

  return {
    ltv,
    maxLtv,
    requestedLoanAmount,
    /** True when the ceiling is currently holding the loan below what the user asked for. */
    isClamped: requestedLoanAmount > profile.loanAmount + 1,
    maxLoan: profile.propertyValue * maxLtv,
    equity: Math.max(0, profile.propertyValue - profile.loanAmount),
    ltvExceeded: ltv > maxLtv + 1e-9,
    disposableIncome: Math.max(0, profile.monthlyNetIncome - profile.existingMonthlyObligations),
    /** The payment ceiling implied by the 40% debt-to-income rule. */
    maxAffordablePayment: Math.max(
      0,
      profile.monthlyNetIncome * 0.4 - profile.existingMonthlyObligations,
    ),
    comfortablePayment: Math.max(
      0,
      profile.monthlyNetIncome * 0.3 - profile.existingMonthlyObligations,
    ),
  };
}
