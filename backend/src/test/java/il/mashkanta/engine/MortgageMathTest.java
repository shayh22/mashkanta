package il.mashkanta.engine;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MortgageMathTest {

    @Test
    @DisplayName("Spitzer payment matches the standard annuity formula")
    void spitzerPaymentIsCorrect() {
        // ₪1,000,000 at 5% nominal over 30 years is a textbook 5,368.22 a month.
        double payment = MortgageMath.payment(1_000_000, 0.05 / 12, 360);
        assertThat(payment).isCloseTo(5368.22, org.assertj.core.data.Offset.offset(0.01));
    }

    @Test
    @DisplayName("A zero rate amortises the principal in equal instalments")
    void zeroRateSplitsPrincipalEvenly() {
        assertThat(MortgageMath.payment(120_000, 0, 120)).isEqualTo(1_000);
    }

    @Test
    @DisplayName("Present value inverts the payment calculation")
    void presentValueInvertsPayment() {
        double payment = MortgageMath.payment(800_000, 0.04 / 12, 240);
        assertThat(MortgageMath.presentValue(payment, 0.04 / 12, 240))
                .isCloseTo(800_000, org.assertj.core.data.Offset.offset(0.01));
    }

    @Test
    @DisplayName("IRR of a plain loan equals its effective annual rate")
    void irrEqualsEffectiveAnnualRate() {
        double monthlyRate = 0.05 / 12;
        double payment = MortgageMath.payment(1_000_000, monthlyRate, 360);
        double[] payments = new double[360];
        java.util.Arrays.fill(payments, payment);

        double irr = MortgageMath.irr(1_000_000, payments);

        assertThat(irr).isCloseTo(Math.pow(1 + monthlyRate, 12) - 1, org.assertj.core.data.Offset.offset(1e-6));
    }

    @Test
    @DisplayName("IRR returns zero rather than a wrong answer when cash flows make no sense")
    void irrIsSafeOnDegenerateInput() {
        assertThat(MortgageMath.irr(0, new double[]{100})).isZero();
        assertThat(MortgageMath.irr(100_000, new double[0])).isZero();
    }
}
