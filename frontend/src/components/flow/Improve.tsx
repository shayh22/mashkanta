import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { FLEX_CHOICES } from '../../engine/flow/recovery';
import { adviceRequestOf, MAX_GOAL_LENGTH, type AdviceRequest } from '../../engine/money/adviceRequest';
import { CATEGORY_LABELS, type CategoryId } from '../../engine/money/categories';
import { defaultExtendYears } from '../../engine/money/decisions';
import { loanMoves, validTerms, type LoanMoveKind } from '../../engine/money/loanMoves';
import type { MonthlyPicture } from '../../engine/money/picture';
import { adviseHousehold, useAiEnabled } from '../../lib/aiClient';
import { formatCurrency, formatPercent } from '../../lib/format';
import { planOf, type JourneyLoan } from '../../store/journeyLoans';
import { useMoney, useMoneyCategories } from '../../store/moneyStore';
import { useQuestionnaire } from '../../store/questionnaireStore';
import { NoamAvatar } from './Noam';
import { adviceKey, useImprovement } from './outcomes';
import { Panel } from './parts';

/**
 * Where it can improve, piece by piece: every charge on the statements, by category, marked as a
 * must, to cut down or to cancel; and every loan, with what each move would make of its payment.
 * Each mark changes the decisions above at once.
 */

/** The categories whose charges are repayments: their moves are the loans' and the mortgage's. */
const REPAYMENTS: ReadonlySet<CategoryId> = new Set(['HOUSING_LOANS', 'LOANS']);
/** A category's charges shown at once: the largest. */
const SHOWN = 12;

