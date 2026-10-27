import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { CATEGORY_LABELS } from '../../engine/money/categories';
import { adviceRequestOf, freedByAdvice, MAX_GOAL_LENGTH, type AdviceRequest } from '../../engine/money/adviceRequest';
import type { CategoryId } from '../../engine/money/categories';
import type { MonthlyPicture } from '../../engine/money/picture';

export interface AdviceTarget {
  readonly category: CategoryId;
  readonly label: string;
  readonly current: number;
  readonly target: number;
}
import { adviseHousehold, useAiEnabled } from '../../lib/aiClient';
import { formatCurrency } from '../../lib/format';
import { useMoneyCategories } from '../../store/moneyStore';

const GOAL_EXAMPLES = ['לצאת מהמינוס בתוך חצי שנה', 'לחסוך 10,000 ₪ לחופשה עד הקיץ'];

/**
 * The advisor: the household's goal in its own words, and a few steps toward it from a model that
 * sees only the monthly totals. What the steps' targets free up is the app's own sum.
 */
export function AdvisorCard({
  picture,
  notes,
  onTargets,
}: {
  picture: MonthlyPicture;
  /** What the household wrote on the earlier screens. */
  notes: readonly string[];
  /** The plan's category targets, each with what is spent there now; called again when they change. */
  onTargets: (targets: readonly AdviceTarget[]) => void;
}) {
  const enabled = useAiEnabled();
  const [goal, setGoal] = useState('');
  const advisor = useMutation({ mutationFn: (request: AdviceRequest) => adviseHousehold(request) });
  const { reset } = advisor;
  const explanations = useMoneyCategories((state) => state.explanations);
  const totals = useMemo(() => adviceRequestOf(picture, '', explanations, notes), [picture, explanations, notes]);
  const totalsKey = JSON.stringify({ ...totals, notes: [] });
  // New files or categories make the plan's figures wrong; drop it rather than leave it beside new ones.
  useEffect(() => reset(), [totalsKey, reset]);
  const { data: planned, variables: plannedFor } = advisor;
  useEffect(() => {
    if (!planned || !plannedFor) {
      onTargets([]);
      return;
    }
    const spent = new Map(plannedFor.categories.map((category) => [category.id as string, category.monthly]));
    // One target per category: the last word on it counts.
    const byCategory = new Map(planned.steps.flatMap((step) => (step.target ? [[step.target.category, step.target] as const] : [])));
    onTargets(
      [...byCategory.values()].map((target) => ({
        category: target.category,
        label: CATEGORY_LABELS[target.category],
        current: spent.get(target.category) ?? 0,
        target: target.monthly,
      })),
    );
  }, [planned, plannedFor, onTargets]);

  if (!enabled) {
    return null;
  }
  const request = { ...totals, goal: goal.trim() };
  const advice = advisor.data;
  const asked = advisor.variables;
  const freed = advice && asked ? freedByAdvice(advice, asked) : 0;
  const net = picture.income - picture.spending;
  const spentOn = new Map(totals.categories.map((category) => [category.id as string, category.monthly]));

  return (
    <section className="card space-y-3 border-brand-500/30 bg-brand-50/40" aria-label="היועץ">
      <label htmlFor="money-goal" className="block text-base font-semibold text-ink">
        <span aria-hidden>🤖 </span>מה חשוב לכם עכשיו?
      </label>
      <textarea
        id="money-goal"
        className="input min-h-20"
        maxLength={MAX_GOAL_LENGTH}
        placeholder={GOAL_EXAMPLES[0]}
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
      />
      {!goal && (
        <div className="no-print flex flex-wrap gap-2">
          {GOAL_EXAMPLES.map((example) => (
            <button key={example} type="button" className="badge-neutral cursor-pointer" onClick={() => setGoal(example)}>
              {example}
            </button>
          ))}
        </div>
      )}
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-soft">
          נשלחים סכומים לפי קטגוריה{notes.length > 0 ? ` ו-${notes.length} ההערות שכתבתם בשלבים` : ''} — בלי שמות בתי עסק, תאריכים או חשבון
        </p>
        <button
          type="button"
          className="btn-primary"
          disabled={advisor.isPending || goal.trim().length < 3}
          onClick={() => advisor.mutate(request)}
        >
          {advisor.isPending ? 'בונה תוכנית…' : 'בנו לי תוכנית'}
        </button>
      </div>
      <details className="no-print">
        <summary className="cursor-pointer text-xs font-medium text-brand-700">מה יישלח</summary>
        <pre dir="ltr" tabIndex={0} className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-xs text-ink-muted">
          {JSON.stringify(request, null, 2)}
        </pre>
      </details>

      {advisor.isError && (
        <p className="text-sm text-negative" role="alert">
          {advisor.error instanceof Error ? advisor.error.message : 'התוכנית לא התקבלה.'}
        </p>
      )}

      {advice && (
        <div className="space-y-3" aria-live="polite">
          {advice.summary && <p className="text-sm font-medium text-ink">{advice.summary}</p>}
          <ol className="space-y-2" aria-label="התוכנית">
            {advice.steps.map((step, index) => (
              <li key={`${index}:${step.title}`} className="flex gap-3 rounded-xl bg-surface p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-on-brand">
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-ink">{step.title}</p>
                  {step.detail && <p className="text-sm text-ink-muted">{step.detail}</p>}
                  {step.target && (
                    <p className="tabular text-xs text-ink-soft">
                      {CATEGORY_LABELS[step.target.category]}: {formatCurrency(spentOn.get(step.target.category) ?? 0)} ←{' '}
                      <span className="font-semibold text-ink">{formatCurrency(step.target.monthly)}</span> בחודש
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {freed >= 1 && (
            <p className="rounded-xl bg-surface p-3 text-sm text-ink">
              היעדים בתוכנית מפנים <span className="tabular font-semibold text-positive">{formatCurrency(freed)}</span> בחודש. אחריהם:{' '}
              <span className={`tabular font-semibold ${net + freed < 0 ? 'text-negative' : 'text-positive'}`}>
                {net + freed < 0 ? `חסרים ${formatCurrency(-(net + freed))}` : `נשארים ${formatCurrency(net + freed)}`}
              </span>{' '}
              בחודש.
            </p>
          )}
          {advice.cautions.map((caution) => (
            <p key={caution} className="text-sm text-caution">
              ⚠ {caution}
            </p>
          ))}
          <p className="text-xs text-ink-soft">נכתב עם AI לפי הסכומים בלבד. הסכומים והחישוב של המחשבון; זו אינה ייעוץ פיננסי.</p>
        </div>
      )}
    </section>
  );
}
