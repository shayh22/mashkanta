import type { RefinanceVerdict, RouteKind } from '../refinance';
import { CATALOG } from './catalog';
import { GOALS, isAnswered, type AnswerValue, type Field, type Goal } from './flow';

/**
 * A result, shared as a link to the site. The link carries the answers — figures and choices,
 * never a name, a business or a document — after the `#`, which browsers do not send to any
 * server. Whoever opens it sees the result worked out again from those answers, at the day's
 * rates; where the result came from documents the link cannot carry (a bank's report, the
 * statements), it carries the result's own figures instead.
 */

export interface RefinanceSnapshot {
  readonly currentPayment: number;
  readonly proposedPayment: number;
  readonly monthlySaving: number;
  readonly lifetimeSaving: number;
  readonly upfrontCost: number;
  readonly breakevenMonth: number;
  readonly verdict: RefinanceVerdict;
  readonly route: RouteKind;
}

export interface RecoverySnapshot {
  readonly months: number;
  readonly today: number;
  readonly after: number;
  readonly decisions: readonly { readonly label: string; readonly monthly: number }[];
}

export interface SharedResult {
  readonly goals: readonly Goal[];
  readonly answers: Readonly<Record<string, AnswerValue>>;
  readonly refinance?: RefinanceSnapshot;
  readonly recovery?: RecoverySnapshot;
}

/** The questions whose answers a link may carry: the catalog's, plus the term tried on the details screen. */
const SHAREABLE: ReadonlyMap<string, Field> = new Map([
  ...CATALOG.steps.flatMap((step) => step.fields.filter((field) => field.kind !== 'upload').map((field) => [field.id, field] as const)),
  ['termYears', { id: 'termYears', label: 'תקופה', kind: 'number', min: 4, max: 30 }],
]);

const VERDICTS: readonly RefinanceVerdict[] = ['IMMEDIATE', 'LONG_TERM', 'NOT_WORTHWHILE'];
const ROUTES: readonly RouteKind[] = ['INTERNAL', 'EXTERNAL'];
const MAX_DECISIONS = 12;

const finite = (value: unknown, limit = 1e9): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
const text = (value: unknown, max: number) => (typeof value === 'string' && value.length > 0 && value.length <= max ? value : undefined);

/** Only answers to known questions, each a valid answer to it. */
function cleanAnswers(raw: unknown): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  if (!raw || typeof raw !== 'object') {
    return out;
  }
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const field = SHAREABLE.get(id);
    if (field && isAnswered(field, value as AnswerValue)) {
      out[id] = value as AnswerValue;
    }
  }
  return out;
}

function cleanRefinance(raw: unknown): RefinanceSnapshot | undefined {
  const r = raw as Record<string, unknown> | null;
  if (
    !r ||
    typeof r !== 'object' ||
    !['currentPayment', 'proposedPayment', 'monthlySaving', 'lifetimeSaving', 'upfrontCost', 'breakevenMonth'].every((key) => finite(r[key])) ||
    !VERDICTS.includes(r.verdict as RefinanceVerdict) ||
    !ROUTES.includes(r.route as RouteKind)
  ) {
    return undefined;
  }
  return {
    currentPayment: r.currentPayment as number,
    proposedPayment: r.proposedPayment as number,
    monthlySaving: r.monthlySaving as number,
    lifetimeSaving: r.lifetimeSaving as number,
    upfrontCost: r.upfrontCost as number,
    breakevenMonth: r.breakevenMonth as number,
    verdict: r.verdict as RefinanceVerdict,
    route: r.route as RouteKind,
  };
}

function cleanRecovery(raw: unknown): RecoverySnapshot | undefined {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || !finite(r.months, 120) || !finite(r.today) || !finite(r.after) || !Array.isArray(r.decisions)) {
    return undefined;
  }
  const decisions = (r.decisions as Record<string, unknown>[]).slice(0, MAX_DECISIONS).flatMap((decision) => {
    const label = text(decision?.label, 80);
    return label && finite(decision.monthly) ? [{ label, monthly: decision.monthly as number }] : [];
  });
  return { months: r.months as number, today: r.today as number, after: r.after as number, decisions };
}

/** The result as it can be read back: unknown answers, malformed figures and unknown goals left out. */
export function cleanShared(raw: unknown): SharedResult | undefined {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.goals)) {
    return undefined;
  }
  const goals = GOALS.filter((goal) => (r.goals as unknown[]).includes(goal));
  if (goals.length === 0) {
    return undefined;
  }
  const refinance = goals.includes('REFINANCE') ? cleanRefinance(r.refinance) : undefined;
  const recovery = goals.includes('RECOVERY') ? cleanRecovery(r.recovery) : undefined;
  return { goals, answers: cleanAnswers(r.answers), ...(refinance ? { refinance } : {}), ...(recovery ? { recovery } : {}) };
}

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text: string) => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

/** The result as the link's last part. */
export function encodeShared(result: SharedResult): string {
  const clean = cleanShared(result);
  return clean ? toBase64Url(new TextEncoder().encode(JSON.stringify({ v: 1, ...clean }))) : '';
}

/** A link's last part back as a result; undefined for anything that is not one. */
export function decodeShared(encoded: string): SharedResult | undefined {
  if (!encoded || encoded.length > 8_000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as Record<string, unknown>;
    return parsed?.v === 1 ? cleanShared(parsed) : undefined;
  } catch {
    return undefined;
  }
}

/** The link itself, on the site the household is on. */
export const sharedLink = (origin: string, result: SharedResult) => `${origin}/#/s/${encodeShared(result)}`;
