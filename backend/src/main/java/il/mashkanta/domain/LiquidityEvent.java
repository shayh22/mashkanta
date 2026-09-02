package il.mashkanta.domain;

/**
 * A future lump sum the household expects — Keren Hishtalmut maturing, a bonus, an inheritance,
 * or the proceeds of an old apartment for an upgrader.
 *
 * @param month             months from origination when the money lands
 * @param amount            expected amount in shekels
 * @param source            free-text Hebrew label, e.g. "קרן השתלמות"
 * @param earmarkedForPrepayment whether the borrower intends to prepay the mortgage with it
 */
public record LiquidityEvent(int month, double amount, String source, boolean earmarkedForPrepayment) {

    public LiquidityEvent {
        if (month < 1) {
            throw new IllegalArgumentException("liquidity event month is 1-based");
        }
        if (amount < 0) {
            throw new IllegalArgumentException("liquidity event amount must not be negative");
        }
    }
}
