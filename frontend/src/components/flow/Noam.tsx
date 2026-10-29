import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CATALOG } from '../../engine/flow/catalog';
import type { AnswerValue, Answers, Goal, Step } from '../../engine/flow/flow';
import { answerText, fillsFor, glossaryAnswer, MAX_MESSAGE_LENGTH, noamRequestFor } from '../../engine/flow/noamRequest';
import { askNoam, useAiEnabled } from '../../lib/aiClient';
import { useFocusTrap } from '../../lib/focusTrap';
import { GLOSSARY, type TermId } from '../../lib/glossary';

/** נועם: a drawn adviser in a jacket and tie — a person, not a photo of anyone. */
export function NoamAvatar({ size = 40 }: { size?: number }) {
  const clip = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden focusable="false" className="shrink-0">
      <defs>
        <clipPath id={clip}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="64" height="64" fill="#DCEBE5" />
        <g transform="translate(-4.8 -5.2) scale(1.15)">
          <path d="M8 66c0-13 10-20 24-20s24 7 24 20z" fill="#0A2F2B" />
          <path d="M25.5 46.5 32 56l6.5-9.5c-2-.7-4.2-1-6.5-1s-4.5.3-6.5 1z" fill="#fff" />
          <path d="M31 50.5h2l1 7.5-2 2.2-2-2.2z" fill="#0F5F57" />
          <path d="M27.5 37h9v9.5c-1.3 1.2-2.8 1.8-4.5 1.8s-3.2-.6-4.5-1.8z" fill="#DFA982" />
          <ellipse cx="19.8" cy="29" rx="2.4" ry="3.4" fill="#EDBE9A" />
          <ellipse cx="44.2" cy="29" rx="2.4" ry="3.4" fill="#EDBE9A" />
          <ellipse cx="32" cy="28" rx="12" ry="13.6" fill="#F3CBA8" />
          <path d="M20 27C19 15.5 25 10 32.5 10S45.5 15 44.2 27C43 21.5 40.5 18.6 36 18c-5-.6-9 1.5-12.5.6-1.9 2-3.1 4.8-3.5 8.4z" fill="#3A2A21" />
          <path d="M24.8 24.6c1.4-.9 3.2-1.1 4.8-.6M34.4 24c1.6-.5 3.4-.3 4.8.6" stroke="#3A2A21" strokeWidth="1.3" fill="none" strokeLinecap="round" />
          <circle cx="27.6" cy="28.4" r="1.35" fill="#2A1F19" />
          <circle cx="36.4" cy="28.4" r="1.35" fill="#2A1F19" />
          <path d="M32 30v3.4l-1.3.5" stroke="#D6A07C" strokeWidth="1.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M29.2 36.3c1.8 1 3.8 1 5.6 0" stroke="#A85A44" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

interface Turn {
  readonly from: 'user' | 'noam';
  readonly text: string;
  /** Answered from the glossary, without the AI. */
  readonly glossary?: boolean;
  /** Answers נועם read from the message, waiting for the household to confirm. */
  readonly fills?: Readonly<Record<string, AnswerValue>>;
}

/**
 * The "?" of a screen, as a sheet from the bottom: the glossary's entry for the question first —
 * no AI needed — then נועם, who explains, recommends, and fills in answers from what the
 * household writes, which they confirm or not.
 */
export function HelpSheet({
  step,
  goals,
  answers,
  focusNoam,
  onAnswer,
  onClose,
}: {
  step: Step;
  goals: readonly Goal[];
  answers: Answers;
  /** Opened from נועם's button rather than the "?": the cursor goes to the message box. */
  focusNoam: boolean;
  onAnswer: (field: string, value: AnswerValue) => void;
  onClose: () => void;
}) {
  const aiEnabled = useAiEnabled();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string>();
  const close = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLInputElement>(null);
  const sheet = useRef<HTMLElement>(null);
  useFocusTrap(sheet);
  const entry = step.help ? GLOSSARY[step.help] : undefined;

  useEffect(() => {
    (focusNoam ? box.current : close.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusNoam, onClose]);

  const ask = async (text: string, viaAi: boolean) => {
    setError(undefined);
    const term: TermId | undefined = viaAi ? undefined : glossaryAnswer(text);
    if (term) {
      const found = GLOSSARY[term];
      setTurns((all) => [...all, { from: 'user', text }, { from: 'noam', text: `${found.term}: ${found.short}`, glossary: true }]);
      return;
    }
    if (!aiEnabled) {
      setTurns((all) => [...all, { from: 'user', text }]);
      setError('נועם לא זמין כרגע. ההסבר מהמילון למעלה.');
      return;
    }
    const history = turns.filter((turn) => !turn.glossary).map((turn) => ({ from: turn.from, text: turn.text }));
    setTurns((all) => [...all, { from: 'user', text }]);
    setThinking(true);
    try {
      const reply = await askNoam(noamRequestFor(CATALOG, goals, step, answers, text, history));
      const fills = fillsFor(step, reply.fill, answers);
      setTurns((all) => [...all, { from: 'noam', text: reply.reply, ...(Object.keys(fills).length > 0 ? { fills } : {}) }]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'לא התקבלה תשובה. נסו שוב.');
    } finally {
      setThinking(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = message.trim();
    if (text.length >= 2 && !thinking) {
      setMessage('');
      void ask(text, false);
    }
  };

  const settle = (index: number, accept: boolean) => {
    const turn = turns[index]!;
    if (accept && turn.fills) {
      for (const [field, value] of Object.entries(turn.fills)) {
        onAnswer(field, value);
      }
    }
    setTurns((all) => all.map((each, at) => (at === index ? { ...each, fills: undefined, text: `${each.text}${accept ? ' ✓' : ''}` } : each)));
  };

  const lastUser = [...turns].reverse().find((turn) => turn.from === 'user');
  const lastGlossary = turns.at(-1)?.glossary;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" dir="rtl">
      <button type="button" aria-label="סגירת ההסבר" tabIndex={-1} className="absolute inset-0 cursor-default bg-black/45" onClick={onClose} />
      <section
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="relative flex max-h-[88vh] w-full max-w-lg flex-col gap-3.5 overflow-y-auto rounded-t-[28px] bg-flow-card px-5 pb-5 pt-2.5 text-flow-ink shadow-2xl"
      >
        <span aria-hidden className="mx-auto h-1.5 w-11 rounded-full bg-flow-line" />
        <div className="flex items-center justify-between gap-3">
          <h2 id="help-title" className="text-[22px] font-black leading-tight">
            {entry ? `מה זה ${entry.term}?` : step.title}
          </h2>
          <button ref={close} type="button" aria-label="סגירה" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-flow-ground">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {entry && (
          <>
            <p className="text-base leading-relaxed">{entry.short}</p>
            {'more' in entry && entry.more && <p className="text-[15px] leading-relaxed text-flow-muted">{entry.more}</p>}
            <span className="self-start rounded-full bg-flow-pick px-2.5 py-1 text-xs font-bold text-flow-strong">מהמילון · בלי AI</span>
            <hr className="border-flow-line" />
          </>
        )}

        <div className="flex items-center gap-2.5">
          <NoamAvatar />
          <span className="flex flex-col">
            <span className="text-base font-extrabold">{entry ? 'עדיין לא ברור? נועם כאן' : 'נועם כאן'}</span>
            <span className="text-xs text-flow-muted">יועץ AI · מסביר, ממליץ וממלא בשבילכם · בלי שמות ופרטים מזהים</span>
          </span>
        </div>

        {turns.length > 0 && (
          <ol aria-label="השיחה עם נועם" aria-live="polite" className="flex flex-col gap-2">
            {turns.map((turn, index) => (
              <li
                key={index}
                className={
                  turn.from === 'user'
                    ? 'max-w-[85%] self-start rounded-[18px] rounded-bl-md bg-flow-ink px-3.5 py-2.5 text-[15px] text-flow-ground'
                    : 'flex max-w-[90%] flex-col gap-2.5 self-end rounded-[18px] rounded-br-md bg-flow-pick px-3.5 py-3 text-[15px]'
                }
              >
                <span>{turn.text}</span>
                {turn.glossary && <span className="text-xs font-bold text-flow-strong">מהמילון · בלי AI</span>}
                {turn.fills && (
                  <>
                    <ul className="flex flex-col gap-0.5 text-sm font-bold">
                      {Object.entries(turn.fills).map(([id, value]) => {
                        const field = step.fields.find((each) => each.id === id)!;
                        return <li key={id}>{`${field.label}: ${answerText(field, value)}`}</li>;
                      })}
                    </ul>
                    <span className="flex gap-2">
                      <button type="button" onClick={() => settle(index, true)} className="min-h-11 rounded-full bg-flow-strong px-4 text-[15px] font-extrabold text-flow-on-strong">
                        אישור
                      </button>
                      <button type="button" onClick={() => settle(index, false)} className="min-h-11 rounded-full border border-flow-strong px-4 text-[15px] font-bold text-flow-strong">
                        לא, אתקן
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
            {thinking && <li className="self-end rounded-[18px] bg-flow-pick px-3.5 py-2.5 text-[15px] text-flow-muted">נועם חושב…</li>}
          </ol>
        )}
        {lastGlossary && lastUser && aiEnabled && !thinking && (
          <button type="button" onClick={() => void ask(lastUser.text, true)} className="min-h-11 self-start text-sm font-bold text-flow-strong underline-offset-4 hover:underline">
            לשאול את נועם בכל זאת
          </button>
        )}
        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}

        <form onSubmit={submit} className="flex min-h-[52px] items-center gap-2 rounded-full border-2 border-flow-line bg-flow-card ps-4 pe-1.5 focus-within:border-flow-strong">
          <label htmlFor="noam-message" className="sr-only">
            שאלה לנועם
          </label>
          <input
            ref={box}
            id="noam-message"
            value={message}
            maxLength={MAX_MESSAGE_LENGTH}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={'כתבו לנועם… למשל "משלמים 4,800 בחודש"'}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-base text-flow-ink outline-none focus-visible:ring-0 placeholder:text-flow-muted"
          />
          <button
            type="submit"
            aria-label="שליחה"
            disabled={thinking || message.trim().length < 2}
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-flow-ink text-flow-ground disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 6-6 6 6 6" />
            </svg>
          </button>
        </form>
      </section>
    </div>
  );
}
