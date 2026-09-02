import { useEffect, useRef } from 'react';
import type { OptimizationResponse } from '../lib/types';
import { formatCurrency, formatPercent, formatTerm } from '../lib/format';

/**
 * Export and share.
 *
 * Printing is delegated to the browser's own print-to-PDF rather than a bundled PDF library: the
 * results page already has a print stylesheet, the output stays selectable and accessible, and the
 * app avoids shipping a megabyte of renderer to every visitor.
 */
export function ReportExportModal({
  result,
  open,
  onClose,
}: {
  result: OptimizationResponse;
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const summary = buildSummary(result);

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="שיתוף וייצוא"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl focus:outline-none"
      >
        <h2 className="text-lg font-semibold text-ink">שיתוף וייצוא</h2>
        <p className="mt-1 text-sm text-ink-soft">
          שמרו את ההשוואה כקובץ PDF או שלחו את התקציר ליועץ המשכנתאות שלכם.
        </p>

        <pre className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-ink-muted">
          {summary}
        </pre>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => window.print()}>
            שמירה כ-PDF
          </button>
          <a
            className="btn-ghost"
            href={`https://wa.me/?text=${encodeURIComponent(summary)}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            שליחה בוואטסאפ
          </a>
          <a
            className="btn-ghost"
            href={`mailto:?subject=${encodeURIComponent('השוואת משכנתאות')}&body=${encodeURIComponent(summary)}`}
          >
            שליחה במייל
          </a>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void navigator.clipboard?.writeText(summary)}
          >
            העתקה
          </button>
          <button type="button" className="btn-ghost ms-auto" onClick={onClose}>
            סגירה
          </button>
        </div>
      </div>
    </div>
  );
}

/** A plain-text digest that survives being pasted into WhatsApp or an email body. */
function buildSummary(result: OptimizationResponse): string {
  const { recommended, savings } = result;
  const lines = [
    'השוואת משכנתאות — תקציר',
    '',
    `סכום הלוואה: ${formatCurrency(recommended.summary.totalPrincipal)}`,
    `תקופה: ${formatTerm(recommended.summary.termMonths)}`,
    '',
    'התמהיל המומלץ:',
    ...recommended.summary.allocations.map(
      (allocation) =>
        `  • ${allocation.hebrewName}: ${formatCurrency(allocation.amount)} ` +
        `(${formatPercent(allocation.share, 0)}) בריבית ${formatPercent(allocation.annualRate)}`,
    ),
    '',
    `החזר חודשי ראשוני: ${formatCurrency(recommended.summary.initialPayment)}`,
    `החזר חודשי שיא: ${formatCurrency(recommended.summary.maxPayment)}`,
    `עלות כוללת: ${formatCurrency(recommended.summary.totalPaid)}`,
    `ריבית כוללת מתואמת: ${formatPercent(recommended.summary.nominalIrr)}`,
    '',
    'חיסכון מול הסלים האחידים:',
    ...savings.map(
      (saving) => `  • ${saving.againstName}: ${formatCurrency(saving.totalPaidSaving)}`,
    ),
    '',
    'הופק בפלטפורמת השוואת המשכנתאות. אינו מהווה ייעוץ פיננסי.',
  ];
  return lines.join('\n');
}
