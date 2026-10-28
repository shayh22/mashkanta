import { useMemo } from 'react';
import type { Answers } from '../../engine/flow/flow';
import type { MonthlyPicture } from '../../engine/money/picture';
import { formatCurrency, formatPercent, formatSignedCurrency, formatTerm } from '../../lib/format';
import { TRACK_COLORS, TRACK_NAMES } from '../../lib/trackColors';
import { isSampleDebts, useConsolidation } from '../../store/consolidationStore';
import { useMonthlyPicture } from '../../store/moneyStore';
import { isSampleTracks, useRefinance, useRefinanceAnalysis } from '../../store/refinanceStore';
import { bestRoute } from '../../lib/routes';
import { useBuyResult, useRefinanceEstimate } from './hooks';
import { Dot, Panel, Rows } from './parts';

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

/** The mortgage as it stands: from the bank's report, every track; from figures typed in, those figures. */
export function RefinanceToday({ answers, onEdit }: { answers: Answers; onEdit: (step: string) => void }) {
  const tracks = useRefinance((state) => state.tracks);
  return isSampleTracks(tracks) ? <EstimateToday answers={answers} onEdit={onEdit} /> : <ExactToday answers={answers} />;
}

function ExactToday({ answers }: { answers: Answers }) {
  const tracks = useRefinance((state) => state.tracks);
  const { comparison, balance } = useRefinanceAnalysis();
  const route = comparison ? bestRoute(comparison) : undefined;
  const home = typeof answers.homeValue === 'number' ? answers.homeValue : 0;
  return (
    <Panel title="המשכנתא היום">
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
      <Rows
        rows={[
          ['יתרה', formatCurrency(balance), true],
          ...(route ? [['החזר בחודש', formatCurrency(route.currentPayment), true] as const] : []),
          ...(home > 0 ? [['אחוז מימון היום', formatPercent(balance / home, 0)] as const] : []),
        ]}
      />
    </Panel>
  );
}

function EstimateToday({ answers, onEdit }: { answers: Answers; onEdit: (step: string) => void }) {
  const { estimate } = useRefinanceEstimate(answers);
  const home = typeof answers.homeValue === 'number' ? answers.homeValue : 0;
  if (estimate?.kind !== 'ESTIMATE') {
    return (
      <Panel title="המשכנתא היום">
        <p className="text-[15px] text-flow-muted">חסרים פרטי המשכנתא.</p>
        <button type="button" onClick={() => onEdit('mortgageHow')} className="min-h-11 self-start font-bold underline underline-offset-4">
          להשלים
        </button>
      </Panel>
    );
  }
  const { current } = estimate;
  return (
    <Panel title="המשכנתא היום">
      <Rows
        rows={[
          ['יתרה', formatCurrency(current.balance), true],
          ['החזר בחודש', formatCurrency(current.payment), true],
          ['נשארו', formatTerm(current.months)],
          ['הריבית שזה אומר, בערך', formatPercent(current.rate)],
          ['עוד תשלמו עד הסוף', formatCurrency(current.payment * current.months)],
          ...(home > 0 ? [['אחוז מימון היום', formatPercent(current.balance / home, 0)] as const] : []),
        ]}
      />
      <p className="text-sm text-flow-muted">ממה שמילאתם. עם דוח היתרות רואים כל מסלול.</p>
    </Panel>
  );
}

/** The account, month by month on average: what is left or missing, where the money goes, what comes in. */
export function RecoveryToday({ onEdit }: { onEdit: (step: string) => void }) {
  const picture = useMonthlyPicture();
  if (!picture) {
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
  return picture.overdraft ? (
    <Panel title="יתרת החשבון">
      <Rows
        rows={[
          ['חודשים במינוס', `${picture.overdraft.monthsBelow} מתוך ${picture.overdraft.months}`],
          ['היתרה הנמוכה', formatCurrency(picture.overdraft.lowest)],
          ['ריבית על המינוס, בחודש', formatCurrency(picture.overdraft.interestMonthly)],
        ]}
      />
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
