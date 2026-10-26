import { describe, expect, it } from 'vitest';
import { redact } from './redaction';

describe('redaction', () => {
  it('masks a name printed on the line below "לכבוד:" when that line holds the print date', () => {
    const { sanitizedText, byCategory } = redact('לכבוד: תאריך הדפסה: 01/02/2026\nישראלה ישראלי\nנתוני הלוואה\nסכום 10,000');
    expect(sanitizedText).not.toContain('ישראלה');
    expect(sanitizedText).toContain('תאריך הדפסה: 01/02/2026');
    expect(sanitizedText).toContain('נתוני הלוואה');
    expect(byCategory).toEqual({ NAME: 1 });
  });

  it('masks a name on the label\'s own line once, and leaves a line of figures below it alone', () => {
    const { sanitizedText, byCategory } = redact('לכבוד: ישראלה ישראלי\nיתרה 10,000');
    expect(sanitizedText).toBe('לכבוד: [REDACTED]\nיתרה 10,000');
    expect(byCategory).toEqual({ NAME: 1 });
  });

  it('masks identity numbers by check digit, and by label when printed without the leading zero', () => {
    const { sanitizedText } = redact('מספר 123456782 ות.ז. 23456789');
    expect(sanitizedText).not.toMatch(/123456782|23456789/);
  });
});
