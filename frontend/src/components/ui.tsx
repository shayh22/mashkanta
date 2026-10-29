import { useId, useState, type ReactNode } from 'react';
import { usePrinting } from '../lib/printing';
import { useIsPhone } from '../lib/viewport';
import type { TermId } from '../lib/glossary';
import { Term } from './Glossary';

/**
 * A titled card, the layout unit the whole dashboard is built from. Given `fold` — one line that
 * says what is inside — it folds on a phone into its title and that line, and opens on a tap; on a
 * larger screen, and in print, it is always open.
 */
export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
  term,
  fold,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** A glossary entry that explains the card's subject, shown as a "?" after the title. */
  term?: TermId;
  /** The one-line summary a folded card shows on a phone; without it the card never folds. */
  fold?: string;
}) {
  const phone = useIsPhone();
  const printing = usePrinting();
  const [open, setOpen] = useState(false);
  const panel = useId();
  if (fold !== undefined && title && phone && !printing) {
    return (
      <section className={`card ${className}`}>
        <h2>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panel}
            onClick={() => setOpen(!open)}
            className="flex w-full items-start justify-between gap-3 text-start"
          >
            <span className="min-w-0">
              <span className="block text-base font-semibold text-ink">{title}</span>
              <span className="mt-0.5 block text-sm font-normal text-ink-soft">{open && subtitle ? subtitle : fold}</span>
            </span>
            <span aria-hidden className={`mt-1 shrink-0 text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`}>
              ▾
            </span>
          </button>
        </h2>
        {open && (
          <div id={panel} className="mt-4">
            {action && <div className="mb-3">{action}</div>}
            {children}
          </div>
        )}
      </section>
    );
  }
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="text-base font-semibold text-ink">
                {title}
                {term && <Term id={term} />}
              </h2>
            )}
            {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** Skeleton shown while a calculation is in flight. */
export function LoadingCard({ message }: { message: string }) {
  return (
    <div className="card flex items-center gap-3">
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600"
        aria-hidden
      />
      <p className="text-sm text-ink-muted">{message}</p>
    </div>
  );
}
