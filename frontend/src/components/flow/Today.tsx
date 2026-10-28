import { lazy, Suspense, useMemo } from 'react';
import { yearlySummary } from '../../engine/amortization';
import type { Answers, Goal } from '../../engine/flow/flow';
import type { MonthlyPicture } from '../../engine/money/picture';
import { LIMITS } from '../../engine/regulatory';
import { formatCurrency, formatPercent, formatSignedCurrency, formatTerm } from '../../lib/format';
import { TRACK_COLORS, TRACK_NAMES } from '../../lib/trackColors';
import { isSampleDebts, useConsolidation } from '../../store/consolidationStore';
import { useMonthlyPicture } from '../../store/moneyStore';
import { useRefinance } from '../../store/refinanceStore';
import { useBuyResult } from './hooks';
import { loadCharts } from './chartsLoader';
import { useMortgageToday } from './outcomes';
import { Dot, Panel, Rows } from './parts';

const DebtPath = lazy(() => loadCharts().then((module) => ({ default: module.DebtPathChart })));
const MonthlyFlow = lazy(() => loadCharts().then((module) => ({ default: module.MonthlyFlowChart })));
const Balance = lazy(() => loadCharts().then((module) => ({ default: module.BalanceChart })));

/**
 * The situation today, before anything changes: what the purchase asks for, the mortgage as it
 * stands, the account month by month, the loans — each as it is, so the screens after it can show
 * what changes.
 */

/** Shares as whole percents that add up to a hundred: the largest remainders round up. */
function wholePercents(shares: readonly number[]): number[] {
  const floors = shares.map((share) => Math.floor(share * 100));
  let left = 100 - floors.reduce((sum, each) => sum + each, 0);
  const order = shares.map((share, index) => ({ index, rest: share * 100 - floors[index]! })).sort((a, b) => b.rest - a.rest);
  for (const { index } of order) {
    if (left <= 0) {
      break;
    }
    floors[index]! += 1;
    left -= 1;
  }
  return floors;
}

