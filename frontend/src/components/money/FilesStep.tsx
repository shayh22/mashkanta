import { useRef, useState } from 'react';
import { useDocumentsStatus } from '../../store/journeyLoans';
import { useMoney, type MoneyFile } from '../../store/moneyStore';
import { isSampleTracks, useRefinance } from '../../store/refinanceStore';
import { DebtImporter } from '../consolidation/DebtImporter';
import { StatementImporter } from '../refinance/StatementImporter';
import { Card } from '../ui';
import { shortDate } from './format';

type Kind = 'bank' | 'card' | 'mortgage' | 'loans';

const ICONS: Record<Kind, string> = {
  bank: 'M3 10h18M5 10v8m5-8v8m4-8v8m5-8v8M2 21h20M12 3 3 8h18z',
  card: 'M2 7.5A2.5 2.5 0 0 1 4.5 5h15A2.5 2.5 0 0 1 22 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 16.5zM2 10h20M6 15h4',
  mortgage: 'M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6',
  loans: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
};

/**
 * Step 1, and a bar on every step after it: the household's documents, four kinds, each one tap
 * away — the bank account, the credit card, the mortgage report, the loans report. Statements are
 * read in the browser; a mortgage or loans report goes through the readers the homeowner path uses,
 * so the mortgage and the loans are entered once for the whole site.
 */
export function FilesStep({ onDone }: { onDone: () => void }) {
  const ready = useMoney((state) => state.files.some((file) => file.statement));
  return (
    <>
      <section aria-label="תוכנית הבראה" className="space-y-1 px-1">
        <h1 className="text-2xl font-bold text-ink">תוכנית הבראה</h1>
        <p className="text-sm text-ink-muted">חמצן לתזרים, צעד אחר צעד: מעלים את המסמכים, רואים לאן הולך הכסף, ובוחרים מה לשנות.</p>
      </section>
      <Card title="המסמכים שלכם" subtitle="מה שיש לכם — כל מסמך מוסיף לתמונה. אפשר להוסיף עוד בכל שלב.">
        <DocumentsHub />
        <button type="button" className="btn-primary mt-4 w-full sm:w-auto" disabled={!ready} onClick={onDone}>
          לתמונה החודשית <span aria-hidden>←</span>
        </button>
        {!ready && <p className="mt-2 text-xs text-ink-soft">כדי להתחיל צריך לפחות דף עו״ש או פירוט כרטיס אשראי.</p>}
      </Card>
    </>
  );
}

/** On every step after the first: what is loaded, in one line, and the hub a tap away. */
export function DocumentsBar() {
  const [open, setOpen] = useState(false);
  const status = useStatusLine();
  return (
    <section className="no-print rounded-2xl border border-line bg-surface" aria-label="המסמכים שלכם">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-start"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-brand-700" aria-hidden>
          <path d="m21 12-8.5 8.5a5 5 0 0 1-7-7L14 5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 8" />
        </svg>
        <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">
          <span className="font-semibold text-ink">המסמכים שלכם: </span>
          {status}
        </span>
        <span className="shrink-0 text-sm font-medium text-brand-700">{open ? 'סגירה' : 'הוספה'}</span>
      </button>
      {open && (
        <div className="border-t border-line p-4">
          <DocumentsHub />
        </div>
      )}
    </section>
  );
}

