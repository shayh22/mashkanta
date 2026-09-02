package il.mashkanta.engine;

/**
 * The macro-economic path a simulation is priced against.
 *
 * <p>A scenario is immutable and cheap to copy, so stress testing simply derives shocked copies of
 * the baseline. Shocks are parallel shifts applied from {@code shockStartMonth} onwards, which lets
 * the caller model both an immediate repricing and a delayed one.
 *
 * @param primeAnnual          Bank of Israel prime rate as a fraction (0.0575 = 5.75%)
 * @param cpiAnnual            expected annual CPI change as a fraction (0.024 = 2.4%)
 * @param variableAnchorAnnual 5-year government bond yield used to re-anchor variable tracks
 * @param primeShock           additive shift to prime from {@code shockStartMonth}
 * @param cpiShock             additive shift to annual inflation from {@code shockStartMonth}
 * @param anchorShock          additive shift to the variable anchor from {@code shockStartMonth}
 * @param shockStartMonth      first 1-based month in which the shocks apply
 * @param label                human readable Hebrew label used in the UI
 */
public record MacroScenario(
        double primeAnnual,
        double cpiAnnual,
        double variableAnchorAnnual,
        double primeShock,
        double cpiShock,
        double anchorShock,
        int shockStartMonth,
        String label) {

    /** Bank of Israel prime as of the last synchronisation, used when the client sends nothing. */
    public static final double DEFAULT_PRIME = 0.0575;
    /** Central Bureau of Statistics trailing inflation, used when the client sends nothing. */
    public static final double DEFAULT_CPI = 0.024;
    /** 5-year non-linked government bond yield, the anchor for variable tracks. */
    public static final double DEFAULT_ANCHOR = 0.042;

    public MacroScenario {
        if (shockStartMonth < 1) {
            throw new IllegalArgumentException("shockStartMonth is 1-based");
        }
    }

    /** The unshocked baseline built from the current published anchors. */
    public static MacroScenario baseline(double primeAnnual, double cpiAnnual, double anchorAnnual) {
        return new MacroScenario(primeAnnual, cpiAnnual, anchorAnnual, 0, 0, 0, 1, "תרחיש בסיס");
    }

    public static MacroScenario defaults() {
        return baseline(DEFAULT_PRIME, DEFAULT_CPI, DEFAULT_ANCHOR);
    }

    /** Derives a shocked copy. Prime and the bond anchor move together — they share a policy driver. */
    public MacroScenario withShock(double ratePoints, double cpiPoints, int startMonth, String label) {
        return new MacroScenario(primeAnnual, cpiAnnual, variableAnchorAnnual,
                ratePoints, cpiPoints, ratePoints, Math.max(1, startMonth), label);
    }

    /** Prime rate in effect during the given 1-based month, floored at zero. */
    public double primeAt(int month) {
        return Math.max(0, primeAnnual + (month >= shockStartMonth ? primeShock : 0));
    }

    /** Variable-track anchor in effect during the given 1-based month, floored at zero. */
    public double anchorAt(int month) {
        return Math.max(0, variableAnchorAnnual + (month >= shockStartMonth ? anchorShock : 0));
    }

    /** Annual inflation in effect during the given 1-based month. Deflation is permitted. */
    public double cpiAnnualAt(int month) {
        return cpiAnnual + (month >= shockStartMonth ? cpiShock : 0);
    }

    /** Geometric monthly inflation derived from the annual figure in effect that month. */
    public double monthlyInflationAt(int month) {
        double annual = cpiAnnualAt(month);
        return Math.pow(1 + annual, 1.0 / 12.0) - 1;
    }

    /** True when any shock is configured; used to label results in the UI. */
    public boolean isShocked() {
        return primeShock != 0 || cpiShock != 0 || anchorShock != 0;
    }
}
