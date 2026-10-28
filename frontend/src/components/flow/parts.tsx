import type { ReactNode } from 'react';
import { TRACK_COLORS } from '../../lib/trackColors';
import type { TrackType } from '../../lib/types';

/** The pieces the result screens and their details are built of, in the questionnaire's look. */


/** `className="no-print"` for a panel that is all controls: on paper, the decisions it led to stand for it. */
export function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`flex flex-col gap-3 rounded-[20px] bg-flow-card p-4 ${className}`}>
      <h3 className="text-base font-extrabold">{title}</h3>
      {children}
    </section>
  );
}

export function Rows({ rows }: { rows: readonly (readonly [ReactNode, ReactNode, boolean?])[] }) {
  return (
    <dl className="flex flex-col">
      {rows.map(([label, value, strong], index) => (
        <div key={index} className={`flex min-h-12 items-center justify-between gap-3 border-b border-flow-line py-2 last:border-b-0 ${strong ? 'font-extrabold' : ''}`}>
          <dt className="text-[15px]">{label}</dt>
          <dd className="text-[15px] font-bold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const Dot = ({ type }: { type: TrackType }) => <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: TRACK_COLORS[type] }} />;
