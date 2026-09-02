import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiError, simulate } from '../lib/api';
import type { DocumentJob, TrackRequest, TrackType } from '../lib/types';
import { formatCurrency, formatPercent } from '../lib/format';
import { useWizard } from '../store/wizardStore';
import { ApprovalUploader } from '../components/ApprovalUploader';
import { OpportunityPanel } from '../components/OpportunityPanel';
import { CompliancePanel } from '../components/CompliancePanel';
import { Card, ErrorCard, LoadingCard, Stat } from '../components/ui';

const TRACK_OPTIONS: { value: TrackType; label: string }[] = [
  { value: 'PRIME', label: 'פריים' },
  { value: 'FIXED_UNLINKED', label: 'קבועה לא צמודה' },
  { value: 'FIXED_LINKED', label: 'קבועה צמודה' },
  { value: 'VARIABLE_UNLINKED', label: 'משתנה לא צמודה' },
  { value: 'VARIABLE_LINKED', label: 'משתנה צמודה' },
  { value: 'ELIGIBILITY', label: 'זכאות' },
];

/**
 * "Is the offer I was given any good?" — the question the platform exists to answer.
 *
 * The tracks can arrive either from an uploaded approval-in-principle or be typed in by hand, and
 * either way they stay editable before scoring: document extraction gets the amounts and rates
 * right most of the time, and the borrower is the one who can tell when it has not.
 */
