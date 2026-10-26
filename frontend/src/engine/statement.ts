import type { TrackType } from '../lib/types';
import type { ExistingTrack } from './prepayment';

/**
 * Reads a mortgage details statement (מכתב "פרטי משכנתאות" / דוח יתרות לסילוק), the document a bank
 * issues on request with the payoff figures of every loan on a property.
 *
 * The format is the Bank Hapoalim one: a summary table with one row per loan (principal,
 * indexation, accrued interest, the early repayment fee the bank would charge today, payoff balance
 * and monthly payment), followed by blocks of up to four sub-loans (מרכיבים) laid out as columns,
 * one labelled row per attribute. Text extraction keeps each row on one line with the cells in
 * column order, but drops empty cells — a fixed sub-loan has no reset frequency — so the rows that
 * only exist for variable sub-loans are assigned to the variable columns in order.
 *
 * It always runs on redacted text, and returns numbers only: no line of the source document is
 * carried into the result.
 */

export interface StatementLoan {
  readonly loanNumber: string;
  readonly principal: number;
  readonly indexation: number;
  readonly accruedInterest: number;
  /** The early repayment fee the bank states for repaying this loan on the statement date. */
  readonly prepaymentFee: number;
  readonly payoffBalance: number;
  readonly monthlyPayment: number;
}

export interface StatementComponent {
  readonly loanNumber: string;
  readonly component: string;
  readonly originalAmount: number;
  readonly originationDate: string;
  readonly firstPaymentDate: string;
  readonly lastPaymentDate: string;
  readonly directed: boolean;
  readonly rateType: 'FIXED' | 'VARIABLE';
  /** Nominal annual rate today, as a fraction. */
  readonly nominalRate: number;
  /** The loan's own rate when it was taken — used as the origination reference for the fee. */
  readonly originationRate: number;
  readonly resetMonths?: number;
  readonly nextResetDate?: string;
  readonly cpiLinked: boolean;
  readonly baseIndex: number;
  readonly lastIndex: number;
  /** Margin over prime for prime-based sub-loans, as a signed fraction. */
  readonly primeMargin?: number;
}

export interface ParsedStatement {
  readonly bankCode?: string;
  /** ISO date the figures are correct for. */
  readonly asOf: string;
  readonly loans: readonly StatementLoan[];
  readonly components: readonly StatementComponent[];
  /** Prime implied by a prime-based sub-loan: its nominal rate less its margin. */
  readonly impliedPrime?: number;
  readonly warnings: readonly string[];
}

const LOAN_NUMBER = /\d{2}\/\d{2}\/\d{6}\/\d{3}/g;
const DATE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;
/** Amounts and rates; the bank prints a negative as a trailing minus ("0.01-"). */
const NUMBER = /-?\d[\d,]*(?:\.\d+)?-?/g;

const LABELS = {
  header: 'מספר הלוואה ומספר מרכיב',
  originalAmount: 'סכום הלוואה מקורי',
  originationDate: 'מועד ביצוע ההלוואה',
  firstPayment: 'מועד התשלום הראשון',
  lastPayment: 'מועד צפוי לתשלום',
  loanType: 'סוג הלוואה',
  method: 'שיטת פירעון',
  rateType: 'סוג ריבית',
  base: 'בסיס לקביעת הריבית',
  nominalRate: 'שיעור ריבית נומינלית',
  originationRate: 'שיעור ריבית מתואמת ליום הביצוע',
  currentEffectiveRate: 'שיעור ריבית מתואמת ליום מכתבנו',
  resetMonths: 'תדירות שינוי הריבית',
  nextReset: 'מועד שינוי הריבית הקרוב',
  indexation: 'בסיס ההצמדה',
  baseIndex: 'מדד / שער בסיס',
  lastIndex: 'מדד / שער אחרון',
  purpose: 'מטרת הלוואה',
  expectedRate: 'שיעור ריבית הכוללת החזויה',
  comparisonRate: 'שיעור ריבית לצורכי השוואה',
} as const;

/** Every label line, including the wrapped second lines of two-line labels. */
const LABEL_FRAGMENTS = [...Object.values(LABELS), 'אחרון / תאריך סילוק', 'הפחתה )ריבית סיכון(', 'הפחתה (ריבית סיכון)'];

