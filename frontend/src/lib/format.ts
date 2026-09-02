/** Hebrew-locale formatting helpers. Every number the user sees goes through one of these. */

const currency = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
});

const compact = new Intl.NumberFormat('he-IL', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const plain = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });

/** ₪1,234,568 — the default for any shekel amount. */
export function formatCurrency(value: number): string {
  return currency.format(Math.round(value));
}

/** ₪1.2M — for axis labels, where the full number would not fit. */
export function formatCompact(value: number): string {
  return `₪${compact.format(value)}`;
}

/** 4.95% — rates arrive from the API as fractions. */
export function formatPercent(fraction: number, digits = 2): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** +₪1,200 / -₪900, with the sign carrying the meaning. */
export function formatSignedCurrency(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

/** "25 שנים" or "25 שנים ו-6 חודשים". */
export function formatTerm(months: number): string {
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (remainder === 0) {
    return `${years} שנים`;
  }
  return `${years} שנים ו-${remainder} חודשים`;
}

/** Parses what a user typed into a currency field, tolerating separators and a shekel sign. */
export function parseCurrencyInput(raw: string): number {
  const digits = raw.replace(/[^\d.]/g, '');
  const value = Number.parseFloat(digits);
  return Number.isFinite(value) ? value : 0;
}

/** Groups digits as the user types, without fighting the caret in the RTL layout. */
export function formatCurrencyInput(value: number): string {
  return value > 0 ? plain.format(value) : '';
}
