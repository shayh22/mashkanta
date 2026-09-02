package il.mashkanta.service;

import il.mashkanta.domain.ComplianceLevel;

/**
 * One regulatory or affordability check.
 *
 * @param code    stable identifier the frontend keys off, e.g. {@code LTV}
 * @param level   severity driving the traffic-light colour
 * @param title   short Hebrew heading
 * @param message full Hebrew explanation shown to the borrower
 * @param actual  the measured value (a fraction for ratios)
 * @param limit   the regulatory threshold the value was measured against
 */
public record ComplianceFinding(
        String code,
        ComplianceLevel level,
        String title,
        String message,
        double actual,
        double limit) {

    public static ComplianceFinding ok(String code, String title, String message, double actual, double limit) {
        return new ComplianceFinding(code, ComplianceLevel.OK, title, message, actual, limit);
    }

    public static ComplianceFinding warning(String code, String title, String message, double actual, double limit) {
        return new ComplianceFinding(code, ComplianceLevel.WARNING, title, message, actual, limit);
    }

    public static ComplianceFinding blocking(String code, String title, String message, double actual, double limit) {
        return new ComplianceFinding(code, ComplianceLevel.BLOCKING, title, message, actual, limit);
    }
}
