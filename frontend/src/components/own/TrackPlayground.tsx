import type { ReactNode } from 'react';
import type { RouteAnalysis } from '../../engine/refinance';
import { clampTerm, KEEP } from '../../engine/trackPlan';
import { formatCurrency, formatPercent, formatSignedCurrency, formatTerm } from '../../lib/format';
import { TRACK_TERMS } from '../../lib/glossary';
import { TRACK_LABEL, TRACK_OPTIONS } from '../../lib/trackOptions';
import type { TrackType } from '../../lib/types';
import { useRefinance } from '../../store/refinanceStore';
import { useTrackPlanStore, type TrackPlanView } from '../../store/trackPlanStore';
import { Term } from '../Glossary';
import { NumberInput } from '../ui';
import { PlanGoalBox } from './PlanGoalBox';

const NEW_TRACKS = TRACK_OPTIONS.filter((option) => option.value !== 'ELIGIBILITY');

/**
 * The mortgage track by track, for a borrower who would rather not refinance all of it: keep the
 * tracks at a good rate, refinance only the dear ones, or put savings into one. The engine prices
 * the plan the same way it prices a full refinance, and sets it beside one.
 */
export function TrackPlayground({ plan, fullRefinance }: { plan: TrackPlanView; fullRefinance?: RouteAnalysis }) {
  const tracks = useRefinance((state) => state.tracks);
  const { actions, suggested, goodRate, result, trackIds } = plan;
  const setAction = useTrackPlanStore((state) => state.setAction);
  const replace = useTrackPlanStore((state) => state.replace);
  const ownChoices = suggested.size < trackIds.length;

  return (
    <div className="space-y-5">
      <PlanGoalBox plan={plan} />

      <ul className="divide-y divide-line rounded-xl border border-line" aria-label="המסלולים">
        {tracks
          .filter((track) => trackIds.includes(track.id))
          .map((track) => {
            const action = actions[track.id] ?? KEEP;
            const name = TRACK_LABEL[track.type];
            return (
              <li key={track.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      <Term id={TRACK_TERMS[track.type]}>{name}</Term>
                      {goodRate.has(track.id) && <span className="badge-ok ms-2">ריבית טובה — כדאי לשמור</span>}
                    </p>
                    <p className="tabular mt-0.5 text-xs text-ink-soft">
                      {formatCurrency(track.balance)} · {formatPercent(track.annualRate)} · נותרו{' '}
                      {formatTerm(track.remainingMonths)}
                    </p>
                  </div>
                  {suggested.has(track.id) && <span className="badge-neutral">המלצה</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="input w-auto py-1.5"
                    aria-label={`מה לעשות במסלול ${name}`}
                    value={action.kind}
                    onChange={(event) =>
                      setAction(
                        track.id,
                        event.target.value === 'REFINANCE'
                          ? { kind: 'REFINANCE', type: track.type === 'ELIGIBILITY' ? 'FIXED_UNLINKED' : track.type, termMonths: clampTerm(track.remainingMonths) }
                          : event.target.value === 'PREPAY'
                            ? { kind: 'PREPAY', amount: Math.min(track.balance, 50_000) }
                            : KEEP,
                      )
                    }
                  >
                    <option value="KEEP">להשאיר כמו שהוא</option>
                    {track.type !== 'ELIGIBILITY' && <option value="REFINANCE">למחזר</option>}
                    <option value="PREPAY">לפרוע חלק מחסכונות</option>
                  </select>
                  {action.kind === 'REFINANCE' && (
                    <>
                      <select
                        className="input w-auto py-1.5"
                        aria-label={`מסלול חדש במקום ${name}`}
                        value={action.type}
                        onChange={(event) => setAction(track.id, { ...action, type: event.target.value as TrackType })}
                      >
                        {NEW_TRACKS.map((option) => (
                          <option key={option.value} value={option.value}>
                            ל{option.label}
                          </option>
                        ))}
                      </select>
                      <Labelled text="שנים">
                        <NumberInput
                          label={`תקופה בשנים במקום ${name}`}
                          className="w-20"
                          value={action.termMonths}
                          scale={1 / 12}
                          digits={0}
                          min={1}
                          max={30}
                          step={1}
                          onChange={(months) => setAction(track.id, { ...action, termMonths: Math.round(months) })}
                        />
                      </Labelled>
                    </>
                  )}
                  {action.kind === 'PREPAY' && (
                    <Labelled text="₪">
                      <NumberInput
                        label={`סכום לפירעון במסלול ${name}`}
                        className="w-32"
                        value={action.amount}
                        digits={0}
                        min={0}
                        max={track.balance}
                        step={10_000}
                        onChange={(amount) => setAction(track.id, { kind: 'PREPAY', amount })}
                      />
                    </Labelled>
                  )}
                </div>
              </li>
            );
          })}
      </ul>

      {result && (
        <section aria-label="תוצאת המשחק" className="rounded-xl bg-surface-muted p-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure label="החזר חודשי" value={formatCurrency(result.proposedPayment)} note={`היום ${formatCurrency(result.currentPayment)}`} />
            <Figure
              label="תשלום ביום המהלך"
              value={formatCurrency(result.upfront)}
              note={result.cash > 0 ? `מתוכם ${formatCurrency(result.cash)} מחסכונות` : 'עמלות ועלויות'}
            />
            <Figure
              label="ערך נוכחי נקי"
              term
              value={result.unchanged ? '—' : formatSignedCurrency(result.netPresentValue)}
              tone={result.unchanged ? undefined : result.netPresentValue > 0 ? 'positive' : 'negative'}
            />
            <Figure label="נקודת איזון" value={result.breakevenMonth > 0 ? `חודש ${result.breakevenMonth}` : '—'} />
          </dl>
          {fullRefinance && !result.unchanged && (
            <p className="mt-3 text-sm text-ink-muted">
              {result.netPresentValue >= fullRefinance.netPresentValue
                ? `✓ עדיף ב-${formatCurrency(result.netPresentValue - fullRefinance.netPresentValue)} על מיחזור מלא בתמהיל המנוע (בערך נוכחי).`
                : `מיחזור מלא בתמהיל המנוע שווה ${formatCurrency(fullRefinance.netPresentValue - result.netPresentValue)} יותר (בערך נוכחי).`}
            </p>
          )}
          {result.unchanged && <p className="mt-3 text-sm text-ink-muted">בחרו מסלול למחזר או לפרוע כדי לראות מה זה עושה.</p>}
        </section>
      )}

      {ownChoices && (
        <button type="button" className="btn-ghost no-print" onClick={() => replace({})}>
          חזרה להמלצה לפי מסלול
        </button>
      )}
    </div>
  );
}

function Labelled({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1 text-xs text-ink-soft">
      {children}
      {text}
    </span>
  );
}

function Figure({
  label,
  value,
  note,
  tone,
  term,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'positive' | 'negative';
  term?: boolean;
}) {
  return (
    <div>
      <dt className="flex items-center text-xs text-ink-soft">
        {label}
        {term && <Term id="npv" />}
      </dt>
      <dd
        className={`tabular mt-0.5 text-lg font-semibold ${tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink'}`}
      >
        {value}
      </dd>
      {note && <dd className="text-xs text-ink-soft">{note}</dd>}
    </div>
  );
}
