import type { MixProposal, SavingsComparison, TrackType } from '../lib/types';
import { formatCurrency, formatPercent, formatSignedCurrency } from '../lib/format';
import { Card, LevelBadge } from './ui';

/** Palette per track, reused by the allocation bar and the legend so colour means one thing. */
const TRACK_COLORS: Record<TrackType, string> = {
  PRIME: '#4F46E5',
  FIXED_UNLINKED: '#0EA5E9',
  FIXED_LINKED: '#10B981',
  VARIABLE_UNLINKED: '#F59E0B',
  VARIABLE_LINKED: '#F43F5E',
  ELIGIBILITY: '#8B5CF6',
};

/**
 * The recommended mix beside the three standardised baskets.
 *
 * All four are priced at the same market rates and the same term, so the only thing that differs
 * between the columns is the composition — which is exactly the comparison the Bank of Israel's
 * standardised basket reform was meant to make possible.
 */
export function MixComparison({
  recommended,
  baskets,
  savings,
}: {
  recommended: MixProposal;
  baskets: MixProposal[];
  savings: SavingsComparison[];
}) {
  const savingsById = new Map(savings.map((entry) => [entry.againstId, entry]));
  const all = [recommended, ...baskets];

  return (
    <Card
      title="התמהיל המומלץ מול הסלים האחידים"
      subtitle="כל התמהילים מתומחרים באותן ריביות שוק ובאותה תקופה, כך שההשוואה בודדת את השפעת ההרכב בלבד."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {all.map((proposal) => (
          <MixCard
            key={proposal.id}
            proposal={proposal}
            saving={savingsById.get(proposal.id)}
          />
        ))}
      </div>
    </Card>
  );
}

function MixCard({ proposal, saving }: { proposal: MixProposal; saving?: SavingsComparison }) {
  const { summary, compliance } = proposal;

  return (
    <article
      className={`rounded-2xl border p-4 ${
        proposal.recommended ? 'border-brand-400 bg-brand-50/40 ring-1 ring-brand-400' : 'border-slate-200'
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">{proposal.name}</h3>
          <p className="mt-0.5 text-xs text-ink-soft">{proposal.description}</p>
        </div>
        {proposal.recommended ? (
          <span className="badge-ok shrink-0">מומלץ</span>
        ) : (
          <LevelBadge level={compliance.level}>
            {compliance.level === 'OK' ? 'תקין' : compliance.level === 'WARNING' ? 'לתשומת לב' : 'חריגה'}
          </LevelBadge>
        )}
      </header>

      <AllocationBar allocations={summary.allocations} total={summary.totalPrincipal} />

      <dl className="mt-3 grid grid-cols-2 gap-3">
        <Metric label="החזר חודשי ראשוני" value={formatCurrency(summary.initialPayment)} />
        <Metric label="החזר שיא" value={formatCurrency(summary.maxPayment)} />
        <Metric label="עלות כוללת" value={formatCurrency(summary.totalPaid)} />
        <Metric label="ריבית כוללת מתואמת" value={formatPercent(summary.nominalIrr)} />
      </dl>

      {summary.totalIndexation > 0 && (
        <p className="mt-2 text-xs text-ink-soft">
          מתוכם {formatCurrency(summary.totalIndexation)} הצמדה למדד לאורך התקופה.
        </p>
      )}

      {saving && (
        <p
          className={`mt-3 rounded-xl px-3 py-2 text-xs font-medium ${
            saving.totalPaidSaving > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-ink-soft'
          }`}
        >
          {saving.totalPaidSaving > 0
            ? `התמהיל המומלץ חוסך ${formatCurrency(saving.totalPaidSaving)} מול סל זה`
            : `סל זה זול ב-${formatCurrency(Math.abs(saving.totalPaidSaving))} מהתמהיל המומלץ, אך תנודתי יותר`}
          {' · '}
          החזר ראשוני {formatSignedCurrency(-saving.initialPaymentDelta)}
        </p>
      )}
    </article>
  );
}

/** A stacked bar of the mix composition, with a legend keyed by the same colours. */
export function AllocationBar({
  allocations,
  total,
}: {
  allocations: { track: TrackType; hebrewName: string; amount: number; share: number; annualRate: number }[];
  total: number;
}) {
  return (
    <div className="mt-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {allocations.map((allocation) => (
          <div
            key={allocation.track}
            style={{
              width: `${(allocation.amount / total) * 100}%`,
              background: TRACK_COLORS[allocation.track],
            }}
            title={`${allocation.hebrewName} — ${formatPercent(allocation.share, 1)}`}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {allocations.map((allocation) => (
          <li key={allocation.track} className="flex items-center gap-1.5 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: TRACK_COLORS[allocation.track] }}
              aria-hidden
            />
            <span className="text-ink-muted">{allocation.hebrewName}</span>
            <span className="tabular font-medium text-ink">{formatPercent(allocation.share, 0)}</span>
            <span className="tabular text-ink-soft">({formatPercent(allocation.annualRate)})</span>
          </li>
        ))}
      </ul>
    </div>
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

/** The detailed per-track table for the recommended mix. */
export function AllocationTable({ proposal }: { proposal: MixProposal }) {
  return (
    <Card title="פירוט המסלולים" subtitle="הרכב התמהיל המומלץ, מסלול אחר מסלול">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-ink-soft">
              <th className="py-2 text-start font-medium">מסלול</th>
              <th className="py-2 text-start font-medium">סכום</th>
              <th className="py-2 text-start font-medium">חלק</th>
              <th className="py-2 text-start font-medium">ריבית</th>
              <th className="py-2 text-start font-medium">החזר ראשוני</th>
              <th className="py-2 text-start font-medium">החזר שיא</th>
              <th className="py-2 text-start font-medium">עלות כוללת</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {proposal.summary.allocations.map((allocation) => (
              <tr key={allocation.track}>
                <td className="py-2.5">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: TRACK_COLORS[allocation.track] }}
                      aria-hidden
                    />
                    <span className="font-medium text-ink">{allocation.hebrewName}</span>
                  </span>
                </td>
                <td className="tabular py-2.5">{formatCurrency(allocation.amount)}</td>
                <td className="tabular py-2.5">{formatPercent(allocation.share, 1)}</td>
                <td className="tabular py-2.5">{formatPercent(allocation.annualRate)}</td>
                <td className="tabular py-2.5">{formatCurrency(allocation.initialPayment)}</td>
                <td className="tabular py-2.5">{formatCurrency(allocation.maxPayment)}</td>
                <td className="tabular py-2.5">{formatCurrency(allocation.totalPaid)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-semibold">
              <td className="py-2.5">סה"כ</td>
              <td className="tabular py-2.5">{formatCurrency(proposal.summary.totalPrincipal)}</td>
              <td className="tabular py-2.5">100%</td>
              <td className="tabular py-2.5">{formatPercent(proposal.summary.weightedInitialRate)}</td>
              <td className="tabular py-2.5">{formatCurrency(proposal.summary.initialPayment)}</td>
              <td className="tabular py-2.5">{formatCurrency(proposal.summary.maxPayment)}</td>
              <td className="tabular py-2.5">{formatCurrency(proposal.summary.totalPaid)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
