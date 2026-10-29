import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY, GLOSSARY_GROUPS, TERM_IDS, type GlossaryEntry, type TermId } from '../lib/glossary';
import { useGlossary } from '../store/glossaryStore';
import { useFocusTrap } from '../lib/focusTrap';

/**
 * Hard terms explained in place. A {@link Term} is underlined where it appears; resting the pointer
 * on it, focusing it or tapping it shows its glossary entry, and the entry links to the full
 * glossary. Timing follows the Tooltip Group pattern from design.yaps.ai (MIT): the first tooltip
 * waits 400ms for the pointer to rest, neighbours open at once while the group is warm, and leaving
 * closes — after a short grace so the pointer can reach the link inside.
 */

const OPEN_DELAY = 400;
const WARM_FOR = 300;
const CLOSE_GRACE = 150;
/** Shared by every term: once one tooltip has been open, the next opens without waiting. */
const warmth = { openCount: 0, closedAt: 0 };
const isWarm = () => warmth.openCount > 0 || Date.now() - warmth.closedAt < WARM_FOR;

interface Placement {
  top: number;
  left: number;
  side: 'top' | 'bottom';
  arrowLeft: number;
}

const WIDTH = 280;
const GAP = 8;
const EDGE = 8;

function place(trigger: DOMRect, height: number): Placement {
  const fitsAbove = trigger.top - height - GAP >= EDGE;
  const side = fitsAbove ? 'top' : 'bottom';
  const centre = trigger.left + trigger.width / 2;
  const width = Math.min(WIDTH, window.innerWidth - 2 * EDGE);
  const left = Math.min(Math.max(EDGE, centre - width / 2), window.innerWidth - width - EDGE);
  return {
    side,
    top: side === 'top' ? trigger.top - height - GAP : trigger.bottom + GAP,
    left,
    arrowLeft: Math.min(Math.max(12, centre - left), width - 12),
  };
}

/**
 * A glossary term in running text. With no children it renders a small "?" after a label, for
 * places where the term is the label itself.
 */
