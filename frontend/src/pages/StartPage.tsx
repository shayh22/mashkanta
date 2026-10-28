import { useCallback, useEffect, useRef, useState } from 'react';
import { BuyResult } from '../components/flow/BuyResult';
import { BuyDetails, RecoveryDetails, RefinanceDetails } from '../components/flow/Details';
import { RecoveryResult, SharedRecovery } from '../components/flow/RecoveryResult';
import { RefinanceResult, SharedRefinance } from '../components/flow/RefinanceResult';
import { ShareBar } from '../components/flow/Share';
import { TasksCard } from '../components/flow/Tasks';
import { BuyBanks, RefinanceBanks } from '../components/flow/Compare';
import { useImprovement, useRecoverySnapshot, useRefinanceSnapshot } from '../components/flow/outcomes';
import { ExpensesByCategory, LoanMovesPanel, NoamAdvisor } from '../components/flow/Improve';
import { useMonthlyPicture } from '../store/moneyStore';
import { chartsReady } from '../components/flow/chartsLoader';
import { AccountToday, BuyToday, CommitmentsMeter, LoansToday, MortgageToday } from '../components/flow/Today';
import { decodeShared } from '../engine/flow/share';
import { AnswersSummary, GoalPicker, QuestionScreen } from '../components/flow/Screens';
import { APP_NAME } from '../components/Logo';
import { CATALOG } from '../engine/flow/catalog';
import { firstOpen, neighbour, progressOf, stepsFor, type Answers, type Goal, type Step } from '../engine/flow/flow';
import { DONE, resultScreensFor, START, useAnswer, useFlowAnswers, useFlowSteps, useQuestionnaire, type ResultScreen } from '../store/questionnaireStore';

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
  const result = resultScreensFor(goals).find((screen) => screen === at);
  const known = at === START || !!result || details || steps.some((step) => step.id === at);
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
          <BuyDetails answers={answers} onAnswer={answer} onBack={() => navigate('improve')} />
        ) : current === DETAILS_REFINANCE ? (
          <RefinanceDetails answers={answers} onAnswer={answer} onEdit={navigate} onBack={() => navigate('improve')} />
        ) : current === DETAILS_RECOVERY ? (
          <RecoveryDetails onBack={() => navigate('improve')} />
        ) : current === START || !step ? (
          result && goals.length > 0 ? (
            <Results
              screen={result}
              steps={steps}
              answers={answers}
              goals={goals}
              onGo={navigate}
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

/** The result screens' names, in order. */
const SCREEN_TITLES: Record<ResultScreen, string> = { DONE: 'המצב היום', improve: 'איפה משפרים', compare: 'השוואה בין בנקים', plan: 'התוכנית' };
const TITLES: Record<Goal, string> = { BUY: 'הדירה', REFINANCE: 'המשכנתא', RECOVERY: 'החשבון' };

/**
 * After the last question: the result, a screen at a time — the situation today, where it can
 * improve, the banks side by side, and the plan — each with its own address, like the questions.
 */
function Results({
  screen,
  steps,
  answers,
  goals,
  onGo,
  onEdit,
  onDetails,
  onRestart,
}: {
  screen: ResultScreen;
  steps: readonly Step[];
  answers: Answers;
  goals: readonly Goal[];
  onGo: (screen: ResultScreen) => void;
  onEdit: (step: string) => void;
  onDetails: (goal: Goal) => void;
  onRestart: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const screens = resultScreensFor(goals);
  const index = screens.indexOf(screen);
  const next = screens[index + 1];
  // What a shared link carries beside the answers: the figures of results read from documents.
  const refinance = useRefinanceSnapshot(answers, goals.includes('REFINANCE'));
  const recovery = useRecoverySnapshot();
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [screen]);

  // The report: every screen at once, on white paper, through the browser's print — where "save
  // as PDF" is one choice away.
  useEffect(() => {
    if (!printing) {
      return;
    }
    const done = () => {
      delete document.body.dataset.print;
      setPrinting(false);
    };
    window.addEventListener('afterprint', done, { once: true });
    document.body.dataset.print = 'report';
    // The charts drawn first: the report is laid out off screen, so they have a width to fill.
    let cancelled = false;
    void chartsReady().then(() =>
      window.setTimeout(() => {
        if (!cancelled) {
          window.print();
        }
      }, 400),
    );
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  const body = (shown: ResultScreen) => <ScreenBody screen={shown} steps={steps} answers={answers} goals={goals} onEdit={onEdit} onDetails={onDetails} />;
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="שלבי התוצאה" className="no-print">
        <ol className="flex gap-1.5">
          {screens.map((each, at) => (
            <li key={each} className="flex-1">
              <button
                type="button"
                onClick={() => onGo(each)}
                aria-current={each === screen ? 'step' : undefined}
                className="flex min-h-11 w-full flex-col items-stretch gap-1.5 text-start text-xs font-bold"
              >
                <span aria-hidden className={`h-1.5 rounded-full ${at <= index ? 'bg-flow-strong' : 'bg-flow-line'}`} />
                <span className={each === screen ? 'text-flow-ink' : 'text-flow-muted'}>{SCREEN_TITLES[each]}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <h2 ref={heading} tabIndex={-1} className="text-[32px] font-black leading-[1.1] tracking-tight outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
        {SCREEN_TITLES[screen]}
      </h2>
      {body(screen)}

      {screen === 'plan' && (
        <>
          <TasksCard goals={goals} answers={answers} {...(refinance ? { refinance } : {})} />
          <div className="flex flex-col gap-2.5">
            <button type="button" onClick={() => setPrinting(true)} className="min-h-[52px] rounded-full border-2 border-flow-ink px-3 text-base font-extrabold">
              דוח PDF
            </button>
            <ShareBar result={{ goals, answers, ...(refinance ? { refinance } : {}), ...(recovery ? { recovery } : {}) }} />
          </div>
          <AnswersSummary steps={steps} answers={answers} goals={[]} onEdit={onEdit} onRestart={onRestart} focus={false} />
        </>
      )}

      <div className="no-print flex flex-col gap-2.5">
        {next && (
          <button type="button" onClick={() => onGo(next)} className="flex min-h-14 items-center justify-center rounded-full bg-flow-ink px-6 text-lg font-extrabold text-flow-ground">
            הבא: {SCREEN_TITLES[next]}
          </button>
        )}
        <button
          type="button"
          onClick={() => (index > 0 ? onGo(screens[index - 1]!) : onEdit(steps.at(-1)?.id ?? START))}
          className="min-h-12 rounded-full px-6 text-base font-bold text-flow-muted"
        >
          {index > 0 ? `חזרה: ${SCREEN_TITLES[screens[index - 1]!]}` : 'חזרה לשאלות'}
        </button>
      </div>

      {printing && (
        <div aria-hidden className="report pointer-events-none fixed left-[-10000px] top-0 flex w-[720px] flex-col gap-6 print:absolute print:left-0 print:right-0 print:w-auto">
          <p className="text-sm font-bold text-flow-muted">
            {APP_NAME} · דוח מ-{new Date().toLocaleDateString('he-IL')}
          </p>
          {screens
            .filter((each) => each !== 'plan')
            .map((each) => (
              <div key={each} className="flex flex-col gap-4">
                <h2 className="text-[28px] font-black leading-tight">{SCREEN_TITLES[each]}</h2>
                {body(each)}
              </div>
            ))}
          <TasksCard goals={goals} answers={answers} {...(refinance ? { refinance } : {})} />
        </div>
      )}
    </div>
  );
}

/** One result screen's content, for each goal chosen. */
function ScreenBody({
  screen,
  steps,
  answers,
  goals,
  onEdit,
  onDetails,
}: {
  screen: ResultScreen;
  steps: readonly Step[];
  answers: Answers;
  goals: readonly Goal[];
  onEdit: (step: string) => void;
  onDetails: (goal: Goal) => void;
}) {
  const picture = useMonthlyPicture();
  const { loans } = useImprovement();
  const hasAccount = !!picture || loans.length > 0;
  if (screen === DONE) {
    return (
      <div className="flex flex-col gap-4">
        {goals.includes('BUY') && <BuyToday answers={answers} />}
        <MortgageToday answers={answers} refinancing={goals.includes('REFINANCE')} onEdit={onEdit} />
        <AccountToday recovering={goals.includes('RECOVERY')} onEdit={onEdit} />
        <LoansToday />
        <CommitmentsMeter answers={answers} goals={goals} />
      </div>
    );
  }
  if (screen === 'compare') {
    return (
      <div className="flex flex-col gap-4">
        {goals.includes('BUY') && <BuyBanks answers={answers} />}
        {goals.includes('REFINANCE') && <RefinanceBanks answers={answers} />}
      </div>
    );
  }
  if (screen === 'plan') {
    return null;
  }
  // The account and the loans, for every goal: a recovery plan's own result, and for the others
  // where the statements or the loans were added.
  const account = goals.includes('RECOVERY') || hasAccount;
  return (
    <div className="flex flex-col gap-6">
      {goals
        .filter((goal) => goal !== 'RECOVERY')
        .map((goal) => (
          <div key={goal} className="flex flex-col gap-3">
            {(goals.length > 1 || account) && <span className="text-sm font-bold uppercase tracking-wide text-flow-muted">{TITLES[goal]}</span>}
            {goal === 'BUY' ? (
              <BuyResult answers={answers} onEdit={onEdit} onDetails={() => onDetails('BUY')} />
            ) : (
              <RefinanceResult answers={answers} onEdit={onEdit} onDetails={() => onDetails('REFINANCE')} />
            )}
          </div>
        ))}
      {account && (
        <div className="flex flex-col gap-3">
          {(goals.length > 1 || !goals.includes('RECOVERY')) && (
            <span className="text-sm font-bold uppercase tracking-wide text-flow-muted">{picture ? TITLES.RECOVERY : 'ההלוואות'}</span>
          )}
          <RecoveryResult
            recovering={goals.includes('RECOVERY')}
            onEdit={onEdit}
            onDetails={() => onDetails('RECOVERY')}
            hasReview={steps.some((step) => step.id === 'canGo')}
          />
          {picture && <ExpensesByCategory picture={picture} />}
          {picture && <NoamAdvisor picture={picture} />}
          <LoanMovesPanel />
        </div>
      )}
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
