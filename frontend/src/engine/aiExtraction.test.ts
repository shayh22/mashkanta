import { describe, expect, it } from 'vitest';
import {
  AI_MAX_TEXT,
  AI_SCHEMAS,
  toConsumerDebts,
  toMortgageTracks,
  toOfferTracks,
  validateAiRequest,
} from './aiExtraction';

let counter = 0;
const newId = () => `ai${++counter}`;

describe('reading a model\'s answer', () => {
  it('turns consumer loans into debts, rates from percent, and drops rows it cannot trust', () => {
    const { items, warnings } = toConsumerDebts(
      {
        loans: [
          { kind: 'CAR', label: 'הלוואת רכב - טויוטה', balance: 84_500, annualRatePercent: 8.9, monthlyPayment: 2_150, remainingMonths: 41 },
          { kind: 'CREDIT_CARD', label: null, balance: 12_000, annualRatePercent: 13.5, monthlyPayment: 600, remainingMonths: null },
          { kind: 'OTHER', label: 'שורת סיכום', balance: null, annualRatePercent: 9, monthlyPayment: 100, remainingMonths: 10 },
          { kind: 'OTHER', label: 'ריבית לא סבירה', balance: 5_000, annualRatePercent: 89, monthlyPayment: 100, remainingMonths: 10 },
        ],
      },
      newId,
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'CAR', label: 'הלוואת רכב - טויוטה', balance: 84_500, annualRate: 0.089, monthlyPayment: 2_150, remainingMonths: 41, include: true });
    expect(items[1]).toMatchObject({ kind: 'CREDIT_CARD', label: 'כרטיס אשראי / קרדיט', remainingMonths: 12 });
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toContain('שורה 2');
  });

  it('turns mortgage tracks into existing tracks with the bank\'s stated fee', () => {
    const { items, warnings } = toMortgageTracks(
      {
        tracks: [
          { type: 'PRIME', label: '1234-1', balance: 420_000, annualRatePercent: 4.25, remainingMonths: 264, monthsElapsed: 48, statedFee: 0 },
          { type: 'FIXED_LINKED', label: null, balance: 260_000, annualRatePercent: 3.9, remainingMonths: 204, monthsElapsed: null, statedFee: 11_218 },
          { type: 'BOGUS', label: null, balance: 1, annualRatePercent: 3, remainingMonths: 10, monthsElapsed: 1, statedFee: null },
        ],
      },
      newId,
    );
    expect(items.map((track) => [track.type, track.annualRate, track.statedFee])).toEqual([
      ['PRIME', 0.0425, 0],
      ['FIXED_LINKED', 0.039, 11_218],
    ]);
    expect(items[1]!.monthsElapsed).toBe(0);
    expect(warnings.join(' ')).toContain('מסלול 3');
  });

  it('turns an offer into approval tracks and keeps the lender', () => {
    const result = toOfferTracks({
      bank: 'בנק לאומי',
      tracks: [{ type: 'FIXED_UNLINKED', amount: 600_000, annualRatePercent: 4.55, termMonths: 300 }],
    });
    expect(result.bank).toBe('בנק לאומי');
    expect(result.items[0]).toMatchObject({ track: 'FIXED_UNLINKED', amount: 600_000, annualRate: 0.0455, termMonths: 300 });
  });

  it('survives an answer of the wrong shape', () => {
    expect(toConsumerDebts('nonsense', newId).items).toEqual([]);
    expect(toMortgageTracks({ tracks: 'x' }, newId).items).toEqual([]);
    expect(toOfferTracks(null).items).toEqual([]);
  });
});

describe('the request sent out', () => {
  it('accepts redacted text or page images and nothing else', () => {
    expect(validateAiRequest({ kind: 'mortgage', text: 'יתרה 100,000' })).toEqual({ kind: 'mortgage', text: 'יתרה 100,000' });
    expect(validateAiRequest({ kind: 'offer', images: ['data:image/png;base64,AAAA'] })).toMatchObject({ kind: 'offer' });
    expect(validateAiRequest({ kind: 'payroll', text: 'x' })).toBe('unknown document kind');
    expect(validateAiRequest({ kind: 'offer' })).toBe('empty document');
    expect(validateAiRequest({ kind: 'offer', text: 'x'.repeat(AI_MAX_TEXT + 1) })).toBe('document too long');
    expect(validateAiRequest({ kind: 'offer', images: ['https://example.com/a.png'] })).toBe('unsupported image');
    expect(validateAiRequest({ kind: 'offer', images: ['data:image/png;base64,A', 'data:image/png;base64,A', 'data:image/png;base64,A', 'data:image/png;base64,A'] })).toBe('too many pages');
  });

  it('asks for strict schemas: every field required, nothing extra', () => {
    for (const schema of Object.values(AI_SCHEMAS)) {
      const items = Object.values((schema as { properties: Record<string, { items?: { required: string[]; properties: object; additionalProperties: boolean } }> }).properties).find((p) => p.items)!.items!;
      expect(items.additionalProperties).toBe(false);
      expect(items.required.sort()).toEqual(Object.keys(items.properties).sort());
    }
  });
});
