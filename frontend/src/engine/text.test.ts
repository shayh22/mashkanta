import { describe, expect, it } from 'vitest';
import { cleanText } from './text';

describe('text sent or shown', () => {
  it('turns control characters and runs of white space into one space, trimmed and cut to length', () => {
    expect(cleanText(' בונוס\nבאוגוסט\t\u0007 ', 100)).toBe('בונוס באוגוסט');
    expect(cleanText('א'.repeat(10), 4)).toBe('אאאא');
  });

  it('is nothing for what is not a string', () => {
    expect(cleanText(42, 10)).toBe('');
    expect(cleanText(undefined, 10)).toBe('');
  });
});
