import { describe, expect, it } from 'vitest';
import { MAX_GOAL_LENGTH, PLAN_SCHEMA, toPlanAnswer, validatePlanRequest, type PlanRequest } from './planRequest';

const TRACKS: PlanRequest['tracks'] = [
  { index: 0, type: 'PRIME', balance: 400_000, annualRate: 0.062, remainingMonths: 240, marketRate: 0.058, refinanceFee: 60 },
  { index: 1, type: 'FIXED_LINKED', balance: 200_000, annualRate: 0.025, remainingMonths: 180, marketRate: 0.035, refinanceFee: 9_000 },
  { index: 2, type: 'ELIGIBILITY', balance: 100_000, annualRate: 0.03, remainingMonths: 200, marketRate: 0.03, refinanceFee: 0 },
];
const REQUEST: PlanRequest = { goal: 'להוריד את ההחזר', tracks: TRACKS, monthlyPayment: 5_200 };

describe('plan request', () => {
  it('accepts the request it describes and drops anything else', () => {
    expect(validatePlanRequest({ ...REQUEST, name: 'ישראל ישראלי' })).toEqual(REQUEST);
    const extra = validatePlanRequest({ ...REQUEST, tracks: TRACKS.map((track) => ({ ...track, bank: 'x' })) });
    expect(extra).toEqual(REQUEST);
  });

  it('cleans the goal and holds it to its length', () => {
    expect((validatePlanRequest({ ...REQUEST, goal: ' שורה\nשנייה\u0007 ' }) as PlanRequest).goal).toBe('שורה שנייה');
    expect(validatePlanRequest({ ...REQUEST, goal: 'אב' })).toBe('bad goal');
    expect(validatePlanRequest({ ...REQUEST, goal: 'א'.repeat(MAX_GOAL_LENGTH + 1) })).toBe('bad goal');
  });

  it('refuses tracks out of order, of unknown kinds or out of range', () => {
    expect(validatePlanRequest({ ...REQUEST, tracks: [TRACKS[1], TRACKS[0]] })).toBe('bad track');
    expect(validatePlanRequest({ ...REQUEST, tracks: [{ ...TRACKS[0], type: 'CRYPTO' }] })).toBe('bad track');
    expect(validatePlanRequest({ ...REQUEST, tracks: [{ ...TRACKS[0], balance: -1 }] })).toBe('bad track');
    expect(validatePlanRequest({ ...REQUEST, tracks: [] })).toBe('bad tracks');
    expect(validatePlanRequest({ ...REQUEST, monthlyPayment: Number.NaN })).toBe('bad payment');
    expect(validatePlanRequest(null)).toBe('not an object');
  });

  it('asks for strict actions, every field required', () => {
    const item = PLAN_SCHEMA.properties.actions.items;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(['index', 'action', 'newType', 'termYears', 'prepayAmount']);
    // Only plain nullable types: a nullable enum is refused by the provider.
    expect(item.properties.newType).toEqual({ type: ['string', 'null'] });
  });
});

describe('plan answer', () => {
  const action = (index: number, action: string, rest: Record<string, unknown> = {}) => ({
    index,
    action,
    newType: null,
    termYears: null,
    prepayAmount: null,
    ...rest,
  });

  it('turns the answer into actions for the tracks that exist', () => {
    const answer = toPlanAnswer(
      {
        actions: [
          action(0, 'REFINANCE', { newType: 'FIXED_UNLINKED', termYears: 25 }),
          action(1, 'KEEP'),
          action(2, 'PREPAY', { prepayAmount: 50_000.4 }),
        ],
        summary: 'למחזר את הפריים ולשמור את הצמודה',
        cautions: ['בדקו את העמלה'],
      },
      TRACKS,
    );
    expect(answer).toEqual({
      actions: {
        0: { kind: 'REFINANCE', type: 'FIXED_UNLINKED', termMonths: 300 },
        1: { kind: 'KEEP' },
        2: { kind: 'PREPAY', amount: 50_000 },
      },
      summary: 'למחזר את הפריים ולשמור את הצמודה',
      cautions: ['בדקו את העמלה'],
    });
  });

  it('keeps whatever is out of bounds rather than guess', () => {
    const answer = toPlanAnswer(
      {
        actions: [
          action(2, 'REFINANCE', { newType: 'PRIME', termYears: 20 }),
          action(1, 'PREPAY', { prepayAmount: -5 }),
          action(7, 'REFINANCE', { newType: 'PRIME', termYears: 20 }),
          action(0, 'REFINANCE', { newType: 'ELIGIBILITY', termYears: 99 }),
          action(0, 'KEEP'),
        ],
        summary: 'x'.repeat(500),
        cautions: ['א', '', 'ב', 'ג', 4],
      },
      TRACKS,
    )!;
    expect(answer.actions).toEqual({
      // An eligibility loan is never refinanced; a negative prepayment is no prepayment.
      2: { kind: 'KEEP' },
      1: { kind: 'KEEP' },
      // An unknown kind keeps the track's own; a term out of range keeps its remaining term. The first word counts.
      0: { kind: 'REFINANCE', type: 'PRIME', termMonths: 240 },
    });
    expect(answer.summary).toHaveLength(300);
    expect(answer.cautions).toEqual(['א', 'ב']);
  });

  it('caps a prepayment at the balance', () => {
    expect(toPlanAnswer({ actions: [action(1, 'PREPAY', { prepayAmount: 1e7 })] }, TRACKS)!.actions[1]).toEqual({
      kind: 'PREPAY',
      amount: 200_000,
    });
  });

  it('is nothing when the answer has no actions', () => {
    expect(toPlanAnswer({ summary: 'x' }, TRACKS)).toBeNull();
    expect(toPlanAnswer('text', TRACKS)).toBeNull();
  });
});