export function Term({ id, children }: { id: TermId; children?: ReactNode }) {
  const entry: GlossaryEntry = GLOSSARY[id];
  const show = useGlossary((state) => state.show);
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement>();
  const timer = useRef<number>();

  const clear = () => window.clearTimeout(timer.current);
  const openNow = () => {
    clear();
    setOpen((was) => {
      if (!was) {
        warmth.openCount++;
      }
      return true;
    });
  };
  const closeNow = () => {
    clear();
    setOpen((was) => {
      if (was) {
        warmth.openCount = Math.max(0, warmth.openCount - 1);
        warmth.closedAt = Date.now();
      }
      return false;
    });
  };
  const closeSoon = () => {
    clear();
    timer.current = window.setTimeout(closeNow, CLOSE_GRACE);
  };

  useEffect(() => () => clear(), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      return;
    }
    const update = () => {
      if (triggerRef.current) {
        setPlacement(place(triggerRef.current.getBoundingClientRect(), surfaceRef.current?.offsetHeight ?? 90));
      }
    };
    update();
    // A second pass once the surface has its real height.
    const frame = requestAnimationFrame(update);
    window.addEventListener('scroll', closeNow, { passive: true, once: true });
    window.addEventListener('resize', update);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && closeNow();
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', closeNow);
      window.removeEventListener('resize', update);
      document.removeEventListener('keydown', onKey);
    };
    // closeNow only touches refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A tap shows the entry; a tap anywhere else puts it away.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !surfaceRef.current?.contains(target)) {
        closeNow();
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const bare = children === undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={
          bare
            ? 'ms-1 inline-flex h-4 w-4 shrink-0 translate-y-[-1px] items-center justify-center rounded-full border border-line-strong align-middle text-[10px] font-semibold leading-none text-ink-soft transition hover:border-brand-500 hover:text-brand-700'
            : 'cursor-help border-b border-dotted border-ink-soft/70 text-inherit transition hover:border-brand-500 hover:text-brand-700'
        }
        aria-label={bare ? `מה זה ${entry.term}?` : undefined}
        aria-describedby={open ? tooltipId : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType === 'touch') {
            return;
          }
          if (isWarm()) {
            openNow();
          } else {
            clear();
            timer.current = window.setTimeout(openNow, OPEN_DELAY);
          }
        }}
        onPointerLeave={(event) => event.pointerType !== 'touch' && closeSoon()}
        onFocus={(event) => event.currentTarget.matches(':focus-visible') && openNow()}
        onBlur={(event) => !surfaceRef.current?.contains(event.relatedTarget as Node) && closeNow()}
        onClick={(event) => {
          // Mouse and keyboard: hover or focus already shows the entry, so a click asks for more —
          // the full glossary. Touch has no hover: a tap toggles the entry in place.
          if ((event.nativeEvent as PointerEvent).pointerType !== 'touch') {
            closeNow();
            show(id);
          } else if (open) {
            closeNow();
          } else {
            openNow();
          }
        }}
      >
        {bare ? '?' : children}
      </button>
      {open &&
        createPortal(
          <div
            ref={surfaceRef}
            id={tooltipId}
            role="tooltip"
            dir="rtl"
            onPointerEnter={clear}
            onPointerLeave={closeSoon}
            style={{
              top: placement?.top ?? -9999,
              left: placement?.left ?? -9999,
              width: Math.min(WIDTH, window.innerWidth - 2 * EDGE),
            }}
            className="fixed z-[60] animate-fade-up rounded-xl border border-line bg-surface p-3 text-start shadow-[0_8px_24px_-8px_rgb(0_0_0/0.25)] motion-reduce:animate-none"
          >
            <p className="text-xs font-semibold text-ink">{entry.term}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{entry.short}</p>
            <button
              type="button"
              className="mt-2 text-xs font-medium text-brand-700 hover:underline"
              onClick={() => {
                closeNow();
                show(id);
              }}
            >
              במילון ←
            </button>
            <span
              aria-hidden
              className={`absolute h-2.5 w-2.5 rotate-45 border-line bg-surface ${
                placement?.side === 'bottom' ? '-top-[6px] border-s border-t' : '-bottom-[6px] border-b border-e'
              }`}
              style={{ left: (placement?.arrowLeft ?? 0) - 5 }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

/** The whole glossary, searchable, as a side sheet. Opens from the header or from any term. */
export function GlossaryPanel() {
  const { open, focus, close } = useGlossary();
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const entries = useMemo(() => {
    const q = query.trim();
    return TERM_IDS.filter((id) => {
      const entry: GlossaryEntry = GLOSSARY[id];
      return !q || entry.term.includes(q) || entry.short.includes(q);
    });
  }, [query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery('');
    const previous = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => {
      const target = focus && document.getElementById(`glossary-${focus}`);
      if (target) {
        target.scrollIntoView({ block: 'center' });
        target.focus();
      } else {
        searchRef.current?.focus();
      }
    });
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, focus, close]);

  if (!open) {
    return null;
  }

  const groups = Object.keys(GLOSSARY_GROUPS) as GlossaryEntry['group'][];

  return createPortal(
    <div className="no-print fixed inset-0 z-50" dir="rtl">
      <button type="button" aria-label="סגירת המילון" className="absolute inset-0 bg-black/30" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 start-0 flex w-full max-w-md animate-fade-up flex-col border-e border-line bg-surface shadow-2xl motion-reduce:animate-none"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            מילון מונחים
          </h2>
          <button type="button" className="btn-ghost !px-3 !py-1.5" onClick={close}>
            סגירה
          </button>
        </header>
        <div className="border-b border-line px-5 py-3">
          <input
            ref={searchRef}
            type="search"
            className="input"
            placeholder="חיפוש מונח…"
            aria-label="חיפוש במילון"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {entries.length === 0 && <p className="text-sm text-ink-soft">לא נמצא מונח כזה.</p>}
          {groups.map((group) => {
            const inGroup = entries.filter((id) => GLOSSARY[id].group === group);
            if (inGroup.length === 0) {
              return null;
            }
            return (
              <section key={group} className="mb-6">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">{GLOSSARY_GROUPS[group]}</h3>
                <dl className="space-y-3">
                  {inGroup.map((id) => {
                    const entry: GlossaryEntry = GLOSSARY[id];
                    return (
                      <div
                        key={id}
                        id={`glossary-${id}`}
                        tabIndex={-1}
                        className={`rounded-xl border p-3 outline-none ${
                          focus === id ? 'border-brand-500 bg-brand-50/60' : 'border-line'
                        }`}
                      >
                        <dt className="text-sm font-semibold text-ink">{entry.term}</dt>
                        <dd className="mt-1 text-sm text-ink-muted">{entry.short}</dd>
                        {entry.more && <dd className="mt-1 text-sm text-ink-soft">{entry.more}</dd>}
                      </div>
                    );
                  })}
                </dl>
              </section>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
