import { useId, type CSSProperties, type ReactNode } from 'react';
import type { ComplianceLevel } from '../lib/types';
import { formatCurrencyInput, parseCurrencyInput } from '../lib/format';
import { GLIDE_CLASS, useGlide } from '../lib/glide';
import type { TermId } from '../lib/glossary';
import { Term } from './Glossary';

/** A titled card, the layout unit the whole dashboard is built from. */
export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
  term,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** A glossary entry that explains the card's subject, shown as a "?" after the title. */
  term?: TermId;
}) {
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

/** A single headline figure with its label and optional supporting note. */
export function Stat({
  label,
  value,
  note,
  tone = 'neutral',
  term,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'neutral' | 'positive' | 'negative';
  term?: TermId;
}) {
  const toneClass =
    tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink';
  return (
    <div>
      <dt className="flex items-center text-xs font-medium text-ink-soft">
        {label}
        {term && <Term id={term} />}
      </dt>
      <dd className={`tabular mt-1 text-xl font-semibold ${toneClass}`}>{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-ink-soft">{note}</dd>}
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
  term,
}: {
  label: string;
  hint?: string;
  hintTone?: 'muted' | 'notice';
  children: ReactNode;
  htmlFor?: string;
  term?: TermId;
}) {
  return (
    <div>
      <div className="label flex items-center">
        <label htmlFor={htmlFor}>{label}</label>
        {term && <Term id={term} />}
      </div>
      {children}
      {hint && (
        <p className={hintTone === 'notice' ? 'hint font-medium text-caution' : 'hint'}>{hint}</p>
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
  term,
}: {
  label: string;
  hint?: string;
  term?: TermId;
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
    <Field label={label} hint={hint} hintTone={notice ? 'notice' : 'muted'} htmlFor={id} term={term}>
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

/**
 * A mutually exclusive choice as one segmented pill: the selected option is lifted by a thumb that
 * glides between options (after Segmented Control on design.yaps.ai, MIT). Only the selected
 * option's subtitle shows, under the control — one line of explanation instead of one per option.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  term,
}: {
  label: string;
  value: T;
  options: { value: T; title: string; subtitle?: string }[];
  onChange: (value: T) => void;
  term?: TermId;
}) {
  const active = Math.max(0, options.findIndex((option) => option.value === value));
  const { items, style } = useGlide<HTMLButtonElement>(active);
  const subtitle = options[active]?.subtitle;
  const columns = options.length <= 3 ? 'grid-cols-[repeat(var(--n),minmax(0,1fr))]' : 'grid-cols-2 sm:grid-cols-[repeat(var(--n),minmax(0,1fr))]';

  return (
    <fieldset>
      <legend className="label">
        {label}
        {term && <Term id={term} />}
      </legend>
      <div
        className={`relative grid gap-1 rounded-xl bg-surface-sunken p-1 ${columns}`}
        style={{ '--n': options.length } as CSSProperties}
      >
        {style && <span aria-hidden className={`rounded-lg border border-line bg-surface shadow-card ${GLIDE_CLASS}`} style={style} />}
        {options.map((option, index) => {
          const selected = index === active;
          return (
            <button
              key={option.value}
              ref={(element) => {
                items.current[index] = element;
              }}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className={`relative z-10 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                selected ? 'text-ink' : 'text-ink-soft hover:text-ink'
              } ${!style && selected ? 'bg-surface shadow-card' : ''}`}
            >
              {option.title}
            </button>
          );
        })}
      </div>
      {subtitle && <p className="hint">{subtitle}</p>}
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
  term,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
  term?: TermId;
}) {
  const id = useId();
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="flex items-center">
          <label className="text-sm font-medium text-ink-muted" htmlFor={id}>
            {label}
          </label>
          {term && <Term id={term} />}
        </span>
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
                    ? 'bg-brand-600 text-on-brand'
                    : state === 'done'
                      ? 'bg-brand-100 text-brand-700'
                      : 'bg-surface-sunken text-ink-soft'
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
            {number < labels.length && <span className="h-px flex-1 bg-line" aria-hidden />}
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
    <div className="card border-rose-500/30 bg-rose-500/10" role="alert">
      <h3 className="text-sm font-semibold text-negative">{title}</h3>
      <p className="mt-1 text-sm text-negative">{message}</p>
      {details.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-xs text-negative">
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A compact numeric cell for editable tables. `scale` lets a percentage field show 4.5 while the
 * engine stores 0.045, so no component ever multiplies by 100 by hand.
 */
export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  scale = 1,
  digits = 2,
  className = '',
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  scale?: number;
  digits?: number;
  className?: string;
}) {
  return (
    <input
      className={`input tabular py-1.5 ${className}`}
      type="number"
      dir="ltr"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      aria-label={label}
      value={Number((value * scale).toFixed(digits))}
      onChange={(event) => {
        const parsed = Number(event.target.value);
        onChange(Number.isFinite(parsed) ? parsed / scale : 0);
      }}
    />
  );
}

/** An accessible on/off switch. */
export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
          checked ? 'bg-brand-600' : 'bg-line-strong'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? '-translate-x-[22px]' : '-translate-x-0.5'
          }`}
          aria-hidden
        />
      </button>
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm font-medium text-ink-muted">{label}</span>
        {hint && <span className="hint mt-0.5 block">{hint}</span>}
      </label>
    </div>
  );
}

/**
 * A horizontally scrollable wrapper for wide tables. It is focusable and labelled so keyboard users
 * can scroll it too (WCAG 2.1.1); the negative margin keeps focus rings from being clipped.
 */
export function ScrollRegion({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div
      className={`-mx-1 overflow-x-auto px-1 focus-visible:ring-offset-0 ${className}`}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
