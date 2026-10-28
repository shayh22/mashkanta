import { useState } from 'react';
import { consumerLoanAverage } from '../../engine/consolidation';
import type { Answers, Goal } from '../../engine/flow/flow';
import { priceLoan, rankLoans, type PricedLoan } from '../../engine/flow/loanOffers';
import { formatCurrency, formatPercent, formatTerm } from '../../lib/format';
import { useQuestionnaire } from '../../store/questionnaireStore';
import { useLoanAmount, useRankedOffers } from './offerHooks';
import { useMortgageToday } from './outcomes';
import { Panel } from './parts';

/**
 * Loan offers for one amount, side by side: each lender's payment and what it costs in all, with
 * two yardsticks — the market's average rate, and the same amount inside the mortgage, whose lower
 * payment runs for many more years and rests on the home.
 */

type Row = PricedLoan & { readonly id: string; readonly rate: number; readonly reference?: 'MARKET' | 'MORTGAGE' };

/** The yardsticks' term, when no offer sets one: five years. */
const DEFAULT_MONTHS = 60;

export function LoanOffersPanel({ answers, goals }: { answers: Answers; goals: readonly Goal[] }) {
  const offers = useQuestionnaire((state) => state.loanOffers);
  const amount = useLoanAmount();
  const setAmount = useQuestionnaire((state) => state.setLoanAmount);
  const removeLoanOffer = useQuestionnaire((state) => state.removeLoanOffer);
  const hasMortgage = goals.includes('REFINANCE') || answers.hasMortgage === 'YES';
  const mortgage = useMortgageToday(answers, hasMortgage);
  const { marketMix } = useRankedOffers('REFINANCE', goals.includes('REFINANCE') ? answers : {});

  const priced: Row[] = offers.flatMap((offer) => {
    const loan = priceLoan(amount, offer);
    return loan ? [{ ...loan, id: offer.id, rate: offer.annualRate }] : [];
  });
  const months = rankLoans(priced)[0]?.months ?? DEFAULT_MONTHS;
  const average = consumerLoanAverage().rate;
  const market = priceLoan(amount, { lender: 'ממוצע השוק (בנק ישראל)', annualRate: average, months, fee: 0 });
  const mortgageRate = marketMix?.rate ?? mortgage?.rate;
  const inMortgage =
    hasMortgage && mortgageRate !== undefined ? priceLoan(amount, { lender: 'בתוך המשכנתא, בערך', annualRate: mortgageRate, months: mortgage?.months ?? 240, fee: 0 }) : undefined;
  const rows: Row[] = rankLoans([
    ...priced,
    ...(market ? [{ ...market, id: 'market', rate: average, reference: 'MARKET' as const }] : []),
    ...(inMortgage ? [{ ...inMortgage, id: 'mortgage', rate: mortgageRate!, reference: 'MORTGAGE' as const }] : []),
  ]);
  const best = rows.find((row) => !row.reference);
  const top = Math.max(1, ...rows.map((row) => row.total));

  return (
    <Panel title="הצעות להלוואה">
      <label className="no-print flex flex-col gap-1 text-[15px] font-bold">
        כמה צריך ללוות?
        <input
          inputMode="numeric"
          value={amount > 0 ? amount.toLocaleString('he-IL') : ''}
          placeholder="50,000"
          onChange={(event) => {
            const typed = Number(event.target.value.replace(/[^\d]/g, ''));
            setAmount(typed > 0 ? typed : undefined);
          }}
          className="min-h-12 rounded-2xl border border-flow-line bg-flow-ground px-3 text-lg font-bold tabular-nums"
        />
      </label>
      {amount > 0 && <p className="hidden text-[15px] font-bold print:block">לסכום של {formatCurrency(amount)}</p>}
      {amount > 0 && priced.length === 0 && <p className="text-[15px] text-flow-muted">הוסיפו את ההצעות שקיבלתם, ותראו מה כל אחת עולה בסך הכל, מול ממוצע השוק{inMortgage ? ' ומול המשכנתא' : ''}.</p>}
      {amount > 0 && rows.length > 0 && (
        <ul aria-label="הלוואות, מהזולה ליקרה" className="flex flex-col">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1.5 border-b border-flow-line py-3 last:border-b-0">
              <span className="flex items-center justify-between gap-2 text-[15px]">
                <span className="font-extrabold">
                  {row.label}
                  {row === best && <span className="ms-2 rounded-full bg-flow-pick px-2 py-0.5 text-xs font-bold text-flow-strong">ההצעה הזולה</span>}
                  {row.reference && <span className="ms-2 rounded-full border border-flow-line px-2 py-0.5 text-xs font-bold">להשוואה</span>}
                </span>
                {!row.reference && (
                  <button type="button" onClick={() => removeLoanOffer(row.id)} aria-label={`הסרת ההצעה של ${row.label}`} className="min-h-9 px-2 text-sm font-bold text-flow-muted underline">
                    הסרה
                  </button>
                )}
              </span>
              <span aria-hidden className="h-2 rounded-full bg-flow-pick">
                <span className={`block h-full rounded-full ${row.reference ? 'bg-flow-muted/60' : 'bg-flow-strong'}`} style={{ width: `${(row.total / top) * 100}%` }} />
              </span>
              <span className="text-sm tabular-nums">
                {formatCurrency(row.monthly)} בחודש · {formatTerm(row.months)} · {formatPercent(row.rate)}
              </span>
              <span className="text-sm text-flow-muted tabular-nums">
                סך הכל {formatCurrency(row.total)} · מזה ריבית ועמלה {formatCurrency(row.cost)}
              </span>
              {row.reference === 'MORTGAGE' && <span className="text-xs text-flow-muted">החזר נמוך יותר, אבל לאורך שנים רבות יותר ובשעבוד הדירה.</span>}
            </li>
          ))}
        </ul>
      )}
      <LoanOfferForm />
    </Panel>
  );
}

