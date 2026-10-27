import type { ConsolidationAnalysis } from '../../engine/consolidation';
import type { ProposedTrack, RouteAnalysis } from '../../engine/refinance';
import { TRACK_TERMS } from '../../lib/glossary';
import { formatCurrency, formatPercent, formatTerm } from '../../lib/format';
import { TRACK_LABEL } from '../../lib/trackOptions';
import type { ProposalMode } from '../../store/refinanceStore';
import { Term } from '../Glossary';
import { AllocationBar } from '../MixComparison';

const HEADINGS = {
  OPTIMAL: ['התמהיל שנבחר לכם', 'נבחר על ידי המנוע לפי ההכנסה ורמת הסיכון שלכם'],
  AUTO: ['התמהיל שנבחר לכם', 'אותם מסלולים כמו היום, במחיר שוק'],
  OFFER: ['ההצעה שקיבלתם', 'כפי שנקראה מהמסמך שהעליתם'],
  TYPED: ['התמהיל שבניתם', 'המסלולים שהזנתם'],
} as const;

/**
 * The answer to "which mix?", in one card at the top of the result: the new mortgage track by
 * track, its share, rate and term, and the monthly payment it comes to against today's.
 */
export function RecommendedMix({
  proposal,
  route,
  mode,
  source,
  onChange,
  onOffer,
  engine,
  onUseEngine,
}: {
  proposal: readonly ProposedTrack[];
  route: RouteAnalysis;
  mode: ProposalMode;
  /** For a hand-held proposal: an offer read from a document, or typed in. */
  source: 'OFFER' | 'TYPED';
  onChange: () => void;
  /** Opens the upload of a bank's offer. */
  onOffer: () => void;
  /** The engine's mix priced the same way, when the one shown is not the engine's. */
  engine?: RouteAnalysis;
  onUseEngine: () => void;
}) {
  const [heading, subheading] = HEADINGS[mode === 'MANUAL' ? source : mode];
  // A hand-held proposal that lends more or less than is owed is not the same loan: say so, rather
  // than let a track the reader missed pass for a cheaper offer.
  const owed = route.current.totalPrincipal;
  const lent = route.proposed.totalPrincipal;
  const mismatch = mode === 'MANUAL' && owed > 0 && Math.abs(lent - owed) > owed * 0.02;
  const tracks = proposal.filter((track) => track.amount > 0);
  const total = tracks.reduce((sum, track) => sum + track.amount, 0);
  const allocations = tracks.map((track) => ({
    track: track.type,
    hebrewName: TRACK_LABEL[track.type],
    amount: track.amount,
    share: total > 0 ? track.amount / total : 0,
    annualRate: track.annualRate,
  }));

  return (
    <section className="card border-brand-500/40" aria-labelledby="recommended-mix">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="recommended-mix" className="flex items-center text-lg font-semibold text-ink">
            {heading}
            <Term id="mix" />
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">{subheading}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={onOffer}>
            יש לי הצעה מהבנק
          </button>
          <button type="button" className="btn-ghost" onClick={onChange}>
            שינוי התמהיל
          </button>
        </div>
      </header>

      <div className="mt-4">
        <AllocationBar allocations={allocations} total={total} />
      </div>

      <ul className="mt-4 divide-y divide-line">
        {tracks.map((track) => (
          <li key={track.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
            <span className="font-medium text-ink">
              <Term id={TRACK_TERMS[track.type]}>{TRACK_LABEL[track.type]}</Term>
              {track.carriedOver && <span className="badge-neutral ms-2">נשאר כמו שהוא</span>}
            </span>
            <span className="tabular text-ink-muted">
              {formatPercent(total > 0 ? track.amount / total : 0, 0)} · {formatCurrency(track.amount)} ·{' '}
              {formatPercent(track.annualRate)} · {formatTerm(track.termMonths)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-surface-muted p-4">
        <div>
          <dt className="text-xs text-ink-soft">החזר חודשי חדש</dt>
          <dd className="tabular mt-0.5 text-xl font-semibold text-ink">{formatCurrency(route.proposedPayment)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">היום</dt>
          <dd className="tabular mt-0.5 text-xl font-semibold text-ink-muted">{formatCurrency(route.currentPayment)}</dd>
        </div>
      </dl>

      {mismatch && (
        <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-caution" role="alert">
          ⚠️ {source === 'OFFER' ? 'ההצעה' : 'התמהיל'} מסתכם ב-{formatCurrency(lent)}, אבל היתרה היום היא {formatCurrency(owed)}.
          ייתכן שמסלול לא נקרא או חסר — בדקו ב"שינוי התמהיל" לפני שמשווים.
        </p>
      )}
      {engine && !mismatch && <EngineComparison shown={route} engine={engine} onUseEngine={onUseEngine} />}
    </section>
  );
}

/**
 * Another proposal (an offer, or the same mix re-priced) against the mix the engine would choose
 * for the same mortgage, on the same route. Judged by net present value — the measure the verdict
 * itself uses — with the monthly payment beside it.
 */
function EngineComparison({
  shown,
  engine,
  onUseEngine,
}: {
  shown: RouteAnalysis;
  engine: RouteAnalysis;
  onUseEngine: () => void;
}) {
  const gap = engine.netPresentValue - shown.netPresentValue;
  const close = Math.abs(gap) < 1_000;
  return (
    <div
      className={`mt-4 rounded-xl border p-4 text-sm ${
        close || gap < 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/10'
      }`}
      aria-label="מול בחירת המנוע"
      role="group"
    >
      <p className="font-medium text-ink">
        {close
          ? '✓ שווה כמעט בדיוק כמו התמהיל שהמנוע בוחר.'
          : gap > 0
            ? `התמהיל שהמנוע בוחר שווה ${formatCurrency(gap)} יותר, בערך נוכחי.`
            : `שווה ${formatCurrency(-gap)} יותר מהתמהיל שהמנוע בוחר, בערך נוכחי.`}
        <Term id="npv" />
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        בחירת המנוע: החזר {formatCurrency(engine.proposedPayment)} (כאן {formatCurrency(shown.proposedPayment)}) · ערך
        נוכחי {formatCurrency(engine.netPresentValue)} (כאן {formatCurrency(shown.netPresentValue)})
      </p>
      {!close && gap > 0 && (
        <button type="button" className="btn-ghost no-print mt-3" onClick={onUseEngine}>
          מעבר לבחירת המנוע
        </button>
      )}
    </div>
  );
}

/** The all-purpose loan that closes the other debts, when there are any. */
export function ConsolidationLoanCard({ analysis }: { analysis: ConsolidationAnalysis }) {
  const { allocation, included, regulation } = analysis;
  return (
    <section className="card" aria-labelledby="consolidation-loan">
      <h2 id="consolidation-loan" className="flex items-center text-base font-semibold text-ink">
        הלוואה לאיחוד
        <Term id="allPurpose" />
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        סוגרת {included.length === 1 ? 'הלוואה אחת' : `${included.length} הלוואות`}:{' '}
        {included.map((debt) => debt.label).join(', ')}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure label="סכום" value={formatCurrency(allocation.amount)} />
        <Figure label="ריבית ממוצעת" value={formatPercent(allocation.blendedRate)} />
        <Figure label="תקופה" value={formatTerm(allocation.termMonths)} />
        <Figure label="החזר חודשי" value={formatCurrency(allocation.payment)} />
      </dl>
      {!regulation.feasible && (
        <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-negative" role="alert">
          בסכום הזה האיחוד חורג מ<Term id="directive329">הוראה 329</Term> — אפשר עד {formatCurrency(regulation.maxFeasibleLoan)}.
        </p>
      )}
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="tabular mt-0.5 text-base font-semibold text-ink">{value}</dd>
    </div>
  );
}