const isLabel = (line: string) => LABEL_FRAGMENTS.some((label) => line.includes(label));

function toNumber(token: string): number {
  const negative = token.startsWith('-') || token.endsWith('-');
  const value = Number(token.replace(/[-,]/g, ''));
  return negative ? -value : value;
}

function numbersIn(line: string): number[] {
  return [...line.matchAll(NUMBER)].map((match) => toNumber(match[0]));
}

function datesIn(line: string): string[] {
  return [...line.matchAll(DATE)].map((match) => `${match[3]}-${match[2]}-${match[1]}`);
}

/** True when the text looks like a mortgage details statement rather than an approval. */
export function isMortgageStatement(text: string): boolean {
  return text.includes('פרטי משכנתאות') && text.includes(LABELS.header);
}

/**
 * The values row for a label: the first following line that has what `pick` is looking for,
 * stopping at the next label so a row that is empty for every column yields nothing.
 */
function valuesAfter<T>(lines: readonly string[], from: number, to: number, label: string, pick: (line: string) => T[]): T[] {
  const at = lines.findIndex((line, index) => index >= from && index < to && line.includes(label));
  if (at < 0) {
    return [];
  }
  for (let index = at + 1; index < to; index++) {
    const line = lines[index]!;
    if (isLabel(line)) {
      return [];
    }
    const values = pick(line);
    if (values.length > 0) {
      return values;
    }
  }
  return [];
}

function parseSummary(lines: readonly string[]): StatementLoan[] {
  const loans: StatementLoan[] = [];
  for (const line of lines) {
    const number = line.match(/^\s*(\d{2}\/\d{2}\/\d{6}\/\d{3})\s+(.*)$/);
    // Sub-loan header rows also start with a loan number, but carry several of them.
    if (!number || number[2]!.includes('/')) {
      continue;
    }
    const values = numbersIn(number[2]!);
    // principal, indexation, arrears, interest, deferred interest, ancillary, fee, payoff, monthly
    if (values.length < 9) {
      continue;
    }
    loans.push({
      loanNumber: number[1]!,
      principal: values[0]!,
      indexation: values[1]!,
      accruedInterest: values[3]!,
      prepaymentFee: values[6]!,
      payoffBalance: values[7]!,
      monthlyPayment: values[8]!,
    });
  }
  return loans;
}

