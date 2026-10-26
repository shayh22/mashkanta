import type { ConsolidationAnalysis } from '../../engine/consolidation';
import type { ProposedTrack, RouteAnalysis } from '../../engine/refinance';
import type { TermId } from '../../lib/glossary';
import { formatCurrency, formatPercent, formatTerm } from '../../lib/format';
import { TRACK_LABEL } from '../../lib/trackOptions';
import type { TrackType } from '../../lib/types';
import type { ProposalMode } from '../../store/refinanceStore';
import { Term } from '../Glossary';
import { AllocationBar } from '../MixComparison';

const TRACK_TERMS: Record<TrackType, TermId> = {
  PRIME: 'prime',
  FIXED_UNLINKED: 'fixedUnlinked',
  FIXED_LINKED: 'fixedLinked',
  VARIABLE_UNLINKED: 'variableUnlinked',
  VARIABLE_LINKED: 'variableLinked',
  ELIGIBILITY: 'eligibility',
};

const SOURCE: Record<ProposalMode, string> = {
  OPTIMAL: 'נבחר על ידי המנוע לפי ההכנסה ורמת הסיכון שלכם',
  AUTO: 'אותם מסלולים כמו היום, במחיר שוק',
  MANUAL: 'התמהיל שהזנתם',
};

/**
 * The answer to "which mix?", in one card at the top of the result: the new mortgage track by
 * track, its share, rate and term, and the monthly payment it comes to against today's.
 */
export function RecommendedMix({
  proposal,
  route,
  mode,
  onChange,
}: {
  proposal: readonly ProposedTrack[];
  route: RouteAnalysis;
  mode: ProposalMode;
  onChange: () => void;
}) {
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
            התמהיל שנבחר לכם
            <Term id="mix" />
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">{SOURCE[mode]}</p>
        </div>
        <button type="button" className="btn-ghost no-print" onClick={onChange}>
          שינוי התמהיל
        </button>
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
    </section>
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
