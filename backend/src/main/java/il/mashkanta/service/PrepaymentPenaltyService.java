package il.mashkanta.service;

import il.mashkanta.domain.TrackType;
import il.mashkanta.engine.MortgageMath;
import org.springframework.stereotype.Service;

/**
 * Prices the early repayment fee (עמלת פירעון מוקדם) a borrower faces when closing a loan early.
 *
 * <p>The material component is the discounting fee (עמלת היוון): the lender re-values the payments
 * it will no longer receive at today's average rate for the remaining term. When rates have fallen
 * since origination that present value exceeds the outstanding balance, and the borrower pays the
 * difference. When rates have risen there is no discounting fee at all — which is exactly why a
 * refinance is only worth modelling once this number is on the table.
 */
@Service
public class PrepaymentPenaltyService {

    /** Flat operational fee charged on any early repayment. */
    private static final double OPERATIONAL_FEE = 60.0;
    /** Statutory notice discount applied to the discounting fee when 30 days' notice is given. */
    private static final double NOTICE_DISCOUNT = 0.0;

    /**
     * @param outstandingBalance principal still owed
     * @param contractRate       the annual rate on the existing loan
     * @param marketRate         today's average annual rate for the remaining term
     * @param remainingMonths    payments still to be made
     * @param track              the track, which decides whether a discounting fee applies at all
     */
    public PrepaymentQuote quote(double outstandingBalance, double contractRate, double marketRate,
                                 int remainingMonths, TrackType track) {
        if (outstandingBalance <= 0 || remainingMonths <= 0) {
            return new PrepaymentQuote(0, 0, 0, 0, 0, 0, 0, "אין יתרה לפירעון.");
        }

        // Variable tracks are re-priced at every anchor reset, so there is nothing to discount.
        if (track != null && track.isVariableRate()) {
            return new PrepaymentQuote(outstandingBalance, contractRate, marketRate, remainingMonths,
                    0, OPERATIONAL_FEE, OPERATIONAL_FEE,
                    "במסלול משתנה לא נגבית עמלת היוון בנקודת עדכון הריבית, אלא עמלה תפעולית בלבד.");
        }

        double contractMonthly = MortgageMath.monthlyRate(contractRate);
        double marketMonthly = MortgageMath.monthlyRate(marketRate);
        double payment = MortgageMath.payment(outstandingBalance, contractMonthly, remainingMonths);
        double presentValueAtMarket = MortgageMath.presentValue(payment, marketMonthly, remainingMonths);

        double discountingFee = Math.max(0, presentValueAtMarket - outstandingBalance) * (1 - NOTICE_DISCOUNT);
        double total = discountingFee + OPERATIONAL_FEE;

        String explanation = discountingFee > 0
                ? String.format("ריבית ההלוואה (%.2f%%) גבוהה מריבית השוק להיום (%.2f%%), ולכן נגבית עמלת היוון של %,.0f ₪.",
                        contractRate * 100, marketRate * 100, discountingFee)
                : String.format("ריבית ההלוואה (%.2f%%) אינה גבוהה מריבית השוק (%.2f%%), ולכן לא נגבית עמלת היוון.",
                        contractRate * 100, marketRate * 100);

        return new PrepaymentQuote(outstandingBalance, contractRate, marketRate, remainingMonths,
                discountingFee, OPERATIONAL_FEE, total, explanation);
    }

    /**
     * The early repayment fee on an existing loan.
     *
     * @param outstandingBalance principal still owed
     * @param contractRate       rate on the existing loan
     * @param marketRate         today's average rate for the remaining term
     * @param remainingMonths    payments still to be made
     * @param discountingFee     עמלת היוון
     * @param operationalFee     flat handling fee
     * @param totalFee           what the borrower actually pays
     * @param explanation        Hebrew explanation shown next to the number
     */
    public record PrepaymentQuote(
            double outstandingBalance,
            double contractRate,
            double marketRate,
            int remainingMonths,
            double discountingFee,
            double operationalFee,
            double totalFee,
            String explanation) {
    }
}
