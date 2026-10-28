import { useEffect, useRef, useState } from 'react';
import { CATALOG, GOAL_CHOICES } from '../../engine/flow/catalog';
import { stepComplete, visibleFields, type AnswerValue, type Answers, type Goal, type Progress, type Step } from '../../engine/flow/flow';
import { answerText } from '../../engine/flow/noamRequest';
import { FieldInput } from './Fields';
import { HelpSheet, NoamAvatar } from './Noam';

/** The questionnaire's screens: the goals, one question at a time, and what was answered. */

const GOAL_ICONS: Record<Goal, string> = {
  REFINANCE: 'M20 7H8a4 4 0 0 0 0 8h1M17 4l3 3-3 3M4 17h12a4 4 0 0 0 0-8h-1M7 20l-3-3 3-3',
  BUY: 'M3 11 12 4l9 7v9H3zM10 20v-5h4v5',
  RECOVERY: 'M3 17 9 11l4 4 8-8M15 7h6v6',
};

const primaryButton =
  'flex min-h-14 items-center justify-center gap-3 rounded-full bg-flow-ink px-6 text-lg font-extrabold text-flow-ground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35';

/** The opening screen: what to sort out today — any of the three. */
export function GoalPicker({
  initial,
  resumable,
  onStart,
  onResume,
  onRestart,
}: {
  initial: readonly Goal[];
  /** A questionnaire already under way on this device. */
  resumable: boolean;
  onStart: (goals: Goal[]) => void;
  onResume: () => void;
  onRestart: () => void;
}) {
  const [chosen, setChosen] = useState<Goal[]>(() => [...initial]);
  const toggle = (goal: Goal) => setChosen((all) => (all.includes(goal) ? all.filter((each) => each !== goal) : [...all, goal]));
  return (
    <div className="flex flex-col gap-5">
      {resumable && (
        <div className="flex flex-col gap-3 rounded-3xl bg-flow-card p-4">
          <p className="text-lg font-extrabold">להמשיך מאיפה שעצרתם?</p>
          <div className="flex gap-2">
            <button type="button" onClick={onResume} className="min-h-12 flex-1 rounded-full bg-flow-strong px-4 text-base font-extrabold text-flow-on-strong">
              להמשיך
            </button>
            <button type="button" onClick={onRestart} className="min-h-12 rounded-full border-2 border-flow-ink px-4 text-base font-bold">
              להתחיל מחדש
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <h2 className="text-[40px] font-black leading-[1.05] tracking-tight">מה נסדר היום?</h2>
        <p className="text-base text-flow-muted">אפשר לבחור יותר מאחד.</p>
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">המטרות שלי</legend>
        {GOAL_CHOICES.map((goal) => {
          const selected = chosen.includes(goal.id);
          return (
            <label
              key={goal.id}
              className={`relative flex min-h-[76px] cursor-pointer items-center gap-3.5 rounded-[20px] border-2 p-4 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-flow-strong ${
                selected ? 'border-flow-strong bg-flow-pick' : 'border-flow-card bg-flow-card hover:border-flow-line'
              }`}
            >
              <input type="checkbox" className="sr-only" checked={selected} onChange={() => toggle(goal.id)} />
              <span
                aria-hidden
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${selected ? 'bg-flow-strong text-flow-on-strong' : 'bg-flow-pick text-flow-strong'}`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={GOAL_ICONS[goal.id]} />
                </svg>
              </span>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-lg font-extrabold">{goal.title}</span>
                <span className="text-sm text-flow-muted">{goal.sub}</span>
              </span>
              <span
                aria-hidden
                className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-flow-strong bg-flow-strong' : 'border-flow-line'}`}
              >
                {selected && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-flow-on-strong">
                    <path d="m5 12 5 5 9-10" />
                  </svg>
                )}
              </span>
            </label>
          );
        })}
      </fieldset>
      <button type="button" disabled={chosen.length === 0} onClick={() => onStart(chosen)} className={primaryButton}>
        {chosen.length > 1 ? `בואו נתחיל · ${chosen.length} מטרות` : 'בואו נתחיל'}
        <span aria-hidden className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-flow-accent text-flow-ink">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </span>
      </button>
      <p className="text-center text-sm text-flow-muted">כ-5 דקות · הכל נשאר אצלכם במכשיר</p>
    </div>
  );
}

