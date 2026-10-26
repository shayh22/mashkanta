import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { PageTab } from '../lib/pageTabs';

/**
 * Section tabs inside a mode: one topic on screen at a time instead of four to nine screens of
 * cards. The chosen tab lives in the URL (`#/refinance/results`), so it survives a reload and can be
 * linked to, and the bottom line stays visible above the tabs in a {@link SummaryBar}.
 */

/**
 * After a switch, bring the top of the new section into view — but only if the reader had scrolled
 * past it; a short page should not jump. The offset clears the sticky header and tab bar.
 */
function revealSection(idPrefix: string) {
  const panel = document.getElementById(`${idPrefix}-panel`);
  if (!panel) {
    return;
  }
  const top = Math.max(0, panel.getBoundingClientRect().top + window.scrollY - 130);
  if (window.scrollY > top) {
    window.scrollTo({ top });
  }
}

/**
 * An ARIA tablist that sticks under the header. In a right-to-left layout the left arrow moves to
 * the next tab, which is where it visually is. On a phone the row scrolls sideways.
 */
export function PageTabs<T extends string>({
  label,
  idPrefix,
  tabs,
  active,
  onSelect,
}: {
  label: string;
  idPrefix: string;
  tabs: readonly PageTab<T>[];
  active: T;
  onSelect: (id: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (index: number) => {
    onSelect(tabs[index]!.id);
    refs.current[index]?.focus();
    requestAnimationFrame(() => revealSection(idPrefix));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0;
    let target = index + step;
    if (event.key === 'Home') {
      target = 0;
    } else if (event.key === 'End') {
      target = tabs.length - 1;
    } else if (step === 0) {
      return;
    }
    event.preventDefault();
    choose((target + tabs.length) % tabs.length);
  };

  useEffect(() => {
    // Keep the active tab visible in the sideways-scrolling row on a phone.
    refs.current[tabs.findIndex((tab) => tab.id === active)]?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [active, tabs]);

  return (
    <div
      className="no-print sticky top-[var(--header-h,61px)] z-30 -mx-4 border-b border-line/70 bg-canvas/85 px-4 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:bg-surface/85 sm:px-1.5 sm:shadow-card"
    >
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto py-1.5 [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,transparent,black_28px)]">
        {tabs.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                refs.current[index] = element;
              }}
              id={`${idPrefix}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${
                selected
                  ? 'bg-brand-600 text-white shadow-glow'
                  : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
              }`}
            >
              <span aria-hidden>{tab.icon}</span>
              {tab.label}
              {tab.badge && (
                <span
                  className={`rounded-full px-1.5 text-[11px] font-semibold leading-5 ${
                    selected ? 'bg-white text-[#3730a3]' : 'bg-surface-sunken text-ink-muted'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The active section, with a step back and forward along the tabs underneath it. */
export function TabPanel<T extends string>({
  idPrefix,
  tabs,
  active,
  onSelect,
  children,
}: {
  idPrefix: string;
  tabs: readonly PageTab<T>[];
  active: T;
  onSelect: (id: T) => void;
  children: ReactNode;
}) {
  const index = tabs.findIndex((tab) => tab.id === active);
  const previous = tabs[index - 1];
  const next = tabs[index + 1];
  const go = (id: T) => {
    onSelect(id);
    requestAnimationFrame(() => revealSection(idPrefix));
  };

  return (
    <div
      id={`${idPrefix}-panel`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${active}`}
      tabIndex={0}
      className="animate-fade-up space-y-5 focus:outline-none"
      key={active}
    >
      {children}
      {(previous || next) && (
        <nav className="no-print flex items-center justify-between gap-3 pt-1" aria-label="מעבר בין חלקים">
          {previous ? (
            <button type="button" className="btn-ghost" onClick={() => go(previous.id)}>
              <span aria-hidden>→</span> {previous.label}
            </button>
          ) : (
            <span />
          )}
          {next && (
            <button type="button" className="btn-primary" onClick={() => go(next.id)}>
              הבא: {next.label} <span aria-hidden>←</span>
            </button>
          )}
        </nav>
      )}
    </div>
  );
}

export type SummaryTone = 'positive' | 'caution' | 'negative' | 'neutral';

const TONE: Record<SummaryTone, { ring: string; chip: string; icon: string }> = {
  positive: { ring: 'from-emerald-500/15', chip: 'bg-emerald-500/15 text-positive', icon: '✓' },
  caution: { ring: 'from-amber-500/15', chip: 'bg-amber-500/15 text-caution', icon: '!' },
  negative: { ring: 'from-rose-500/15', chip: 'bg-rose-500/15 text-negative', icon: '✕' },
  neutral: { ring: 'from-brand-500/10', chip: 'bg-brand-50 text-brand-700', icon: 'i' },
};

export interface SummaryFigure {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
  readonly tone?: 'positive' | 'negative';
}

/** The bottom line of a mode, kept above the tabs so it is in view whichever section is open. */
export function SummaryBar({
  label,
  tone,
  eyebrow,
  title,
  figures,
  action,
}: {
  label: string;
  tone: SummaryTone;
  eyebrow?: string;
  title: string;
  figures: readonly SummaryFigure[];
  action?: ReactNode;
}) {
  const style = TONE[tone];
  return (
    <section
      aria-label={label}
      aria-live="polite"
      className={`card overflow-hidden bg-gradient-to-l ${style.ring} via-surface/90 to-surface/90`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-start gap-3 lg:w-[34%]">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg font-bold ${style.chip}`}
            aria-hidden
          >
            {style.icon}
          </span>
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-medium text-ink-soft">{eyebrow}</p>}
            <h2 className="text-lg font-bold leading-snug text-ink">{title}</h2>
            {action && <div className="mt-2">{action}</div>}
          </div>
        </div>
        {figures.length > 0 && (
          <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 border-line/70 sm:grid-cols-4 lg:border-s lg:ps-5">
            {figures.map((figure) => (
              <div key={figure.label} className="min-w-0">
                <dt className="text-xs font-medium text-ink-soft">{figure.label}</dt>
                <dd
                  className={`tabular mt-0.5 text-lg font-semibold sm:text-xl ${
                    figure.tone === 'positive' ? 'text-positive' : figure.tone === 'negative' ? 'text-negative' : 'text-ink'
                  }`}
                >
                  {figure.value}
                </dd>
                {figure.note && <dd className="text-xs text-ink-soft">{figure.note}</dd>}
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
