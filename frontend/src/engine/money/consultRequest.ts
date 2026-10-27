import type { Explanations } from './explanations';
import type { MonthlyPicture } from './picture';
import { knownSaving, savingIdeas, type SavingKind } from './savings';

/**
 * "Tell the AI" on each screen of the journey: the household adds what the numbers do not say
 * ("the August income included a bonus", "the insurer charge is a pension loan"), and gets a short
 * answer about what is on that screen. The facts sent are the screen's totals, built here with
 * fixed labels — category names and amounts, never a business name, a date or an account.
 */

export const CONSULT_STEPS = ['flow', 'spending', 'debts', 'savings', 'summary'] as const;
export type ConsultStep = (typeof CONSULT_STEPS)[number];

export const MAX_QUESTION_LENGTH = 400;
const MAX_FACTS = 40;

export interface ConsultFact {
  readonly label: string;
  readonly value: number;
}

export interface ConsultRequest {
  readonly step: ConsultStep;
  readonly question: string;
  readonly facts: readonly ConsultFact[];
}

export interface ConsultAnswer {
  readonly answer: string;
  readonly points: readonly string[];
}

export const CONSULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'points'],
  properties: {
    answer: { type: 'string' },
    points: { type: 'array', items: { type: 'string' } },
  },
} as const;

const STEP_TOPICS: Record<ConsultStep, string> = {
  flow: 'what comes in and goes out each month, one-off money, and the account balance and overdraft',
  spending: 'where the money goes: spending by category, and what the household marked as a must, possible to cut or cancel',
  debts: 'the mortgage, loans and overdraft: monthly repayments and the moves that could lower them',
  savings: 'where the household can save: the ideas found in its statements and what each saves',
  summary: 'the decisions the household chose and the month before and after them',
};

export const CONSULT_INSTRUCTIONS = `You are a careful household budget advisor in Israel. The household is going through its finances screen by screen. You receive which screen they are on, the facts shown on it (ILS amounts, monthly unless the label says otherwise), and what they wrote — context the numbers do not show, or a question.

The screens: ${Object.entries(STEP_TOPICS)
  .map(([step, topic]) => `${step} — ${topic}`)
  .join('; ')}.

Answer about this screen, taking what they wrote into account: if they explain a figure (a bonus, a loan named after an insurer), read the figures in that light. answer: two to four short Hebrew sentences, addressed to them in the plural (אתם). points: up to three short, concrete things to do or check on this screen, or none. Use only the figures given and what they wrote; do not invent figures. Do not recommend specific investment products, banks or companies. If what they wrote is not about their money, say so briefly. Return only the JSON the schema asks for.`;

const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export const cleanText = (value: unknown, max: number) =>
  typeof value === 'string'
    ? [...value].map((char) => (char < ' ' || char === '\u007f' ? ' ' : char)).join('').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';

/** Accepts exactly the request above, rebuilt field by field; the reason when refused. */
export function validateConsultRequest(body: unknown): ConsultRequest | string {
  const record = body as Record<string, unknown> | null;
  if (!record || typeof record !== 'object') {
    return 'not an object';
  }
  if (!(CONSULT_STEPS as readonly unknown[]).includes(record.step)) {
    return 'bad step';
  }
  const question = cleanText(record.question, MAX_QUESTION_LENGTH + 1);
  if (question.length < 3 || question.length > MAX_QUESTION_LENGTH) {
    return 'bad question';
  }
  const facts = Array.isArray(record.facts) ? (record.facts as Record<string, unknown>[]) : null;
  if (!facts || facts.length === 0 || facts.length > MAX_FACTS) {
    return 'bad facts';
  }
  const clean: ConsultFact[] = [];
  for (const fact of facts) {
    const label = cleanText(fact?.label, 61);
    if (!label || label.length > 60 || !finite(fact.value, -1e8, 1e8)) {
      return 'bad fact';
    }
    clean.push({ label, value: fact.value });
  }
  return { step: record.step as ConsultStep, question, facts: clean };
}

