package il.mashkanta.domain;

import java.util.List;

/**
 * Everything the onboarding wizard collects, in one immutable value.
 *
 * @param propertyValue              שווי נכס
 * @param loanAmount                 סכום מבוקש
 * @param termMonths                 requested amortization term
 * @param segment                    borrower classification, which fixes the LTV ceiling
 * @param monthlyNetIncome           combined household net income
 * @param existingMonthlyObligations loans with more than 18 months left to run
 * @param riskTolerance              1 (ultra conservative) to 10 (dynamic)
 * @param volatilityCapacity         shekels of monthly payment increase the household can absorb
 * @param liquidityEvents            expected future lump sums
 * @param primePreference            desired share of the prime track, 0..1
 * @param stablePreference           desired share of fixed tracks, 0..1
 * @param dynamicPreference          desired share of variable tracks, 0..1
 * @param eligibilityAmount          Ministry of Construction and Housing subsidised principal
 * @param eligibilityRate            the regulated rate on that subsidised principal
 */
public record BorrowerProfile(
        double propertyValue,
        double loanAmount,
        int termMonths,
        BuyerSegment segment,
        double monthlyNetIncome,
        double existingMonthlyObligations,
        int riskTolerance,
        double volatilityCapacity,
        List<LiquidityEvent> liquidityEvents,
        double primePreference,
        double stablePreference,
        double dynamicPreference,
        double eligibilityAmount,
        double eligibilityRate) {

    public BorrowerProfile {
        if (propertyValue <= 0) {
            throw new IllegalArgumentException("property value must be positive");
        }
        if (loanAmount <= 0) {
            throw new IllegalArgumentException("loan amount must be positive");
        }
        if (monthlyNetIncome <= 0) {
            throw new IllegalArgumentException("net income must be positive");
        }
        if (riskTolerance < 1 || riskTolerance > 10) {
            throw new IllegalArgumentException("risk tolerance is a 1..10 score");
        }
        liquidityEvents = liquidityEvents == null ? List.of() : List.copyOf(liquidityEvents);
    }

    /** Loan-to-value as a fraction of the property valuation. */
    public double ltv() {
        return loanAmount / propertyValue;
    }

    /** Income left for a mortgage payment once existing obligations are served. */
    public double disposableIncome() {
        return Math.max(0, monthlyNetIncome - existingMonthlyObligations);
    }

    /** The largest month-1 payment that keeps total obligations inside the 40% ceiling. */
    public double maxAffordablePayment() {
        return Math.max(0, monthlyNetIncome * 0.40 - existingMonthlyObligations);
    }

    /** The largest month-1 payment that stays inside the 30% comfort band. */
    public double comfortablePayment() {
        return Math.max(0, monthlyNetIncome * 0.30 - existingMonthlyObligations);
    }

    /** The earliest lump sum earmarked for prepayment, or empty when there is none. */
    public java.util.Optional<LiquidityEvent> firstPrepaymentEvent() {
        return liquidityEvents.stream()
                .filter(LiquidityEvent::earmarkedForPrepayment)
                .min(java.util.Comparator.comparingInt(LiquidityEvent::month));
    }
}
