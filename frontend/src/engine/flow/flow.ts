import type { TermId } from '../../lib/glossary';

/**
 * The questionnaire: what the household wants to sort out, then one question a screen, each with
 * the follow-up questions its answer opens. The questions are data (see `catalog.ts`); this file
 * says which of them apply, whether a screen is answered, and where the household is.
 */

export const GOALS = ['REFINANCE', 'BUY', 'RECOVERY'] as const;
export type Goal = (typeof GOALS)[number];

/** An upload the household chose to skip for now. */
export const LATER = 'LATER';

export type AnswerValue = string | number | boolean | readonly string[];
export type Answers = Readonly<Record<string, AnswerValue>>;

export interface Choice {
  readonly id: string;
  readonly label: string;
}

/**
 * - `choice`: one of `options`, as large buttons.
 * - `multi`: any of `options`.
 * - `money` / `number`: a figure, between `min` and `max`.
 * - `upload`: a document read in the browser; answered once it has been read (the page says so), or
 *   put off for later (`LATER`).
 */
export type FieldKind = 'choice' | 'multi' | 'money' | 'number' | 'upload';
export type UploadKind = 'mortgage' | 'loans' | 'statements';

export interface Field {
  readonly id: string;
  readonly label: string;
  readonly kind: FieldKind;
  readonly options?: readonly Choice[];
  readonly min?: number;
  readonly max?: number;
  readonly unit?: string;
  readonly placeholder?: string;
  /** Can be left empty and the screen still counts as answered. */
  readonly optional?: boolean;
  readonly upload?: UploadKind;
  /** A follow-up: shown only once the answers so far call for it. */
  readonly when?: (answers: Answers) => boolean;
}

export type SectionId = 'mortgage' | 'home' | 'household' | 'statements' | 'loans';

export interface Step {
  readonly id: string;
  readonly section: SectionId;
  /** The question, as the screen's heading. */
  readonly title: string;
  /** The glossary entry the "?" opens first, before anyone asks the AI. */
  readonly help?: TermId;
  readonly fields: readonly Field[];
  /** A list of like questions, each its own row, rather than one question and its follow-ups. */
  readonly list?: boolean;
  /** Asked only when this holds. */
  readonly when?: (answers: Answers, goals: ReadonlySet<Goal>) => boolean;
}

export interface Section {
  readonly id: SectionId;
  readonly label: string;
  /** Asked for any of these goals; a section shared by several goals is asked once. */
  readonly goals: readonly Goal[];
}

export interface Catalog {
  readonly sections: readonly Section[];
  readonly steps: readonly Step[];
}

/** The screens for the goals chosen, in the catalog's order, each section once. */
export function stepsFor(catalog: Catalog, goals: readonly Goal[], answers: Answers): Step[] {
  const chosen = new Set(goals);
  const sections = new Set(catalog.sections.filter((section) => section.goals.some((goal) => chosen.has(goal))).map((section) => section.id));
  const order = catalog.sections.map((section) => section.id);
  return catalog.steps
    .filter((step) => sections.has(step.section) && (step.when?.(answers, chosen) ?? true))
    .sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
}

/** The fields a screen shows now: its question and the follow-ups the answers opened. */
export function visibleFields(step: Step, answers: Answers): Field[] {
  return step.fields.filter((field) => field.when?.(answers) ?? true);
}

/** Whether a value is a complete answer to a field. */
export function isAnswered(field: Field, value: AnswerValue | undefined): boolean {
  switch (field.kind) {
    case 'choice':
      return typeof value === 'string' && (field.options ?? []).some((option) => option.id === value);
    case 'multi':
      return Array.isArray(value) && value.length > 0 && value.every((id) => (field.options ?? []).some((option) => option.id === id));
    case 'money':
    case 'number':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= (field.min ?? (field.kind === 'money' ? 0 : -Infinity)) &&
        value <= (field.max ?? Infinity)
      );
    case 'upload':
      return value === true || value === LATER;
  }
}

/** Whether every field the screen shows is answered, or may stay empty. */
export function stepComplete(step: Step, answers: Answers): boolean {
  return visibleFields(step, answers).every((field) => field.optional || isAnswered(field, answers[field.id]));
}

export interface Progress {
  /** From 0; -1 when the screen is not among them. */
  readonly index: number;
  readonly total: number;
  readonly section?: Section;
}

export function progressOf(catalog: Catalog, steps: readonly Step[], stepId: string | undefined): Progress {
  const index = steps.findIndex((step) => step.id === stepId);
  const step = steps[index];
  return {
    index,
    total: steps.length,
    ...(step ? { section: catalog.sections.find((section) => section.id === step.section) } : {}),
  };
}

/** Where to pick up: the first screen not yet answered, or undefined when all are. */
export function firstOpen(steps: readonly Step[], answers: Answers): string | undefined {
  return steps.find((step) => !stepComplete(step, answers))?.id;
}

/** The screen after or before this one; undefined at either end. */
export function neighbour(steps: readonly Step[], stepId: string, direction: 1 | -1): string | undefined {
  const index = steps.findIndex((step) => step.id === stepId);
  return index < 0 ? undefined : steps[index + direction]?.id;
}
