import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { MAX_GOAL_LENGTH, type PlanAnswer, type PlanRequest } from '../../engine/planRequest';
import type { TrackAction } from '../../engine/trackPlan';
import { proposePlan, useAiEnabled } from '../../lib/aiClient';
import { useTrackPlan, useTrackPlanStore } from '../../store/trackPlanStore';

const EXAMPLES = ['להוריד את ההחזר החודשי בלי לגעת במסלול הקבוע', 'יש לי 100 אלף בצד — איפה הכי כדאי לשים אותם?'];

/**
 * "What do you want?" in the borrower's own words. A model turns the goal into an action per track;
 * the plan lands in the playground, where the engine prices it like any plan the borrower builds.
 * Shown only when AI is switched on; only the track figures and the goal are sent.
 */
export function PlanGoalBox() {
  const enabled = useAiEnabled();
  const { planTracks, trackIds, result } = useTrackPlan();
  const replace = useTrackPlanStore((state) => state.replace);
  const [goal, setGoal] = useState('');
  const planner = useMutation({ mutationFn: (request: PlanRequest) => proposePlan(request) });
  const [answer, setAnswer] = useState<PlanAnswer>();
  const tracksKey = trackIds.join('|');

  // A plan for other tracks would point at the wrong ones.
  useEffect(() => setAnswer(undefined), [tracksKey]);

  if (!enabled || planTracks.length === 0 || !result) {
    return null;
  }

  const submit = () => {
    const request: PlanRequest = { goal: goal.trim(), tracks: planTracks, monthlyPayment: Math.round(result.currentPayment) };
    planner.mutate(request, {
      onSuccess: (planned) => {
        const actions: Record<string, TrackAction> = {};
        trackIds.forEach((id, index) => {
          actions[id] = planned.actions[index] ?? { kind: 'KEEP' };
        });
        replace(actions);
        setAnswer(planned);
      },
    });
  };

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
