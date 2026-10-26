import type { ReactNode } from 'react';
import type { TermId } from '../lib/glossary';
import { Term } from './Glossary';

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
