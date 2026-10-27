import { useRef } from 'react';
import { useMoney, type MoneyFile } from '../../store/moneyStore';
import { Card } from '../ui';
import { shortDate } from './format';

export function FilesStep({ onDone }: { onDone: () => void }) {
  const files = useMoney((state) => state.files);
  const reading = useMoney((state) => state.reading);
  const addFiles = useMoney((state) => state.addFiles);
  const remove = useMoney((state) => state.remove);
  const input = useRef<HTMLInputElement>(null);
  const read = files.filter((file) => file.statement);
  const hasBank = read.some((file) => file.statement!.source === 'BANK');
  const hasCard = read.some((file) => file.statement!.source === 'CARD');

  return (
    <Card title="העלו את החשבונות" subtitle="עו״ש וכרטיסי אשראי, 3 חודשים ומעלה. קובץ Excel או CSV מאתר הבנק או חברת האשראי.">
      <div className="grid gap-3 sm:grid-cols-2">
        <UploadTile
          title="חשבון עו״ש"
          hint="באתר הבנק: תנועות בחשבון ← ייצוא ל-Excel"
          icon="M3 10h18M5 10v8m5-8v8m4-8v8m5-8v8M2 21h20M12 3 3 8h18z"
          onClick={() => input.current?.click()}
        />
        <UploadTile
          title="כרטיס אשראי"
          hint="באתר חברת האשראי: פירוט עסקאות ← ייצוא ל-Excel"
          icon="M2 7.5A2.5 2.5 0 0 1 4.5 5h15A2.5 2.5 0 0 1 22 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 16.5zM2 10h20M6 15h4"
          onClick={() => input.current?.click()}
        />
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept=".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        aria-label="בחירת קבצי עו״ש או כרטיס אשראי"
        onChange={(event) => {
          const chosen = [...(event.target.files ?? [])];
          event.target.value = '';
          if (chosen.length > 0) {
            void addFiles(chosen);
          }
        }}
      />

      {(files.length > 0 || reading) && (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line" aria-label="קבצים שהועלו">
          {files.map((file) => (
            <FileRow key={file.id} file={file} onRemove={() => remove(file.id)} />
          ))}
          {reading && <li className="p-3 text-sm text-ink-soft">קורא…</li>}
        </ul>
      )}

      {hasBank && !hasCard && (
        <p className="mt-3 text-sm text-ink-muted">הוסיפו גם את פירוט כרטיס האשראי — בלעדיו רואים רק את החיוב החודשי, לא על מה.</p>
      )}
      {hasCard && !hasBank && (
        <p className="mt-3 text-sm text-ink-muted">הוסיפו גם את העו״ש — שם המשכורת, המשכנתא וההוראות הקבע.</p>
      )}

      <p className="mt-4 rounded-xl bg-surface-muted p-3 text-sm text-ink-muted">
        הקבצים נקראים בדפדפן שלכם ולא נשלחים לשום מקום. הם לא נשמרים: סגירת הדף מוחקת אותם.
      </p>

      <button type="button" className="btn-primary mt-4 w-full sm:w-auto" disabled={read.length === 0} onClick={onDone}>
        לתמונה החודשית <span aria-hidden>←</span>
      </button>
    </Card>
  );
}

function UploadTile({ title, hint, icon, onClick }: { title: string; hint: string; icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded-2xl border-2 border-dashed border-brand-500/60 bg-brand-50/60 p-4 text-start transition hover:bg-brand-50"
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-brand-700" aria-hidden>
        <path d={icon} />
      </svg>
      <span className="text-base font-semibold text-ink">{title}</span>
      <span className="text-xs text-ink-soft">{hint}</span>
    </button>
  );
}

function FileRow({ file, onRemove }: { file: MoneyFile; onRemove: () => void }) {
  const statement = file.statement;
  return (
    <li className="flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink" dir="auto">
          {file.name}
        </p>
        {statement ? (
          <p className="text-xs text-ink-soft">
            {statement.source === 'BANK' ? 'עו״ש' : `כרטיס ${statement.cards.join(', ')}`} · {statement.transactions.length} תנועות ·{' '}
            {shortDate(statement.from)} עד {shortDate(statement.to)}
          </p>
        ) : (
          <p className="text-xs text-negative">{file.error}</p>
        )}
      </div>
      {statement && <span className="badge-ok">נקרא</span>}
      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onRemove} aria-label={`הסרת ${file.name}`}>
        הסרה
      </button>
    </li>
  );
}

