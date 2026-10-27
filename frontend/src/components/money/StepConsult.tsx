import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { MAX_QUESTION_LENGTH, type ConsultFact, type ConsultRequest, type ConsultStep } from '../../engine/money/consultRequest';
import { consultStep, useAiEnabled } from '../../lib/aiClient';
import { useIsPhone } from '../../lib/viewport';
import { useMoney } from '../../store/moneyStore';

const PLACEHOLDERS: Record<ConsultStep, string> = {
  flow: 'למשל: באוגוסט קיבלתי בונוס; ההכנסה של בת הזוג נכנסת לחשבון אחר',
  spending: 'למשל: "מגדל" זה החזר הלוואה מהפנסיה; החוגים של הילדים נגמרים ביוני',
  debts: 'למשל: ההלוואה מהפנסיה נגמרת בעוד שנתיים; אני רוצה החזר חודשי נמוך יותר',
  savings: 'למשל: את המנוי לחדר כושר אני לא מוכן לבטל; ביטוח הרכב מתחדש בדצמבר',
  summary: 'למשל: מה הכי דחוף מבין כל אלה?',
};

/**
 * "Tell the AI" on a screen: what the numbers do not show, or a question about them. The answer
 * is about this screen; what was written is kept for the summary, where the advisor reads it all.
 * Sends the screen's totals (shown before sending) and the words typed — nothing else.
 */
export function StepConsult({ step, facts }: { step: ConsultStep; facts: readonly ConsultFact[] }) {
  const enabled = useAiEnabled();
  const note = useMoney((state) => state.notes[step] ?? '');
  const setNote = useMoney((state) => state.setNote);
  const consult = useMutation({ mutationFn: (request: ConsultRequest) => consultStep(request) });
  const { reset } = consult;
  const phone = useIsPhone();
  const [opened, setOpened] = useState(false);
  const factsKey = JSON.stringify(facts);
  // New figures on the screen make an earlier answer about them stale.
  useEffect(() => reset(), [factsKey, reset]);

  if (!enabled) {
    return null;
  }
  const request: ConsultRequest = { step, question: note.trim(), facts };
  const answer = consult.data;
  // On a phone, one line until it is wanted; open once anything is written or answered.
  if (phone && !opened && !note && !answer && !consult.isPending) {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={() => setOpened(true)}
        className="no-print flex w-full items-center gap-2 rounded-2xl border border-brand-500/30 bg-brand-50/40 px-4 py-3 text-start text-sm font-semibold text-ink"
      >
        <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] text-on-brand">
          AI
        </span>
        יש משהו שהמספרים לא מספרים?
      </button>
    );
  }
  return (
    <section className="no-print rounded-2xl border border-brand-500/30 bg-brand-50/40 p-4" aria-label="ספרו ל-AI">
      <label htmlFor={`consult-${step}`} className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[11px] text-on-brand">
          AI
        </span>
        יש משהו שהמספרים לא מספרים?
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          id={`consult-${step}`}
          rows={2}
          className="input min-h-16 flex-1 resize-none"
          maxLength={MAX_QUESTION_LENGTH}
          placeholder={PLACEHOLDERS[step]}
          value={note}
          onChange={(event) => setNote(step, event.target.value)}
        />
        <button
          type="button"
          className="btn-primary shrink-0"
          disabled={consult.isPending || note.trim().length < 3}
          onClick={() => consult.mutate(request)}
        >
          {consult.isPending ? <Thinking /> : 'שאלו את היועץ'}
        </button>
      </div>
      <div className="mt-1.5 text-xs text-ink-soft">
        <p>בלי שמות או פרטים מזהים. נשלחים הסכומים שבמסך והמילים שלכם, וזה נזכר לסיכום.</p>
        <details>
          <summary className="cursor-pointer font-medium text-brand-700">מה יישלח</summary>
          <pre dir="ltr" tabIndex={0} className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-xs text-ink-muted">
            {JSON.stringify(request, null, 2)}
          </pre>
        </details>
      </div>
      {consult.isError && (
        <p className="mt-2 text-sm text-negative" role="alert">
          {consult.error instanceof Error ? consult.error.message : 'התשובה לא התקבלה.'}
        </p>
      )}
      {answer && (
        <div className="mt-3 space-y-2 rounded-xl bg-surface p-3 text-sm" aria-live="polite">
          <p className="text-ink">{answer.answer}</p>
          {answer.points.length > 0 && (
            <ul className="space-y-1">
              {answer.points.map((point) => (
                <li key={point} className="flex gap-2 text-ink-muted">
                  <span aria-hidden className="text-brand-600">●</span>
                  {point}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-ink-soft">נכתב עם AI; המספרים של המחשבון. אינו ייעוץ פיננסי.</p>
        </div>
      )}
    </section>
  );
}

/** Three dots that pulse in turn while the answer is on its way. */
function Thinking() {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label="חושב">
      חושב
      {[0, 150, 300].map((delay) => (
        <span key={delay} aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}
