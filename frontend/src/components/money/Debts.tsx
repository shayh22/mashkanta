import { factsFor, type ConsultFact } from '../../engine/money/consultRequest';
import { defaultExtendYears, loanDecision, mortgageDecision } from '../../engine/money/decisions';
import { loanMoves, validTerms, type LoanMoveKind } from '../../engine/money/loanMoves';
import type { MonthlyPicture } from '../../engine/money/picture';
import { VERDICT_LABELS } from '../../engine/refinance';
import { formatCurrency, formatPercent } from '../../lib/format';
import { useMoney, useMoneyCategories } from '../../store/moneyStore';
import {
  loanCandidates,
  NOT_ON_STATEMENTS,
  planOf,
  useJourneyLoans,
  type JourneyLoan,
  type LoanCandidate,
} from '../../store/journeyLoans';
import { useMortgageMove } from '../../store/mortgageMove';
import { Card, NumberInput } from '../ui';
import { periodOf } from './format';
import { StepConsult } from './StepConsult';

/** Banks' common ceiling on repayments as a share of income. */
const BANK_POLICY = 0.4;

const MOVE_LABELS: Record<LoanMoveKind, string> = {
  KEEP: 'להשאיר כמו שהיא',
  BALLOON: 'בלון: רק ריבית, הקרן בסוף',
  EXTEND: 'לפרוס על יותר שנים',
};

/**
 * Step: the mortgage, the loans and the overdraft — how much of the income goes to repayments,
 * and what each could do instead: refinance the mortgage, turn a loan into a balloon, or spread it
 * over more years. Every move shows what it costs as well as what it frees.
 */
