import { useRef, useState } from 'react';
import { toConsumerDebts } from '../../engine/aiExtraction';
import { DEBT_KIND_LABELS, type ConsumerDebt } from '../../engine/consolidation';
import { extractLoanSchedule, isImageFile } from '../../engine/documents';
import { scheduleToDebt } from '../../engine/schedule';
import { useAiEnabled } from '../../lib/aiClient';
import { formatCurrency, formatPercent } from '../../lib/format';
import { isSampleDebts, newDebtId, useConsolidation } from '../../store/consolidationStore';
import { AiDocumentReader } from '../AiDocumentReader';

/**
 * The household's loans, document by document: every loan read so far stays listed, each new
 * document adds to the list (the same loan twice is kept once), any can be removed, and a loan with
 * no document can be typed in.
 */

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

interface Outcome {
  readonly name: string;
  readonly text: string;
  readonly ok: boolean;
}

export function LoansUpload() {
  const debts = useConsolidation((state) => state.debts);
  const importDebts = useConsolidation((state) => state.importDebts);
  const removeDebt = useConsolidation((state) => state.removeDebt);
  const aiEnabled = useAiEnabled();
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  // Documents no local reader recognised, offered for reading with AI one at a time.
  const [forAi, setForAi] = useState<File[]>([]);
  const [typing, setTyping] = useState(false);
  const loans = isSampleDebts(debts) ? [] : debts;

  const add = (found: ConsumerDebt[]) => {
    const before = useConsolidation.getState().debts;
    importDebts(found, false);
    const after = useConsolidation.getState().debts;
    return after.length - (isSampleDebts(before) ? 0 : before.length);
  };

  const readFiles = async (files: File[]) => {
    setReading(true);
    const results: Outcome[] = [];
    const ai: File[] = [];
    for (const file of files) {
      try {
        if (isImageFile(file)) {
          if (aiEnabled) {
            ai.push(file);
          } else {
            results.push({ name: file.name, text: 'צילום נקרא רק עם AI, שלא זמין כרגע. אפשר להוסיף ידנית.', ok: false });
          }
          continue;
        }
        const { schedule } = await extractLoanSchedule(file, localToday());
        if (schedule && schedule.remainingMonths > 0) {
          const added = add([scheduleToDebt(schedule, newDebtId())]);
          results.push({ name: file.name, text: added > 0 ? 'נוספה הלוואה' : 'ההלוואה הזו כבר ברשימה', ok: true });
        } else if (schedule) {
          results.push({ name: file.name, text: 'לפי המסמך ההלוואה כבר נפרעה', ok: false });
        } else if (aiEnabled) {
          ai.push(file);
        } else {
          results.push({ name: file.name, text: 'לא זוהה כלוח סילוקין. אפשר להוסיף ידנית.', ok: false });
        }
      } catch (error) {
        results.push({ name: file.name, text: error instanceof Error ? error.message : 'קריאת המסמך נכשלה', ok: false });
      }
    }
    setOutcomes((all) => [...results, ...all].slice(0, 8));
    setForAi((all) => [...all, ...ai]);
    setReading(false);
  };

  const fromAi = (file: File, data: unknown) => {
    const { items } = toConsumerDebts(data, newDebtId);
    const added = items.length > 0 ? add(items) : 0;
    setOutcomes((all) => [{ name: file.name, text: added > 0 ? `נוספו ${added} הלוואות` : 'לא נמצאו הלוואות חדשות', ok: added > 0 }, ...all].slice(0, 8));
    setForAi((all) => all.slice(1));
  };

  return (
    <div className="flex flex-col gap-3">
      {loans.length > 0 && (
        <section aria-label="ההלוואות שלכם" className="flex flex-col overflow-hidden rounded-[20px] bg-flow-card">
          <h3 className="border-b border-flow-line px-4 py-2.5 text-sm font-bold text-flow-muted">ההלוואות שלכם · {loans.length}</h3>
          <ul>
            {loans.map((loan) => (
              <li key={loan.id} className="flex min-h-14 items-center gap-3 border-b border-flow-line px-4 py-2.5 last:border-b-0">
                <span className="flex flex-1 flex-col">
                  <span className="text-[15px] font-bold" dir="auto">
                    {loan.label || DEBT_KIND_LABELS[loan.kind]}
                  </span>
                  <span className="text-sm text-flow-muted">
                    {formatCurrency(loan.balance)} · {formatCurrency(loan.monthlyPayment)} בחודש · {formatPercent(loan.annualRate)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeDebt(loan.id)}
                  aria-label={`הסרת ${loan.label || DEBT_KIND_LABELS[loan.kind]}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-flow-pick"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={reading}
        className="flex min-h-[150px] flex-col items-center justify-center gap-2.5 rounded-3xl border-2 border-dashed border-flow-strong bg-flow-card p-5 text-center disabled:opacity-60"
      >
        <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-flow-pick text-flow-strong">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <span className="text-lg font-extrabold">{reading ? 'קורא…' : loans.length > 0 ? 'הוספת עוד מסמך' : 'בחרו מסמכים'}</span>
        <span className="text-sm text-flow-muted">לוח סילוקין או דוח הלוואות · PDF · כמה ביחד</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept="application/pdf,.pdf,.txt,image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="בחירת מסמכי הלוואות"
        onChange={(event) => {
          const chosen = [...(event.target.files ?? [])];
          event.target.value = '';
          if (chosen.length > 0) {
            void readFiles(chosen);
          }
        }}
      />

      {outcomes.length > 0 && (
        <ul aria-label="מסמכים שנקראו" aria-live="polite" className="flex flex-col gap-1.5">
          {outcomes.map((outcome, index) => (
            <li key={`${outcome.name}-${index}`} className="flex items-center justify-between gap-2 rounded-xl bg-flow-card px-3 py-2 text-sm">
              <span className="truncate" dir="auto">
                {outcome.name}
              </span>
              <span className={outcome.ok ? 'shrink-0 font-bold text-flow-strong' : 'shrink-0 text-flow-muted'}>{outcome.text}</span>
            </li>
          ))}
        </ul>
      )}

      {forAi[0] && (
        <AiDocumentReader key={`${forAi[0].name}-${forAi.length}`} kind="consumerLoans" file={forAi[0]} reason={`לא זוהה כלוח סילוקין: ${forAi[0].name}`} onData={(data) => fromAi(forAi[0]!, data)} />
      )}

      {typing ? (
        <TypedLoan
          onAdd={(loan) => {
            add([loan]);
            setTyping(false);
          }}
          onCancel={() => setTyping(false)}
        />
      ) : (
        <button type="button" onClick={() => setTyping(true)} className="min-h-11 self-center rounded-full px-4 text-base font-bold text-flow-strong underline-offset-4 hover:underline">
          הוספת הלוואה ידנית
        </button>
      )}
    </div>
  );
}

const digits = (text: string) => Number(text.replace(/[^\d.]/g, '')) || 0;

/** Months until a payment repays a balance at a rate; 480 when it never does. */
function monthsToRepay(balance: number, payment: number, annualRate: number): number {
  const monthly = annualRate / 12;
  if (monthly <= 0) {
    return Math.min(480, Math.ceil(balance / payment));
  }
  if (payment <= balance * monthly) {
    return 480;
  }
  return Math.min(480, Math.ceil(-Math.log(1 - (balance * monthly) / payment) / Math.log(1 + monthly)));
}

/** A loan with no document: what it is, what is left, the monthly payment and the rate. */
function TypedLoan({ onAdd, onCancel }: { onAdd: (loan: ConsumerDebt) => void; onCancel: () => void }) {
  const [label, setLabel] = useState('');
  const [balance, setBalance] = useState('');
  const [payment, setPayment] = useState('');
  const [rate, setRate] = useState('');
  const b = digits(balance);
  const p = digits(payment);
  const r = digits(rate) / 100;
  const ready = b > 0 && p > 0;
  const field = 'min-h-12 w-full rounded-2xl border-2 border-flow-line bg-flow-card px-3.5 text-base font-bold text-flow-ink outline-none focus:border-flow-strong focus-visible:ring-0';
  return (
    <form
      className="flex flex-col gap-3 rounded-[20px] border border-flow-line bg-flow-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) {
          onAdd({ id: newDebtId(), kind: 'OTHER', label: label.trim() || 'הלוואה', balance: b, monthlyPayment: p, annualRate: r, remainingMonths: monthsToRepay(b, p, r), include: true });
        }
      }}
    >
      <label className="flex flex-col gap-1.5 text-[15px] font-bold">
        מה ההלוואה
        <input className={field} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="למשל: רכב" maxLength={40} />
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1.5 text-[15px] font-bold">
          יתרה ₪
          <input className={field} inputMode="numeric" dir="ltr" value={balance} onChange={(event) => setBalance(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-[15px] font-bold">
          החזר בחודש ₪
          <input className={field} inputMode="numeric" dir="ltr" value={payment} onChange={(event) => setPayment(event.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-[15px] font-bold">
        ריבית שנתית %, אם ידועה
        <input className={field} inputMode="decimal" dir="ltr" value={rate} onChange={(event) => setRate(event.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={!ready} className="min-h-12 flex-1 rounded-full bg-flow-strong px-4 text-base font-extrabold text-flow-on-strong disabled:opacity-40">
          הוספה
        </button>
        <button type="button" onClick={onCancel} className="min-h-12 rounded-full border-2 border-flow-ink px-4 text-base font-bold">
          ביטול
        </button>
      </div>
    </form>
  );
}
