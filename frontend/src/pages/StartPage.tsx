import { useCallback, useEffect, useRef, useState } from 'react';
import { BuyResult } from '../components/flow/BuyResult';
import { BuyDetails, RecoveryDetails, RefinanceDetails } from '../components/flow/Details';
import { RecoveryResult, SharedRecovery } from '../components/flow/RecoveryResult';
import { RefinanceResult, SharedRefinance } from '../components/flow/RefinanceResult';
import { ShareBar } from '../components/flow/Share';
import { decodeShared, type RecoverySnapshot, type RefinanceSnapshot } from '../engine/flow/share';
import { AnswersSummary, GoalPicker, QuestionScreen } from '../components/flow/Screens';
import { CATALOG } from '../engine/flow/catalog';
import { firstOpen, neighbour, progressOf, stepsFor, type Answers, type Goal, type Step } from '../engine/flow/flow';
import { DONE, START, useAnswer, useFlowAnswers, useFlowSteps, useQuestionnaire } from '../store/questionnaireStore';

/**
 * The questionnaire, at `#/start`: the goals, then one question a screen, then what was answered.
 * Each screen has its own address (`#/start/<screen>`), so the browser's Back goes to the previous
 * question; the place is also kept on the device, so a later visit picks up where this one stopped.
 */

/** A result's details, under the questionnaire's own address. */
const DETAILS_BUY = 'details-buy';
const DETAILS_REFINANCE = 'details-refinance';
const DETAILS_RECOVERY = 'details-recovery';
const DETAILS: Record<Goal, string> = { BUY: DETAILS_BUY, REFINANCE: DETAILS_REFINANCE, RECOVERY: DETAILS_RECOVERY };

