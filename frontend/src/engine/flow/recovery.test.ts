import { describe, expect, it } from 'vitest';
import { BANK_CSV, cardXlsx } from '../money/__fixtures__/statements';
import { monthlyPicture } from '../money/picture';
import { parseCsv, readXlsx } from '../money/sheets';
import { readStatement } from '../money/statementImport';
import { isAnswered, stepComplete } from './flow';
import { explanationFor, recoveryAnswers, recoveryQuestions } from './recovery';

const raw = async () => monthlyPicture([readStatement(parseCsv(BANK_CSV), 'b')!, readStatement(await readXlsx(await cardXlsx()), 'c')!], {})!;

describe('the recovery plan’s own questions', () => {
  it('asks what the unclear charges are, then which recurring ones can go, each as a row of its own', async () => {
    const { steps, payees } = recoveryQuestions(await raw());
    expect(steps.map((step) => step.id)).toEqual(['whatIsIt', 'canGo']);
    expect(steps.every((step) => step.list && step.section === 'statements')).toBe(true);
    expect(steps[0]!.fields.map((field) => field.label)).toEqual(['חנות הדוגמאות · 667 ₪ בחודש']);
    expect(payees).toEqual({ what0: 'חנות הדוגמאות', flex0: 'חנות הדוגמאות' });
    // Any of them may stay unanswered.
    expect(steps.every((step) => stepComplete(step, {}))).toBe(true);
  });

  it('asks nothing of a household with no unclear or recurring charges', () => {
    const empty = { spendingLines: [], months: ['2026-04', '2026-05'], partial: false } as unknown as Awaited<ReturnType<typeof raw>>;
    expect(recoveryQuestions(empty).steps).toEqual([]);
  });

  it('reads and writes the answers as what the household says about each business', async () => {
    const questions = recoveryQuestions(await raw());
    expect(recoveryAnswers(questions, { 'חנות הדוגמאות': { category: 'LOANS', flexibility: 'MUST' } })).toEqual({ what0: 'LOANS', flex0: 'MUST' });
    expect(explanationFor(questions, 'what0', 'INSURANCE')).toEqual({ payee: 'חנות הדוגמאות', patch: { category: 'INSURANCE' } });
    expect(explanationFor(questions, 'flex0', 'CANCEL')).toEqual({ payee: 'חנות הדוגמאות', patch: { flexibility: 'CANCEL' } });
    expect(explanationFor(questions, 'flex0', undefined)).toEqual({ payee: 'חנות הדוגמאות', patch: { flexibility: undefined } });
    expect(explanationFor(questions, 'netIncome', 5)).toBeUndefined();
    expect(isAnswered(questions.steps[1]!.fields[0]!, 'CANCEL')).toBe(true);
  });
});
