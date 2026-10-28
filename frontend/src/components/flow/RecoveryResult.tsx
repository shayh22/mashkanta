import { useMemo, useState } from 'react';
import { decisionsOf, freedBy } from '../../engine/money/decisions';
import { formatCurrency, formatSignedCurrency } from '../../lib/format';
import { useMoneyCategories, useMonthlyPicture } from '../../store/moneyStore';

/**
 * The recovery plan's result: what is left each month today, and after the decisions the household
 * keeps — each a tick away from being left out — from its own statements and what it said about
 * its charges.
 */
export function RecoveryResult({ onEdit, onDetails, hasReview }: { onEdit: (step: string) => void; onDetails: () => void; hasReview: boolean }) {
  const picture = useMonthlyPicture();
  const explanations = useMoneyCategories((state) => state.explanations);
  const decisions = useMemo(() => (picture ? decisionsOf(picture, explanations) : []), [picture, explanations]);
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());

  if (!picture) {
    // Statements are kept in memory only: a later visit has none until they are uploaded again.
    return (
      <section aria-label="תוכנית ההבראה" className="flex flex-col gap-3 rounded-[20px] bg-flow-card p-5">
        <h3 id="recovery-result" className="text-[24px] font-black leading-tight">
          לתוכנית ההבראה צריך את דפי החשבון
        </h3>
        <p className="text-[15px] text-flow-muted">הם נקראים במכשיר ולא נשמרים, ולכן מעלים אותם בכל ביקור.</p>
        <button type="button" onClick={() => onEdit('statementsUpload')} className="min-h-12 self-start rounded-full bg-flow-strong px-5 text-base font-extrabold text-flow-on-strong">
          להעלות את דפי החשבון
        </button>
      </section>
    );
  }

  const today = picture.income - picture.spending;
  const chosen = new Set(decisions.map((decision) => decision.key).filter((key) => !left.has(key)));
  const after = today + freedBy(decisions, chosen);
  const toggle = (key: string) =>
    setLeft((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  const share = [
    'תוכנית ההבראה שלי מ"מפתח כלכלי":',
    `היום ${formatSignedCurrency(today)} בחודש, אחרי ההחלטות ${formatSignedCurrency(after)}`,
    ...decisions.filter((decision) => chosen.has(decision.key)).map((decision) => `${decision.label}: +${formatCurrency(decision.monthly)}`),
  ].join('\n');

  return (
    <section aria-label="תוכנית ההבראה" className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-bold text-flow-muted">{after >= 0 ? 'אחרי ההחלטות נשארים כל חודש' : 'אחרי ההחלטות עדיין חסרים כל חודש'}</span>
        <h3 id="recovery-result" className={`text-[48px] font-black leading-none tracking-tight ${after < 0 ? 'text-negative' : ''}`}>
          {formatCurrency(Math.abs(after))}
        </h3>
        <span className="text-[15px] text-flow-muted">היום {formatSignedCurrency(today)} בחודש</span>
      </div>

      <div className="flex flex-col gap-2 rounded-[20px] bg-flow-card p-4">
        {[
          { label: 'היום', value: today },
          { label: 'אחרי', value: after },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-[15px]">
            <span className="font-bold">{row.label}</span>
            <span className={`font-extrabold tabular-nums ${row.value < 0 ? 'text-negative' : 'text-flow-strong'}`}>{formatSignedCurrency(row.value)}</span>
          </div>
        ))}
      </div>

      {decisions.length > 0 ? (
        <fieldset className="flex flex-col overflow-hidden rounded-[20px] bg-flow-card">
          <legend className="sr-only">ההחלטות</legend>
          {decisions.map((decision) => (
            <label key={decision.key} className="flex min-h-[60px] cursor-pointer items-center gap-3 border-b border-flow-line px-4 py-2.5 last:border-b-0">
              <input type="checkbox" checked={chosen.has(decision.key)} onChange={() => toggle(decision.key)} className="h-[22px] w-[22px] shrink-0 accent-[rgb(var(--flow-strong))]" />
              <span className="flex flex-1 flex-col">
                <span className="text-base font-bold">{decision.label}</span>
                {decision.note && <span className="text-sm text-flow-muted">{decision.note}</span>}
              </span>
              <span className="text-base font-extrabold tabular-nums">+{formatCurrency(decision.monthly)}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <div className="flex flex-col gap-2 rounded-[20px] bg-flow-card p-4">
          <span className="text-base font-extrabold">עוד אין החלטות</span>
          <span className="text-[15px] text-flow-muted">סמנו מה אפשר לבטל או לצמצם, וזה יופיע כאן.</span>
          {hasReview && (
            <button type="button" onClick={() => onEdit('canGo')} className="min-h-11 self-start font-bold text-flow-strong underline underline-offset-4">
              לסמן עכשיו
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={onDetails} className="min-h-[52px] rounded-full border-2 border-flow-ink px-3 text-base font-extrabold">
          כל הפרטים
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(share)}`}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-[52px] items-center justify-center rounded-full border-2 border-flow-ink px-3 text-base font-extrabold"
        >
          שיתוף בוואטסאפ
        </a>
      </div>
      <p className="text-xs leading-relaxed text-flow-muted">
        לפי {picture.months.length} חודשים מלאים בדפי החשבון. הקבצים נקראו במכשיר ולא נשמרו.
      </p>
    </section>
  );
}
