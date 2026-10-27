import { useMutation } from '@tanstack/react-query';
import { MAX_GOAL_LENGTH, type PlanRequest } from '../../engine/planRequest';
import { KEEP, type TrackAction } from '../../engine/trackPlan';
import { proposePlan, useAiEnabled } from '../../lib/aiClient';
import { useRefinance } from '../../store/refinanceStore';
import { tracksKeyOf, useTrackPlanStore, type TrackPlanView } from '../../store/trackPlanStore';

const EXAMPLES = ['להוריד את ההחזר החודשי בלי לגעת במסלול הקבוע', 'יש לי 100 אלף בצד — איפה הכי כדאי לשים אותם?'];

const liveKey = () =>
  tracksKeyOf(
    useRefinance
      .getState()
      .tracks.filter((track) => track.balance > 0 && track.remainingMonths > 0)
      .map((track) => track.id),
  );

/**
 * Asks for a plan and applies it. Runs to the end even if the section is folded meanwhile, and
 * applies nothing if the tracks changed while the answer was on its way.
 */
async function planFor(request: PlanRequest, trackIds: readonly string[]): Promise<void> {
  const planned = await proposePlan(request);
  const tracksKey = tracksKeyOf(trackIds);
  if (liveKey() !== tracksKey) {
    throw new Error('המסלולים השתנו בזמן שההצעה הוכנה. שלחו שוב.');
  }
  const actions: Record<string, TrackAction> = {};
  trackIds.forEach((id, index) => {
    actions[id] = planned.actions[index] ?? KEEP;
  });
  const store = useTrackPlanStore.getState();
  store.replace(actions);
  store.setAnswer({ tracksKey, plan: planned });
}

/**
 * "What do you want?" in the borrower's own words. A model turns the goal into an action per track;
 * the plan lands in the playground, where the engine prices it like any plan the borrower builds.
 * Shown only when AI is switched on; only the track figures and the goal are sent.
 */
export function PlanGoalBox({ plan }: { plan: TrackPlanView }) {
  const enabled = useAiEnabled();
  const { planTracks, trackIds, result } = plan;
  const goal = useTrackPlanStore((state) => state.goal);
  const setGoal = useTrackPlanStore((state) => state.setGoal);
  const stored = useTrackPlanStore((state) => state.answer);
  const planner = useMutation({ mutationFn: (request: PlanRequest) => planFor(request, trackIds) });
  // An answer about other tracks would point at the wrong ones.
  const answer = stored?.tracksKey === tracksKeyOf(trackIds) ? stored.plan : undefined;

  if (!enabled || planTracks.length === 0 || !result) {
    return null;
  }

  const submit = () =>
    planner.mutate({ goal: goal.trim(), tracks: planTracks, monthlyPayment: Math.round(result.currentPayment) });

  return (
    <section className="card space-y-3 border-brand-500/30 bg-brand-50/40 no-print" aria-label="מה אתם רוצים להשיג">
      <label htmlFor="plan-goal" className="block text-sm font-semibold text-ink">
        <span aria-hidden>🤖 </span>מה אתם רוצים להשיג?
      </label>
      <textarea
        id="plan-goal"
        className="input min-h-20"
        maxLength={MAX_GOAL_LENGTH}
        placeholder={EXAMPLES[0]}
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-soft">בלי שמות או פרטים מזהים · נשלחים רק נתוני המסלולים והבקשה</p>
        <button
          type="button"
          className="btn-primary"
          disabled={planner.isPending || goal.trim().length < 3}
          onClick={submit}
        >
          {planner.isPending ? 'בונה הצעה…' : 'הציעו לי תוכנית'}
        </button>
      </div>
      {!goal && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className="badge-neutral cursor-pointer" onClick={() => setGoal(example)}>
              {example}
            </button>
          ))}
        </div>
      )}
      {planner.isError && (
        <p className="text-sm text-negative" role="alert">
          {planner.error instanceof Error ? planner.error.message : 'ההצעה לא התקבלה.'}
        </p>
      )}
      {answer && (
        <div className="space-y-1 text-sm" aria-live="polite">
          {answer.summary && <p className="font-medium text-ink">{answer.summary}</p>}
          {answer.cautions.map((caution) => (
            <p key={caution} className="text-caution">
              ⚠ {caution}
            </p>
          ))}
          <p className="text-xs text-ink-soft">ההצעה הוחלה על המסלולים למטה. המספרים של המחשבון; ההצעה נכתבה עם AI ואינה ייעוץ.</p>
        </div>
      )}
    </section>
  );
}
