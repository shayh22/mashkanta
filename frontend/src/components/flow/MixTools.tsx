import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { checkManualMix, MANUAL_TRACKS, sharesTotal, type ManualShares } from '../../engine/manualMix';
import { MAX_GOAL_LENGTH, type PlanRequest } from '../../engine/planRequest';
import { clampTerm, KEEP, type TrackAction } from '../../engine/trackPlan';
import { proposePlan, useAiEnabled } from '../../lib/aiClient';
import { formatCurrency, formatPercent, formatSignedCurrency, formatTerm } from '../../lib/format';
import { bestRoute } from '../../lib/routes';
import { TRACK_NAMES } from '../../lib/trackColors';
import type { TrackType } from '../../lib/types';
import { useQuestionnaire } from '../../store/questionnaireStore';
import { useRefinance, useRefinanceAnalysis } from '../../store/refinanceStore';
import { tracksKeyOf, useTrackPlan, useTrackPlanStore } from '../../store/trackPlanStore';
import { NoamAvatar } from './Noam';
import { Dot, Panel, Rows } from './parts';

/**
 * The mix in the household's own hands: for a purchase, a share per track — checked against the
 * Bank of Israel's shape rules as it is typed — that the result, the banks and the plan then use;
 * for a refinance from the bank's report, a move per track, priced like a full refinance and set
 * beside one, with נועם turning a goal in words into such a plan.
 */

const PRESETS: { label: string; shares: ManualShares }[] = [
  { label: 'שליש שליש שליש', shares: { PRIME: 1 / 3, FIXED_LINKED: 1 / 3, VARIABLE_LINKED: 1 / 3 } },
  { label: 'פריים וקבועה לא צמודה', shares: { PRIME: 1 / 3, FIXED_UNLINKED: 2 / 3 } },
  { label: 'הכל בקבועה לא צמודה', shares: { FIXED_UNLINKED: 1 } },
];

const pill = (on: boolean) => `min-h-11 rounded-full px-4 text-[15px] ${on ? 'border-2 border-flow-strong bg-flow-pick font-extrabold' : 'border border-flow-line font-semibold'}`;

