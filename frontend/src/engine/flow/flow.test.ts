import { describe, expect, it } from 'vitest';
import { CATALOG } from './catalog';
import { firstOpen, isAnswered, LATER, neighbour, progressOf, stepComplete, stepsFor, visibleFields, type Field } from './flow';

const ids = (goals: Parameters<typeof stepsFor>[1], answers = {}) => stepsFor(CATALOG, goals, answers).map((step) => step.id);

describe('the questions for the goals chosen', () => {
  it('asks a buyer about the home and the income, nothing about a mortgage they do not have', () => {
    expect(ids(['BUY'])).toEqual(['price', 'buyer', 'equity', 'eligibility', 'income', 'obligations', 'stability']);
  });

  it('asks the shared sections once when goals are combined, in one order', () => {
    const steps = ids(['RECOVERY', 'REFINANCE'], { mortgageHow: 'UPLOAD', hasLoans: 'YES' });
    expect(steps).toEqual(['mortgageHow', 'mortgageUpload', 'homeValue', 'refinanceGoal', 'income', 'stability', 'statementsUpload', 'worry', 'hasLoans', 'loansUpload']);
    expect(new Set(steps).size).toBe(steps.length);
  });

  it('asks whether there is a mortgage only when the household is not refinancing one', () => {
    expect(ids(['RECOVERY'])).toEqual(['hasMortgage', 'statementsUpload', 'worry', 'hasLoans']);
    expect(ids(['RECOVERY'], { hasMortgage: 'YES' })).toContain('mortgageHow');
    expect(ids(['REFINANCE'])).not.toContain('hasMortgage');
  });

  it('asks a homeowner the home’s value and income for the new mix, and about other loans in their own section', () => {
    expect(ids(['REFINANCE'], { mortgageHow: 'MANUAL' })).toEqual(['mortgageHow', 'homeValue', 'refinanceGoal', 'income', 'stability', 'hasLoans']);
    expect(ids(['BUY', 'REFINANCE'], { mortgageHow: 'MANUAL' })).toContain('obligations');
  });

  it('asks for a document only when the household said it has one', () => {
    expect(ids(['REFINANCE'], { mortgageHow: 'MANUAL' })).not.toContain('mortgageUpload');
    expect(ids(['REFINANCE'], { hasLoans: 'NO' })).not.toContain('loansUpload');
  });

  it('asks nothing for no goal', () => {
    expect(ids([])).toEqual([]);
  });
});

describe('a screen and its follow-ups', () => {
  const mortgage = CATALOG.steps.find((step) => step.id === 'mortgageHow')!;

  it('opens the follow-up questions the answer calls for', () => {
    expect(visibleFields(mortgage, {}).map((field) => field.id)).toEqual(['mortgageHow']);
    expect(visibleFields(mortgage, { mortgageHow: 'MANUAL' }).map((field) => field.id)).toEqual([
      'mortgageHow',
      'mortgageBalance',
      'mortgagePayment',
      'mortgageYears',
    ]);
  });

  it('is answered once every question it shows is', () => {
    expect(stepComplete(mortgage, { mortgageHow: 'UPLOAD' })).toBe(true);
    expect(stepComplete(mortgage, { mortgageHow: 'MANUAL', mortgageBalance: 800_000 })).toBe(false);
    expect(stepComplete(mortgage, { mortgageHow: 'MANUAL', mortgageBalance: 800_000, mortgagePayment: 4_800, mortgageYears: 'TEN_20' })).toBe(true);
  });
});

describe('an answer', () => {
  const field = (kind: Field['kind'], extra: Partial<Field> = {}): Field => ({ id: 'f', label: 'f', kind, ...extra });
  const options = [
    { id: 'A', label: 'א' },
    { id: 'B', label: 'ב' },
  ];

  it('to a choice is one of its options', () => {
    expect(isAnswered(field('choice', { options }), 'A')).toBe(true);
    expect(isAnswered(field('choice', { options }), 'C')).toBe(false);
    expect(isAnswered(field('multi', { options }), ['A', 'B'])).toBe(true);
    expect(isAnswered(field('multi', { options }), [])).toBe(false);
    expect(isAnswered(field('multi', { options }), ['A', 'C'])).toBe(false);
  });

  it('to a figure is within its bounds, and money is never negative', () => {
    expect(isAnswered(field('money', { min: 100 }), 99)).toBe(false);
    expect(isAnswered(field('money', { max: 1_000 }), 1_000)).toBe(true);
    expect(isAnswered(field('money'), -1)).toBe(false);
    expect(isAnswered(field('money'), Number.NaN)).toBe(false);
    expect(isAnswered(field('number'), -1)).toBe(true);
    expect(isAnswered(field('money'), '5')).toBe(false);
  });

  it('to a document is that it was read, or put off for later', () => {
    expect(isAnswered(field('upload'), true)).toBe(true);
    expect(isAnswered(field('upload'), LATER)).toBe(true);
    expect(isAnswered(field('upload'), undefined)).toBe(false);
  });
});

describe('where the household is', () => {
  const steps = stepsFor(CATALOG, ['BUY'], {});

  it('counts the screens and names the section', () => {
    expect(progressOf(CATALOG, steps, 'income')).toMatchObject({ index: 4, total: 7, section: { label: 'ההכנסה' } });
    expect(progressOf(CATALOG, steps, 'nowhere')).toEqual({ index: -1, total: 7 });
  });

  it('picks up at the first screen not answered', () => {
    expect(firstOpen(steps, {})).toBe('price');
    expect(firstOpen(steps, { propertyValue: 2_000_000, segment: 'FIRST_HOME' })).toBe('equity');
    const all = { propertyValue: 2e6, segment: 'FIRST_HOME', equity: 6e5, hasEligibility: 'NO', netIncome: 2e4, hasObligations: 'NO', stability: 'BALANCED' };
    expect(firstOpen(steps, all)).toBeUndefined();
  });

  it('moves one screen at a time, and stops at either end', () => {
    expect(neighbour(steps, 'price', 1)).toBe('buyer');
    expect(neighbour(steps, 'buyer', -1)).toBe('price');
    expect(neighbour(steps, 'price', -1)).toBeUndefined();
    expect(neighbour(steps, 'stability', 1)).toBeUndefined();
  });
});

describe('the catalog', () => {
  it('has unique screens and fields, each a short question with a choice where it needs one', () => {
    const fields = CATALOG.steps.flatMap((step) => step.fields.map((field) => field.id));
    expect(new Set(CATALOG.steps.map((step) => step.id)).size).toBe(CATALOG.steps.length);
    expect(new Set(fields).size).toBe(fields.length);
    for (const step of CATALOG.steps) {
      expect(step.title.split(' ').length).toBeLessThanOrEqual(8);
      for (const field of step.fields) {
        if (field.kind === 'choice' || field.kind === 'multi') {
          expect(field.options!.length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });
});
