package il.mashkanta.service;

/**
 * The borrower's tolerance translated into the weights and caps the optimizer actually consumes.
 *
 * @param riskTolerance      the raw 1..10 score
 * @param costWeight         weight on lifetime cost in the objective, 0..1
 * @param riskWeight         weight on payment volatility, {@code 1 - costWeight}
 * @param cpiAversion        0..1 penalty multiplier on CPI-linked principal
 * @param maxVariableShare   self-imposed cap on rate-sensitive principal, tighter than regulation
 * @param maxPrimeShare      self-imposed cap on the prime track
 * @param volatilityCapacity shekels of monthly increase the household accepts
 * @param prepaymentHorizon  month of the first lump sum earmarked for prepayment, 0 when none
 * @param narrative          Hebrew summary shown at the top of the results page
 */
public record RiskProfile(
        int riskTolerance,
        double costWeight,
        double riskWeight,
        double cpiAversion,
        double maxVariableShare,
        double maxPrimeShare,
        double volatilityCapacity,
        int prepaymentHorizon,
        String narrative) {

    /** True when the borrower expects to repay a meaningful chunk early. */
    public boolean expectsEarlyRepayment() {
        return prepaymentHorizon > 0;
    }
}
