package il.mashkanta.engine;

import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Pure, stateless amortization kernel.
 *
 * <p>Every schedule is built the same way regardless of track: index the balance, accrue interest on
 * the indexed balance, then apply the method's payment rule. Because the Spitzer payment is
 * recomputed from the live balance and rate every month, a fixed non-linked track naturally produces
 * a flat payment while a linked or prime track produces the growing payment Israeli borrowers see.
 *
 * <p>The engine has no state and allocates only the schedule it returns, so it is safe to call from
 * parallel streams during optimization.
 */
@Component
public class AmortizationEngine {

    /** Prices one track along the supplied macro path. */
    public TrackResult price(TrackSpec spec, MacroScenario scenario) {
        int n = spec.termMonths();
        List<ScheduleRow> schedule = new ArrayList<>(n);
        double[] payments = new double[n];

        double balance = spec.amount();
        double totalInterest = 0;
        double totalIndexation = 0;
        double totalPaid = 0;
        double maxPayment = 0;

        for (int month = 1; month <= n; month++) {
            double annualRate = spec.annualRateAt(month, scenario);
            double monthlyRate = MortgageMath.monthlyRate(annualRate);
            double opening = balance;

            double indexation = 0;
            if (spec.type().isCpiLinked()) {
                indexation = balance * scenario.monthlyInflationAt(month);
                balance += indexation;
                totalIndexation += indexation;
            }

            double interest = balance * monthlyRate;
            int remaining = n - month + 1;
            double payment;
            double principal;

            switch (spec.method()) {
                case BALLOON -> {
                    if (month < n) {
                        // Nothing is paid; interest capitalises into the balance.
                        payment = 0;
                        principal = -interest;
                    } else {
                        payment = balance + interest;
                        principal = balance;
                    }
                }
                case GRACE -> {
                    if (month <= spec.graceMonths()) {
                        payment = interest;
                        principal = 0;
                    } else {
                        payment = MortgageMath.payment(balance, monthlyRate, remaining);
                        principal = payment - interest;
                    }
                }
                case EQUAL_PRINCIPAL -> {
                    principal = balance / remaining;
                    payment = principal + interest;
                }
                case SPITZER -> {
                    payment = MortgageMath.payment(balance, monthlyRate, remaining);
                    principal = payment - interest;
                }
                default -> throw new IllegalStateException("unsupported method " + spec.method());
            }

            balance -= principal;
            if (month == n) {
                // Absorb the accumulated floating-point residue into the final payment.
                payment += balance;
                principal += balance;
                balance = 0;
            }

            totalInterest += interest;
            totalPaid += payment;
            payments[month - 1] = payment;
            maxPayment = Math.max(maxPayment, payment);

            schedule.add(new ScheduleRow(month, opening, indexation, interest, principal, payment, balance, annualRate));
        }

        double nominalIrr = MortgageMath.irr(spec.amount(), payments);
        double realIrr = MortgageMath.irr(spec.amount(), deflate(payments, scenario));

        return new TrackResult(
                spec.type(),
                spec.method(),
                spec.amount(),
                n,
                spec.initialRate(scenario),
                payments.length > 0 ? payments[0] : 0,
                maxPayment,
                payments.length > 0 ? payments[n - 1] : 0,
                totalPaid,
                totalInterest,
                totalIndexation,
                nominalIrr,
                realIrr,
                List.copyOf(schedule));
    }

    /** Restates nominal payments in origination-date shekels so the real cost is comparable. */
    private double[] deflate(double[] payments, MacroScenario scenario) {
        double[] real = new double[payments.length];
        double deflator = 1;
        for (int i = 0; i < payments.length; i++) {
            deflator *= 1 + scenario.monthlyInflationAt(i + 1);
            real[i] = payments[i] / deflator;
        }
        return real;
    }

    /**
     * Prices a whole mix. Tracks are priced independently and then summed month by month, which is
     * exactly how a multi-track Israeli mortgage behaves — each track has its own rate and term.
     */
    public MixResult priceMix(List<TrackSpec> specs, MacroScenario scenario) {
        List<TrackResult> results = new ArrayList<>(specs.size());
        int horizon = 0;
        double principal = 0;
        for (TrackSpec spec : specs) {
            if (spec.amount() <= 0) {
                continue;
            }
            results.add(price(spec, scenario));
            horizon = Math.max(horizon, spec.termMonths());
            principal += spec.amount();
        }
        return MixResult.combine(results, principal, horizon, scenario);
    }
}
