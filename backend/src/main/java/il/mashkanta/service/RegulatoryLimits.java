package il.mashkanta.service;

/**
 * The hard numbers behind Bank of Israel Proper Conduct of Banking Business Directives 329 and 451,
 * kept in one place so a regulatory change is a one-line edit rather than a hunt through the engine.
 */
public final class RegulatoryLimits {

    /** Payment-to-income above which the bank prices a risk premium and needs an exception. */
    public static final double PTI_WARNING = 0.30;
    /** Payment-to-income that may not be underwritten at all. */
    public static final double PTI_CEILING = 0.40;
    /** Longest permitted amortization term. */
    public static final int MAX_TERM_MONTHS = 30 * 12;
    /** Shortest term the platform will quote. */
    public static final int MIN_TERM_MONTHS = 4 * 12;
    /** Largest share of the loan that may sit in the prime track. */
    public static final double MAX_PRIME_SHARE = 2.0 / 3.0;
    /** Largest share whose rate may change within five years (prime and variable together). */
    public static final double MAX_VARIABLE_SHARE = 2.0 / 3.0;
    /** Smallest share that must stay fixed until maturity. */
    public static final double MIN_FIXED_SHARE = 1.0 / 3.0;
    /** Tolerance applied to share tests so 33.33% does not fail a 1/3 floor. */
    public static final double SHARE_TOLERANCE = 0.005;

    private RegulatoryLimits() {
    }
}