export function toConsultAnswer(data: unknown): ConsultAnswer | null {
  const record = data as Record<string, unknown> | null;
  if (!record || typeof record !== 'object' || typeof record.answer !== 'string') {
    return null;
  }
  return {
    answer: cleanText(record.answer, 600),
    points: (Array.isArray(record.points) ? record.points : []).map((point) => cleanText(point, 200)).filter(Boolean).slice(0, 3),
  };
}

const IDEA_LABELS: Record<SavingKind, string> = {
  CANCEL: 'מה שסימנו לביטול',
  REDUCE: 'מה שסימנו שאפשר לצמצם',
  OVERDRAFT: 'ריבית על המינוס',
  LOANS: 'החזרי הלוואות',
  FEES: 'עמלות ודמי כרטיס',
  RISING: 'קטגוריה שקפצה בחודש האחרון',
  RECURRING: 'חיובים חוזרים לבדיקה',
  INSURANCE: 'ביטוחים',
  CASH: 'משיכות מזומן',
  MORTGAGE: 'החזר משכנתא',
};

const round = Math.round;

/** The figures a screen shows, as the facts its AI box sends. */
export function factsFor(step: ConsultStep, picture: MonthlyPicture, explanations: Explanations = {}): ConsultFact[] {
  const facts: ConsultFact[] = [];
  const add = (label: string, value: number) => facts.push({ label, value: round(value) });
  const { overdraft } = picture;
  if (step === 'flow' || step === 'summary') {
    add('הכנסה חודשית ממוצעת', picture.income);
    add('הוצאה חודשית ממוצעת', picture.spending);
    add('נשאר בחודש', picture.income - picture.spending);
    add('מספר חודשים בחישוב', picture.months.length);
  }
  if (step === 'flow') {
    add('כסף חד-פעמי שנכנס בתקופה (לא נספר כהכנסה)', picture.oneOff.reduce((sum, t) => sum + t.amount, 0));
    for (const line of picture.incomeLines) {
      add(`הכנסה: ${line.label}`, line.monthly);
    }
    if (overdraft) {
      add('חודשים שבהם החשבון ירד למינוס', overdraft.monthsBelow);
      add('היתרה הנמוכה ביותר', overdraft.lowest);
      add('ריבית מינוס בחודש', overdraft.interestMonthly);
    }
  }
  if (step === 'spending' || step === 'debts') {
    add('הוצאות קבועות בחודש', picture.fixed);
    const lines = step === 'debts' ? picture.spendingLines.filter((l) => ['HOUSING_LOANS', 'LOANS', 'FEES'].includes(l.id)) : picture.spendingLines;
    for (const line of lines.slice(0, 25)) {
      add(line.label, line.monthly);
      for (const flexibility of ['MUST', 'REDUCE', 'CANCEL'] as const) {
        const part = line.payees.filter((p) => explanations[p.description]?.flexibility === flexibility).reduce((sum, p) => sum + p.monthly, 0);
        if (part >= 1) {
          add(`${line.label} — ${flexibility === 'MUST' ? 'חובה' : flexibility === 'REDUCE' ? 'אפשר לצמצם' : 'אפשר לבטל'}`, part);
        }
      }
    }
    if (step === 'debts' && overdraft) {
      add('היתרה הנמוכה ביותר', overdraft.lowest);
      add('ריבית מינוס בחודש', overdraft.interestMonthly);
    }
  }
  if (step === 'savings') {
    const ideas = savingIdeas(picture, explanations);
    for (const idea of ideas) {
      add(`${IDEA_LABELS[idea.kind]}${idea.monthly === undefined ? ' (לבדיקה, סכום חודשי)' : ' (חיסכון בחודש)'}`, idea.monthly ?? sumItems(idea.items));
    }
    add('סך החיסכון שידוע מהדפים', knownSaving(ideas));
  }
  return facts.slice(0, MAX_FACTS);
}

const sumItems = (items?: readonly { monthly: number }[]) => (items ?? []).reduce((sum, item) => sum + item.monthly, 0);
