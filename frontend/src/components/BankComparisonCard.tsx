import type { BankQuote } from '../lib/types';
import { formatCurrency, formatPercent } from '../lib/format';
import { Card } from './ui';

/**
 * The lender league table for one fixed allocation.
 *
 * The mix is held constant across every lender, so the ranking reflects pricing alone — a bank
 * cannot look cheap by quietly moving principal into a cheaper track.
 */
export function BankComparison({ quotes }: { quotes: BankQuote[] }) {
  if (quotes.length === 0) {
    return null;
  }

  return (
    <Card
      title="השוואת בנקים"
      subtitle="אותו תמהיל בדיוק, מתומחר לפי מיצוב הריביות הפומבי של כל בנק."
    >
      <ul className="space-y-3">
        {quotes.map((quote) => (
          <li key={quote.code}>
            <BankCard quote={quote} />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-ink-soft">
        המיצוב מבוסס על תעריפונים ומבצעים שפורסמו בפומבי ואינו מהווה הצעה מחייבת. הריבית בפועל נקבעת
        במשא ומתן ותלויה בפרופיל הלווה.
      </p>
    </Card>
  );
}

function BankCard({ quote }: { quote: BankQuote }) {
  const isBest = quote.rank === 1;

  return (
    <article
      className={`rounded-2xl border p-4 transition ${
        isBest ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-white hover:bg-slate-50/60'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
              isBest ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
            }`}
          >
            {quote.rank}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-ink">{quote.hebrewName}</h3>
            <p className="text-xs text-ink-soft">
              נתח שוק משכנתאות {formatPercent(quote.marketShare, 0)} · ריבית משוקללת{' '}
              {formatPercent(quote.weightedRate)}
            </p>
          </div>
        </div>
        {isBest ? (
          <span className="badge-ok">הזול ביותר לאורך חיי ההלוואה</span>
        ) : (
          <span className="badge-neutral">
            יקר ב-{formatCurrency(quote.costAboveBest)} מהזול ביותר
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="החזר ראשוני" value={formatCurrency(quote.initialPayment)} />
        <Metric label="החזר שיא" value={formatCurrency(quote.maxPayment)} />
        <Metric label="עלות כוללת" value={formatCurrency(quote.totalPaid)} />
        <Metric label="ריבית אפקטיבית" value={formatPercent(quote.nominalIrr)} />
      </dl>

      <p className="mt-3 text-xs text-ink-soft">{quote.note}</p>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="tabular mt-0.5 text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}