/** A whole split into its parts, as one bar with a legend. */
function SplitBar({ label, parts }: { label: string; parts: readonly { label: string; value: number; color: string }[] }) {
  const shown = parts.filter((part) => part.value > 0);
  const total = shown.reduce((sum, part) => sum + part.value, 0) || 1;
  const shares = wholePercents(shown.map((part) => part.value / total));
  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={`${label}: ${shown.map((part) => `${part.label} ${formatCurrency(part.value)}`).join(', ')}`} className="flex h-4 overflow-hidden rounded-full">
        {shown.map((part) => (
          <span key={part.label} style={{ width: `${(part.value / total) * 100}%`, background: part.color }} />
        ))}
      </div>
      {/* The bar's own label says the same, for a screen reader. */}
      <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {shown.map((part, index) => (
          <li key={part.label} className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: part.color }} />
            <span className="font-bold">{part.label}</span>
            <span className="tabular-nums text-flow-muted">{shares[index]}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const EQUITY = 'rgb(var(--flow-strong))';
const LOAN = 'rgb(var(--flow-muted) / 0.45)';
const SHORT = 'rgb(var(--flow-accent))';

/** The purchase as it stands: the price, what the household brings, and what it must borrow. */
export function BuyToday({ answers }: { answers: Answers }) {
  const { plan } = useBuyResult(answers);
  const price = typeof answers.propertyValue === 'number' ? answers.propertyValue : 0;
  const equity = typeof answers.equity === 'number' ? answers.equity : 0;
  if (!plan || price <= 0) {
    return null;
  }
  const needed = plan.kind === 'LOAN' ? plan.needed : 0;
  const short = plan.kind === 'LOAN' ? plan.equityShort : 0;
  return (
    <Panel title="הדירה">
      <SplitBar
        label="המחיר"
        parts={[
          { label: 'הון עצמי', value: Math.min(equity, price), color: EQUITY },
          { label: 'משכנתא', value: needed - short, color: LOAN },
          { label: 'חסר', value: short, color: SHORT },
        ]}
      />
      <Rows
        rows={[
          ['מחיר הדירה', formatCurrency(price)],
          ['הון עצמי', formatCurrency(equity)],
          ['צריך ללוות', formatCurrency(needed), true],
          ...(needed > 0 ? [['אחוז מימון', formatPercent(needed / price, 0)] as const] : []),
          ...(typeof answers.netIncome === 'number' ? [['הכנסה נטו בחודש', formatCurrency(answers.netIncome)] as const] : []),
        ]}
      />
    </Panel>
  );
}

/** The mortgage as it stands, to its end: every track from the bank's report, or the figures typed in. */
export function MortgageToday({ answers, refinancing, onEdit }: { answers: Answers; refinancing: boolean; onEdit: (step: string) => void }) {
  const hasMortgage = refinancing || answers.hasMortgage === 'YES';
  const today = useMortgageToday(answers, hasMortgage);
  const tracks = useRefinance((state) => state.tracks);
  const yearly = useMemo(() => (today ? yearlySummary(today.mix) : []), [today]);
  if (!hasMortgage) {
    return null;
  }
  if (!today) {
    return (
      <Panel title="המשכנתא היום">
        <p className="text-[15px] text-flow-muted">חסרים פרטי המשכנתא, או שההחזר והיתרה לא מסתדרים.</p>
        <button type="button" onClick={() => onEdit('mortgageHow')} className="min-h-11 self-start font-bold underline underline-offset-4">
          להשלים
        </button>
      </Panel>
    );
  }
  const home = typeof answers.homeValue === 'number' ? answers.homeValue : 0;
  const cost = today.mix.totalInterest + today.mix.totalIndexation;
  return (
    <Panel title="המשכנתא היום">
      {today.exact && (
        <>
          <SplitBar label="המסלולים" parts={tracks.map((track) => ({ label: TRACK_NAMES[track.type], value: track.balance, color: TRACK_COLORS[track.type] }))} />
          <ul className="flex flex-col">
            {tracks.map((track) => (
              <li key={track.id} className="flex flex-col gap-0.5 border-b border-flow-line py-2.5 last:border-b-0">
                <span className="flex items-center gap-2 text-[15px] font-extrabold">
                  <Dot type={track.type} />
                  {TRACK_NAMES[track.type]}
                  <span className="ms-auto tabular-nums">{formatCurrency(track.balance)}</span>
                </span>
                <span className="text-sm text-flow-muted">
                  {formatPercent(track.annualRate)} · נשארו {formatTerm(track.remainingMonths)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Rows
        rows={[
          ['יתרה', formatCurrency(today.balance), true],
          ['החזר בחודש', formatCurrency(today.payment), true],
          ...(today.months !== undefined ? [['נשארו', formatTerm(today.months)] as const] : []),
          ...(today.rate !== undefined ? [['הריבית שזה אומר, בערך', formatPercent(today.rate)] as const] : []),
          ...(home > 0 ? [['אחוז מימון היום', formatPercent(today.balance / home, 0)] as const] : []),
        ]}
      />
      <div className="flex flex-col gap-2">
        <h4 className="text-[15px] font-extrabold">מהיום ועד הסוף</h4>
        <Suspense fallback={<div className="h-52" />}>
          <DebtPath start={today.balance} yearly={yearly} />
        </Suspense>
        <ul aria-hidden className="flex flex-wrap gap-x-4 text-sm">
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-flow-strong" />
            יתרה
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-flow-accent" />
            ריבית והצמדה ששילמתם עד אז
          </li>
        </ul>
      </div>
      <Rows
        rows={[
          ['עוד תשלמו עד הסוף', formatCurrency(today.mix.totalPaid)],
          ['מזה ריבית והצמדה', formatCurrency(cost), true],
        ]}
      />
      <p className="text-sm text-flow-muted">
        {today.exact ? 'לפי דוח היתרות, במדד ובריבית של היום.' : 'ממה שמילאתם, כמסלול אחד. עם דוח היתרות רואים כל מסלול.'}
      </p>
    </Panel>
  );
}

/** The account, month by month on average: what is left or missing, each month, the balance, where the money goes. */
export function AccountToday({ recovering, onEdit }: { recovering: boolean; onEdit: (step: string) => void }) {
  const picture = useMonthlyPicture();
  if (!picture) {
    if (!recovering) {
      return null;
    }
    // Statements are kept in memory only: a later visit has none until they are uploaded again.
    return (
      <section aria-label="החשבון" className="flex flex-col gap-3 rounded-[20px] bg-flow-card p-5">
        <h3 className="text-[24px] font-black leading-tight">לתמונת החשבון צריך את דפי החשבון</h3>
        <p className="text-[15px] text-flow-muted">הם נקראים במכשיר ולא נשמרים, ולכן מעלים אותם בכל ביקור.</p>
        <button type="button" onClick={() => onEdit('statementsUpload')} className="min-h-12 self-start rounded-full bg-flow-strong px-5 text-base font-extrabold text-flow-on-strong">
          להעלות את דפי החשבון
        </button>
      </section>
    );
  }
  const left = picture.income - picture.spending;
  return (
    <section aria-label="החשבון" className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-bold text-flow-muted">{left >= 0 ? 'נשארים כל חודש, בממוצע' : 'חסרים כל חודש, בממוצע'}</span>
        <h3 className={`text-[48px] font-black leading-none tracking-tight ${left < 0 ? 'text-negative' : ''}`}>{formatCurrency(Math.abs(left))}</h3>
        <span className="text-[15px] text-flow-muted">
          נכנסים {formatCurrency(picture.income)} · יוצאים {formatCurrency(picture.spending)}
        </span>
      </div>
      {picture.byMonth.length > 1 && (
        <Panel title="כל חודש: נכנס, יצא ונשאר">
          <Suspense fallback={<div className="h-64" />}>
            <MonthlyFlow months={picture.byMonth} animate={false} />
          </Suspense>
          <ul aria-hidden className="flex flex-wrap gap-x-4 text-sm">
            {[
              ['נכנס', 'var(--chart-1)'],
              ['יצא', 'var(--chart-2)'],
              ['נשאר', 'rgb(var(--ink))'],
            ].map(([label, color]) => (
              <li key={label} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                {label}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <SpendingPanel picture={picture} />
      <IncomePanel picture={picture} />
      <OverdraftPanel picture={picture} />
    </section>
  );
}

export function SpendingPanel({ picture }: { picture: MonthlyPicture }) {
  const spending = useMemo(() => [...picture.spendingLines].sort((a, b) => b.monthly - a.monthly), [picture]);
  const top = Math.max(1, ...spending.map((line) => line.monthly));
  return (
    <Panel title="לאן הולך הכסף, בחודש">
      <ul className="flex flex-col gap-2.5">
        {spending.map((line) => (
          <li key={line.id} className="flex flex-col gap-1">
            <span className="flex items-center justify-between gap-2 text-[15px]">
              <span className="font-bold">{line.label}</span>
              <span className="font-extrabold tabular-nums">{formatCurrency(line.monthly)}</span>
            </span>
            <span aria-hidden className="h-2 rounded-full bg-flow-pick">
              <span className="block h-full rounded-full bg-flow-strong" style={{ width: `${(line.monthly / top) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <Rows rows={[['סך הכל הוצאות', formatCurrency(picture.spending), true]]} />
    </Panel>
  );
}

export function IncomePanel({ picture }: { picture: MonthlyPicture }) {
  return (
    <Panel title="מה נכנס, בחודש">
      <Rows rows={[...picture.incomeLines.map((line) => [line.label, formatCurrency(line.monthly)] as const), ['סך הכל הכנסות', formatCurrency(picture.income), true] as const]} />
    </Panel>
  );
}

export function OverdraftPanel({ picture }: { picture: MonthlyPicture }) {
  return picture.overdraft || picture.balances.length > 1 ? (
    <Panel title="יתרת החשבון">
      {picture.balances.length > 1 && (
        <Suspense fallback={<div className="h-52" />}>
          <Balance balances={picture.balances} animate={false} />
        </Suspense>
      )}
      {picture.overdraft && (
      <Rows
        rows={[
          ['חודשים במינוס', `${picture.overdraft.monthsBelow} מתוך ${picture.overdraft.months}`],
          ['היתרה הנמוכה', formatCurrency(picture.overdraft.lowest)],
          ['ריבית על המינוס, בחודש', formatCurrency(picture.overdraft.interestMonthly)],
        ]}
      />
      )}
    </Panel>
  ) : null;
}

/** The loans read or typed in, each with what it costs a month, and all of them together. */
export function LoansToday() {
  const debts = useConsolidation((state) => state.debts);
  if (debts.length === 0 || isSampleDebts(debts)) {
    return null;
  }
  const monthly = debts.reduce((sum, debt) => sum + Math.max(0, debt.monthlyPayment), 0);
  const balance = debts.reduce((sum, debt) => sum + Math.max(0, debt.balance), 0);
  return (
    <Panel title="ההלוואות">
      <ul className="flex flex-col">
        {debts.map((debt) => (
          <li key={debt.id} className="flex flex-col gap-0.5 border-b border-flow-line py-2.5 last:border-b-0">
            <span className="flex items-center justify-between gap-2 text-[15px] font-extrabold">
              {debt.label}
              <span className="tabular-nums">{formatCurrency(debt.monthlyPayment)} בחודש</span>
            </span>
            <span className="text-sm text-flow-muted">
              יתרה {formatCurrency(debt.balance)}
              {debt.annualRate > 0 ? ` · ${formatPercent(debt.annualRate)}` : ''}
              {debt.remainingMonths > 0 ? ` · נשארו ${formatTerm(debt.remainingMonths)}` : ''}
            </span>
          </li>
        ))}
      </ul>
      <Rows
        rows={[
          ['כל ההלוואות, בחודש', formatSignedCurrency(-monthly), true],
          ['יתרה כוללת', formatCurrency(balance)],
        ]}
      />
    </Panel>
  );
}

/**
 * How much of the income goes to repayments today — the mortgage, the loans, other commitments —
 * against the lines the banks draw.
 */
export function CommitmentsMeter({ answers, goals }: { answers: Answers; goals: readonly Goal[] }) {
  const picture = useMonthlyPicture();
  const today = useMortgageToday(answers, goals.includes('REFINANCE') || answers.hasMortgage === 'YES');
  const debts = useConsolidation((state) => state.debts);
  const income = typeof answers.netIncome === 'number' ? answers.netIncome : (picture?.income ?? 0);
  const loans = answers.hasLoans === 'YES' && !isSampleDebts(debts) ? debts.reduce((sum, debt) => sum + Math.max(0, debt.monthlyPayment), 0) : 0;
  const other = goals.includes('BUY') && answers.hasObligations === 'YES' && typeof answers.obligations === 'number' ? answers.obligations : 0;
  const parts = [
    { label: 'משכנתא', value: today?.payment ?? 0, color: 'rgb(var(--flow-strong))' },
    { label: 'הלוואות', value: loans, color: 'rgb(var(--flow-accent))' },
    { label: 'התחייבויות אחרות', value: other, color: 'rgb(var(--flow-muted) / 0.6)' },
  ].filter((part) => part.value > 0);
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (income <= 0 || total <= 0) {
    return null;
  }
  const share = total / income;
  // The scale runs to sixty percent, so the banks' lines sit well inside it.
  const scale = 0.6;
  const at = (value: number) => `${Math.min(100, (value / scale) * 100)}%`;
  const verdict =
    share > LIMITS.PTI_CEILING
      ? `מעל ${Math.round(LIMITS.PTI_CEILING * 100)}%: מעל מה שבנק יאשר למשכנתא`
      : share > LIMITS.PTI_WARNING
        ? `מעל ${Math.round(LIMITS.PTI_WARNING * 100)}%: הבנק יראה בזה סיכון ויתמחר אותו`
        : 'בטווח שהבנקים רואים כסביר';
  return (
    <Panel title="כמה מההכנסה הולך להחזרים">
      <div className="flex items-baseline gap-2">
        <span className={`text-[40px] font-black leading-none tabular-nums ${share > LIMITS.PTI_CEILING ? 'text-negative' : ''}`}>{formatPercent(share, 0)}</span>
        <span className="text-[15px] text-flow-muted">
          {formatCurrency(total)} מתוך {formatCurrency(income)}
        </span>
      </div>
      <div role="img" aria-label={`${formatPercent(share, 0)} מההכנסה: ${parts.map((part) => `${part.label} ${formatCurrency(part.value)}`).join(', ')}`} className="relative flex h-4 rounded-full bg-flow-pick">
        {parts.map((part) => (
          <span key={part.label} className="h-full first:rounded-s-full" style={{ width: at(part.value / income), background: part.color }} />
        ))}
        {[LIMITS.PTI_WARNING, LIMITS.PTI_CEILING].map((line) => (
          <span key={line} aria-hidden className="absolute -bottom-1 -top-1 w-0.5 bg-flow-ink" style={{ insetInlineStart: at(line) }} />
        ))}
      </div>
      <div aria-hidden className="relative h-4 text-xs font-bold text-flow-muted">
        {[LIMITS.PTI_WARNING, LIMITS.PTI_CEILING].map((line) => (
          <span key={line} className="absolute -translate-x-1/2 tabular-nums rtl:translate-x-1/2" style={{ insetInlineStart: at(line) }}>
            {Math.round(line * 100)}%
          </span>
        ))}
      </div>
      <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: part.color }} />
            <span className="font-bold">{part.label}</span>
            <span className="tabular-nums text-flow-muted">{formatCurrency(part.value)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[15px] font-bold">{verdict}</p>
    </Panel>
  );
}
