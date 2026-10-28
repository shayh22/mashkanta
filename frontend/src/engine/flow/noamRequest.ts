import { GLOSSARY, TERM_IDS, type TermId } from '../../lib/glossary';
import { cleanText } from '../money/consultRequest';
import { redact } from '../redaction';
import { GOALS, isAnswered, type AnswerValue, type Answers, type Catalog, type Field, type Goal, type Step } from './flow';

/**
 * נועם, the questionnaire's AI guide. Asked on a screen, it explains the question, says what it
 * would choose given what the household answered so far, and fills in the answers from what they
 * wrote ("we pay about 4,800 a month, 17 years left") — for the household to confirm, never on its
 * own. A question the glossary already answers is answered from it, without asking the AI.
 *
 * What is sent: the question and its fields, the answers so far under their questions' labels, and
 * the household's message with names and identity numbers masked. No document, no business name.
 */

export const MAX_MESSAGE_LENGTH = 400;
const MAX_HISTORY = 6;
const MAX_KNOWN = 40;
const MAX_FIELDS = 8;
const MAX_OPTIONS = 8;

type AskedKind = Exclude<Field['kind'], 'upload'>;
const ASKED_KINDS: readonly AskedKind[] = ['choice', 'multi', 'money', 'number'];

export interface NoamField {
  readonly id: string;
  readonly label: string;
  readonly kind: AskedKind;
  readonly options?: readonly { readonly id: string; readonly label: string }[];
  readonly min?: number;
  readonly max?: number;
}

export interface NoamRequest {
  readonly goals: readonly Goal[];
  readonly question: { readonly title: string; readonly fields: readonly NoamField[] };
  /** What the household answered so far, as each question's label and the answer's words. */
  readonly known: readonly { readonly label: string; readonly value: string }[];
  readonly message: string;
  readonly history: readonly { readonly from: 'user' | 'noam'; readonly text: string }[];
}

export interface NoamAnswer {
  readonly reply: string;
  /** Answers it read from the message: a field's id and its value as text. */
  readonly fill: readonly { readonly field: string; readonly value: string }[];
}

export const NOAM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'fill'],
  properties: {
    reply: { type: 'string' },
    fill: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'value'],
        properties: { field: { type: 'string' }, value: { type: 'string' } },
      },
    },
  },
} as const;

const GOAL_TOPICS: Record<Goal, string> = {
  REFINANCE: 'refinancing their existing mortgage',
  BUY: 'buying a home with a mortgage',
  RECOVERY: 'getting their household account out of the red (a recovery plan)',
};

export const NOAM_INSTRUCTIONS = `You are נועם (Noam), a warm, plain-spoken guide to mortgages and household money in Israel, inside a step-by-step questionnaire. You receive what the household wants to sort out (${Object.entries(
  GOAL_TOPICS,
)
  .map(([goal, topic]) => `${goal}: ${topic}`)
  .join('; ')}), the question on their screen with its fields, what they answered so far, the conversation so far, and their message.

Do what the message calls for:
- Explain the question or a term in it, simply.
- If they ask what to choose, recommend one option for them, from what they answered, in a sentence.
- If the message states facts that answer fields of this question, put them in fill: field = the field's id; value = an option's id for a choice, option ids separated by commas for a multi, or a plain number (ILS; monthly when the label says so) for money or a number. Only fields of this question, only facts they stated — never a guess. Leave fill empty otherwise.

reply: one to three short Hebrew sentences, addressing them in the plural (אתם). When you filled answers, say which, so they can confirm. Do not invent figures. Do not recommend specific banks, lenders or products. Never repeat names, identity or account numbers. If the message is not about their money or this questionnaire, say so briefly. Return only the JSON the schema asks for.`;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(value);