function parseBlocks(lines: readonly string[], warnings: string[]): StatementComponent[] {
  const starts = lines.flatMap((line, index) => (line.includes(LABELS.header) ? [index] : []));
  const components: StatementComponent[] = [];

  starts.forEach((start, blockIndex) => {
    const end = starts[blockIndex + 1] ?? lines.length;
    const loanNumbers = [...(lines[start + 1] ?? '').matchAll(LOAN_NUMBER)].map((match) => match[0]);
    const componentNumbers = [...(lines[start + 2] ?? '').matchAll(/\b\d{3}\b/g)].map((match) => match[0]);
    const columns = loanNumbers.length;
    if (columns === 0 || componentNumbers.length !== columns) {
      warnings.push('בלוק מרכיבים לא זוהה במלואו ודולג.');
      return;
    }

    const row = <T>(label: string, pick: (line: string) => T[]) => valuesAfter(lines, start, end, label, pick);
    const amounts = row(LABELS.originalAmount, numbersIn);
    const originations = row(LABELS.originationDate, datesIn);
    const firstPayments = row(LABELS.firstPayment, datesIn);
    const lastPayments = row(LABELS.lastPayment, datesIn);
    const loanTypes = row(LABELS.loanType, (line) => line.split(/\s+/).filter(Boolean));
    const rateTypes = row(LABELS.rateType, (line) =>
      [...line.matchAll(/קבועה|משתנה/g)].map((match): 'FIXED' | 'VARIABLE' => (match[0] === 'קבועה' ? 'FIXED' : 'VARIABLE')),
    );
    const nominal = row(LABELS.nominalRate, numbersIn);
    const atOrigination = row(LABELS.originationRate, numbersIn);
    const resets = row(LABELS.resetMonths, numbersIn);
    const nextResets = row(LABELS.nextReset, datesIn);
    const indexation = row(LABELS.indexation, (line) =>
      [...line.matchAll(/מדד המחירים לצרכן|לא צמוד|דולר|יורו|מט"ח/g)].map((match) => match[0]),
    );
    const baseIndices = row(LABELS.baseIndex, numbersIn);
    const lastIndices = row(LABELS.lastIndex, numbersIn);
    const baseText = lines.slice(start, end).find((line) => /[PH]\s*[+-]\s*\d/.test(line)) ?? '';
    const primeMargins = [...baseText.matchAll(/P\s*([+-])\s*(\d+(?:\.\d+)?)/g)].map(
      (match) => (match[1] === '-' ? -1 : 1) * (Number(match[2]) / 100),
    );

    const required = [amounts, originations, firstPayments, lastPayments, rateTypes, nominal, indexation];
    if (required.some((values) => values.length !== columns)) {
      warnings.push(`בבלוק המרכיבים של הלוואה ${loanNumbers[0]} חסרים נתונים — בדקו את המסלולים שיובאו.`);
      return;
    }

    // Rows that only exist for variable sub-loans are filled in column order.
    const variableColumns = rateTypes.flatMap((type, index) => (type === 'VARIABLE' ? [index] : []));
    if (resets.length > 0 && resets.length !== variableColumns.length) {
      warnings.push(`תדירות שינוי הריבית בהלוואה ${loanNumbers[0]} לא הותאמה למרכיבים המשתנים.`);
    }
    let primeCursor = 0;

    for (let column = 0; column < columns; column++) {
      const variableIndex = variableColumns.indexOf(column);
      const resetMonths = variableIndex >= 0 ? resets[variableIndex] : undefined;
      const cpiLinked = indexation[column] === 'מדד המחירים לצרכן';
      const isPrime = rateTypes[column] === 'VARIABLE' && !cpiLinked && (resetMonths ?? 1) <= 1;
      components.push({
        loanNumber: loanNumbers[column]!,
        component: componentNumbers[column]!,
        originalAmount: amounts[column]!,
        originationDate: originations[column]!,
        firstPaymentDate: firstPayments[column]!,
        lastPaymentDate: lastPayments[column]!,
        directed: /זכאות|מכוונת|מוכוונת|ממשלת|משרד/.test(loanTypes[column] ?? ''),
        rateType: rateTypes[column]!,
        nominalRate: nominal[column]! / 100,
        originationRate: (atOrigination[column] ?? nominal[column]!) / 100,
        resetMonths,
        nextResetDate: variableIndex >= 0 ? nextResets[variableIndex] : undefined,
        cpiLinked,
        baseIndex: baseIndices[column] ?? 0,
        lastIndex: lastIndices[column] ?? 0,
        primeMargin: isPrime ? primeMargins[primeCursor++] : undefined,
      });
    }
  });

  return components;
}

export function parseMortgageStatement(redactedText: string): ParsedStatement | null {
  if (!isMortgageStatement(redactedText)) {
    return null;
  }
  const lines = redactedText.split(/\r?\n/).map((line) => line.replace(/\u00a0/g, ' ').trim());
  const warnings: string[] = [];

  const asOfMatch =
    /נכון ליום\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(redactedText) ?? /תאריך:\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(redactedText);
  const asOf = asOfMatch ? `${asOfMatch[3]}-${asOfMatch[2]}-${asOfMatch[1]}` : new Date().toISOString().slice(0, 10);
  if (!asOfMatch) {
    warnings.push('תאריך הדוח לא זוהה — החישוב מניח את תאריך היום.');
  }

  const loans = parseSummary(lines);
  const components = parseBlocks(lines, warnings);
  if (loans.length === 0) {
    warnings.push('טבלת היתרות לא זוהתה בדוח.');
  }
  for (const loan of loans) {
    if (!components.some((component) => component.loanNumber === loan.loanNumber)) {
      warnings.push(`למשכנתא ${loan.loanNumber.slice(-3)} לא נמצאו מרכיבים.`);
    }
  }

  const prime = components.find((component) => component.primeMargin !== undefined);
  return {
    bankCode: redactedText.includes('הפועלים') ? 'HAPOALIM' : undefined,
    asOf,
    loans,
    components,
    impliedPrime: prime ? prime.nominalRate - prime.primeMargin! : undefined,
    warnings,
  };
}

const parseIso = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return { year: year!, month: month!, day: day! };
};

/** Whole months from `from` to `to`, counting a month only once its day has been reached. */
export function monthsBetween(fromIso: string, toIso: string): number {
  const from = parseIso(fromIso);
  const to = parseIso(toIso);
  return (to.year - from.year) * 12 + (to.month - from.month) - (to.day < from.day ? 1 : 0);
}

/** Monthly payments falling after `asOf` up to and including `last`. */
export function paymentsRemaining(asOfIso: string, lastIso: string): number {
  const asOf = parseIso(asOfIso);
  const last = parseIso(lastIso);
  return Math.max(0, (last.year - asOf.year) * 12 + (last.month - asOf.month) + (asOf.day < last.day ? 1 : 0));
}

/** Fraction of a level annuity's principal still outstanding after `paid` of `total` payments. */
function outstandingFraction(rate: number, total: number, paid: number): number {
  const i = rate / 12;
  const left = Math.max(0, total - paid);
  if (total <= 0) {
    return 0;
  }
  if (Math.abs(i) < 1e-12) {
    return left / total;
  }
  return (1 - Math.pow(1 + i, -left)) / (1 - Math.pow(1 + i, -total));
}

function trackType(component: StatementComponent): TrackType {
  if (component.directed) {
    return 'ELIGIBILITY';
  }
  if (component.rateType === 'FIXED') {
    return component.cpiLinked ? 'FIXED_LINKED' : 'FIXED_UNLINKED';
  }
  if (component.cpiLinked) {
    return 'VARIABLE_LINKED';
  }
  return (component.resetMonths ?? 1) <= 1 ? 'PRIME' : 'VARIABLE_UNLINKED';
}

export interface StatementTrack extends ExistingTrack {
  readonly loanNumber: string;
}

/**
 * One existing track per sub-loan, ready for the refinance analysis.
 *
 * The statement gives balances per loan, not per sub-loan, so each loan's balance (principal plus
 * indexation) is split across its sub-loans in proportion to an estimate of each one's outstanding
 * balance — original amount, indexed, amortised on its own schedule. The bank's stated fee for the
 * loan is split the same way and carried on each track, so the analysis uses the bank's figure
 * rather than an estimate.
 */
export function statementToTracks(statement: ParsedStatement): StatementTrack[] {
  const tracks: StatementTrack[] = [];
  for (const loan of statement.loans) {
    const parts = statement.components.filter((component) => component.loanNumber === loan.loanNumber);
    if (parts.length === 0) {
      continue;
    }
    const estimates = parts.map((part) => {
      const total = paymentsRemaining(part.firstPaymentDate, part.lastPaymentDate) + 1;
      const left = paymentsRemaining(statement.asOf, part.lastPaymentDate);
      const indexRatio = part.cpiLinked && part.baseIndex > 0 ? part.lastIndex / part.baseIndex : 1;
      return part.originalAmount * indexRatio * outstandingFraction(part.nominalRate, total, total - left);
    });
    const estimateSum = estimates.reduce((sum, value) => sum + value, 0);
    const loanBalance = loan.principal + loan.indexation;

    parts.forEach((part, index) => {
      const share = estimateSum > 0 ? estimates[index]! / estimateSum : 1 / parts.length;
      const type = trackType(part);
      tracks.push({
        id: `${loan.loanNumber.slice(-3)}-${part.component}`,
        loanNumber: loan.loanNumber,
        label: `הלוואה ${loan.loanNumber.slice(-3)} · מרכיב ${part.component}`,
        type,
        balance: loanBalance * share,
        annualRate: part.nominalRate,
        remainingMonths: paymentsRemaining(statement.asOf, part.lastPaymentDate),
        monthsElapsed: Math.max(0, monthsBetween(part.originationDate, statement.asOf)),
        originationAverageRate: part.originationRate,
        monthsToReset:
          part.nextResetDate !== undefined ? paymentsRemaining(statement.asOf, part.nextResetDate) : undefined,
        statedFee: loan.prepaymentFee * share,
      });
    });
  }
  return tracks;
}
