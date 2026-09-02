package il.mashkanta.engine;

import il.mashkanta.domain.AmortizationMethod;
import il.mashkanta.domain.TrackType;

/**
 * One priced component of a mortgage mix.
 *
 * <p>Fixed tracks carry their whole rate in {@code fixedRate}. Prime and variable tracks carry only
 * the bank's discretionary margin (מרווח הבנק) — the anchor comes from the scenario, which is what
 * makes stress testing meaningful: shocking prime re-prices every prime component automatically.
 *
 * @param type        the Israeli track
 * @param amount      principal in shekels
 * @param termMonths  amortization term in months
 * @param fixedRate   annual nominal rate for fixed tracks, ignored for prime and variable tracks
 * @param margin      annual margin over the scenario anchor for prime and variable tracks
 * @param method      repayment table
 * @param graceMonths interest-only months, only meaningful for {@link AmortizationMethod#GRACE}
 */
public record TrackSpec(
        TrackType type,
        double amount,
        int termMonths,
        double fixedRate,
        double margin,
        AmortizationMethod method,
        int graceMonths) {

    public TrackSpec {
        if (amount < 0) {
            throw new IllegalArgumentException("track amount must not be negative");
        }
        if (termMonths < 1) {
            throw new IllegalArgumentException("track term must be at least one month");
        }
        if (graceMonths < 0 || graceMonths >= termMonths) {
            throw new IllegalArgumentException("grace period must be shorter than the term");
        }
    }

    /** A plain Spitzer track quoted by its all-in annual rate at origination. */
    public static TrackSpec ofRate(TrackType type, double amount, int termMonths, double annualRate,
                                   MacroScenario scenario) {
        return ofRate(type, amount, termMonths, annualRate, scenario, AmortizationMethod.SPITZER, 0);
    }

    /**
     * Builds a spec from the rate the borrower was actually quoted. For anchored tracks the margin
     * is backed out of the quote, so the component keeps re-pricing correctly under shocks.
     */
    public static TrackSpec ofRate(TrackType type, double amount, int termMonths, double annualRate,
                                   MacroScenario scenario, AmortizationMethod method, int graceMonths) {
        if (type.isPrimeAnchored()) {
            return new TrackSpec(type, amount, termMonths, 0, annualRate - scenario.primeAt(1), method, graceMonths);
        }
        if (type.isVariableRate()) {
            return new TrackSpec(type, amount, termMonths, 0, annualRate - scenario.anchorAt(1), method, graceMonths);
        }
        return new TrackSpec(type, amount, termMonths, annualRate, 0, method, graceMonths);
    }

    /** The annual nominal rate charged during the given 1-based month. */
    public double annualRateAt(int month, MacroScenario scenario) {
        if (type.isPrimeAnchored()) {
            return Math.max(0, scenario.primeAt(month) + margin);
        }
        if (type.isVariableRate()) {
            // The anchor is sampled once per reset window and then held for the whole window.
            int reset = type.anchorResetMonths();
            int windowStart = ((month - 1) / reset) * reset + 1;
            return Math.max(0, scenario.anchorAt(windowStart) + margin);
        }
        return Math.max(0, fixedRate);
    }

    /** The rate the borrower sees on the offer sheet. */
    public double initialRate(MacroScenario scenario) {
        return annualRateAt(1, scenario);
    }

    public TrackSpec withAmount(double newAmount) {
        return new TrackSpec(type, newAmount, termMonths, fixedRate, margin, method, graceMonths);
    }

    public TrackSpec withTerm(int newTermMonths) {
        int grace = Math.min(graceMonths, Math.max(0, newTermMonths - 1));
        return new TrackSpec(type, amount, newTermMonths, fixedRate, margin, method, grace);
    }
}