/** Accepts exactly the request above, rebuilt field by field; the reason when refused. */
export function validateNoamRequest(body: unknown): NoamRequest | string {
  const record = body as Record<string, unknown> | null;
  if (!record || typeof record !== 'object') {
    return 'not an object';
  }
  const goals = Array.isArray(record.goals) ? record.goals : null;
  if (!goals || goals.length === 0 || goals.length > GOALS.length || !goals.every((goal) => (GOALS as readonly unknown[]).includes(goal))) {
    return 'bad goals';
  }
  const question = record.question as Record<string, unknown> | null;
  const title = cleanText(question?.title, 81);
  const rawFields = Array.isArray(question?.fields) ? (question.fields as Record<string, unknown>[]) : null;
  if (!title || title.length > 80 || !rawFields || rawFields.length === 0 || rawFields.length > MAX_FIELDS) {
    return 'bad question';
  }
  const fields: NoamField[] = [];
  for (const raw of rawFields) {
    const label = cleanText(raw?.label, 81);
    if (!isId(raw?.id) || !label || label.length > 80 || !(ASKED_KINDS as readonly unknown[]).includes(raw.kind)) {
      return 'bad field';
    }
    const kind = raw.kind as AskedKind;
    const field: { -readonly [K in keyof NoamField]: NoamField[K] } = { id: raw.id, label, kind };
    if (kind === 'choice' || kind === 'multi') {
      const options = Array.isArray(raw.options) ? (raw.options as Record<string, unknown>[]) : [];
      if (options.length < 2 || options.length > MAX_OPTIONS) {
        return 'bad options';
      }
      const clean = options.map((option) => ({ id: option?.id, label: cleanText(option?.label, 61) }));
      if (!clean.every((option) => isId(option.id) && option.label && option.label.length <= 60)) {
        return 'bad option';
      }
      field.options = clean as { id: string; label: string }[];
    } else {
      if (raw.min !== undefined) {
        if (!finite(raw.min)) return 'bad bounds';
        field.min = raw.min;
      }
      if (raw.max !== undefined) {
        if (!finite(raw.max)) return 'bad bounds';
        field.max = raw.max;
      }
    }
    fields.push(field);
  }
  const rawKnown = Array.isArray(record.known) ? (record.known as Record<string, unknown>[]) : null;
  if (!rawKnown || rawKnown.length > MAX_KNOWN) {
    return 'bad known';
  }
  const known: { label: string; value: string }[] = [];
  for (const item of rawKnown) {
    const label = cleanText(item?.label, 81);
    const value = cleanText(item?.value, 81);
    if (!label || label.length > 80 || !value || value.length > 80) {
      return 'bad known';
    }
    known.push({ label, value });
  }
  const message = cleanText(record.message, MAX_MESSAGE_LENGTH + 1);
  if (message.length < 2 || message.length > MAX_MESSAGE_LENGTH) {
    return 'bad message';
  }
  const rawHistory = Array.isArray(record.history) ? (record.history as Record<string, unknown>[]) : null;
  if (!rawHistory || rawHistory.length > MAX_HISTORY) {
    return 'bad history';
  }
  const history: { from: 'user' | 'noam'; text: string }[] = [];
  for (const turn of rawHistory) {
    const text = cleanText(turn?.text, 601);
    if ((turn?.from !== 'user' && turn?.from !== 'noam') || !text || text.length > 600) {
      return 'bad history';
    }
    history.push({ from: turn.from, text });
  }
  return { goals: goals as Goal[], question: { title, fields }, known, message, history };
}

export function toNoamAnswer(data: unknown): NoamAnswer | null {
  const record = data as Record<string, unknown> | null;
  if (!record || typeof record !== 'object' || typeof record.reply !== 'string') {
    return null;
  }
  const reply = cleanText(record.reply, 800);
  if (!reply) {
    return null;
  }
  const fill = (Array.isArray(record.fill) ? (record.fill as Record<string, unknown>[]) : [])
    .filter((item) => isId(item?.field) && typeof item.value === 'string')
    .map((item) => ({ field: item.field as string, value: cleanText(item.value, 80) }))
    .slice(0, MAX_FIELDS);
  return { reply, fill };
}

