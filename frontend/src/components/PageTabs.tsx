import { useEffect, type KeyboardEvent, type ReactNode } from 'react';
import { GLIDE_CLASS, useGlide } from '../lib/glide';
import type { TermId } from '../lib/glossary';
import type { PageTab } from '../lib/pageTabs';
import { Term } from './Glossary';

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
 * An ARIA tablist that sticks under the header, drawn as underline tabs: plain labels on a hairline,
 * with one underline that glides to the selected tab (after Underline Tabs on design.yaps.ai, MIT).
 * In a right-to-left layout the left arrow moves to the next tab, which is where it visually is. On
 * a phone the row scrolls sideways.
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
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === active));
  const { items: refs, style: underline } = useGlide<HTMLButtonElement>(activeIndex);

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
  }, [active, tabs, refs]);

  return (
    <div className="no-print sticky top-[var(--header-h,57px)] z-30 -mx-4 border-b border-line bg-canvas/90 px-4 backdrop-blur-md sm:mx-0 sm:px-0">
      <div
        role="tablist"
        aria-label={label}
        className="relative flex gap-1 overflow-x-auto [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,transparent,black_28px)]"
      >
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
              className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-3 text-sm transition-colors ${
                selected ? 'font-semibold text-ink' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {tab.label}
              {tab.badge && (
                <span
                  className={`rounded-full px-1.5 text-[11px] font-semibold leading-5 ${
                    tab.badge === '!' ? 'bg-rose-500/10 text-negative' : 'bg-surface-sunken text-ink-soft'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
        {underline && (
          <span
            aria-hidden
            className={`!h-0.5 rounded-full bg-brand-600 ${GLIDE_CLASS}`}
            style={{ ...underline, top: undefined, bottom: 0 }}
          />
        )}
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

const TONE: Record<SummaryTone, { chip: string; icon: string }> = {
  positive: { chip: 'bg-emerald-500/15 text-positive', icon: '✓' },
  caution: { chip: 'bg-amber-500/15 text-caution', icon: '!' },
  negative: { chip: 'bg-rose-500/15 text-negative', icon: '✕' },
  neutral: { chip: 'bg-brand-50 text-brand-700', icon: 'i' },
};

export interface SummaryFigure {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
  readonly tone?: 'positive' | 'negative';
  /** A glossary entry for the label. */
  readonly term?: TermId;
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
      className="card overflow-hidden"
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
                <dt className="flex items-center text-xs font-medium text-ink-soft">
                  {figure.label}
                  {figure.term && <Term id={figure.term} />}
                </dt>
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
