import { payment } from '../math';

/**
 * A synthetic amortization schedule: `amount` at 6% over 36 payments after two interest-only
 * months, paid on the 10th from January 2026. Built here rather than copied from a real document.
 */
export function scheduleText(order: 'bank' | 'reversed' = 'bank', header = 'שיעור ריבית נומינלית שנתית 6%\nסוג הריבית קבועה', amount = 100_000): string {
  const rate = 0.06 / 12;
  const lines = [header, 'לוח סילוקין'];
  let balance = amount;
  const instalment = payment(balance, rate, 36);
  for (let n = 0; n < 38; n++) {
    const date = new Date(Date.UTC(2026, n, 10));
    const stamp = `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
    const interest = Math.round(balance * rate * 100) / 100;
    const principal = n < 2 ? 0 : Math.round(Math.min(balance, instalment - interest) * 100) / 100;
    balance = Math.round((balance - principal) * 100) / 100;
    const total = Math.round((principal + interest) * 100) / 100;
    const money = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cells = [stamp, money(principal), money(interest), money(total), money(balance)];
    lines.push((order === 'bank' ? cells : [...cells].reverse()).join(' '));
  }
  return lines.join('\n');
}
