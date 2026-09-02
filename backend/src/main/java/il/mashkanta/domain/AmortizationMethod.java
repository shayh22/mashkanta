package il.mashkanta.domain;

/** The repayment tables permitted by Israeli lenders. */
public enum AmortizationMethod {

    /** לוח שפיצר — level annuity payment, recomputed whenever the rate or indexed balance moves. */
    SPITZER("לוח שפיצר", "Spitzer annuity"),

    /** קרן שווה — constant principal, linearly decreasing interest. */
    EQUAL_PRINCIPAL("קרן שווה", "Equal principal"),

    /** גרייס חלקי — interest-only for the grace window, then a Spitzer schedule. */
    GRACE("גרייס חלקי", "Partial grace (interest only)"),

    /** בלון / גרייס מלא — nothing is paid until maturity; interest is capitalised into the balance. */
    BALLOON("בלון / גרייס מלא", "Balloon (full deferral)");

    private final String hebrewName;
    private final String englishName;

    AmortizationMethod(String hebrewName, String englishName) {
        this.hebrewName = hebrewName;
        this.englishName = englishName;
    }

    public String hebrewName() {
        return hebrewName;
    }

    public String englishName() {
        return englishName;
    }
}