export function DebtsStep({ picture }: { picture: MonthlyPicture }) {
  const explanations = useMoneyCategories((state) => state.explanations);
  const plans = useMoney((state) => state.loans);
  const refinance = useMoney((state) => state.refinance);
  const setRefinance = useMoney((state) => state.setRefinance);
  const { sample, route } = useMortgageMove();
  const mortgage = picture.spendingLines.find((line) => line.id === 'HOUSING_LOANS');
  const loans = useJourneyLoans(picture);
  const candidates = loanCandidates(picture);
  const loansTotal = loans.reduce((sum, loan) => sum + loan.monthly, 0);
  const interest = picture.overdraft?.interestMonthly ?? 0;
  const repayments = (mortgage?.monthly ?? 0) + loansTotal + interest;
  const share = picture.income > 0 ? repayments / picture.income : 0;
  const mortgageMove = route ? mortgageDecision(route) : undefined;

  const extraFacts: ConsultFact[] = [
    ...(route
      ? [
          { label: 'משכנתא — החזר היום (לפי המנוע)', value: Math.round(route.currentPayment) },
          { label: 'משכנתא — החזר אחרי מיחזור לתמהיל המנוע', value: Math.round(route.proposedPayment) },
          { label: 'משכנתא — עלות מעבר', value: Math.round(route.upfrontCost) },
        ]
      : []),
    ...loans.flatMap((loan, index) => {
      const plan = planOf(loan, plans);
      return [
        { label: `הלוואה ${index + 1} — החזר חודשי`, value: Math.round(loan.monthly) },
        ...(plan?.balance ? [{ label: `הלוואה ${index + 1} — יתרה`, value: Math.round(plan.balance) }] : []),
        ...(plan?.annualRate !== undefined ? [{ label: `הלוואה ${index + 1} — ריבית שנתית באחוזים`, value: Math.round(plan.annualRate * 1000) / 10 }] : []),
        ...(plan?.remainingMonths ? [{ label: `הלוואה ${index + 1} — חודשים שנותרו`, value: plan.remainingMonths }] : []),
      ];
    }),
    { label: 'סך ההחזרים בחודש', value: Math.round(repayments) },
    { label: 'הכנסה חודשית ממוצעת', value: Math.round(picture.income) },
  ];

  return (
    <>
      <section aria-label="הלוואות ומשכנתא" className="space-y-1 px-1">
        <p className="text-xs font-medium text-ink-soft">
          {picture.partial ? 'התקופה בקבצים' : `ממוצע ${picture.months.length} חודשים מלאים`}: {periodOf(picture.months)}
        </p>
        <h2 className="text-xl font-bold text-ink">
          {formatCurrency(repayments)} בחודש הולכים להחזרים — {Math.round(share * 100)}% מההכנסה
        </h2>
      </section>

      <Card title="ההכנסה, ומה מתוכה הולך להחזרים" subtitle={`הקו: ${Math.round(BANK_POLICY * 100)}% — התקרה המקובלת בבנקים`}>
        <IncomeShare
          income={picture.income}
          parts={[
            { key: 'mortgage', label: 'משכנתא', value: mortgage?.monthly ?? 0, className: 'bg-brand-700' },
            { key: 'loans', label: 'הלוואות', value: loansTotal, className: 'bg-amber-500' },
            { key: 'interest', label: 'ריבית מינוס', value: interest, className: 'bg-rose-400' },
          ]}
        />
      </Card>

      <Card
        title="המשכנתא"
        subtitle={mortgage ? `${formatCurrency(mortgage.monthly)} בחודש לפי הדפים` : 'לא זוהה החזר משכנתא בדפים'}
        fold={
          route
            ? `${formatCurrency(route.currentPayment)} ← ${formatCurrency(route.proposedPayment)} בתמהיל של המנוע`
            : mortgage
              ? `${formatCurrency(mortgage.monthly)} בחודש · להזנת המשכנתא לבדיקה`
              : 'לא זוהה החזר משכנתא'
        }
      >
        {sample || !route ? (
          <p className="text-sm text-ink-muted">
            כדי לבדוק מיחזור או שינוי מסלולים, הזינו את המשכנתא שלכם — דוח מהבנק או ידנית.{' '}
            <a className="font-medium text-brand-700 hover:underline" href="#/own">
              להזנת המשכנתא
            </a>
          </p>
        ) : (
          <div className="space-y-3">
            <MoveBars
              rows={[
                { key: 'now', label: 'היום', monthly: route.currentPayment },
                { key: 'engine', label: 'בתמהיל של המנוע', monthly: route.proposedPayment, note: `עלות מעבר ${formatCurrency(route.upfrontCost)}` },
              ]}
            />
            <p className="text-sm text-ink-muted">{VERDICT_LABELS[route.verdict]}</p>
            {mortgageMove && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={refinance} onChange={(event) => setRefinance(event.target.checked)} />
                לכלול את המיחזור בסיכום ({formatCurrency(mortgageMove.monthly)} פחות בחודש)
              </label>
            )}
            <a className="btn-ghost inline-flex text-sm" href="#/own/result">
              לפרטים ולמשחק במסלולים <span aria-hidden>←</span>
            </a>
          </div>
        )}
      </Card>

      <Card
        title="הלוואות"
        subtitle={loans.length > 0 ? 'לכל הלוואה: מה היתרה, הריבית וכמה נשאר — ואז מה אפשר לעשות איתה.' : undefined}
        fold={loans.length > 0 ? `${loans.length === 1 ? 'הלוואה אחת' : `${loans.length} הלוואות`} · ${formatCurrency(loansTotal)} בחודש` : 'לא זוהו הלוואות'}
      >
        {loans.length === 0 ? (
          <p className="text-sm text-ink-muted">
            לא זוהו הלוואות. אפשר להעלות דוח הלוואות למעלה ("המסמכים שלכם"), או לסמן הלוואה מהדפים — למשל הלוואה מהפנסיה שמופיעה בשם
            חברת הביטוח — כ"הלוואות" בשלב "לאן הולך הכסף".
          </p>
        ) : (
          <ul className="space-y-5" aria-label="ההלוואות">
            {loans.map((loan) => (
              <LoanCard key={loan.key} loan={loan} candidates={candidates} />
            ))}
          </ul>
        )}
      </Card>

      <StepConsult step="debts" facts={[...factsFor('debts', picture, explanations), ...extraFacts].slice(0, 40)} />
    </>
  );
}

