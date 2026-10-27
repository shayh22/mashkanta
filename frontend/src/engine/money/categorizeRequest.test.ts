import { describe, expect, it } from 'vitest';
import { CATEGORIZE_SCHEMA, MAX_PAYEES, toCategories, validateCategorizeRequest } from './categorizeRequest';

describe('sorting businesses with AI', () => {
  it('sends names only, cleaned, within limits', () => {
    expect(validateCategorizeRequest({ payees: [' חנות\nדוגמה ', 'קפה דוגמה'], amounts: [1] })).toEqual({
      payees: ['חנות דוגמה', 'קפה דוגמה'],
    });
    expect(validateCategorizeRequest({ payees: [] })).toBe('bad payees');
    expect(validateCategorizeRequest({ payees: Array(MAX_PAYEES + 1).fill('x') })).toBe('bad payees');
    expect(validateCategorizeRequest({ payees: ['x'.repeat(81)] })).toBe('bad payee');
    expect(validateCategorizeRequest({ payees: [3] })).toBe('bad payee');
  });

  it('offers spending categories only', () => {
    const allowed = CATEGORIZE_SCHEMA.properties.items.items.properties.category.enum as readonly string[];
    expect(allowed).toContain('GROCERIES');
    expect(allowed).not.toContain('SALARY');
    expect(allowed).not.toContain('CARD_UNDETAILED');
  });

  it('keeps answers for names it was asked about, in known categories, and drops "other"', () => {
    const payees = ['חנות צעצועים', 'מאפייה', 'פלוני'];
    expect(
      toCategories(
        {
          items: [
            { index: 0, category: 'SHOPPING' },
            { index: 1, category: 'GROCERIES' },
            { index: 2, category: 'OTHER' },
            { index: 9, category: 'DINING' },
            { index: 1, category: 'SALARY' },
          ],
        },
        payees,
      ),
    ).toEqual({ 'חנות צעצועים': 'SHOPPING', מאפייה: 'GROCERIES' });
    expect(toCategories({ nothing: true }, payees)).toBeNull();
  });
});