function LoanOfferForm() {
  const addLoanOffer = useQuestionnaire((state) => state.addLoanOffer);
  const [open, setOpen] = useState(false);
  const [lender, setLender] = useState('');
  const [rate, setRate] = useState('');
  const [months, setMonths] = useState('60');
  const [fee, setFee] = useState('');
  const number = (value: string) => Number(value.replace(/[^\d.]/g, ''));
  const ready = lender.trim().length > 0 && number(rate) > 0 && number(months) > 0;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-expanded={false} className="min-h-12 rounded-full border-2 border-flow-ink px-3 text-[15px] font-extrabold">
        הוספת הצעה להלוואה
      </button>
    );
  }
  return (
    <div className="no-print flex flex-col gap-2 rounded-2xl bg-flow-ground p-3">
      <label className="flex flex-col gap-1 text-xs font-bold">
        מי מציע
        <input value={lender} onChange={(event) => setLender(event.target.value)} placeholder="בנק, חברת כרטיסי אשראי…" className="min-h-11 rounded-xl border border-flow-line bg-flow-card px-2 text-base" />
      </label>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ['ריבית %', rate, setRate],
            ['חודשים', months, setMonths],
            ['עמלה ₪', fee, setFee],
          ] as const
        ).map(([label, value, set]) => (
          <label key={label} className="flex flex-col gap-1 text-xs font-bold">
            {label}
            <input inputMode="decimal" value={value} aria-label={`ההלוואה: ${label}`} onChange={(event) => set(event.target.value)} className="min-h-11 rounded-xl border border-flow-line bg-flow-card px-2 text-base tabular-nums" />
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={!ready}
        onClick={() => {
          addLoanOffer({ id: crypto.randomUUID(), lender: lender.trim(), annualRate: number(rate) / 100, months: Math.round(number(months)), fee: number(fee) || 0 });
          setLender('');
          setRate('');
          setFee('');
          setOpen(false);
        }}
        className="min-h-12 rounded-full bg-flow-ink px-4 text-base font-extrabold text-flow-ground disabled:opacity-40"
      >
        הוספת ההצעה
      </button>
    </div>
  );
}