function useStatusLine(): string {
  const { statements, loans } = useDocumentsStatus();
  const tracks = useRefinance((state) => state.tracks);
  const mortgage = !isSampleTracks(tracks);
  const parts = [
    statements > 0 ? `${statements === 1 ? 'דף חשבון אחד' : `${statements} דפי חשבון`}` : 'אין דפי חשבון',
    mortgage ? 'משכנתא ✓' : undefined,
    loans > 0 ? (loans === 1 ? 'הלוואה אחת' : `${loans} הלוואות`) : undefined,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** The four kinds of document as tiles; a report's reader opens under them when its tile is chosen. */
function DocumentsHub() {
  const files = useMoney((state) => state.files);
  const reading = useMoney((state) => state.reading);
  const addFiles = useMoney((state) => state.addFiles);
  const remove = useMoney((state) => state.remove);
  const tracks = useRefinance((state) => state.tracks);
  const { loans } = useDocumentsStatus();
  const input = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<'mortgage' | 'loans'>();
  const read = files.filter((file) => file.statement);
  const banks = read.filter((file) => file.statement!.source === 'BANK').length;
  const cards = read.filter((file) => file.statement!.source === 'CARD').length;
  const mortgage = !isSampleTracks(tracks);

  const tiles: { kind: Kind; title: string; hint: string; done?: string; onClick: () => void; pressed?: boolean }[] = [
    { kind: 'bank', title: 'חשבון עו״ש', hint: 'Excel או CSV מאתר הבנק', done: banks ? `${banks} נקראו` : undefined, onClick: () => input.current?.click() },
    { kind: 'card', title: 'כרטיס אשראי', hint: 'פירוט עסקאות, Excel או CSV', done: cards ? `${cards} נקראו` : undefined, onClick: () => input.current?.click() },
    {
      kind: 'mortgage',
      title: 'דוח משכנתא',
      hint: 'דוח יתרות או פרטי משכנתא מהבנק',
      done: mortgage ? `${tracks.length} מסלולים` : undefined,
      onClick: () => setReport(report === 'mortgage' ? undefined : 'mortgage'),
      pressed: report === 'mortgage',
    },
    {
      kind: 'loans',
      title: 'דוח הלוואות',
      hint: 'לוח סילוקין או דוח מהמלווה',
      done: loans ? `${loans} הלוואות` : undefined,
      onClick: () => setReport(report === 'loans' ? undefined : 'loans'),
      pressed: report === 'loans',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <button
            key={tile.kind}
            type="button"
            onClick={tile.onClick}
            {...(tile.pressed !== undefined ? { 'aria-pressed': tile.pressed } : {})}
            className={`flex min-h-28 flex-col items-start gap-1.5 rounded-2xl border-2 p-3 text-start transition ${
              tile.pressed ? 'border-brand-600 bg-brand-50' : 'border-dashed border-brand-500/60 bg-brand-50/50 hover:bg-brand-50'
            }`}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-brand-700" aria-hidden>
                <path d={ICONS[tile.kind]} />
              </svg>
              {tile.done && <span className="badge-ok">{tile.done}</span>}
            </span>
            <span className="text-sm font-semibold text-ink">{tile.title}</span>
            <span className="text-xs text-ink-soft">{tile.hint}</span>
          </button>
        ))}
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

      {report === 'mortgage' && <StatementImporter />}
      {report === 'loans' && <DebtImporter />}

      {(files.length > 0 || reading) && (
        <ul className="divide-y divide-line rounded-xl border border-line" aria-label="קבצים שהועלו">
          {files.map((file) => (
            <FileRow key={file.id} file={file} onRemove={() => remove(file.id)} />
          ))}
          {reading && <li className="p-3 text-sm text-ink-soft">קורא…</li>}
        </ul>
      )}
      {banks > 0 && cards === 0 && (
        <p className="text-sm text-ink-muted">הוסיפו גם את פירוט כרטיס האשראי — בלעדיו רואים רק את החיוב החודשי, לא על מה.</p>
      )}
      {cards > 0 && banks === 0 && <p className="text-sm text-ink-muted">הוסיפו גם את העו״ש — שם המשכורת, המשכנתא וההוראות הקבע.</p>}

      <p className="rounded-xl bg-surface-muted p-3 text-sm text-ink-muted">
        דפי החשבון נקראים בדפדפן שלכם ולא נשלחים לשום מקום, ולא נשמרים: סגירת הדף מוחקת אותם. דוחות משכנתא והלוואות נקראים בדפדפן;
        פורמט לא מוכר נשלח לקריאה עם AI רק באישורכם.
      </p>
    </div>
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