export function OfferReview() {
  const { profile, macro } = useWizard();
  const [tracks, setTracks] = useState<TrackRequest[]>([]);

  const review = useMutation({
    mutationFn: (input: TrackRequest[]) => {
      const offeredTotal = input.reduce((sum, track) => sum + track.amount, 0);
      // Score the offer as it actually stands: LTV and the payment ratio have to be measured
      // against the amount the bank offered, not the amount typed into the wizard.
      const offerProfile = { ...profile, loanAmount: offeredTotal };
      return simulate(offerProfile, input, macro, false);
    },
  });

  const seedFromDocument = useCallback((job: DocumentJob) => {
    const extracted = job.result?.tracks ?? [];
    if (extracted.length === 0) {
      return;
    }
    setTracks((current) => {
      // Only seed an empty table: re-seeding would discard edits every time the job is re-read.
      if (current.length > 0) {
        return current;
      }
      return extracted.map((track) => ({
        type: track.track,
        amount: track.amount,
        annualRate: track.annualRate,
        termMonths: track.termMonths > 0 ? track.termMonths : profile.termMonths,
      }));
    });
  }, [profile.termMonths]);

  const updateTrack = (index: number, patch: Partial<TrackRequest>) =>
    setTracks((current) => current.map((track, i) => (i === index ? { ...track, ...patch } : track)));

  const total = tracks.reduce((sum, track) => sum + track.amount, 0);
  const valid = tracks.length > 0 && tracks.every((track) => track.amount > 0 && track.annualRate > 0);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <ApprovalUploader ltv={profile.loanAmount / profile.propertyValue} onExtracted={seedFromDocument} />

      <Card
        title="ההצעה שקיבלתם"
        subtitle="ניתן לערוך את המסלולים שחולצו מהמסמך, או להזין אותם ידנית."
        action={
          <button
            type="button"
            className="btn-ghost"
            onClick={() =>
              setTracks((current) => [
                ...current,
                {
                  type: 'FIXED_UNLINKED',
                  amount: 300_000,
                  annualRate: 0.05,
                  termMonths: profile.termMonths,
                },
              ])
            }
          >
            הוספת מסלול
          </button>
        }
      >
        {tracks.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft">
            העלו אישור עקרוני או הוסיפו מסלול ידנית כדי לבדוק את ההצעה מול השוק.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-ink-soft">
                    <th className="py-2 text-start font-medium">מסלול</th>
                    <th className="py-2 text-start font-medium">סכום</th>
                    <th className="py-2 text-start font-medium">ריבית שנתית</th>
                    <th className="py-2 text-start font-medium">חודשים</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tracks.map((track, index) => (
                    <tr key={index}>
                      <td className="py-2 pe-2">
                        <select
                          className="input py-1.5"
                          value={track.type}
                          aria-label="מסלול"
                          onChange={(event) =>
                            updateTrack(index, { type: event.target.value as TrackType })
                          }
                        >
                          {TRACK_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pe-2">
                        <input
                          className="input tabular py-1.5"
                          type="number"
                          dir="ltr"
                          min={0}
                          step={10_000}
                          aria-label="סכום"
                          value={track.amount}
                          onChange={(event) =>
                            updateTrack(index, { amount: Number(event.target.value) })
                          }
                        />
                      </td>
                      <td className="py-2 pe-2">
                        <input
                          className="input tabular py-1.5"
                          type="number"
                          dir="ltr"
                          min={0}
                          max={25}
                          step={0.01}
                          aria-label="ריבית שנתית באחוזים"
                          value={Number((track.annualRate * 100).toFixed(2))}
                          onChange={(event) =>
                            updateTrack(index, { annualRate: Number(event.target.value) / 100 })
                          }
                        />
                      </td>
                      <td className="py-2 pe-2">
                        <input
                          className="input tabular py-1.5"
                          type="number"
                          dir="ltr"
                          min={12}
                          max={360}
                          step={12}
                          aria-label="חודשים"
                          value={track.termMonths ?? profile.termMonths}
                          onChange={(event) =>
                            updateTrack(index, { termMonths: Number(event.target.value) })
                          }
                        />
                      </td>
                      <td className="py-2 text-end">
                        <button
                          type="button"
                          className="text-xs font-medium text-rose-600"
                          onClick={() => setTracks((current) => current.filter((_, i) => i !== index))}
                        >
                          הסרה
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-muted">
                סך ההלוואה בהצעה: <span className="tabular font-semibold">{formatCurrency(total)}</span>
                {' · '}
                שיעור מימון{' '}
                <span className="tabular font-semibold">
                  {formatPercent(total / profile.propertyValue, 1)}
                </span>
              </p>
              <button
                type="button"
                className="btn-primary"
                disabled={!valid || review.isPending}
                onClick={() => review.mutate(tracks)}
              >
                בדיקת ההצעה מול השוק
              </button>
            </div>
          </>
        )}
      </Card>

      {review.isPending && <LoadingCard message="מתמחר את ההצעה ומשווה אותה לבסיס נתוני השוק…" />}

      {review.isError && (
        <ErrorCard
          title="בדיקת ההצעה נכשלה"
          message={review.error instanceof ApiError ? review.error.message : 'לא ניתן היה לבדוק את ההצעה.'}
          details={review.error instanceof ApiError ? review.error.details : []}
        />
      )}

      {review.data && (
        <>
          <Card title="ההצעה שקיבלתם — במספרים">
            <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Stat
                label="החזר חודשי ראשוני"
                value={formatCurrency(review.data.mix.initialPayment)}
                note={`שיא צפוי: ${formatCurrency(review.data.mix.maxPayment)}`}
              />
              <Stat
                label="עלות כוללת"
                value={formatCurrency(review.data.mix.totalPaid)}
                note={`מתוכם ${formatCurrency(review.data.mix.totalCost)} ריבית והצמדה`}
              />
              <Stat
                label="ריבית כוללת מתואמת"
                value={formatPercent(review.data.mix.nominalIrr)}
                note={`ריאלית: ${formatPercent(review.data.mix.realIrr)}`}
              />
              <Stat
                label="בתרחיש הקיצון החמור"
                value={formatCurrency(review.data.stress.worstCase.maxPayment)}
                tone={review.data.stress.anyBreach ? 'negative' : 'neutral'}
                note={review.data.stress.worstCase.label}
              />
            </dl>
          </Card>

          <OpportunityPanel opportunity={review.data.opportunity} />

          <CompliancePanel compliance={review.data.compliance} />
        </>
      )}
    </div>
  );
}
