import { useId, type ReactNode } from 'react';
import type { ComplianceLevel } from '../lib/types';
import { formatCurrencyInput, parseCurrencyInput } from '../lib/format';

/** A titled card, the layout unit the whole dashboard is built from. */
export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** A single headline figure with its label and optional supporting note. */
export function Stat({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  const toneClass =
    tone === 'positive' ? 'text-emerald-600' : tone === 'negative' ? 'text-rose-600' : 'text-ink';
  return (
    <div>
      <dt className="text-xs font-medium text-ink-soft">{label}</dt>
      <dd className={`tabular mt-1 text-xl font-semibold ${toneClass}`}>{value}</dd>
      {note && <p className="mt-0.5 text-xs text-ink-soft">{note}</p>}
    </div>
  );
}

/** Traffic-light badge driven by the backend's compliance level. */
export function LevelBadge({ level, children }: { level: ComplianceLevel; children: ReactNode }) {
  const className =
    level === 'BLOCKING' ? 'badge-danger' : level === 'WARNING' ? 'badge-warn' : 'badge-ok';
  return <span className={className}>{children}</span>;
}

/** Labelled form field wrapper that wires the label to its control for screen readers. */
export function Field({
  label,
  hint,
  hintTone = 'muted',
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  hintTone?: 'muted' | 'notice';
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && (
        <p className={hintTone === 'notice' ? 'hint font-medium text-amber-600' : 'hint'}>{hint}</p>
      )}
    </div>
  );
}

/**
 * A currency input paired with a range slider.
 *
 * The text field keeps thousands separators while the user types and the slider gives the
 * coarse gesture; both write the same underlying number, so they can never disagree.
 */
export function CurrencyField({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  invalid = false,
  notice = false,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  invalid?: boolean;
  /** Draws attention to the hint without implying the value is wrong — used when a
      regulatory ceiling is holding the value below what was asked for. */
  notice?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} hintTone={notice ? 'notice' : 'muted'} htmlFor={id}>
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          {/* The symbol sits at the visual right, matching he-IL currency order. The input runs
              LTR so digit groups read correctly, which means its padding has to be logical to
              *its own* direction — pe-, not ps-, or the number collides with the symbol. */}
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-ink-soft">
            ₪
          </span>
          <input
            id={id}
            type="text"
            inputMode="numeric"
            dir="ltr"
            className={`input tabular pe-8 text-end ${invalid ? 'border-rose-400 focus:border-rose-500' : ''}`}
            value={formatCurrencyInput(value)}
            onChange={(event) => onChange(parseCurrencyInput(event.target.value))}
            aria-invalid={invalid}
          />
        </div>
      </div>
      <input
        type="range"
        className="mt-3"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={`${label} — מחוון`}
      />
    </Field>
  );
}

/** A mutually exclusive choice rendered as a button group. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; title: string; subtitle?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className={`rounded-xl border px-3 py-2.5 text-start transition ${
                selected
                  ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                  : 'border-slate-300 bg-white hover:bg-slate-50'
              }`}
            >
              <span className="block text-sm font-semibold text-ink">{option.title}</span>
              {option.subtitle && (
                <span className="mt-0.5 block text-xs text-ink-soft">{option.subtitle}</span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A labelled range control that renders its own current value. */
export function RangeField({
  label,
  hint,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="text-sm font-medium text-ink-muted" htmlFor={id}>
          {label}
        </label>
        <span className="tabular text-sm font-semibold text-ink">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

/** The wizard's step indicator. */
export function ProgressSteps({
  step,
  labels,
  onSelect,
}: {
  step: number;
  labels: string[];
  onSelect: (step: number) => void;
}) {
  return (
    <ol className="flex items-center gap-2">
      {labels.map((label, index) => {
        const number = index + 1;
        const state = number === step ? 'current' : number < step ? 'done' : 'todo';
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(number)}
              disabled={number > step}
              aria-current={state === 'current' ? 'step' : undefined}
              className="flex flex-1 items-center gap-2 text-start disabled:cursor-not-allowed"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                  state === 'current'
                    ? 'bg-brand-600 text-white'
                    : state === 'done'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 text-slate-500'
                }`}
              >
                {state === 'done' ? '✓' : number}
              </span>
              <span
                className={`hidden text-sm sm:block ${
                  state === 'todo' ? 'text-ink-soft' : 'font-medium text-ink'
                }`}
              >
                {label}
              </span>
            </button>
            {number < labels.length && <span className="h-px flex-1 bg-slate-200" aria-hidden />}
          </li>
        );
      })}
    </ol>
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

/** Error state that surfaces the backend's own Hebrew message rather than a generic string. */
export function ErrorCard({ title, message, details = [] }: { title: string; message: string; details?: string[] }) {
  return (
    <div className="card border-rose-200 bg-rose-50/50" role="alert">
      <h3 className="text-sm font-semibold text-rose-700">{title}</h3>
      <p className="mt-1 text-sm text-rose-600">{message}</p>
      {details.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-xs text-rose-600">
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
