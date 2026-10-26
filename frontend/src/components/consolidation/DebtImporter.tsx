import { useRef, useState } from 'react';
import { toConsumerDebts } from '../../engine/aiExtraction';
import { extractLoanSchedule, isImageFile } from '../../engine/documents';
import { scheduleToDebt } from '../../engine/schedule';
import { DEBT_KIND_LABELS, type ConsumerDebt } from '../../engine/consolidation';
import { useAiEnabled } from '../../lib/aiClient';
import { formatCurrency, formatPercent } from '../../lib/format';
import { newDebtId, useConsolidation } from '../../store/consolidationStore';
import { AiDocumentReader } from '../AiDocumentReader';
import { Card, ScrollRegion } from '../ui';

/** Today in the borrower's time zone, as an ISO date — which schedule rows are already paid. */
const localToday = () => new Date().toLocaleDateString('en-CA');

/**
 * Reads the household's loans from a document. A loan's amortization schedule (לוח סילוקין) is
 * read right here in the browser — balance today, payment, payments left and rate. Anything else
 * (a statement listing several loans, a screenshot) goes to the AI reader when it is switched on,
 * with the borrower's consent. Either way the result is shown for confirmation before it changes
 * the list.
 */
export function DebtImporter() {
  const enabled = useAiEnabled();
  const importDebts = useConsolidation((state) => state.importDebts);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [found, setFound] = useState<{ debts: ConsumerDebt[]; warnings: string[]; summary?: string }>();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [reading, setReading] = useState(false);

  const show = (debts: ConsumerDebt[], warnings: string[], summary?: string) => {
    setFound({ debts, warnings, summary });
    setChosen(new Set(debts.map((debt) => debt.id)));
  };

  const pick = async (picked: File) => {
    setFound(undefined);
    setDone(undefined);
    setNotice(undefined);
    setFile(undefined);
    const unreadable = 'זה לא לוח סילוקין שהמחשבון מכיר. אפשר להזין את ההלוואה ידנית בטבלה.';
    if (isImageFile(picked)) {
      if (enabled) {
        setFile(picked);
      } else {
        setNotice(`צילום מסך אפשר לקרוא רק עם AI, שאינו מופעל כרגע. ${unreadable}`);
      }
      return;
    }
    setReading(true);
    try {
      const { schedule, warnings } = await extractLoanSchedule(picked, localToday());
      if (schedule && schedule.remainingMonths > 0) {
        show(
          [scheduleToDebt(schedule, newDebtId())],
          [...schedule.warnings, ...warnings],
          `לוח סילוקין: שולמו ${schedule.paidCount} מתוך ${schedule.rows.length} תשלומים; היתרה והתשלומים שנותרו נכונים להיום. נקרא בדפדפן, בלי AI.`,
        );
      } else if (schedule) {
        setNotice('לפי לוח הסילוקין ההלוואה כבר נפרעה — אין מה לאחד.');
      } else if (enabled) {
        setFile(picked);
      } else {
        setNotice(unreadable);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'קריאת המסמך נכשלה.');
    } finally {
      setReading(false);
    }
  };

  const read = (data: unknown) => {
    const { items, warnings } = toConsumerDebts(data, newDebtId);
    show(items, warnings);
    setFile(undefined);
  };

  const apply = (replace: boolean) => {
    const debts = found!.debts.filter((debt) => chosen.has(debt.id));
    importDebts(debts, replace);
    setDone(`${replace ? 'הרשימה הוחלפה ב-' : 'נוספו '}${debts.length} הלוואות מהמסמך. בדקו אותן מול המסמך.`);
    setFound(undefined);
  };

  return (
    <Card
      title="ייבוא הלוואות ממסמך"
      subtitle="לוח סילוקין של הלוואה, או פירוט הלוואות מהבנק, מחברת האשראי או מגוף חוץ-בנקאי. הנתונים יוצגו לאישור לפני שיוזנו."
      action={
        <button type="button" className="btn-ghost" onClick={() => inputRef.current?.click()} disabled={reading}>
          {reading ? 'קורא…' : 'בחירת מסמך'}
        </button>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf,.txt,image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="מסמך פירוט הלוואות"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          event.target.value = '';
          if (picked) {
            void pick(picked);
          }
        }}
      />

      {!file && !found && !done && !notice && (
        <p className="text-sm text-ink-soft">
          לוח סילוקין נקרא בדפדפן בלבד. מסמך בפורמט אחר{enabled ? ' נקרא עם AI — רק באישורכם, ואחרי השחרת פרטים מזהים בטקסט' : ' יש להזין ידנית'}.
        </p>
      )}
      {notice && (
        <p className="text-sm text-caution" role="status">
          {notice}
        </p>
      )}

      {file && (
        <AiDocumentReader
          kind="consumerLoans"
          file={file}
          reason={`נבחר: ${file.name}`}
          onData={read}
        />
      )}

      {found && (
        <div className="mt-2 space-y-3 text-sm">
          {found.debts.length === 0 ? (
            <p className="text-negative">לא זוהו הלוואות במסמך. אפשר להוסיף אותן ידנית בטבלה.</p>
          ) : (
            <>
              {found.summary && <p className="text-positive">✓ {found.summary}</p>}
              <p className="font-medium text-ink">
                {found.debts.length === 1 ? 'זוהתה הלוואה אחת.' : `זוהו ${found.debts.length} הלוואות.`} סמנו אילו להוסיף:
              </p>
              <ScrollRegion label="הלוואות שזוהו במסמך">
                <table className="tabular w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-ink-soft">
                      <th className="py-2 text-start font-medium" scope="col">להוסיף</th>
                      <th className="py-2 text-start font-medium" scope="col">הלוואה</th>
                      <th className="py-2 text-start font-medium" scope="col">יתרה</th>
                      <th className="py-2 text-start font-medium" scope="col">ריבית</th>
                      <th className="py-2 text-start font-medium" scope="col">החזר</th>
                      <th className="py-2 text-start font-medium" scope="col">חודשים</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {found.debts.map((debt) => (
                      <tr key={debt.id}>
                        <td className="py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-brand-600"
                            aria-label={`להוסיף את ${debt.label}`}
                            checked={chosen.has(debt.id)}
                            onChange={(event) =>
                              setChosen((current) => {
                                const next = new Set(current);
                                if (event.target.checked) {
                                  next.add(debt.id);
                                } else {
                                  next.delete(debt.id);
                                }
                                return next;
                              })
                            }
                          />
                        </td>
                        <th className="py-2 text-start font-normal text-ink" scope="row">
                          {debt.label}
                          <span className="block text-xs text-ink-soft">{DEBT_KIND_LABELS[debt.kind]}</span>
                        </th>
                        <td className="py-2">{formatCurrency(debt.balance)}</td>
                        <td className="py-2">{formatPercent(debt.annualRate)}</td>
                        <td className="py-2">{debt.monthlyPayment > 0 ? formatCurrency(debt.monthlyPayment) : '—'}</td>
                        <td className="py-2">{debt.remainingMonths}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" disabled={chosen.size === 0} onClick={() => apply(false)}>
                  הוספה לרשימה
                </button>
                <button type="button" className="btn-ghost" disabled={chosen.size === 0} onClick={() => apply(true)}>
                  החלפת הרשימה הקיימת
                </button>
                <button type="button" className="btn-ghost" onClick={() => setFound(undefined)}>
                  ביטול
                </button>
              </div>
            </>
          )}
          {found.warnings.length > 0 && (
            <ul className="list-inside list-disc text-caution">
              {found.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {done && (
        <p className="mt-2 text-sm font-medium text-positive" aria-live="polite">
          ✓ {done}
        </p>
      )}
    </Card>
  );
}
