import { useCallback, useEffect, useRef } from 'react';
import { BuyResult } from '../components/flow/BuyResult';
import { BuyDetails, RefinanceDetails } from '../components/flow/Details';
import { RefinanceResult } from '../components/flow/RefinanceResult';
import { AnswersSummary, GoalPicker, QuestionScreen } from '../components/flow/Screens';
import { CATALOG } from '../engine/flow/catalog';
import { firstOpen, neighbour, progressOf, stepsFor, type Answers, type Goal, type Step } from '../engine/flow/flow';
import { DONE, START, useFlowAnswers, useFlowSteps, useQuestionnaire } from '../store/questionnaireStore';

/**
 * The questionnaire, at `#/start`: the goals, then one question a screen, then what was answered.
 * Each screen has its own address (`#/start/<screen>`), so the browser's Back goes to the previous
 * question; the place is also kept on the device, so a later visit picks up where this one stopped.
 */

/** A result's details, under the questionnaire's own address. */
const DETAILS_BUY = 'details-buy';
const DETAILS_REFINANCE = 'details-refinance';

const hashOf = (at: string) => (at === START ? '#/start' : at === DONE ? '#/start/done' : `#/start/${at}`);
const atOfHash = () => {
  const screen = window.location.hash.replace(/^#\/?/, '').split('/')[1];
  return !screen ? START : screen === 'done' ? DONE : screen;
};

export function StartPage() {
  const { goals, at, setGoals, answer, go, reset } = useQuestionnaire();
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
  const details = (at === DETAILS_BUY && goals.includes('BUY')) || (at === DETAILS_REFINANCE && goals.includes('REFINANCE'));
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
        ) : current === START || !step ? (
          current === DONE && goals.length > 0 ? (
            <Results
              steps={steps}
              answers={answers}
              goals={goals}
              onEdit={navigate}
              onDetails={(goal) => navigate(goal === 'BUY' ? DETAILS_BUY : DETAILS_REFINANCE)}
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
  // The goals whose result is worked out here; the others link to their pages for now.
  const here: Goal[] = goals.filter((goal) => goal === 'BUY' || goal === 'REFINANCE');
  const any = here.length > 0;
  useEffect(() => {
    if (any) {
      heading.current?.focus({ preventScroll: true });
    }
  }, [any]);
  const TITLES: Partial<Record<Goal, string>> = { BUY: 'הדירה', REFINANCE: 'המשכנתא' };
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
              ) : (
                <RefinanceResult answers={answers} onEdit={onEdit} onDetails={() => onDetails('REFINANCE')} />
              )}
            </div>
          ))}
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
