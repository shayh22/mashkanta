package il.mashkanta.api.dto;

import il.mashkanta.domain.BorrowerProfile;
import il.mashkanta.domain.BuyerSegment;
import il.mashkanta.domain.LiquidityEvent;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.List;

/**
 * The onboarding wizard's payload.
 *
 * @param propertyValue              שווי נכס
 * @param loanAmount                 סכום מבוקש
 * @param termMonths                 requested term, 4 to 30 years
 * @param segment                    buyer classification
 * @param monthlyNetIncome           combined household net income
 * @param existingMonthlyObligations existing monthly debt service
 * @param riskTolerance              1..10
 * @param volatilityCapacity         acceptable monthly payment increase in shekels
 * @param liquidityEvents            expected lump sums
 * @param primePreference            desired prime share, 0..1
 * @param stablePreference           desired fixed share, 0..1
 * @param dynamicPreference          desired variable share, 0..1
 * @param eligibilityAmount          subsidised principal, if entitled
 * @param eligibilityRate            the regulated rate on that principal
 */
public record BorrowerProfileRequest(
        @Positive double propertyValue,
        @Positive double loanAmount,
        @Min(48) @Max(360) int termMonths,
        @NotNull BuyerSegment segment,
        @Positive double monthlyNetIncome,
        @PositiveOrZero double existingMonthlyObligations,
        @Min(1) @Max(10) int riskTolerance,
        @PositiveOrZero Double volatilityCapacity,
        @Valid List<LiquidityEventRequest> liquidityEvents,
        Double primePreference,
        Double stablePreference,
        Double dynamicPreference,
        @PositiveOrZero Double eligibilityAmount,
        @PositiveOrZero Double eligibilityRate) {

    public BorrowerProfile toDomain() {
        List<LiquidityEvent> events = liquidityEvents == null
                ? List.of()
                : liquidityEvents.stream().map(LiquidityEventRequest::toDomain).toList();

        // Preferences are a three-way split; normalise so a client that sends 30/30/30 is not
        // silently treated as wanting only 90% of a loan allocated.
        double prime = primePreference != null ? Math.max(0, primePreference) : 0.25;
        double stable = stablePreference != null ? Math.max(0, stablePreference) : 0.50;
        double dynamic = dynamicPreference != null ? Math.max(0, dynamicPreference) : 0.25;
        double sum = prime + stable + dynamic;
        if (sum > 0) {
            prime /= sum;
            stable /= sum;
            dynamic /= sum;
        }

        return new BorrowerProfile(
                propertyValue,
                loanAmount,
                termMonths,
                segment,
                monthlyNetIncome,
                existingMonthlyObligations,
                riskTolerance,
                volatilityCapacity == null ? 0 : volatilityCapacity,
                events,
                prime,
                stable,
                dynamic,
                eligibilityAmount == null ? 0 : eligibilityAmount,
                eligibilityRate == null ? 0 : eligibilityRate);
    }
}
