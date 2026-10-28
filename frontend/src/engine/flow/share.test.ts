import { describe, expect, it } from 'vitest';
import { decodeShared, encodeShared, sharedLink, type SharedResult } from './share';

const buyer: SharedResult = {
  goals: ['BUY'],
  answers: { propertyValue: 2_000_000, segment: 'FIRST_HOME', equity: 600_000, netIncome: 22_000, stability: 'BALANCED', termYears: 20 },
};

const everything: SharedResult = {
  goals: ['REFINANCE', 'RECOVERY'],
  answers: { mortgageHow: 'UPLOAD', homeValue: 2_400_000, worries: ['OVERDRAFT', 'SAVING'] },
  refinance: { currentPayment: 7_200, proposedPayment: 6_100, monthlySaving: 1_100, lifetimeSaving: 150_000, upfrontCost: 12_000, breakevenMonth: 11, verdict: 'IMMEDIATE', route: 'EXTERNAL' },
  recovery: { months: 3, today: -1_200, after: 300, decisions: [{ label: 'לבטל את מה שסימנתם', monthly: 1_500 }] },
};

describe('a result shared as a link', () => {
  it('reads back exactly what was shared, Hebrew included', () => {
    expect(decodeShared(encodeShared(buyer))).toEqual(buyer);
    expect(decodeShared(encodeShared(everything))).toEqual(everything);
  });

  it('is a link to the site, with the result after the # and in characters a link carries as they are', () => {
    const link = sharedLink('https://mashkanta.example', buyer);
    expect(link.startsWith('https://mashkanta.example/#/s/')).toBe(true);
    expect(link.split('/#/s/')[1]).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('carries only answers to the questionnaire’s questions, each a valid one', () => {
    const shared = decodeShared(
      encodeShared({
        goals: ['BUY'],
        answers: { ...buyer.answers, name: 'ישראל ישראלי', propertyValue: -5, segment: 'CASTLE', mortgageReport: true } as never,
      }),
    )!;
    expect(shared.answers).toEqual({ equity: 600_000, netIncome: 22_000, stability: 'BALANCED', termYears: 20 });
  });

  it('keeps a goal’s figures only for a goal that was shared, and only when well formed', () => {
    const noRefi = decodeShared(encodeShared({ ...everything, goals: ['RECOVERY'] }))!;
    expect(noRefi.refinance).toBeUndefined();
    const broken = decodeShared(encodeShared({ ...everything, refinance: { ...everything.refinance!, verdict: 'MAYBE' as never } }))!;
    expect(broken.refinance).toBeUndefined();
    expect(broken.recovery).toEqual(everything.recovery);
  });

  it('is nothing for what is not a shared result', () => {
    expect(decodeShared('')).toBeUndefined();
    expect(decodeShared('not base64!')).toBeUndefined();
    expect(decodeShared(btoa('{"v":2,"goals":["BUY"]}'))).toBeUndefined();
    expect(decodeShared(btoa('{"v":1,"goals":["HACK"]}'))).toBeUndefined();
    expect(decodeShared('a'.repeat(9_000))).toBeUndefined();
  });
});
