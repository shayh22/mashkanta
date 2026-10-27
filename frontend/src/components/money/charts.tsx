import type { FlexibilityRow } from '../../engine/money/flexibility';
import { formatCurrency, formatSignedCurrency } from '../../lib/format';
import { waffleCells } from '../../lib/waffle';

/**
 * Small charts for the household journey, drawn with plain elements: each one is a single idea
 * that reads at a glance, and costs nothing to load. Colors come from the theme tokens, so they
 * follow light and dark.
 */

export interface WaffleGroup {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

/** Distinct hues that differ in lightness too, so they part in grey; the rest is grey. */
const WAFFLE_COLORS = ['bg-brand-700', 'bg-amber-500', 'bg-indigo-500', 'bg-brand-200', 'bg-rose-400', 'bg-line-strong'];

/**
 * Where a hundred shekels go: a 10×10 grid, one cell per shekel in a hundred, colored by group.
 * The grid fills by column, so each group is one band.
 */
export function Waffle({ groups, caption }: { groups: readonly WaffleGroup[]; caption: string }) {
  const cells = waffleCells(groups.map((group) => group.value));
  const total = groups.reduce((sum, group) => sum + Math.max(0, group.value), 0);
  const colorOf = groups.flatMap((_group, index) => Array.from({ length: cells[index] ?? 0 }, () => WAFFLE_COLORS[index] ?? WAFFLE_COLORS.at(-1)!));
  return (
    <figure className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div
        role="img"
        aria-label={`${caption}: ${groups.map((group, index) => `${group.label} ${cells[index]}%`).join(', ')}`}
        className="grid aspect-square w-full max-w-[220px] shrink-0 grid-flow-col grid-cols-10 grid-rows-10 gap-1"
      >
        {colorOf.map((color, index) => (
          <span key={index} className={`rounded-[3px] ${color} transition-colors duration-500`} />
        ))}
      </div>
      <figcaption className="min-w-0 flex-1 space-y-2">
        <p className="text-xs text-ink-soft">{caption}</p>
        <ul className="space-y-1.5">
          {groups.map((group, index) => (
            <li key={group.key} className="flex items-center gap-2 text-sm">
              <span aria-hidden className={`h-3 w-3 shrink-0 rounded-[3px] ${WAFFLE_COLORS[index] ?? WAFFLE_COLORS.at(-1)}`} />
              <span className="min-w-0 flex-1 truncate text-ink">{group.label}</span>
              <span className="tabular text-ink-muted">{formatCurrency(group.value)}</span>
              <span className="tabular w-10 text-end font-semibold text-ink">{total > 0 ? `${cells[index]}%` : '—'}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

const SEGMENTS = [
  { key: 'must', label: 'חובה', className: 'bg-brand-700' },
  { key: 'reduce', label: 'אפשר לצמצם', className: 'bg-brand-200' },
  { key: 'cancel', label: 'אפשר לבטל', className: 'bg-amber-400' },
  { key: 'open', label: 'לא הוסבר', className: 'bg-line-strong' },
] as const;

/**
 * Each category as one bar, split by what the household said about it — a must, could be cut,
 * could be cancelled, not yet explained — with a marker where a target sits. The bullet chart's
 * idea: the actual against the goal, on one shared scale.
 */
export function FlexibilityBars({ rows }: { rows: readonly FlexibilityRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.must + row.reduce + row.cancel + row.open));
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted" aria-hidden>
        {SEGMENTS.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm border border-line ${segment.className}`} />
            {segment.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-ink" />
          יעד
        </li>
      </ul>
      <ul className="space-y-2.5" aria-label="כל קטגוריה לפי מה שאפשר לוותר עליו">
        {rows.map((row) => {
          const total = row.must + row.reduce + row.cancel + row.open;
          return (
            <li
              key={row.key}
              aria-label={`${row.label}: ${formatCurrency(total)} בחודש — חובה ${formatCurrency(row.must)}, לצמצם ${formatCurrency(row.reduce)}, לבטל ${formatCurrency(row.cancel)}${row.target !== undefined ? `, יעד ${formatCurrency(row.target)}` : ''}`}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate text-ink">{row.label}</span>
                <span className="tabular text-ink-muted">
                  {row.target !== undefined ? (
                    <>
                      {formatCurrency(total)} ← <span className="font-semibold text-ink">{formatCurrency(row.target)}</span>
                    </>
                  ) : (
                    formatCurrency(total)
                  )}
                </span>
              </div>
              <div className="relative h-3 rounded-full bg-surface-muted" aria-hidden>
                <div className="flex h-3 overflow-hidden rounded-full" style={{ width: `${(total / max) * 100}%` }}>
                  {SEGMENTS.map((segment) => {
                    const value = row[segment.key];
                    return value > 0 ? (
                      <span key={segment.key} className={`${segment.className} transition-all duration-500`} style={{ width: `${(value / total) * 100}%` }} />
                    ) : null;
                  })}
                </div>
                {row.target !== undefined && (
                  <span className="absolute -top-1 h-5 w-0.5 rounded bg-ink" style={{ insetInlineStart: `${(row.target / max) * 100}%` }} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const BEFORE_X = 300;
const AFTER_X = 100;

export interface SlopeSeries {
  readonly key: string;
  readonly label: string;
  readonly before: number;
  readonly after: number;
  /** Whether a rise is good (money left) or bad (spending). */
  readonly higherIsBetter: boolean;
}

/**
 * Before and after, as slopes: each figure today on one side and after the decisions on the
 * other, joined by a line that rises or falls. Green when the move is for the better.
 */
export function SlopeCompare({ series, beforeLabel = 'היום', afterLabel = 'אחרי' }: { series: readonly SlopeSeries[]; beforeLabel?: string; afterLabel?: string }) {
  const values = series.flatMap((s) => [s.before, s.after]);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const height = 220;
  const pad = 22;
  const y = (value: number) => pad + (1 - (value - min) / (max - min || 1)) * (height - 2 * pad);
  const better = (s: SlopeSeries) => (s.higherIsBetter ? s.after >= s.before : s.after <= s.before);
  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 400 ${height}`}
        className="h-56 w-full"
        role="img"
        aria-label={series.map((s) => `${s.label}: ${formatCurrency(s.before)} ${beforeLabel}, ${formatCurrency(s.after)} ${afterLabel}`).join('; ')}
      >
        {min < 0 && <line x1="70" x2="330" y1={y(0)} y2={y(0)} className="stroke-line-strong" strokeDasharray="4 4" />}
        {/* Right to left, as the page reads: today on the right, after on the left. */}
        <text x={BEFORE_X} y="14" textAnchor="middle" className="fill-ink-soft text-[11px]">
          {beforeLabel}
        </text>
        <text x={AFTER_X} y="14" textAnchor="middle" className="fill-ink-soft text-[11px]">
          {afterLabel}
        </text>
        {series.map((s) => {
          const tone = better(s) ? 'rgb(var(--positive))' : 'rgb(var(--negative))';
          return (
            <g key={s.key}>
              <line x1={BEFORE_X} x2={AFTER_X} y1={y(s.before)} y2={y(s.after)} stroke={tone} strokeWidth="2.5" strokeLinecap="round" />
              <circle cx={BEFORE_X} cy={y(s.before)} r="4.5" className="fill-ink-soft" />
              <circle cx={AFTER_X} cy={y(s.after)} r="5.5" fill={tone} />
              <text x={BEFORE_X + 10} y={y(s.before) + 4} textAnchor="start" className="fill-ink-muted text-[11px]" direction="ltr">
                {formatCurrency(s.before)}
              </text>
              <text x={AFTER_X - 10} y={y(s.after) + 4} textAnchor="end" className="fill-ink text-[12px] font-semibold" direction="ltr">
                {formatCurrency(s.after)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${better(s) ? 'bg-positive' : 'bg-negative'}`} />
              <span className="text-ink">{s.label}</span>
              <span className={`tabular font-semibold ${better(s) ? 'text-positive' : 'text-negative'}`}>{formatSignedCurrency(s.after - s.before)}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

/**
 * What each decision frees a month, as bars on one scale — readable whether the savings are tens
 * of shekels or thousands, which a waterfall over the whole budget is not.
 */
export function DecisionBars({ items }: { items: readonly { key: string; label: string; monthly: number }[] }) {
  const max = Math.max(1, ...items.map((item) => item.monthly));
  const total = items.reduce((sum, item) => sum + item.monthly, 0);
  return (
    <figure className="space-y-2">
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-ink">{item.label}</span>
              <span className="tabular font-semibold text-positive">{formatCurrency(item.monthly)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-surface-muted" aria-hidden>
              <div className="h-2.5 rounded-full bg-positive/80 transition-all duration-500" style={{ width: `${Math.max(2, (item.monthly / max) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <figcaption className="flex justify-between border-t border-line pt-2 text-sm font-semibold text-ink">
        <span>יחד בחודש</span>
        <span className="tabular text-positive">{formatCurrency(total)}</span>
      </figcaption>
    </figure>
  );
}