/** An answer in words, for the AI and for the household to read back. */
export function answerText(field: Field, value: AnswerValue): string | undefined {
  if (!isAnswered(field, value) || field.kind === 'upload') {
    return undefined;
  }
  if (field.kind === 'choice') {
    return field.options!.find((option) => option.id === value)?.label;
  }
  if (field.kind === 'multi') {
    return (value as readonly string[]).map((id) => field.options!.find((option) => option.id === id)!.label).join(', ');
  }
  return `${Math.round(value as number).toLocaleString('he-IL')}${field.unit ? ` ${field.unit}` : ''}`;
}

/** The request for a message on a screen: the question, the answers so far in words, the message masked. */
export function noamRequestFor(
  catalog: Catalog,
  goals: readonly Goal[],
  step: Step,
  answers: Answers,
  message: string,
  history: NoamRequest['history'],
): NoamRequest {
  const fields = step.fields
    .filter((field): field is Field & { kind: AskedKind } => field.kind !== 'upload')
    .map((field) => ({
      id: field.id,
      label: field.label,
      kind: field.kind,
      ...(field.options ? { options: field.options.map((option) => ({ id: option.id, label: option.label })) } : {}),
      ...(field.min !== undefined ? { min: field.min } : {}),
      ...(field.max !== undefined ? { max: field.max } : {}),
    }));
  const known = catalog.steps
    .flatMap((each) => each.fields)
    .flatMap((field) => {
      const value = answers[field.id];
      const text = value === undefined ? undefined : answerText(field, value);
      return text ? [{ label: field.label, value: text }] : [];
    })
    .slice(0, MAX_KNOWN);
  return {
    goals,
    question: { title: step.title, fields },
    known,
    message: redact(message).sanitizedText.slice(0, MAX_MESSAGE_LENGTH),
    history: history.slice(-MAX_HISTORY),
  };
}

/**
 * The answers the AI read, as values the screen takes: an option's id (or its words) for a choice,
 * ids for a multi, a number for a figure. Anything that is not a valid answer to a field of this
 * screen is dropped.
 */
export function fillsFor(step: Step, fill: NoamAnswer['fill']): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const { field: id, value } of fill) {
    const field = step.fields.find((each) => each.id === id);
    if (!field || field.kind === 'upload') {
      continue;
    }
    const option = (text: string) => field.options?.find((each) => each.id === text.trim() || each.label === text.trim())?.id;
    let parsed: AnswerValue | undefined;
    if (field.kind === 'choice') {
      parsed = option(value);
    } else if (field.kind === 'multi') {
      const ids = value.split(',').map(option);
      parsed = ids.every(Boolean) ? (ids as string[]) : undefined;
    } else {
      const number = Number(value.replace(/[,\s₪]/g, ''));
      parsed = Number.isFinite(number) ? number : undefined;
    }
    if (parsed !== undefined && isAnswered(field, parsed)) {
      out[field.id] = parsed;
    }
  }
  return out;
}

/** The glossary's own term, without the abbreviation in brackets: "קבועה לא צמודה (קל"צ)" → both. */
const namesOf = (id: TermId): string[] => {
  const term = GLOSSARY[id].term;
  const inner = /\(([^)]+)\)/.exec(term)?.[1];
  return [term.replace(/\s*\([^)]*\)/, '').trim(), ...(inner ? [inner.trim()] : [])];
};

/**
 * A "what is X?" the glossary answers: a short question naming one of its terms. The longest name
 * wins, so "קבועה לא צמודה" is not taken for something shorter inside it.
 */
export function glossaryAnswer(message: string): TermId | undefined {
  const text = message.trim();
  if (text.split(/\s+/).length > 8 || !/(^|\s)(מה|מהי|מהו|מה זה|מה זו)(\s|$)|\?$/.test(text)) {
    return undefined;
  }
  let best: { id: TermId; length: number } | undefined;
  for (const id of TERM_IDS) {
    for (const name of namesOf(id)) {
      if (name.length >= 2 && text.includes(name) && name.length > (best?.length ?? 0)) {
        best = { id, length: name.length };
      }
    }
  }
  return best?.id;
}
