package il.mashkanta.domain;

/**
 * The four borrowing segments, each with the Loan-to-Value ceiling set by Bank of Israel
 * Proper Conduct of Banking Business Directive 329.
 */
public enum BuyerSegment {

    /** SEG-01 — רוכשי דירה ראשונה. */
    FIRST_HOME("SEG-01", "רוכשי דירה ראשונה", "First-time homebuyer", 0.75),

    /** SEG-02 — משפרי דיור. */
    UPGRADER("SEG-02", "משפרי דיור", "Move-up buyer", 0.70),

    /** SEG-03 — משקיעי נדל"ן. */
    INVESTOR("SEG-03", "משקיעי נדל\"ן", "Real-estate investor", 0.50),

    /** SEG-04 — ממחזרי משכנתא. The 70% ceiling applies to a sole residence being refinanced. */
    REFINANCE("SEG-04", "ממחזרי משכנתא", "Refinancing borrower", 0.70);

    private final String code;
    private final String hebrewName;
    private final String englishName;
    private final double maxLtv;

    BuyerSegment(String code, String hebrewName, String englishName, double maxLtv) {
        this.code = code;
        this.hebrewName = hebrewName;
        this.englishName = englishName;
        this.maxLtv = maxLtv;
    }

    public String code() {
        return code;
    }

    public String hebrewName() {
        return hebrewName;
    }

    public String englishName() {
        return englishName;
    }

    /** The regulatory Loan-to-Value ceiling as a fraction of the property valuation. */
    public double maxLtv() {
        return maxLtv;
    }
}
