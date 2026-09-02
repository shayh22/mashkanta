package il.mashkanta.service;

import il.mashkanta.engine.AmortizationEngine;
import il.mashkanta.engine.MacroScenario;
import il.mashkanta.engine.MixResult;
import il.mashkanta.engine.TrackSpec;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Runs every candidate mix through the macro shocks a 25-year loan has to survive.
 *
 * <p>Rate shocks move prime and the 5-year anchor together, because in practice they share a policy
 * driver — shocking prime alone would flatter any mix holding variable tracks. Inflation scenarios
 * are stated as absolute annual rates rather than deltas, matching how the Bank of Israel and the
 * Central Bureau of Statistics publish them.
 */
@Service
public class StressTestService {

    /** Rate shocks in percentage points, per the platform's sensitivity specification. */
    private static final double[] RATE_SHOCKS = {0.005, 0.010, 0.020, 0.030};
    /** Absolute annual inflation paths tested against every mix. */
    private static final double[] CPI_PATHS = {0.015, 0.030, 0.045, 0.060};

    private final AmortizationEngine engine;

    public StressTestService(AmortizationEngine engine) {
        this.engine = engine;
    }

    public StressMatrix run(List<TrackSpec> specs, MacroScenario baselineScenario, MixResult baseline,
                            double volatilityCapacity) {
        List<StressScenarioResult> scenarios = new ArrayList<>();

        for (double shock : RATE_SHOCKS) {
            scenarios.add(evaluate(specs, baselineScenario, baseline, volatilityCapacity,
                    String.format("PRIME_%.0f", shock * 1000),
                    String.format("עליית ריבית של %.1f%%", shock * 100),
                    shock, baselineScenario.cpiAnnual()));
        }
        for (double cpi : CPI_PATHS) {
            scenarios.add(evaluate(specs, baselineScenario, baseline, volatilityCapacity,
                    String.format("CPI_%.0f", cpi * 1000),
                    String.format("אינפלציה שנתית של %.1f%%", cpi * 100),
                    0, cpi));
        }
        // The combined path is what actually happens: the central bank raises rates because of inflation.
        scenarios.add(evaluate(specs, baselineScenario, baseline, volatilityCapacity,
                "COMBINED_MODERATE", "משולב: ריבית +2% ואינפלציה 4.5%", 0.020, 0.045));
        scenarios.add(evaluate(specs, baselineScenario, baseline, volatilityCapacity,
                "COMBINED_SEVERE", "משולב חמור: ריבית +3% ואינפלציה 6%", 0.030, 0.060));

        StressScenarioResult worst = scenarios.stream()
                .max(Comparator.comparingDouble(StressScenarioResult::maxPayment))
                .orElse(null);
        boolean anyBreach = scenarios.stream().anyMatch(StressScenarioResult::breachesCapacity);

        return new StressMatrix(List.copyOf(scenarios), worst,
                worst == null ? 0 : worst.maxPayment() - baseline.initialPayment(), anyBreach);
    }

    private StressScenarioResult evaluate(List<TrackSpec> specs, MacroScenario baselineScenario,
                                          MixResult baseline, double capacity,
                                          String id, String label, double ratePoints, double cpiAnnual) {
        MacroScenario shocked = baselineScenario.withShock(
                ratePoints, cpiAnnual - baselineScenario.cpiAnnual(), 1, label);
        MixResult result = engine.priceMix(specs, shocked);

        double increase = result.maxPayment() - baseline.initialPayment();
        return new StressScenarioResult(
                id,
                label,
                ratePoints,
                cpiAnnual,
                result.initialPayment(),
                result.maxPayment(),
                result.maxPaymentMonth(),
                result.paymentAt(60),
                result.totalPaid(),
                increase,
                result.totalPaid() - baseline.totalPaid(),
                capacity > 0 && increase > capacity);
    }
}