/** One loan: its terms as the household knows them, and the three moves side by side. */
function LoanCard({ loan, candidates }: { loan: JourneyLoan; candidates: readonly LoanCandidate[] }) {
  const plans = useMoney((state) => state.loans);
  const setLoan = useMoney((state) => state.setLoan);
  const linkLoan = useMoney((state) => state.linkLoan);
  const plan = planOf(loan, plans);
  const name = loan.name;
  const key = loan.key;
  const terms = { balance: plan?.balance, annualRate: plan?.annualRate, remainingMonths: plan?.remainingMonths };
  const ready = validTerms(terms);
  const extendYears = plan.extendYears ?? defaultExtendYears(plan.remainingMonths ?? 12);
  const moves = ready ? loanMoves(terms, extendYears * 12, loan.monthly) : undefined;
  const chosen = plan.move;
  const decision = loanDecision(name, loan.monthly, plan);
  return (
    <li className="space-y-3 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink" dir="auto">
          {name}
        </h3>
        <span className="tabular text-sm text-ink-muted">
          {formatCurrency(loan.monthly)} בחודש {loan.onStatements ? 'לפי הדפים' : 'לפי הדוח'}
          {loan.fromReport && loan.onStatements ? ' · הפרטים מהדוח' : ''}
        </span>
      </div>
      {loan.debtId && (
        // Which charge on the statements this report loan is, so its repayment counts once.
        <label className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          <span>
            {loan.reportLabel && loan.reportLabel !== name ? `"${loan.reportLabel}" מהדוח · ` : ''}בדפי החשבון ההחזר הזה הוא:
          </span>
          <select
            className="input w-auto py-1 text-xs"
            aria-label={`איפה ההחזר של ${loan.reportLabel ?? name} בדפי החשבון`}
            value={loan.onStatements ? name : NOT_ON_STATEMENTS}
            onChange={(event) => linkLoan(loan.debtId!, event.target.value)}
          >
            <option value={NOT_ON_STATEMENTS}>לא מופיע — משולם מחשבון אחר</option>
            {[...candidates]
              .sort((a, b) => Math.abs(a.monthly - loan.monthly) - Math.abs(b.monthly - loan.monthly))
              .filter((candidate, index) => index < 8 || candidate.name === name)
              .map((candidate) => (
                <option key={candidate.name} value={candidate.name}>
                  {candidate.name} · {formatCurrency(candidate.monthly)}
                </option>
              ))}
          </select>
        </label>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="space-y-1 text-xs text-ink-soft">
          <span>יתרה לסילוק (₪)</span>
          <NumberInput label={`יתרה של ${name}`} value={plan.balance ?? 0} digits={0} min={0} step={1_000} onChange={(balance) => setLoan(key, { balance })} />
        </label>
        <label className="space-y-1 text-xs text-ink-soft">
          <span>ריבית שנתית (%)</span>
          <NumberInput
            label={`ריבית של ${name}`}
            value={plan.annualRate ?? 0}
            scale={100}
            digits={2}
            min={0}
            max={0.4}
            step={0.0025}
            onChange={(annualRate) => setLoan(key, { annualRate })}
          />
        </label>
        <label className="space-y-1 text-xs text-ink-soft">
          <span>חודשים שנותרו</span>
          <NumberInput label={`חודשים שנותרו ב${name}`} value={plan.remainingMonths ?? 0} digits={0} min={0} max={480} step={1} onChange={(remainingMonths) => setLoan(key, { remainingMonths: Math.round(remainingMonths) })} />
        </label>
      </div>

      {!moves ? (
        <p className="text-xs text-ink-soft">את היתרה, הריבית ומספר החודשים רואים בדוח השנתי של ההלוואה או באתר של המלווה.</p>
      ) : (
        <>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-medium text-ink-soft">מה לעשות בהלוואה</legend>
            <div className="flex flex-wrap gap-2">
              {(['KEEP', 'BALLOON', 'EXTEND'] as const).map((kind) => (
                <label
                  key={kind}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    chosen === kind ? 'border-brand-600 bg-brand-50 text-ink' : 'border-line text-ink-muted'
                  }`}
                >
                  <input type="radio" name={`move-${name}`} className="accent-brand-600" checked={chosen === kind} onChange={() => setLoan(key, { move: kind })} />
                  {MOVE_LABELS[kind]}
                </label>
              ))}
            </div>
            {chosen === 'EXTEND' && (
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                לפרוס על
                <NumberInput label={`שנים לפריסה של ${name}`} className="w-20" value={extendYears} digits={0} min={1} max={40} step={1} onChange={(years) => setLoan(key, { extendYears: Math.round(years) })} />
                שנים
              </label>
            )}
          </fieldset>
          <MoveBars
            rows={[
              { key: 'KEEP', label: 'להשאיר', monthly: moves.KEEP.monthly },
              {
                key: 'BALLOON',
                label: 'בלון',
                monthly: moves.BALLOON.monthly,
                note: `בסוף: ${formatCurrency(moves.BALLOON.atEnd)} בבת אחת · +${formatCurrency(moves.BALLOON.extraCost)} בסך הכל`,
              },
              {
                key: 'EXTEND',
                label: `פריסה ל-${Math.round(moves.EXTEND.months / 12)} שנים`,
                monthly: moves.EXTEND.monthly,
                note: `+${formatCurrency(moves.EXTEND.extraCost)} בסך הכל`,
              },
            ]}
            highlight={chosen}
          />
          <p className="text-xs text-ink-soft">
            ריבית {formatPercent(terms.annualRate!, 2)} · {terms.remainingMonths} חודשים.{' '}
            {decision ? `בסיכום: ${formatCurrency(decision.monthly)} פחות בחודש.` : 'בסיכום: ללא שינוי.'}
          </p>
        </>
      )}
    </li>
  );
}

/** Monthly payment of each option as bars on one scale; the chosen one stands out. */
function MoveBars({ rows, highlight }: { rows: readonly { key: string; label: string; monthly: number; note?: string }[]; highlight?: string }) {
  const max = Math.max(1, ...rows.map((row) => row.monthly));
  return (
    <ul className="space-y-2" aria-label="החזר חודשי לכל אפשרות">
      {rows.map((row) => {
        const on = highlight === row.key;
        return (
          <li key={row.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className={on ? 'font-semibold text-ink' : 'text-ink-muted'}>{row.label}</span>
              <span className={`tabular ${on ? 'font-semibold text-ink' : 'text-ink-muted'}`}>{formatCurrency(row.monthly)} בחודש</span>
            </div>
            <div className="h-2.5 rounded-full bg-surface-muted" aria-hidden>
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${on ? 'bg-brand-600' : 'bg-line-strong'}`}
                style={{ width: `${Math.max(2, (row.monthly / max) * 100)}%` }}
              />
            </div>
            {row.note && <p className="mt-0.5 text-xs text-ink-soft">{row.note}</p>}
          </li>
        );
      })}
    </ul>
  );
}

/** The income as one bar: each kind of repayment, the rest, and the banks' ceiling marked. */
function IncomeShare({ income, parts }: { income: number; parts: readonly { key: string; label: string; value: number; className: string }[] }) {
  const total = Math.max(income, parts.reduce((sum, part) => sum + part.value, 0), 1);
  const shown = parts.filter((part) => part.value >= 1);
  return (
    <figure className="space-y-3">
      <div
        className="relative h-6 rounded-lg bg-surface-sunken"
        role="img"
        aria-label={`מתוך הכנסה של ${formatCurrency(income)}: ${shown.map((part) => `${part.label} ${formatCurrency(part.value)}`).join(', ')}`}
      >
        <div className="flex h-6 overflow-hidden rounded-lg">
          {shown.map((part) => (
            <span key={part.key} className={`${part.className} transition-all duration-500`} style={{ width: `${(part.value / total) * 100}%` }} />
          ))}
        </div>
        <span className="absolute -top-1.5 h-9 w-0.5 rounded bg-ink" style={{ insetInlineStart: `${(income * BANK_POLICY * 100) / total}%` }} aria-hidden />
      </div>
      <figcaption>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {shown.map((part) => (
            <li key={part.key} className="flex items-center gap-1.5">
              <span aria-hidden className={`h-2.5 w-2.5 rounded-sm ${part.className}`} />
              <span className="text-ink">{part.label}</span>
              <span className="tabular text-ink-muted">{formatCurrency(part.value)}</span>
            </li>
          ))}
          <li className="flex items-center gap-1.5 text-ink-muted">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-surface-sunken" />
            נשאר מההכנסה
          </li>
        </ul>
      </figcaption>
    </figure>
  );
}
