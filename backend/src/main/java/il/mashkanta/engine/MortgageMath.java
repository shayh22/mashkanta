package il.mashkanta.engine;

/** Small numeric kernel shared by the amortization engine. All figures are plain doubles. */
public final class MortgageMath {

    private static final double IRR_TOLERANCE = 1e-10;
    private static final int IRR_MAX_ITERATIONS = 200;

    private MortgageMath() {
    }

    /**
     * Level annuity payment (לוח שפיצר).
     *
     * @param balance         outstanding principal
     * @param monthlyRate     periodic rate, may be zero
     * @param remainingMonths payments still to be made, at least one
     */
    public static double payment(double balance, double monthlyRate, int remainingMonths) {
        if (remainingMonths <= 0) {
            return balance;
        }
        if (Math.abs(monthlyRate) < 1e-12) {
            return balance / remainingMonths;
        }
        double growth = Math.pow(1 + monthlyRate, remainingMonths);
        return balance * monthlyRate * growth / (growth - 1);
    }

    /** Present value of a level annuity — the inverse of {@link #payment}. */
    public static double presentValue(double payment, double monthlyRate, int months) {
        if (months <= 0) {
            return 0;
        }
        if (Math.abs(monthlyRate) < 1e-12) {
            return payment * months;
        }
        return payment * (1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate;
    }

    /** Converts an annual nominal rate quoted monthly into its periodic equivalent. */
    public static double monthlyRate(double annualRate) {
        return annualRate / 12.0;
    }

    /** Compounds a periodic rate into its effective annual equivalent. */
    public static double annualise(double monthlyRate) {
        return Math.pow(1 + monthlyRate, 12) - 1;
    }

    /**
     * Effective annual internal rate of return of a loan: money in at t0, payments out monthly.
     *
     * <p>Solved by bisection rather than Newton — the payment vector of an indexed mortgage is not
     * smooth, and bisection cannot diverge on the single sign change these cash flows have.
     *
     * @param proceeds net cash the borrower receives at origination
     * @param payments the monthly outflows, index 0 being month 1
     * @return the effective annual rate, or {@code 0} when the cash flows have no solution
     */
    public static double irr(double proceeds, double[] payments) {
        if (proceeds <= 0 || payments.length == 0) {
            return 0;
        }
        double lo = -0.9 / 12.0;
        double hi = 1.0;
        double fLo = npv(proceeds, payments, lo);
        double fHi = npv(proceeds, payments, hi);
        if (fLo * fHi > 0) {
            return 0;
        }
        for (int i = 0; i < IRR_MAX_ITERATIONS; i++) {
            double mid = (lo + hi) / 2;
            double fMid = npv(proceeds, payments, mid);
            if (Math.abs(fMid) < IRR_TOLERANCE || (hi - lo) < IRR_TOLERANCE) {
                return annualise(mid);
            }
            if (fLo * fMid <= 0) {
                hi = mid;
            } else {
                lo = mid;
                fLo = fMid;
            }
        }
        return annualise((lo + hi) / 2);
    }

    /** Net present value of the loan cash flows at the given periodic discount rate. */
    public static double npv(double proceeds, double[] payments, double monthlyRate) {
        double npv = proceeds;
        double discount = 1;
        double factor = 1 / (1 + monthlyRate);
        for (double payment : payments) {
            discount *= factor;
            npv -= payment * discount;
        }
        return npv;
    }

    /** Rounds to agorot for presentation. The engine itself never rounds mid-calculation. */
    public static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    /** Rounds a rate to four decimals, i.e. one hundredth of a percentage point. */
    public static double roundRate(double value) {
        return Math.round(value * 1_000_000.0) / 1_000_000.0;
    }
}