/** One question, its follow-ups as they open, and the way back, on, and to help. */
export function QuestionScreen({
  step,
  progress,
  answers,
  goals,
  onAnswer,
  onBack,
  onNext,
}: {
  step: Step;
  progress: Progress;
  answers: Answers;
  goals: readonly Goal[];
  onAnswer: (field: string, value: AnswerValue | undefined) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [help, setHelp] = useState<'term' | 'noam'>();
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const fields = visibleFields(step, answers);
  const complete = stepComplete(step, answers);

  // A new question takes the reader to it: the focus, off a button the swap removed, to its heading.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    setHelp(undefined);
  }, [step.id]);

  const openHelp = (kind: 'term' | 'noam') => {
    opener.current = document.activeElement as HTMLElement | null;
    setHelp(kind);
  };
  const closeHelp = () => {
    setHelp(undefined);
    opener.current?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} aria-label="לשאלה הקודמת" className="flex h-11 w-11 items-center justify-center rounded-full bg-flow-card">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
          <span className="text-sm font-bold text-flow-muted">
            {progress.section?.label} · {progress.index + 1} מתוך {progress.total}
          </span>
          <span className="w-11" aria-hidden />
        </div>
        <div
          role="progressbar"
          aria-label="התקדמות בשאלון"
          aria-valuemin={1}
          aria-valuemax={progress.total}
          aria-valuenow={progress.index + 1}
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${progress.total}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: progress.total }, (_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-full ${index < progress.index ? 'bg-flow-strong' : index === progress.index ? 'bg-flow-ink' : 'bg-flow-line'}`}
            />
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2.5 pt-2">
        <h2 ref={heading} tabIndex={-1} className="flex-1 text-[32px] font-black leading-[1.1] tracking-tight outline-none">
          {step.title}
        </h2>
        <button
          type="button"
          onClick={() => openHelp(step.help ? 'term' : 'noam')}
          aria-label="הסבר על השאלה"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-flow-line bg-flow-card text-xl font-black text-flow-strong"
        >
          ?
        </button>
      </div>

      <FieldInput field={fields[0]!} value={answers[fields[0]!.id]} onChange={(value) => onAnswer(fields[0]!.id, value)} primary />
      {fields.length > 1 && (
        <div className="flex animate-fade-up flex-col gap-3.5 rounded-[20px] border border-flow-line bg-flow-card p-4">
          {fields.slice(1).map((field) => (
            <FieldInput key={field.id} field={field} value={answers[field.id]} onChange={(value) => onAnswer(field.id, value)} primary={false} />
          ))}
        </div>
      )}

      <div className="flex gap-2.5 pt-2">
        <button type="button" disabled={!complete} onClick={onNext} className={`${primaryButton} flex-1`}>
          הבא
        </button>
        <button
          type="button"
          onClick={() => openHelp('noam')}
          aria-label="שאלו את נועם"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-flow-line bg-flow-card"
        >
          <NoamAvatar />
        </button>
      </div>

      {help && <HelpSheet step={step} goals={goals} answers={answers} focusNoam={help === 'noam'} onAnswer={onAnswer} onClose={closeHelp} />}
    </div>
  );
}

/** After the last question: what the household told us, each answer a tap away from changing. */
export function AnswersSummary({
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
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const RESULTS: Record<Goal, { label: string; href: string }> = {
    REFINANCE: { label: 'לבדיקת המיחזור', href: '#/own' },
    BUY: { label: 'לתמהיל לדירה', href: '#/buy' },
    RECOVERY: { label: 'לתוכנית ההבראה', href: '#/money' },
  };
  return (
    <div className="flex flex-col gap-5">
      <h2 ref={heading} tabIndex={-1} className="text-[32px] font-black leading-[1.1] tracking-tight outline-none">
        זה מה שסיפרתם
      </h2>
      {CATALOG.sections
        .filter((section) => steps.some((step) => step.section === section.id))
        .map((section) => (
          <section key={section.id} aria-label={section.label} className="flex flex-col overflow-hidden rounded-[20px] bg-flow-card">
            <h3 className="border-b border-flow-line px-4 py-2.5 text-sm font-bold text-flow-muted">{section.label}</h3>
            {steps
              .filter((step) => step.section === section.id)
              .map((step) => {
                const said = visibleFields(step, answers)
                  .map((field) => {
                    const value = answers[field.id];
                    if (field.kind === 'upload') {
                      return value === true ? 'נקרא' : value === undefined ? undefined : 'בהמשך';
                    }
                    return value === undefined ? undefined : answerText(field, value);
                  })
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => onEdit(step.id)}
                    className="flex min-h-14 items-center justify-between gap-3 border-b border-flow-line px-4 py-2.5 text-start last:border-b-0 hover:bg-flow-pick"
                  >
                    <span className="flex flex-col">
                      <span className="text-[15px] font-bold">{step.title}</span>
                      <span className="text-sm text-flow-muted">{said || 'לא נענה'}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-flow-strong">שינוי</span>
                  </button>
                );
              })}
          </section>
        ))}
      <div className="flex flex-col gap-2.5">
        {goals.map((goal) => (
          <a key={goal} href={RESULTS[goal].href} className={primaryButton}>
            {RESULTS[goal].label}
          </a>
        ))}
      </div>
      <button type="button" onClick={onRestart} className="min-h-11 self-center text-base font-bold text-flow-strong underline-offset-4 hover:underline">
        להתחיל מחדש
      </button>
    </div>
  );
}