const hashOf = (at: string) => (at === START ? '#/start' : at === DONE ? '#/start/done' : `#/start/${at}`);
const atOfHash = () => {
  const screen = window.location.hash.replace(/^#\/?/, '').split('/')[1];
  return !screen ? START : screen === 'done' ? DONE : screen;
};

export function StartPage() {
  const { goals, at, setGoals, go, reset } = useQuestionnaire();
  const answer = useAnswer();
  const answers = useFlowAnswers();
  const steps = useFlowSteps(answers);

  const navigate = useCallback(
    (next: string) => {
      go(next);
      if (window.location.hash !== hashOf(next)) {
        window.history.pushState(null, '', hashOf(next));
      }
      window.scrollTo({ top: 0 });
    },
    [go],
  );

  // Back and Forward walk the questions; a link to a screen opens it.
  useEffect(() => {
    const fromHash = () => {
      const target = atOfHash();
      if (target !== useQuestionnaire.getState().at) {
        go(target);
      }
    };
    if (window.location.hash.replace(/^#\/?/, '').split('/')[1]) {
      fromHash();
    } else {
      window.history.replaceState(null, '', hashOf(useQuestionnaire.getState().at));
    }
    window.addEventListener('popstate', fromHash);
    return () => window.removeEventListener('popstate', fromHash);
  }, [go]);

  // A screen the answers no longer ask, or no goals at all: back to where the questionnaire stands.
  const details = goals.some((goal) => DETAILS[goal] === at);
  const known = at === START || at === DONE || details || steps.some((step) => step.id === at);
  const current = goals.length === 0 ? START : known ? at : (firstOpen(steps, answers) ?? DONE);
  const step = steps.find((each) => each.id === current);

  const start = (chosen: Goal[]) => {
    setGoals(chosen);
    navigate(firstOpen(stepsFor(CATALOG, chosen, answers), answers) ?? DONE);
  };

  return (
    <div dir="rtl" className="-mx-4 -mt-6 min-h-[calc(100vh-4rem)] bg-flow-ground px-5 pb-10 pt-5 text-flow-ink">
      <div className="mx-auto w-full max-w-md">
        {current === DETAILS_BUY ? (
          <BuyDetails answers={answers} onAnswer={answer} onBack={() => navigate(DONE)} />
        ) : current === DETAILS_REFINANCE ? (
          <RefinanceDetails answers={answers} onEdit={navigate} onBack={() => navigate(DONE)} />
        ) : current === DETAILS_RECOVERY ? (
          <RecoveryDetails onBack={() => navigate(DONE)} />
        ) : current === START || !step ? (
          current === DONE && goals.length > 0 ? (
            <Results
              steps={steps}
              answers={answers}
              goals={goals}
              onEdit={navigate}
              onDetails={(goal) => navigate(DETAILS[goal])}
              onRestart={() => {
                reset();
                navigate(START);
              }}
            />
          ) : (
            <GoalPicker
              initial={goals}
              resumable={goals.length > 0 && Object.keys(useQuestionnaire.getState().answers).length > 0}
              onStart={start}
              onResume={() => navigate(firstOpen(steps, answers) ?? DONE)}
              onRestart={() => {
                reset();
                navigate(START);
              }}
            />
          )
        ) : (
          <QuestionScreen
            step={step}
            progress={progressOf(CATALOG, steps, step.id)}
            answers={answers}
            goals={goals}
            onAnswer={answer}
            onBack={() => navigate(neighbour(steps, step.id, -1) ?? START)}
            onNext={() => navigate(neighbour(steps, step.id, 1) ?? DONE)}
          />
        )}
      </div>
    </div>
  );
}

/** After the last question: each goal's result that is ready here, then what was answered. */
function Results({
  steps,
  answers,
  goals,
  onEdit,
  onDetails,
  onRestart,
}: {
  steps: readonly Step[];
  answers: Answers;
  goals: readonly Goal[];
  onEdit: (step: string) => void;
  onDetails: (goal: Goal) => void;
  onRestart: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const here: Goal[] = [...goals];
  // What a shared link carries beside the answers: the figures of results read from documents.
  const [refinance, setRefinance] = useState<RefinanceSnapshot>();
  const [recovery, setRecovery] = useState<RecoverySnapshot>();
  const onRefinance = useCallback((snapshot: RefinanceSnapshot | undefined) => setRefinance(snapshot), []);
  const onRecovery = useCallback((snapshot: RecoverySnapshot | undefined) => setRecovery(snapshot), []);
  const any = here.length > 0;
  useEffect(() => {
    if (any) {
      heading.current?.focus({ preventScroll: true });
    }
  }, [any]);
  const TITLES: Record<Goal, string> = { BUY: 'הדירה', REFINANCE: 'המשכנתא', RECOVERY: 'החשבון' };
  return (
    <div className="flex flex-col gap-8">
      {any && (
        <div className="flex flex-col gap-6">
          <h2 ref={heading} tabIndex={-1} className="text-[32px] font-black leading-[1.1] tracking-tight outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
            התוצאה שלכם
          </h2>
          {here.map((goal) => (
            <div key={goal} className="flex flex-col gap-3">
              {here.length > 1 && <span className="text-sm font-bold uppercase tracking-wide text-flow-muted">{TITLES[goal]}</span>}
              {goal === 'BUY' ? (
                <BuyResult answers={answers} onEdit={onEdit} onDetails={() => onDetails('BUY')} />
              ) : goal === 'REFINANCE' ? (
                <RefinanceResult answers={answers} onEdit={onEdit} onDetails={() => onDetails('REFINANCE')} onSnapshot={onRefinance} />
              ) : (
                <RecoveryResult onEdit={onEdit} onDetails={() => onDetails('RECOVERY')} onSnapshot={onRecovery} hasReview={steps.some((step) => step.id === 'canGo')} />
              )}
            </div>
          ))}
          <ShareBar result={{ goals, answers, ...(refinance ? { refinance } : {}), ...(recovery ? { recovery } : {}) }} />
        </div>
      )}
      <AnswersSummary
        steps={steps}
        answers={answers}
        goals={goals.filter((goal) => !here.includes(goal))}
        onEdit={onEdit}
        onRestart={onRestart}
        focus={!any}
      />
    </div>
  );
}

/**
 * A result someone shared, at `#/s/<result>`: worked out again from its answers where it can be,
 * its own figures where it came from documents — beside the visitor's own questionnaire, which it
 * never touches unless they choose to take the answers in.
 */
export function SharedPage() {
  const encoded = window.location.hash.replace(/^#\/?s\//, '');
  const [shared] = useState(() => decodeShared(encoded));
  const [confirming, setConfirming] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const TITLES: Record<Goal, string> = { BUY: 'הדירה', REFINANCE: 'המשכנתא', RECOVERY: 'החשבון' };

  // In place of the visitor's own answers, as the confirmation says: nothing of theirs mixes in.
  const takeIn = () => {
    useQuestionnaire.setState({ goals: [...shared!.goals], answers: { ...shared!.answers }, at: DONE });
    window.location.hash = '#/start/done';
  };

  return (
    <div dir="rtl" className="-mx-4 -mt-6 min-h-[calc(100vh-4rem)] bg-flow-ground px-5 pb-10 pt-5 text-flow-ink">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <h2 ref={heading} tabIndex={-1} className="text-[32px] font-black leading-[1.1] tracking-tight outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
          {shared ? 'תוצאה ששותפה איתכם' : 'הקישור לא תקין'}
        </h2>
        {!shared ? (
          <p className="text-base text-flow-muted">אולי הוא נקטע בהעתקה. אפשר לבקש אותו שוב, או להתחיל שאלון משלכם.</p>
        ) : (
          shared.goals.map((goal) => (
            <div key={goal} className="flex flex-col gap-3">
              {shared.goals.length > 1 && <span className="text-sm font-bold uppercase tracking-wide text-flow-muted">{TITLES[goal]}</span>}
              {goal === 'BUY' ? (
                <BuyResult answers={shared.answers} />
              ) : goal === 'REFINANCE' ? (
                <SharedRefinance answers={shared.answers} snapshot={shared.refinance} />
              ) : shared.recovery ? (
                <SharedRecovery snapshot={shared.recovery} />
              ) : (
                <p className="rounded-[20px] bg-flow-card p-5 text-base text-flow-muted">תוכנית ההבראה לא שותפה בקישור הזה.</p>
              )}
            </div>
          ))
        )}
        {shared && (
          <div className="flex flex-col gap-2.5 rounded-[20px] bg-flow-card p-4">
            {confirming ? (
              <>
                <p className="text-[15px] font-bold">התשובות מהקישור יחליפו את התשובות שלכם בשאלון, אם יש. להמשיך?</p>
                <div className="flex gap-2">
                  <button type="button" onClick={takeIn} className="min-h-12 flex-1 rounded-full bg-flow-strong px-4 text-base font-extrabold text-flow-on-strong">
                    כן, לפתוח אצלי
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className="min-h-12 rounded-full border-2 border-flow-ink px-4 text-base font-bold">
                    ביטול
                  </button>
                </div>
              </>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="min-h-[52px] rounded-full border-2 border-flow-ink px-3 text-base font-extrabold">
                לפתוח את התשובות אצלי ולשנות
              </button>
            )}
          </div>
        )}
        <a href="#/start" className="flex min-h-14 items-center justify-center rounded-full bg-flow-ink px-6 text-lg font-extrabold text-flow-ground">
          שאלון משלי
        </a>
      </div>
    </div>
  );
}
