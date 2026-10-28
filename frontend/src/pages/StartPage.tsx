import { useCallback, useEffect, useRef } from 'react';
import { BuyResult } from '../components/flow/BuyResult';
import { AnswersSummary, GoalPicker, QuestionScreen } from '../components/flow/Screens';
import { CATALOG } from '../engine/flow/catalog';
import { firstOpen, neighbour, progressOf, stepsFor, type Answers, type Goal, type Step } from '../engine/flow/flow';
import { DONE, START, useFlowAnswers, useFlowSteps, useQuestionnaire } from '../store/questionnaireStore';

/**
 * The questionnaire, at `#/start`: the goals, then one question a screen, then what was answered.
 * Each screen has its own address (`#/start/<screen>`), so the browser's Back goes to the previous
 * question; the place is also kept on the device, so a later visit picks up where this one stopped.
 */

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
  const known = at === START || at === DONE || steps.some((step) => step.id === at);
  const current = goals.length === 0 ? START : known ? at : (firstOpen(steps, answers) ?? DONE);
  const step = steps.find((each) => each.id === current);

  const start = (chosen: Goal[]) => {
    setGoals(chosen);
    navigate(firstOpen(stepsFor(CATALOG, chosen, answers), answers) ?? DONE);
  };

  return (
    <div dir="rtl" className="-mx-4 -mt-6 min-h-[calc(100vh-4rem)] bg-flow-ground px-5 pb-10 pt-5 text-flow-ink">
      <div className="mx-auto w-full max-w-md">
        {current === START || !step ? (
          current === DONE && goals.length > 0 ? (
            <Results
              steps={steps}
              answers={answers}
              goals={goals}
              onEdit={navigate}
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
  onRestart,
}: {
  steps: readonly Step[];
  answers: Answers;
  goals: readonly Goal[];
  onEdit: (step: string) => void;
  onRestart: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const buying = goals.includes('BUY');
  useEffect(() => {
    if (buying) {
      heading.current?.focus({ preventScroll: true });
    }
  }, [buying]);
  return (
    <div className="flex flex-col gap-8">
      {buying && (
        <div className="flex flex-col gap-4">
          <h2 ref={heading} tabIndex={-1} className="text-[32px] font-black leading-[1.1] tracking-tight outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
            התוצאה שלכם
          </h2>
          <BuyResult answers={answers} onEdit={onEdit} />
        </div>
      )}
      <AnswersSummary
        steps={steps}
        answers={answers}
        goals={goals.filter((goal) => goal !== 'BUY')}
        onEdit={onEdit}
        onRestart={onRestart}
        focus={!buying}
      />
    </div>
  );
}