export function ExpensesByCategory({ picture }: { picture: MonthlyPicture }) {
  const explanations = useMoneyCategories((state) => state.explanations);
  const explain = useMoneyCategories((state) => state.explain);
  const [open, setOpen] = useState<CategoryId>();
  const lines = [...picture.spendingLines].filter((line) => !REPAYMENTS.has(line.id) && line.monthly >= 1).sort((a, b) => b.monthly - a.monthly);
  if (lines.length === 0) {
    return null;
  }
  return (
    <Panel title="ההוצאות, חיוב אחר חיוב">
      <p className="text-sm text-flow-muted">פתחו קטגוריה וסמנו כל חיוב: חובה, לצמצם או לבטל. מה שמסומן לביטול נכנס להחלטות.</p>
      <ul className="flex flex-col">
        {lines.map((line) => {
          const expanded = open === line.id;
          const payees = [...line.payees].filter((payee) => payee.monthly >= 1).sort((a, b) => b.monthly - a.monthly);
          const marked = payees.filter((payee) => explanations[payee.description]?.flexibility).length;
          return (
            <li key={line.id} className="border-b border-flow-line last:border-b-0">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? undefined : line.id)}
                className="flex min-h-14 w-full items-center gap-2 py-2 text-start text-[15px]"
              >
                <span className="flex flex-1 flex-col">
                  <span className="font-extrabold">{line.label}</span>
                  <span className="text-sm text-flow-muted">
                    {payees.length} חיובים{marked > 0 ? ` · ${marked} סומנו` : ''}
                  </span>
                </span>
                <span className="font-extrabold tabular-nums">{formatCurrency(line.monthly)}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden className={`shrink-0 transition ${expanded ? 'rotate-180' : ''}`}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {expanded && (
                <ul className="flex flex-col gap-3 pb-3">
                  {payees.slice(0, SHOWN).map((payee) => {
                    const current = explanations[payee.description]?.flexibility;
                    return (
                      <li key={payee.description} className="flex flex-col gap-1.5 rounded-2xl bg-flow-ground p-3">
                        <span className="flex items-baseline justify-between gap-2 text-[15px]">
                          <span className="font-bold" dir="auto">
                            {payee.description}
                          </span>
                          <span className="shrink-0 tabular-nums">{formatCurrency(payee.monthly)} בחודש</span>
                        </span>
                        <div role="radiogroup" aria-label={payee.description} className="flex gap-1.5">
                          {FLEX_CHOICES.map((choice) => (
                            <button
                              key={choice.id}
                              type="button"
                              role="radio"
                              aria-checked={current === choice.id}
                              onClick={() => explain(payee.description, { flexibility: current === choice.id ? undefined : choice.id })}
                              className={`min-h-10 flex-1 rounded-full text-sm ${current === choice.id ? 'border-2 border-flow-strong bg-flow-pick font-extrabold' : 'border border-flow-line font-semibold'}`}
                            >
                              {choice.label}
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                  {payees.length > SHOWN && <li className="text-sm text-flow-muted">ועוד {payees.length - SHOWN} חיובים קטנים</li>}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

const MOVE_LABELS: Record<LoanMoveKind, string> = { KEEP: 'להשאיר', BALLOON: 'בלון', EXTEND: 'לפרוס' };

/** Each loan, and what keeping it, turning it into a balloon or spreading it would make of the payment. */
export function LoanMovesPanel() {
  const { loans } = useImprovement();
  if (loans.length === 0) {
    return null;
  }
  return (
    <Panel title="ההלוואות: מה אפשר לעשות">
      <ul className="flex flex-col gap-3">
        {loans.map((loan) => (
          <LoanMoves key={loan.key} loan={loan} />
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-flow-muted">בלון: משלמים רק ריבית, והקרן כולה בסוף. פריסה: אותה הלוואה על יותר שנים. שתיהן מורידות את ההחזר ומייקרות את ההלוואה.</p>
    </Panel>
  );
}

function LoanMoves({ loan }: { loan: JourneyLoan }) {
  const plans = useMoney((state) => state.loans);
  const setLoan = useMoney((state) => state.setLoan);
  const plan = planOf(loan, plans);
  const terms = { balance: plan.balance, annualRate: plan.annualRate, remainingMonths: plan.remainingMonths };
  const known = validTerms(terms);
  const moves = known ? loanMoves(terms, (plan.extendYears ?? defaultExtendYears(terms.remainingMonths)) * 12, loan.monthly) : undefined;
  const number = (value: string) => (value.trim() === '' ? undefined : Number(value.replace(/[^\d.]/g, '')));
  return (
    <li className="flex flex-col gap-2 rounded-2xl bg-flow-ground p-3">
      <span className="flex items-baseline justify-between gap-2 text-[15px]">
        <span className="font-extrabold" dir="auto">
          {loan.name}
        </span>
        <span className="shrink-0 tabular-nums">{formatCurrency(loan.monthly)} בחודש</span>
      </span>
      {!moves ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-flow-muted">כדי לחשב מה אפשר לעשות איתה:</span>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['balance', 'יתרה ₪', plan.balance],
                ['annualRate', 'ריבית %', plan.annualRate !== undefined ? Math.round(plan.annualRate * 1000) / 10 : undefined],
                ['remainingMonths', 'חודשים', plan.remainingMonths],
              ] as const
            ).map(([field, label, value]) => (
              <label key={field} className="flex flex-col gap-1 text-xs font-bold">
                {label}
                <input
                  inputMode="decimal"
                  defaultValue={value ?? ''}
                  aria-label={`${loan.name}: ${label}`}
                  onBlur={(event) => {
                    const typed = number(event.target.value);
                    setLoan(loan.key, { [field]: field === 'annualRate' && typed !== undefined ? typed / 100 : typed });
                  }}
                  className="min-h-11 rounded-xl border border-flow-line bg-flow-card px-2 text-base tabular-nums"
                />
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div role="radiogroup" aria-label={`מה לעשות עם ${loan.name}`} className="grid grid-cols-3 gap-1.5">
          {(['KEEP', 'BALLOON', 'EXTEND'] as const).map((move) => {
            const result = moves[move];
            const picked = plan.move === move;
            return (
              <button
                key={move}
                type="button"
                role="radio"
                aria-checked={picked}
                onClick={() => setLoan(loan.key, { move })}
                className={`flex min-h-16 flex-col items-center justify-center rounded-2xl px-1 text-sm ${picked ? 'border-2 border-flow-strong bg-flow-pick' : 'border border-flow-line'}`}
              >
                <span className="font-extrabold">{MOVE_LABELS[move]}</span>
                <span className="tabular-nums">{formatCurrency(result.monthly)}</span>
                {move !== 'KEEP' && result.extraCost >= 1 && <span className="text-xs text-flow-muted tabular-nums">+{formatCurrency(result.extraCost)} סה״כ</span>}
              </button>
            );
          })}
        </div>
      )}
      {moves && plan.annualRate !== undefined && (
        <span className="text-xs text-flow-muted">
          יתרה {formatCurrency(terms.balance!)} · {formatPercent(plan.annualRate)} · נשארו {terms.remainingMonths} חודשים
        </span>
      )}
    </li>
  );
}

const GOAL_EXAMPLES = ['לצאת מהמינוס בתוך חצי שנה', 'לחסוך 1,000 ₪ בחודש'];

/**
 * נועם's plan for the month: the household's goal in its own words, and a few steps toward it from
 * the totals by category alone — no business, date or account. Its targets join the decisions,
 * each a tick away from being left out; what they free is the app's own sum.
 */
export function NoamAdvisor({ picture }: { picture: MonthlyPicture }) {
  const enabled = useAiEnabled();
  const explanations = useMoneyCategories((state) => state.explanations);
  const saved = useQuestionnaire((state) => state.advice);
  const setAdvice = useQuestionnaire((state) => state.setAdvice);
  const [goal, setGoal] = useState(saved?.goal ?? '');
  const totals = useMemo(() => adviceRequestOf(picture, '', explanations), [picture, explanations]);
  const key = adviceKey(totals);
  const advisor = useMutation({
    mutationFn: (request: AdviceRequest) => adviseHousehold(request),
    onSuccess: (advice, request) => setAdvice({ for: adviceKey(request), goal: request.goal, advice }),
  });
  if (!enabled) {
    return null;
  }
  const advice = saved?.for === key ? saved.advice : undefined;
  const spent = new Map(totals.categories.map((category) => [category.id as string, category.monthly]));
  return (
    <section aria-label="נועם: תוכנית לחודש" className="flex flex-col gap-3 rounded-[20px] bg-flow-card p-4">
      <div className="flex items-center gap-3">
        <NoamAvatar size={44} />
        <h3 className="text-base font-extrabold">נועם: תוכנית לחודש</h3>
      </div>
      <label className="flex flex-col gap-1.5 text-[15px] font-bold">
        מה חשוב לכם עכשיו?
        <textarea
          value={goal}
          maxLength={MAX_GOAL_LENGTH}
          placeholder={GOAL_EXAMPLES[0]}
          onChange={(event) => setGoal(event.target.value)}
          className="min-h-20 rounded-2xl border border-flow-line bg-flow-ground p-3 text-base font-normal"
        />
      </label>
      {!goal && (
        <div className="flex flex-wrap gap-2">
          {GOAL_EXAMPLES.map((example) => (
            <button key={example} type="button" onClick={() => setGoal(example)} className="min-h-10 rounded-full border border-flow-line px-3 text-sm font-semibold">
              {example}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        disabled={advisor.isPending || goal.trim().length < 3}
        onClick={() => advisor.mutate({ ...totals, goal: goal.trim() })}
        className="min-h-12 rounded-full bg-flow-strong px-5 text-base font-extrabold text-flow-on-strong disabled:opacity-40"
      >
        {advisor.isPending ? 'נועם בונה תוכנית…' : 'נועם, תבנה לי יעדים'}
      </button>
      <p className="text-xs text-flow-muted">נשלחים רק סכומים לפי קטגוריה. בלי שמות של עסקים, תאריכים או חשבון.</p>
      {advisor.isError && (
        <p role="alert" className="text-[15px] text-negative">
          {advisor.error instanceof Error ? advisor.error.message : 'התוכנית לא התקבלה.'}
        </p>
      )}
      {advice && (
        <div aria-live="polite" className="flex flex-col gap-2.5">
          {advice.summary && <p className="text-[15px] font-bold">{advice.summary}</p>}
          <ol aria-label="התוכנית של נועם" className="flex flex-col gap-2">
            {advice.steps.map((step, index) => (
              <li key={`${index}:${step.title}`} className="flex gap-3 rounded-2xl bg-flow-ground p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-flow-strong text-sm font-extrabold text-flow-on-strong">{index + 1}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-bold">{step.title}</span>
                  {step.detail && <span className="text-sm text-flow-muted">{step.detail}</span>}
                  {step.target && (
                    <span className="text-sm tabular-nums">
                      {CATEGORY_LABELS[step.target.category]}: {formatCurrency(spent.get(step.target.category) ?? 0)} ← <b>{formatCurrency(step.target.monthly)}</b> בחודש
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          {advice.cautions.map((caution) => (
            <p key={caution} className="text-sm font-bold text-negative">
              {caution}
            </p>
          ))}
          <p className="text-xs text-flow-muted">היעדים נוספו להחלטות למעלה. נכתב עם AI לפי הסכומים בלבד, ואינו ייעוץ פיננסי.</p>
        </div>
      )}
    </section>
  );
}
