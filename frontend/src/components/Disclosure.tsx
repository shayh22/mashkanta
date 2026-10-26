import { useId, useState, type ReactNode } from 'react';
import { usePrinting } from '../lib/printing';

/**
 * A closed section under the result: its title and a one-line summary show; the detail mounts only
 * when opened, so charts are not drawn for sections nobody reads. Printing opens every section, so a
 * printed report is complete.
 */
export function Disclosure({
  title,
  summary,
  open: controlledOpen,
  onToggle,
  id,
  children,
}: {
  title: string;
  summary?: string;
  /** Controlled from outside, for a button elsewhere that opens this section. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  id?: string;
  children: ReactNode;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const printing = usePrinting();
  const open = printing || (controlledOpen ?? ownOpen);
  const panelId = useId();

  const toggle = () => {
    const next = !open;
    if (controlledOpen === undefined) {
      setOwnOpen(next);
    }
    onToggle?.(next);
  };

  return (
    <section id={id} className="rounded-2xl border border-line bg-surface">
      <h3>
        <button
          type="button"
          className="no-print flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-start transition hover:bg-surface-muted"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{title}</span>
            {summary && <span className="mt-0.5 block truncate text-xs text-ink-soft">{summary}</span>}
          </span>
          <span
            aria-hidden
            className={`shrink-0 text-ink-soft transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </button>
        <span className="hidden text-base font-semibold text-ink print:block print:px-5 print:pt-4">{title}</span>
      </h3>
      {open && (
        <div id={panelId} className="space-y-5 border-t border-line p-4 sm:p-5">
          {children}
        </div>
      )}
    </section>
  );
}
