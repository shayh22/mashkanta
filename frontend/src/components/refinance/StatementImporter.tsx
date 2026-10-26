import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { extractMortgageDocument, type MortgageDocument } from '../../engine/documents';
import { scenarioOf } from '../../lib/api';
import { formatCurrency, formatPercent } from '../../lib/format';
import { newTrackId, useRefinance } from '../../store/refinanceStore';
import { useWizard } from '../../store/wizardStore';
import { Card } from '../ui';

const REDACTION_LABELS: Record<string, string> = {
  NATIONAL_ID: 'מספרי זהות',
  NAME: 'שמות וכתובת נמען',
  ADDRESS: 'כתובות',
  ACCOUNT: 'מספרי חשבון',
  PHONE: 'טלפונים',
  EMAIL: 'כתובות דוא"ל',
};

/**
 * Imports the existing mortgage from the bank's own document. A mortgage details statement
 * (פרטי משכנתאות / דוח יתרות לסילוק) gives every sub-loan with its balance, rate, dates and the
 * fee the bank would charge; an approval-in-principle is still accepted and gives the tracks only.
 *
 * Everything happens in the browser: the file is read, identifying details are masked, and only
 * numbers reach the parser.
 */
export function StatementImporter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const setTracks = useRefinance((state) => state.setTracks);
  const setKeptIds = useRefinance((state) => state.setKeptIds);
  const macro = useWizard((state) => state.macro);
  const setMacro = useWizard((state) => state.setMacro);

  const importer = useMutation({
    mutationFn: (file: File) => extractMortgageDocument(file, scenarioOf(macro).primeAnnual),
    onSuccess: (document: MortgageDocument) => {
      if (document.tracks.length === 0) {
        return;
      }
      setKeptIds([]);
      if (document.kind === 'statement') {
        setTracks(document.tracks.map(({ loanNumber: _loanNumber, ...track }) => track));
      } else {
        setTracks(
          document.tracks.map((track) => ({
            id: newTrackId(),
            type: track.track,
            balance: track.amount,
            annualRate: track.annualRate,
            remainingMonths: track.termMonths > 0 ? track.termMonths : 240,
            monthsElapsed: 36,
          })),
        );
      }
    },
  });

  const pick = (file: File | undefined) => file && importer.mutate(file);
  const result = importer.data;
  const prime = scenarioOf(macro).primeAnnual;

  return (
    <Card
      title="ייבוא מהבנק"
      subtitle="העלו מכתב &quot;פרטי משכנתאות&quot; (דוח יתרות לסילוק) — הוא כולל את כל המרכיבים ואת עמלת הפירעון שהבנק עצמו מחשב."
    >
      <div
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
          dragging ? 'border-brand-500 bg-brand-50' : 'border-line-strong bg-surface-muted/60'
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          pick(event.dataTransfer.files[0]);
        }}
      >
        <p className="text-sm text-ink-muted">גררו לכאן קובץ PDF, או</p>
        <button type="button" className="btn-ghost" onClick={() => inputRef.current?.click()} disabled={importer.isPending}>
          {importer.isPending ? 'קורא את המסמך…' : 'בחירת קובץ'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf,.txt"
          className="sr-only"
          aria-label="קובץ דוח המשכנתא"
          onChange={(event) => {
            pick(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <p className="hint">הקובץ מעובד בדפדפן בלבד ואינו נשלח לשום שרת. שם, כתובת ומספר זהות מושחרים לפני הניתוח.</p>
      </div>

      {importer.isError && (
        <p className="mt-3 text-sm text-negative" role="alert">
          {importer.error instanceof Error ? importer.error.message : 'קריאת המסמך נכשלה.'}
        </p>
      )}

      {result && (
        <div className="mt-4 space-y-3 text-sm" aria-live="polite">
          {result.kind === 'statement' ? (
            <>
              <p className="font-semibold text-positive">
                ✓ יובאו {result.tracks.length} מרכיבים מ-{result.statement.loans.length} הלוואות, נכון ליום{' '}
                {result.statement.asOf.split('-').reverse().join('/')}.
              </p>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Figure label="יתרה לסילוק" value={formatCurrency(result.statement.loans.reduce((s, l) => s + l.payoffBalance, 0))} />
                <Figure label="החזר חודשי" value={formatCurrency(result.statement.loans.reduce((s, l) => s + l.monthlyPayment, 0))} />
                <Figure
                  label="עמלת פירעון לפי הבנק"
                  value={formatCurrency(result.statement.loans.reduce((s, l) => s + l.prepaymentFee, 0))}
                />
                <Figure label="מקור" value="דוח הבנק" />
              </dl>
              {result.statement.impliedPrime !== undefined && Math.abs(result.statement.impliedPrime - prime) > 0.0001 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-caution">
                  <span>
                    לפי הדוח הפריים היום {formatPercent(result.statement.impliedPrime)}, והמחשבון מניח{' '}
                    {formatPercent(prime)}.
                  </span>
                  <button
                    type="button"
                    className="btn-ghost !px-3 !py-1.5"
                    onClick={() => setMacro({ prime: result.statement.impliedPrime })}
                  >
                    עדכון הפריים
                  </button>
                </div>
              )}
              <p className="hint">
                יתרת כל הלוואה חולקה בין מרכיביה לפי לוח הסילוקין של כל מרכיב. עמלת הפירעון שהבנק ציין
                משמשת בחישוב במקום ההערכה; עריכת יתרה או ריבית של מרכיב מחזירה אותו להערכה.
              </p>
            </>
          ) : (
            <p className="text-ink-muted">
              המסמך זוהה כאישור עקרוני ({result.tracks.length} מסלולים). ותק ההלוואה אינו מופיע בו — עדכנו אותו בטבלה.
            </p>
          )}
          {result.redaction.spanCount > 0 && (
            <p className="hint">
              הושחרו:{' '}
              {Object.entries(result.redaction.byCategory)
                .map(([category, count]) => `${REDACTION_LABELS[category] ?? category} (${count})`)
                .join(' · ')}
            </p>
          )}
          {result.warnings.length > 0 && (
            <ul className="list-inside list-disc text-caution">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="tabular font-semibold text-ink">{value}</dd>
    </div>
  );
}
