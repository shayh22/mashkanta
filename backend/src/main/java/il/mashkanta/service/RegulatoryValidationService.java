package il.mashkanta.service;

import il.mashkanta.domain.BorrowerProfile;
import il.mashkanta.domain.ComplianceLevel;
import il.mashkanta.domain.TrackType;
import il.mashkanta.engine.MixResult;
import il.mashkanta.engine.TrackResult;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Enforces the Bank of Israel constraints a proposal must satisfy before a bank can underwrite it.
 *
 * <p>Checks are reported rather than thrown: the borrower is entitled to see a non-compliant mix and
 * understand exactly which line breaks it, which is the whole point of the platform.
 */
@Service
public class RegulatoryValidationService {

    /** How near the LTV ceiling counts as "close enough to warn about". */
    private static final double LTV_WARNING_BAND = 0.025;

    public ComplianceReport validate(BorrowerProfile borrower, MixResult mix, double stressedPayment) {
        List<ComplianceFinding> findings = new ArrayList<>();

        double ltv = borrower.ltv();
        double maxLtv = borrower.segment().maxLtv();
        findings.add(ltvFinding(ltv, maxLtv, borrower));

        double income = borrower.monthlyNetIncome();
        double pti = mix.initialPayment() / income;
        double dti = (mix.initialPayment() + borrower.existingMonthlyObligations()) / income;
        double stressedPti = (stressedPayment + borrower.existingMonthlyObligations()) / income;
        findings.add(ptiFinding(dti));
        findings.add(stressFinding(stressedPti));

        findings.add(termFinding(mix.termMonths()));
        findings.add(primeShareFinding(mix));
        findings.add(variableShareFinding(mix));
        findings.add(fixedFloorFinding(mix));

        ComplianceLevel level = findings.stream()
                .map(ComplianceFinding::level)
                .max(java.util.Comparator.comparingInt(Enum::ordinal))
                .orElse(ComplianceLevel.OK);

        return new ComplianceReport(ltv, maxLtv, pti, stressedPti, dti, level, List.copyOf(findings));
    }

    private ComplianceFinding ltvFinding(double ltv, double maxLtv, BorrowerProfile borrower) {
        String title = "שיעור מימון (LTV)";
        if (ltv > maxLtv + 1e-9) {
            double maxLoan = borrower.propertyValue() * maxLtv;
            return ComplianceFinding.blocking("LTV", title, String.format(
                    "שיעור המימון %.1f%% חורג מהתקרה של %.0f%% שנקבעה על ידי בנק ישראל עבור %s. "
                            + "סכום ההלוואה המרבי הוא %,.0f ₪.",
                    ltv * 100, maxLtv * 100, borrower.segment().hebrewName(), maxLoan), ltv, maxLtv);
        }
        // "Close to the ceiling" has to mean close, or the warning fires on ordinary deals and
        // borrowers learn to ignore it.
        if (ltv > maxLtv - LTV_WARNING_BAND) {
            return ComplianceFinding.warning("LTV", title, String.format(
                    "שיעור המימון %.1f%% קרוב מאוד לתקרה של %.0f%%. בשיעורי מימון גבוהים הבנקים מתמחרים פרמיית סיכון.",
                    ltv * 100, maxLtv * 100), ltv, maxLtv);
        }
        return ComplianceFinding.ok("LTV", title, String.format(
                "שיעור המימון %.1f%% נמצא בטווח התקין (עד %.0f%%).", ltv * 100, maxLtv * 100), ltv, maxLtv);
    }

    private ComplianceFinding ptiFinding(double dti) {
        String title = "יחס החזר מהכנסה (DTI)";
        if (dti > RegulatoryLimits.PTI_CEILING + 1e-9) {
            return ComplianceFinding.blocking("DTI", title, String.format(
                    "ההחזר החודשי מהווה %.1f%% מההכנסה נטו, מעל התקרה הרגולטורית של 40%%. הבנק לא יוכל לאשר את ההלוואה במתכונת זו.",
                    dti * 100), dti, RegulatoryLimits.PTI_CEILING);
        }
        if (dti > RegulatoryLimits.PTI_WARNING) {
            return ComplianceFinding.warning("DTI", title, String.format(
                    "ההחזר החודשי מהווה %.1f%% מההכנסה נטו. מעל 30%% נדרש אישור חריג והתמחור מתייקר.",
                    dti * 100), dti, RegulatoryLimits.PTI_WARNING);
        }
        return ComplianceFinding.ok("DTI", title, String.format(
                "ההחזר החודשי מהווה %.1f%% מההכנסה נטו — בתוך האזור הירוק (עד 30%%).",
                dti * 100), dti, RegulatoryLimits.PTI_WARNING);
    }