/** A purchase's mix: the calculator's, or one built here, share by share. */
export function ManualMixPanel({ loanAmount, eligibility }: { loanAmount: number; eligibility: number }) {
  const shares = useQuestionnaire((state) => state.manualShares);
  const setShares = useQuestionnaire((state) => state.setManualShares);
  const own = !!shares;
  const locked = Math.min(eligibility, loanAmount);
  const free = loanAmount - locked;
  const check = shares ? checkManualMix(shares, loanAmount > 0 ? locked / loanAmount : 0) : undefined;
  const total = shares ? sharesTotal(shares) : 0;
  return (
    <Panel title="התמהיל" className="no-print">
      <div role="radiogroup" aria-label="איזה תמהיל" className="flex flex-wrap gap-2">
        <button type="button" role="radio" aria-checked={!own} onClick={() => setShares(undefined)} className={pill(!own)}>
          של המחשבון
        </button>
        <button type="button" role="radio" aria-checked={own} onClick={() => setShares(shares ?? PRESETS[1]!.shares)} className={pill(own)}>
          לבנות בעצמי
        </button>
      </div>
      {shares && check && (
        <>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button key={preset.label} type="button" onClick={() => setShares(preset.shares)} className="min-h-10 rounded-full border border-flow-line px-3 text-sm font-semibold">
                {preset.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-flow-muted">
            מחלקים {formatCurrency(free)} בין המסלולים{locked > 0 ? `; הזכאות (${formatCurrency(locked)}) בנפרד` : ''}.
          </p>
          <ul className="flex flex-col">
            {MANUAL_TRACKS.map((track) => {
              const share = shares[track] ?? 0;
              return (
                <li key={track} className="flex min-h-12 items-center gap-2 border-b border-flow-line py-1.5 last:border-b-0">
                  <Dot type={track} />
                  <span className="flex-1 text-[15px] font-bold">{TRACK_NAMES[track]}</span>
                  <span className="w-24 text-left text-sm tabular-nums text-flow-muted">{formatCurrency(free * share)}</span>
                  <input
                    inputMode="numeric"
                    aria-label={`אחוז במסלול ${TRACK_NAMES[track]}`}
                    value={Math.round(share * 100)}
                    onChange={(event) => {
                      const percent = Math.min(100, Math.max(0, Number(event.target.value.replace(/[^\d]/g, '')) || 0));
                      setShares({ ...shares, [track]: percent / 100 });
                    }}
                    className="min-h-11 w-16 rounded-xl border border-flow-line bg-flow-ground px-2 text-center text-base tabular-nums"
                  />
                  <span className="text-sm">%</span>
                </li>
              );
            })}
          </ul>
          <Rows rows={[['סך הכל', <span key="total" className={check.totalError ? 'text-negative' : ''}>{Math.round(total * 100)}%</span>, true]]} />
          <div aria-live="polite" className="flex flex-col gap-1 text-sm">
            {check.totalError ? (
              <p role="alert" className="font-bold text-negative">
                {check.totalError}
              </p>
            ) : check.violations.length === 0 ? (
              <p className="font-bold text-flow-strong">
                עומד בכללי בנק ישראל: פריים {formatPercent(check.primeShare, 0)}, משתנה {formatPercent(check.variableShare, 0)}, קבועה {formatPercent(check.fixedShare, 0)}.
              </p>
            ) : (
              check.violations.map((violation) => (
                <p key={violation} className="font-bold text-negative">
                  {violation} בנק לא יאשר תמהיל כזה; הוא מחושב להשוואה בלבד.
                </p>
              ))
            )}
          </div>
          <p className="text-xs text-flow-muted">התמהיל שלכם משמש את התוצאה, את השוואת הבנקים ואת התוכנית, כל עוד הוא מסתכם ב-100%.</p>
        </>
      )}
    </Panel>
  );
}

const ACTIONS: { kind: TrackAction['kind']; label: string }[] = [
  { kind: 'KEEP', label: 'להשאיר' },
  { kind: 'REFINANCE', label: 'למחזר' },
  { kind: 'PREPAY', label: 'לפרוע חלק' },
];
const NEW_TRACKS = MANUAL_TRACKS;

/** The mortgage track by track: keep the cheap ones, refinance the dear ones, or put savings into one. */
export function TrackByTrack() {
  const tracks = useRefinance((state) => state.tracks);
  const plan = useTrackPlan();
  const setAction = useTrackPlanStore((state) => state.setAction);
  const replace = useTrackPlanStore((state) => state.replace);
  const { comparison } = useRefinanceAnalysis();
  const full = comparison ? bestRoute(comparison) : undefined;
  const { actions, suggested, goodRate, result, trackIds } = plan;
  if (trackIds.length === 0) {
    return null;
  }
  return (
    <Panel title="מסלול אחר מסלול">
      <NoamTrackPlan />
      <ul className="flex flex-col gap-2.5">
        {tracks
          .filter((track) => trackIds.includes(track.id))
          .map((track) => {
            const action = actions[track.id] ?? KEEP;
            const name = TRACK_NAMES[track.type];
            return (
              <li key={track.id} className="flex flex-col gap-2 rounded-2xl bg-flow-ground p-3">
                <span className="flex flex-wrap items-center gap-2 text-[15px] font-extrabold">
                  <Dot type={track.type} />
                  {name}
                  {goodRate.has(track.id) && <span className="rounded-full bg-flow-pick px-2 py-0.5 text-xs font-bold text-flow-strong">ריבית טובה, כדאי לשמור</span>}
                  {suggested.has(track.id) && <span className="rounded-full border border-flow-line px-2 py-0.5 text-xs font-bold">ההמלצה</span>}
                </span>
                <span className="text-sm tabular-nums text-flow-muted">
                  {formatCurrency(track.balance)} · {formatPercent(track.annualRate)} · נשארו {formatTerm(track.remainingMonths)}
                </span>
                <div role="radiogroup" aria-label={`מה לעשות במסלול ${name}`} className="grid grid-cols-3 gap-1.5">
                  {ACTIONS.filter((each) => each.kind !== 'REFINANCE' || track.type !== 'ELIGIBILITY').map((each) => (
                    <button
                      key={each.kind}
                      type="button"
                      role="radio"
                      aria-checked={action.kind === each.kind}
                      onClick={() =>
                        setAction(
                          track.id,
                          each.kind === 'REFINANCE'
                            ? { kind: 'REFINANCE', type: track.type === 'ELIGIBILITY' ? 'FIXED_UNLINKED' : track.type, termMonths: clampTerm(track.remainingMonths) }
                            : each.kind === 'PREPAY'
                              ? { kind: 'PREPAY', amount: Math.min(track.balance, 50_000) }
                              : KEEP,
                        )
                      }
                      className={`min-h-11 rounded-full text-sm ${action.kind === each.kind ? 'border-2 border-flow-strong bg-flow-pick font-extrabold' : 'border border-flow-line font-semibold'}`}
                    >
                      {each.label}
                    </button>
                  ))}
                </div>
                {action.kind === 'REFINANCE' && (
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <select
                      aria-label={`מסלול חדש במקום ${name}`}
                      value={action.type}
                      onChange={(event) => setAction(track.id, { ...action, type: event.target.value as TrackType })}
                      className="min-h-11 rounded-xl border border-flow-line bg-flow-card px-2 text-base"
                    >
                      {NEW_TRACKS.map((type) => (
                        <option key={type} value={type}>
                          ל{TRACK_NAMES[type]}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        inputMode="numeric"
                        aria-label={`תקופה בשנים במקום ${name}`}
                        value={Math.round(action.termMonths / 12)}
                        onChange={(event) => setAction(track.id, { ...action, termMonths: clampTerm((Number(event.target.value.replace(/[^\d]/g, '')) || 1) * 12) })}
                        className="min-h-11 w-14 rounded-xl border border-flow-line bg-flow-card px-2 text-center text-base tabular-nums"
                      />
                      שנים
                    </label>
                  </div>
                )}
                {action.kind === 'PREPAY' && (
                  <label className="flex items-center gap-2 text-sm">
                    מחסכונות
                    <input
                      inputMode="numeric"
                      aria-label={`סכום לפירעון במסלול ${name}`}
                      value={Math.round(action.amount).toLocaleString('he-IL')}
                      onChange={(event) => setAction(track.id, { kind: 'PREPAY', amount: Math.min(track.balance, Number(event.target.value.replace(/[^\d]/g, '')) || 0) })}
                      className="min-h-11 flex-1 rounded-xl border border-flow-line bg-flow-card px-2 text-base tabular-nums"
                    />
                    ₪
                  </label>
                )}
              </li>
            );
          })}
      </ul>
      {result && (
        <section aria-label="מה התוכנית עושה" className="flex flex-col gap-1 rounded-2xl border border-flow-line p-3">
          {result.unchanged ? (
            <p className="text-[15px] text-flow-muted">בחרו מסלול למחזר או לפרוע, כדי לראות מה זה עושה.</p>
          ) : (
            <>
              <Rows
                rows={[
                  ['החזר בחודש', `${formatCurrency(result.currentPayment)} ← ${formatCurrency(result.proposedPayment)}`, true],
                  ['ביום המהלך', `${formatCurrency(result.upfront)}${result.cash > 0 ? `, מזה ${formatCurrency(result.cash)} מחסכונות` : ''}`],
                  ['מחזיר את עצמו', result.breakevenMonth > 0 ? `תוך ${result.breakevenMonth} חודשים` : 'לא מחזיר'],
                  ['שווה היום', formatSignedCurrency(result.netPresentValue)],
                ]}
              />
              {full && (
                <p className="text-sm font-bold">
                  {result.netPresentValue >= full.netPresentValue
                    ? `עדיף ב-${formatCurrency(result.netPresentValue - full.netPresentValue)} על מיחזור של הכל.`
                    : `מיחזור של הכל שווה ${formatCurrency(full.netPresentValue - result.netPresentValue)} יותר.`}
                </p>
              )}
            </>
          )}
        </section>
      )}
      {suggested.size < trackIds.length && (
        <button type="button" onClick={() => replace({})} className="no-print min-h-11 self-start text-sm font-bold underline underline-offset-4">
          חזרה להמלצה לכל מסלול
        </button>
      )}
    </Panel>
  );
}

const EXAMPLES = ['להוריד את ההחזר בלי לגעת במסלול הקבוע', 'יש לי 100,000 ₪ בצד: איפה הכי כדאי לשים אותם?'];

/**
 * A goal in the household's words, turned by נועם into a move per track; the plan lands in the
 * tracks above, where the engine prices it like any other. Only the tracks' figures and the goal go out.
 */
function NoamTrackPlan() {
  const enabled = useAiEnabled();
  const { planTracks, trackIds, result } = useTrackPlan();
  const goal = useTrackPlanStore((state) => state.goal);
  const setGoal = useTrackPlanStore((state) => state.setGoal);
  const stored = useTrackPlanStore((state) => state.answer);
  const [open, setOpen] = useState(false);
  const planner = useMutation({
    mutationFn: async (request: PlanRequest) => {
      const planned = await proposePlan(request);
      const live = useRefinance
        .getState()
        .tracks.filter((track) => track.balance > 0 && track.remainingMonths > 0)
        .map((track) => track.id);
      if (tracksKeyOf(live) !== tracksKeyOf(trackIds)) {
        throw new Error('המסלולים השתנו בזמן שההצעה הוכנה. שלחו שוב.');
      }
      const actions: Record<string, TrackAction> = {};
      trackIds.forEach((id, index) => {
        actions[id] = planned.actions[index] ?? KEEP;
      });
      const store = useTrackPlanStore.getState();
      store.replace(actions);
      store.setAnswer({ tracksKey: tracksKeyOf(trackIds), plan: planned });
    },
  });
  // An answer about other tracks would point at the wrong ones.
  const answer = stored?.tracksKey === tracksKeyOf(trackIds) ? stored.plan : undefined;
  if (!enabled || planTracks.length === 0 || !result) {
    return null;
  }
  if (!open && !answer) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-expanded={false} className="no-print flex min-h-12 items-center gap-2 self-start rounded-full border border-flow-line px-3 text-[15px] font-bold">
        <NoamAvatar size={28} />
        נועם, תבנה לי תוכנית לפי מטרה
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-flow-ground p-3">
      <div className="no-print flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-[15px] font-bold">
          מה אתם רוצים להשיג?
          <textarea
            value={goal}
            maxLength={MAX_GOAL_LENGTH}
            placeholder={EXAMPLES[0]}
            onChange={(event) => setGoal(event.target.value)}
            className="min-h-20 rounded-2xl border border-flow-line bg-flow-card p-3 text-base font-normal"
          />
        </label>
        {!goal && (
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" onClick={() => setGoal(example)} className="min-h-10 rounded-full border border-flow-line px-3 text-sm font-semibold">
                {example}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          disabled={planner.isPending || goal.trim().length < 3}
          onClick={() => planner.mutate({ goal: goal.trim(), tracks: planTracks, monthlyPayment: Math.round(result.currentPayment) })}
          className="min-h-12 rounded-full bg-flow-strong px-5 text-base font-extrabold text-flow-on-strong disabled:opacity-40"
        >
          {planner.isPending ? 'נועם בונה תוכנית…' : 'נועם, תבנה לי תוכנית'}
        </button>
        <p className="text-xs text-flow-muted">נשלחים רק נתוני המסלולים והמטרה, בלי שמות או פרטים מזהים.</p>
      </div>
      {planner.isError && (
        <p role="alert" className="text-[15px] text-negative">
          {planner.error instanceof Error ? planner.error.message : 'ההצעה לא התקבלה.'}
        </p>
      )}
      {answer && (
        <div aria-live="polite" className="flex flex-col gap-1 text-[15px]">
          {answer.summary && <p className="font-bold">{answer.summary}</p>}
          {answer.cautions.map((caution) => (
            <p key={caution} className="font-bold text-negative">
              {caution}
            </p>
          ))}
          <p className="text-xs text-flow-muted">התוכנית הוחלה על המסלולים למטה, והמספרים של המחשבון. נכתבה עם AI ואינה ייעוץ.</p>
        </div>
      )}
    </div>
  );
}
