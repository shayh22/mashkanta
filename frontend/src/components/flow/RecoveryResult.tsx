import type { RecoverySnapshot } from '../../engine/flow/share';
import type { Decision } from '../../engine/money/decisions';
import { formatCurrency, formatSignedCurrency } from '../../lib/format';
import { useImprovement } from './outcomes';

/**
 * The recovery plan's result: what is left each month today, and after the decisions the household
 * keeps — each a tick away from being left out — from its own statements and what it said about
 * its charges.
 */
export function RecoveryResult({
  recovering,
  onEdit,
  onDetails,
  hasReview,
}: {
  /** A recovery plan needs the statements; for the other goals they are optional. */
  recovering: boolean;
  onEdit: (step: string) => void;
  onDetails: () => void;
  hasReview: boolean;
}) {
  const { picture, decisions, chosen, freed, today, after, toggle } = useImprovement();

  if (!picture && !recovering) {
    // Without statements, the loans' moves alone: what they free a month.
    return decisions.length > 0 ? (
      <section aria-label="ההחלטות" className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1">
          <span className="text-[15px] font-bold text-flow-muted">ההחלטות מפנות כל חודש</span>
          <h3 className="text-[48px] font-black leading-none tracking-tight">{formatCurrency(freed)}</h3>
        </div>
        <Decisions decisions={decisions} chosen={chosen} toggle={toggle} />
      </section>
    ) : null;
  }
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

  return (
    <section aria-label="תוכנית ההבראה" className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-bold text-flow-muted">{after >= 0 ? 'אחרי ההחלטות נשארים כל חודש' : 'אחרי ההחלטות עדיין חסרים כל חודש'}</span>
        <h3 id="recovery-result" className={`text-[48px] font-black leading-none tracking-tight ${after < 0 ? 'text-negative' : ''}`}>
          {formatCurrency(Math.abs(after))}
        </h3>
        <span className="text-[15px] text-flow-muted">היום {formatSignedCurrency(today)} בחודש</span>
      </div>

      <TodayAfter today={today} after={after} />

      {decisions.length > 0 ? (
        <Decisions decisions={decisions} chosen={chosen} toggle={toggle} />
      ) : (
        <div className="flex flex-col gap-2 rounded-[20px] bg-flow-card p-4">
          <span className="text-base font-extrabold">עוד אין החלטות</span>
          <span className="text-[15px] text-flow-muted">סמנו למטה, בהוצאות, מה אפשר לבטל או לצמצם, וזה יופיע כאן.</span>
          {hasReview && (
            <button type="button" onClick={() => onEdit('canGo')} className="min-h-11 self-start font-bold text-flow-strong underline underline-offset-4">
              לסמן עכשיו
            </button>
          )}
        </div>
      )}

      <button type="button" onClick={onDetails} className="min-h-[52px] rounded-full border-2 border-flow-ink px-3 text-base font-extrabold">
        כל הפרטים
      </button>
      <p className="text-xs leading-relaxed text-flow-muted">
        לפי {picture.months.length} חודשים מלאים בדפי החשבון. הקבצים נקראו במכשיר ולא נשמרו.
      </p>
    </section>
  );
}

/** Each decision, a tick away from being left out, with what it frees a month. */
function Decisions({ decisions, chosen, toggle }: { decisions: readonly Decision[]; chosen: ReadonlySet<string>; toggle: (key: string) => void }) {
  return (
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
  );
}

/** The month today beside the month after the decisions, as two bars: left over or missing. */
function TodayAfter({ today, after }: { today: number; after: number }) {
  const top = Math.max(Math.abs(today), Math.abs(after), 1);
  return (
    <div role="img" aria-label={`היום ${formatSignedCurrency(today)} בחודש, אחרי ההחלטות ${formatSignedCurrency(after)}`} className="flex flex-col gap-2.5 rounded-[20px] bg-flow-card p-4">
      {[
        { label: 'היום', value: today },
        { label: 'אחרי', value: after },
      ].map((bar) => (
        <div key={bar.label} className="flex items-center gap-3">
          <span className="w-10 shrink-0 text-sm font-bold">{bar.label}</span>
          <span className="h-7 flex-1">
            <span className={`block h-full rounded-lg ${bar.value < 0 ? 'bg-negative/70' : 'bg-flow-strong'}`} style={{ width: `${Math.max(2, (Math.abs(bar.value) / top) * 100)}%` }} />
          </span>
          <span className={`w-20 shrink-0 text-left text-sm font-extrabold tabular-nums ${bar.value < 0 ? 'text-negative' : ''}`}>{formatSignedCurrency(bar.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** A recovery plan someone shared: its month today and after, and the decisions they kept. */
export function SharedRecovery({ snapshot }: { snapshot: RecoverySnapshot }) {
  return (
    <section aria-label="תוכנית ההבראה" className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-bold text-flow-muted">{snapshot.after >= 0 ? 'אחרי ההחלטות נשארים כל חודש' : 'אחרי ההחלטות עדיין חסרים כל חודש'}</span>
        <h3 id="recovery-result" className={`text-[48px] font-black leading-none tracking-tight ${snapshot.after < 0 ? 'text-negative' : ''}`}>
          {formatCurrency(Math.abs(snapshot.after))}
        </h3>
        <span className="text-[15px] text-flow-muted">היום {formatSignedCurrency(snapshot.today)} בחודש</span>
      </div>
      {snapshot.decisions.length > 0 && (
        <ul aria-label="ההחלטות" className="flex flex-col overflow-hidden rounded-[20px] bg-flow-card">
          {snapshot.decisions.map((decision) => (
            <li key={decision.label} className="flex min-h-14 items-center justify-between gap-3 border-b border-flow-line px-4 last:border-b-0">
              <span className="text-base font-bold">{decision.label}</span>
              <span className="text-base font-extrabold tabular-nums">+{formatCurrency(decision.monthly)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs leading-relaxed text-flow-muted">לפי {snapshot.months} חודשים מלאים בדפי החשבון של מי ששיתף. דפי החשבון עצמם לא שותפו.</p>
    </section>
  );
}