    private ComplianceFinding stressFinding(double stressedPti) {
        String title = "עמידות בתרחיש קיצון";
        if (stressedPti > RegulatoryLimits.PTI_CEILING) {
            return ComplianceFinding.warning("DTI_STRESS", title, String.format(
                    "בתרחיש הקיצון החמור ההחזר מגיע ל-%.1f%% מההכנסה, מעל התקרה של 40%%.",
                    stressedPti * 100), stressedPti, RegulatoryLimits.PTI_CEILING);
        }
        return ComplianceFinding.ok("DTI_STRESS", title, String.format(
                "גם בתרחיש הקיצון החמור ההחזר נשאר על %.1f%% מההכנסה.",
                stressedPti * 100), stressedPti, RegulatoryLimits.PTI_CEILING);
    }

    private ComplianceFinding termFinding(int termMonths) {
        String title = "תקופת ההלוואה";
        double years = termMonths / 12.0;
        if (termMonths > RegulatoryLimits.MAX_TERM_MONTHS) {
            return ComplianceFinding.blocking("TERM", title, String.format(
                    "תקופה של %.1f שנים חורגת מהמקסימום של 30 שנה.", years), years, 30);
        }
        return ComplianceFinding.ok("TERM", title,
                String.format("תקופת ההלוואה %.0f שנים, בתוך המותר (עד 30 שנה).", years), years, 30);
    }

    private ComplianceFinding primeShareFinding(MixResult mix) {
        double primeShare = mix.shareOf(track -> track.type() == TrackType.PRIME);
        String title = "מרכיב הפריים";
        if (primeShare > RegulatoryLimits.MAX_PRIME_SHARE + RegulatoryLimits.SHARE_TOLERANCE) {
            return ComplianceFinding.blocking("PRIME_SHARE", title, String.format(
                    "מסלול הפריים מהווה %.1f%% מההלוואה, מעל התקרה של 66.7%%.",
                    primeShare * 100), primeShare, RegulatoryLimits.MAX_PRIME_SHARE);
        }
        return ComplianceFinding.ok("PRIME_SHARE", title, String.format(
                "מסלול הפריים מהווה %.1f%% מההלוואה, בתוך המגבלה של 66.7%%.",
                primeShare * 100), primeShare, RegulatoryLimits.MAX_PRIME_SHARE);
    }

    private ComplianceFinding variableShareFinding(MixResult mix) {
        double variableShare = mix.shareOf(track -> track.type().isVariableRate());
        String title = "מרכיב בריבית משתנה";
        if (variableShare > RegulatoryLimits.MAX_VARIABLE_SHARE + RegulatoryLimits.SHARE_TOLERANCE) {
            return ComplianceFinding.blocking("VARIABLE_SHARE", title, String.format(
                    "החלק שהריבית בו משתנה בתוך פחות מ-5 שנים מהווה %.1f%%, מעל התקרה של 66.7%%.",
                    variableShare * 100), variableShare, RegulatoryLimits.MAX_VARIABLE_SHARE);
        }
        return ComplianceFinding.ok("VARIABLE_SHARE", title, String.format(
                "המרכיב המשתנה מהווה %.1f%% מההלוואה, בתוך המגבלה של 66.7%%.",
                variableShare * 100), variableShare, RegulatoryLimits.MAX_VARIABLE_SHARE);
    }

    private ComplianceFinding fixedFloorFinding(MixResult mix) {
        double fixedShare = mix.shareOf(track -> track.type().isFixedForRegulation());
        String title = "רכיב ריבית קבועה";
        if (fixedShare < RegulatoryLimits.MIN_FIXED_SHARE - RegulatoryLimits.SHARE_TOLERANCE) {
            return ComplianceFinding.blocking("FIXED_FLOOR", title, String.format(
                    "רק %.1f%% מההלוואה בריבית קבועה. בנק ישראל מחייב לפחות שליש בריבית קבועה עד סוף התקופה.",
                    fixedShare * 100), fixedShare, RegulatoryLimits.MIN_FIXED_SHARE);
        }
        return ComplianceFinding.ok("FIXED_FLOOR", title, String.format(
                "%.1f%% מההלוואה בריבית קבועה, מעל הרף של שליש.",
                fixedShare * 100), fixedShare, RegulatoryLimits.MIN_FIXED_SHARE);
    }

    /** Fast pre-check used inside the optimizer loop, where building findings would be wasteful. */
    public boolean isStructurallyCompliant(List<TrackResult> tracks, double principal) {
        if (principal <= 0) {
            return false;
        }
        double prime = 0;
        double variable = 0;
        double fixed = 0;
        for (TrackResult track : tracks) {
            if (track.type() == TrackType.PRIME) {
                prime += track.amount();
            }
            if (track.type().isVariableRate()) {
                variable += track.amount();
            } else {
                fixed += track.amount();
            }
        }
        double tolerance = RegulatoryLimits.SHARE_TOLERANCE;
        return prime / principal <= RegulatoryLimits.MAX_PRIME_SHARE + tolerance
                && variable / principal <= RegulatoryLimits.MAX_VARIABLE_SHARE + tolerance
                && fixed / principal >= RegulatoryLimits.MIN_FIXED_SHARE - tolerance;
    }
}
