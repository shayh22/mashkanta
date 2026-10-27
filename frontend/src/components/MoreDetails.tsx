import { Children, useState, type ReactNode } from 'react';
import { usePrinting } from '../lib/printing';
import { useIsPhone } from '../lib/viewport';

/**
 * The folded sections under a result. On a phone the whole group is one line — "more details · 7
 * topics" — opened on a tap, so the result is not followed by a wall of headings; on a larger
 * screen, and in print, the sections are listed as they are.
 */
export function MoreDetails({ children }: { children: ReactNode }) {
  const phone = useIsPhone();
  const printing = usePrinting();
  const [open, setOpen] = useState(false);
  const count = Children.toArray(children).length;
  if (!phone || printing) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-soft">פרטים נוספים</h2>
        {children}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-start text-sm font-semibold text-ink"
        >
          <span>
            פרטים נוספים <span className="font-normal text-ink-soft">· {count} נושאים</span>
          </span>
          <span aria-hidden className={`text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </button>
      </h2>
      {open && children}
    </div>
  );
}
