import type { Answers } from '../../engine/flow/flow';
import { SEGMENT_MAX_LTV } from '../../engine/regulatory';
import { formatCurrency, formatPercent, formatTerm } from '../../lib/format';
import type { BorrowerProfileRequest, OptimizationResponse } from '../../lib/types';
import { TRACK_COLORS } from '../../lib/trackColors';
import { useBuyResult } from './hooks';

/**
 * The buyer's result, straight from the answers: one number — the first monthly payment — the mix
 * as one bar, the few facts that matter, and what stands in the way when something does.
 */
/** Without `onEdit` and `onDetails`, a result someone shared: worked out again, nothing to change. */
export function BuyResult({ answers, onEdit, onDetails }: { answers: Answers; onEdit?: (step: string) => void; onDetails?: () => void }) {
  const { plan, result, manual } = useBuyResult(answers);

  if (!plan) {
    return null;
  }
  if (plan.kind === 'NO_LOAN') {
    return (
      <section aria-labelledby="buy-result" className="flex flex-col gap-2 rounded-[24px] bg-flow-card p-5">
        <span className="text-[15px] font-bold text-flow-muted">הדירה</span>
        <h3 id="buy-result" className="text-[32px] font-black leading-tight">
          אין צורך במשכנתא
        </h3>
        <p className="text-base text-flow-muted">
          ההון העצמי מכסה את המחיר{plan.spare > 0 ? `, ונשארים ${formatCurrency(plan.spare)}` : ''}.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="buy-result" className="flex flex-col gap-3.5">
      {result.isPending && (
        <p role="status" className="rounded-[20px] bg-flow-card p-5 text-base text-flow-muted">
          מחשב את התמהיל המשתלם לכם…
        </p>
      )}
      {result.isError && (
        <p role="alert" className="rounded-[20px] bg-flow-card p-5 text-base text-negative">
          החישוב לא הצליח. {result.error instanceof Error ? result.error.message : ''}
        </p>
      )}
      {result.data && <Mix data={result.data} profile={plan.profile} equityShort={plan.equityShort} onEdit={onEdit} onDetails={onDetails} manual={manual} />}
    </section>
  );
}

function Mix({
  data,
  profile,
  equityShort,
  onEdit,
  onDetails,
  manual,
}: {
  data: OptimizationResponse;
  profile: BorrowerProfileRequest;
  equityShort: number;
  onEdit?: (step: string) => void;
  onDetails?: () => void;
  /** The household built this mix itself, on the details screen. */
  manual?: boolean;
}) {
  const mix = data.recommended;
  const { summary, compliance, stress } = mix;
  // The one finding that matters most, beside the equity (which has its own note): a blocker, else a warning.
  const finding =
    compliance.findings.find((each) => each.level === 'BLOCKING' && each.code !== 'LTV') ??
    compliance.findings.find((each) => each.level === 'WARNING' && each.code !== 'LTV');
  const cheapest = [...data.bankQuotes].sort((a, b) => a.rank - b.rank)[0];
  const tracks = summary.allocations.filter((track) => track.share > 0.0005);
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-bold text-flow-muted">החזר חודשי בהתחלה</span>
        <h3 id="buy-result" className="text-[48px] font-black leading-none tracking-tight">
          {formatCurrency(summary.initialPayment)}
        </h3>
        <span className="text-[15px] text-flow-muted">
          {formatPercent(compliance.pti, 0)} מההכנסה · עד {formatCurrency(stress.worstCase.maxPayment)} בתרחיש קשה
        </span>
      </div>

      {equityShort > 0 && (
        <p role="alert" className="flex flex-col gap-1 rounded-2xl bg-flow-accent/25 p-3.5 text-[15px]">
          <span className="font-extrabold">חסרים {formatCurrency(equityShort)} הון עצמי</span>
          <span>
            הבנק מממן עד {Math.round(SEGMENT_MAX_LTV[profile.segment] * 100)}% מהמחיר. חישבנו על {formatCurrency(profile.loanAmount)}.
          </span>
          {onEdit && (
            <button type="button" onClick={() => onEdit('equity')} className="min-h-11 self-start font-bold underline underline-offset-4">
              לשנות את ההון העצמי
            </button>
          )}
        </p>
      )}
      {finding && (
        <p
          role={finding.level === 'BLOCKING' ? 'alert' : undefined}
          className={`flex flex-col gap-1 rounded-2xl p-3.5 text-[15px] ${finding.level === 'BLOCKING' ? 'bg-negative/15' : 'bg-flow-accent/25'}`}
        >
          <span className="font-extrabold">{finding.title}</span>
          <span>{finding.message}</span>
        </p>
      )}

      <div className="flex flex-col gap-3 rounded-[20px] bg-flow-card p-4">
        <h4 className="text-base font-extrabold">{manual ? 'התמהיל שלכם' : 'התמהיל'}</h4>
        <div role="img" aria-label={tracks.map((track) => `${track.hebrewName} ${Math.round(track.share * 100)}%`).join(', ')} className="flex h-4 overflow-hidden rounded-full">
          {tracks.map((track) => (
            <span key={`${track.track}-${track.termMonths}`} style={{ width: `${track.share * 100}%`, background: TRACK_COLORS[track.track] }} />
          ))}
        </div>
        <ul className="flex flex-col gap-2">
          {tracks.map((track) => (
            <li key={`${track.track}-${track.termMonths}`} className="flex items-center gap-2.5 text-[15px]">
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: TRACK_COLORS[track.track] }} />
              <span className="flex-1 font-bold">{track.hebrewName}</span>
              <span className="tabular-nums text-flow-muted">{formatPercent(track.annualRate)}</span>
              <span className="w-12 text-left font-extrabold tabular-nums">{Math.round(track.share * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="flex flex-col overflow-hidden rounded-[20px] bg-flow-card">
        {[
          ['הלוואה', `${formatCurrency(summary.totalPrincipal)} · ${formatTerm(summary.termMonths)}`],
          ['סך הכל תשלמו', formatCurrency(summary.totalPaid)],
          ...(cheapest ? [['הבנק הזול לתמהיל הזה', `${cheapest.hebrewName} · ${formatPercent(cheapest.weightedRate)}`]] : []),
        ].map(([label, value]) => (
          <div key={label} className="flex min-h-14 items-center justify-between gap-3 border-b border-flow-line px-4 last:border-b-0">
            <dt className="text-[15px] font-bold">{label}</dt>
            <dd className="text-[15px] font-extrabold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {onDetails && (
        <button type="button" onClick={onDetails} className="min-h-[52px] rounded-full border-2 border-flow-ink px-3 text-base font-extrabold">
          כל הפרטים
        </button>
      )}
      <p className="text-xs leading-relaxed text-flow-muted">
        לפי ריביות השוק של בנק ישראל ל-{formatTerm(summary.termMonths)}. אינו ייעוץ ואינו הצעה של בנק.
      </p>
    </>
  );
}
