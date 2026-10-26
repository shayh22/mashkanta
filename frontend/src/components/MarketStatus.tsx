import { formatPercent } from '../lib/format';
import { monthLabel } from '../engine/liveMarket';
import { BASELINE_AS_OF } from '../engine/baseline';
import { useMarket } from '../store/marketStore';

const time = (iso: string) =>
  new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Where the figures the app prices against came from, and a button to read them again. Fetching
 * starts on load (see App); this shows the outcome and offers a forced refresh.
 */
export function MarketStatus() {
  const market = useMarket((state) => state.market);
  const status = useMarket((state) => state.status);
  const refresh = useMarket((state) => state.refresh);
  const loading = status === 'loading';

  let summary: string;
  let detail: string;
  if (market) {
    summary = market.prime ? `פריים ${formatPercent(market.prime.value)}` : 'נתוני שוק';
    detail = `נתוני בנק ישראל · נקראו ${time(market.fetchedAt)}${
      market.housing ? ` · ממוצעי משכנתאות ${monthLabel(market.housing.asOf)}` : ''
    }${status === 'error' ? ' · העדכון האחרון נכשל' : ''}`;
  } else {
    summary = status === 'error' ? 'נתוני בסיס' : 'טוען נתוני שוק…';
    detail =
      status === 'error'
        ? `לא ניתן לקרוא את נתוני בנק ישראל כעת — מוצגים ערכי בסיס מ-${monthLabel(BASELINE_AS_OF)}`
        : 'קורא את הריביות העדכניות מבנק ישראל';
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <p className="text-end text-xs leading-tight sm:max-w-[26rem]" role="status" aria-live="polite">
        <span className={`block whitespace-nowrap font-medium ${status === 'error' && !market ? 'text-caution' : 'text-ink'}`}>
          {summary}
        </span>
        <span className="hidden text-ink-soft sm:block">{detail}</span>
        <span className="sr-only sm:hidden">{detail}</span>
      </p>
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-base transition hover:bg-surface-muted disabled:opacity-60"
        onClick={() => void refresh(true)}
        disabled={loading}
        aria-label="עדכון נתוני השוק מבנק ישראל"
        title="עדכון נתוני השוק מבנק ישראל"
      >
        <span aria-hidden className={loading ? 'animate-spin' : undefined}>
          ⟳
        </span>
      </button>
    </div>
  );
}
