package il.mashkanta.domain;

/**
 * The mortgage tracks (מסלולים) offered by Israeli lenders.
 *
 * <p>Every track is characterised by three independent properties that drive the amortization
 * engine: whether the outstanding principal is indexed to the CPI (צמוד מדד), whether the nominal
 * rate can move during the life of the loan, and — when it can move — how often it re-anchors.
 */
public enum TrackType {

    /** פריים — Bank of Israel prime plus/minus a bank margin, re-priced whenever prime moves. */
    PRIME("פריים", "Prime", false, true, 1, true),

    /** קל"צ — fixed, non-linked. Full certainty, the most expensive nominal rate. */
    FIXED_UNLINKED("קבועה לא צמודה (קל\"צ)", "Fixed unlinked", false, false, 0, false),

    /** ק"צ — fixed nominal rate, principal indexed to the CPI. */
    FIXED_LINKED("קבועה צמודה (ק\"צ)", "Fixed linked", true, false, 0, false),

    /** משתנה לא צמודה — re-anchored to the government bond curve every 5 years. */
    VARIABLE_UNLINKED("משתנה לא צמודה", "Variable unlinked", false, true, 60, false),

    /** משתנה צמודה — re-anchored every 5 years, principal indexed to the CPI. */
    VARIABLE_LINKED("משתנה צמודה", "Variable linked", true, true, 60, false),

    /** זכאות — the Ministry of Construction and Housing subsidised loan: fixed rate, CPI linked. */
    ELIGIBILITY("זכאות", "Eligibility (subsidised)", true, false, 0, false);

    private final String hebrewName;
    private final String englishName;
    private final boolean cpiLinked;
    private final boolean variableRate;
    private final int anchorResetMonths;
    private final boolean primeAnchored;

    TrackType(String hebrewName, String englishName, boolean cpiLinked, boolean variableRate,
              int anchorResetMonths, boolean primeAnchored) {
        this.hebrewName = hebrewName;
        this.englishName = englishName;
        this.cpiLinked = cpiLinked;
        this.variableRate = variableRate;
        this.anchorResetMonths = anchorResetMonths;
        this.primeAnchored = primeAnchored;
    }

    public String hebrewName() {
        return hebrewName;
    }

    public String englishName() {
        return englishName;
    }

    /** True when the outstanding balance is re-valued monthly by the consumer price index. */
    public boolean isCpiLinked() {
        return cpiLinked;
    }

    /** True when the nominal rate may change before maturity. */
    public boolean isVariableRate() {
        return variableRate;
    }

    /** Months between rate re-anchoring; {@code 0} for fixed tracks, {@code 1} for prime. */
    public int anchorResetMonths() {
        return anchorResetMonths;
    }

    /** True when the rate is quoted as a margin over the Bank of Israel prime rate. */
    public boolean isPrimeAnchored() {
        return primeAnchored;
    }

    /**
     * Counts towards the "at least one third fixed" Bank of Israel constraint.
     * A track qualifies only when its rate cannot change for the whole term.
     */
    public boolean isFixedForRegulation() {
        return !variableRate;
    }
}
