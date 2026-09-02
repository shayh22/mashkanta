package il.mashkanta.service;

import il.mashkanta.domain.BorrowerProfile;
import il.mashkanta.domain.LiquidityEvent;
import org.springframework.stereotype.Service;

/**
 * Turns the onboarding answers into an optimizer-ready risk vector.
 *
 * <p>The mapping is deliberately monotonic and explainable: a borrower who moves one notch up the
 * tolerance slider always gets a higher cost weight and a looser variable cap, never a surprise.
 * Affordability then overrides stated tolerance — a household with no room in its budget is capped
 * regardless of how adventurous it says it feels.
 */
@Service
public class CustomerProfilingService {

    /** Fraction of disposable income assumed absorbable when the borrower states no capacity. */
    private static final double IMPLIED_CAPACITY_SHARE = 0.05;

    public RiskProfile profile(BorrowerProfile borrower) {
        double normalized = (borrower.riskTolerance() - 1) / 9.0;

        // Conservative borrowers weight volatility; dynamic ones weight headline cost.
        double costWeight = 0.35 + 0.5 * normalized;
        double cpiAversion = 1.0 - 0.7 * normalized;

        double maxVariableShare = Math.min(RegulatoryLimits.MAX_VARIABLE_SHARE, 0.20 + 0.50 * normalized);
        double maxPrimeShare = Math.min(RegulatoryLimits.MAX_PRIME_SHARE, 0.20 + 0.50 * normalized);

        double capacity = borrower.volatilityCapacity() > 0
                ? borrower.volatilityCapacity()
                : borrower.disposableIncome() * IMPLIED_CAPACITY_SHARE;

        // A thin budget is a hard constraint, not a preference: tighten the caps whatever was said.
        double headroom = borrower.comfortablePayment();
        if (headroom <= 0) {
            maxVariableShare = Math.min(maxVariableShare, 0.25);
            maxPrimeShare = Math.min(maxPrimeShare, 0.25);
        }

        int prepaymentHorizon = borrower.firstPrepaymentEvent().map(LiquidityEvent::month).orElse(0);

        return new RiskProfile(
                borrower.riskTolerance(),
                costWeight,
                1 - costWeight,
                cpiAversion,
                maxVariableShare,
                maxPrimeShare,
                capacity,
                prepaymentHorizon,
                narrative(borrower, normalized, capacity, prepaymentHorizon));
    }

    private String narrative(BorrowerProfile borrower, double normalized, double capacity, int prepaymentHorizon) {
        StringBuilder text = new StringBuilder();
        if (normalized <= 0.25) {
            text.append("פרופיל שמרני: העדפה לוודאות תשלום על פני חיסכון בריבית. ");
        } else if (normalized <= 0.65) {
            text.append("פרופיל מאוזן: שילוב של ודאות בחלק מהתמהיל וניצול מסלולים משתנים בחלק האחר. ");
        } else {
            text.append("פרופיל דינמי: נכונות לספוג תנודתיות בהחזר החודשי בתמורה לעלות כוללת נמוכה יותר. ");
        }
        text.append(String.format("יכולת ספיגה חודשית של כ-%,.0f ₪ מעל ההחזר הבסיסי. ", capacity));
        if (prepaymentHorizon > 0) {
            text.append(String.format("צפוי פירעון חלקי בחודש %d, ולכן ניתן משקל נמוך יותר למסלולים עם עמלת היוון. ",
                    prepaymentHorizon));
        }
        if (borrower.eligibilityAmount() > 0) {
            text.append("נלקחה בחשבון הלוואת זכאות ממשרד הבינוי והשיכון. ");
        }
        return text.toString().trim();
    }
}
