package il.mashkanta.service;

import il.mashkanta.engine.AmortizationEngine;
import il.mashkanta.engine.MacroScenario;
import il.mashkanta.engine.MixResult;
import il.mashkanta.engine.MortgageMath;
import il.mashkanta.engine.TrackSpec;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Decides whether refinancing an existing mortgage actually pays (SEG-04).
 *
 * <p>Three numbers decide it, and the service reports all three rather than a verdict alone: the
 * early repayment fee that has to be paid up front, the month at which cumulative savings have
 * repaid that fee, and the net present value of the whole switch. A refinance that saves money every
 * month but never recovers its break fee inside the remaining term is not a saving, and the
 * breakeven month is what exposes that.
 */
@Service
public class RefinanceService {

    private final AmortizationEngine engine;
    private final PrepaymentPenaltyService prepayment;

    public RefinanceService(AmortizationEngine engine, PrepaymentPenaltyService prepayment) {
        this.engine = engine;
        this.prepayment = prepayment;
    }

    /**
     * @param existing     the tracks still running on the current mortgage
     * @param proposed     the tracks of the replacement mortgage
     * @param marketRates  today's average rate per existing track, used to price the break fee
     * @param scenario     macro path
     * @param discountRate annual rate used to discount both payment streams
     */
    public RefinanceAnalysis analyse(List<TrackSpec> existing, List<TrackSpec> proposed,
                                     List<Double> marketRates, MacroScenario scenario, double discountRate) {
        MixResult current = engine.priceMix(existing, scenario);
        MixResult replacement = engine.priceMix(proposed, scenario);

        double breakFee = 0;
        List<PrepaymentPenaltyService.PrepaymentQuote> quotes = new ArrayList<>();
        for (int i = 0; i < existing.size(); i++) {
            TrackSpec spec = existing.get(i);
            double marketRate = i < marketRates.size() ? marketRates.get(i) : spec.initialRate(scenario);
            PrepaymentPenaltyService.PrepaymentQuote quote = prepayment.quote(
                    spec.amount(), spec.initialRate(scenario), marketRate, spec.termMonths(), spec.type());
            quotes.add(quote);
            breakFee += quote.totalFee();
        }

        int horizon = Math.max(current.termMonths(), replacement.termMonths());
        double cumulativeSaving = -breakFee;
        int breakeven = 0;
        List<CumulativePoint> path = new ArrayList<>(horizon);

        for (int month = 1; month <= horizon; month++) {
            cumulativeSaving += current.paymentAt(month) - replacement.paymentAt(month);
            if (breakeven == 0 && cumulativeSaving >= 0) {
                breakeven = month;
            }
            if (month % 12 == 0 || month == horizon) {
                path.add(new CumulativePoint(month, cumulativeSaving));
            }
        }

        double monthlyDiscount = MortgageMath.monthlyRate(discountRate);
        double npv = presentValue(current, horizon, monthlyDiscount)
                - presentValue(replacement, horizon, monthlyDiscount) - breakFee;

        boolean worthwhile = npv > 0 && breakeven > 0 && breakeven <= horizon;
        String recommendation = recommendation(worthwhile, npv, breakeven, horizon, breakFee);

        return new RefinanceAnalysis(
                current.totalPaid(),
                replacement.totalPaid(),
                current.initialPayment(),
                replacement.initialPayment(),
                current.initialPayment() - replacement.initialPayment(),
                current.totalPaid() - replacement.totalPaid() - breakFee,
                breakFee,
                breakeven,
                npv,
                worthwhile,
                List.copyOf(quotes),
                List.copyOf(path),
                recommendation);
    }

    private double presentValue(MixResult mix, int horizon, double monthlyDiscount) {
        double pv = 0;
        double discount = 1;
        double factor = 1 / (1 + monthlyDiscount);
        for (int month = 1; month <= horizon; month++) {
            discount *= factor;
            pv += mix.paymentAt(month) * discount;
        }
        return pv;
    }

    private String recommendation(boolean worthwhile, double npv, int breakeven, int horizon, double fee) {
        if (!worthwhile && breakeven == 0) {
            return "המיחזור אינו משתלם: ההחזרים החדשים אינם מכסים את עמלת הפירעון המוקדם לאורך יתרת התקופה.";
        }
        if (!worthwhile) {
            return String.format("המיחזור מגיע לנקודת איזון רק בחודש %d מתוך %d — שולי מדי כדי להצדיק את המהלך.",
                    breakeven, horizon);
        }
        return String.format(
                "המיחזור משתלם: עמלת פירעון של %,.0f ₪ מוחזרת תוך %d חודשים, וערך נוכחי נקי של %,.0f ₪ לטובת ההצעה החדשה.",
                fee, breakeven, npv);
    }

    /** Cumulative net saving at a point on the timeline. */
    public record CumulativePoint(int month, double cumulativeSaving) {
    }

    /**
     * The refinance verdict.
     *
     * @param currentTotalPaid      lifetime cost of staying put
     * @param proposedTotalPaid     lifetime cost of the replacement
     * @param currentInitialPayment today's payment
     * @param proposedInitialPayment payment after refinancing
     * @param monthlySaving         the immediate monthly difference
     * @param lifetimeSaving        lifetime saving net of the break fee
     * @param breakFee              total early repayment fee
     * @param breakevenMonth        month the fee is recovered, 0 when it never is
     * @param netPresentValue       discounted value of the switch
     * @param worthwhile            whether the switch pays
     * @param prepaymentQuotes      per-track fee detail
     * @param cumulativeSavingPath  yearly cumulative saving, for the chart
     * @param recommendation        Hebrew summary
     */
    public record RefinanceAnalysis(
            double currentTotalPaid,
            double proposedTotalPaid,
            double currentInitialPayment,
            double proposedInitialPayment,
            double monthlySaving,
            double lifetimeSaving,
            double breakFee,
            int breakevenMonth,
            double netPresentValue,
            boolean worthwhile,
            List<PrepaymentPenaltyService.PrepaymentQuote> prepaymentQuotes,
            List<CumulativePoint> cumulativeSavingPath,
            String recommendation) {
    }
}
