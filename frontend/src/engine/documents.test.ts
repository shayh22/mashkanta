import { describe, expect, it } from 'vitest';
import { rebuildVisualText } from './documents';

/** A PDF item for one glyph at a horizontal position, the way glyph-by-glyph generators write them. */
const glyphs = (text: string, x0: number, y: number, direction: 'ltr' | 'rtl') => {
  const chars = [...text];
  const width = 6;
  // Right-to-left text is drawn from the right edge leftwards; numbers left to right.
  return chars.map((str, index) => ({
    str,
    width,
    transform: [1, 0, 0, 1, direction === 'ltr' ? x0 + index * width : x0 - (index + 1) * width, y],
  }));
};

describe('rebuilding glyph-by-glyph PDF text', () => {
  it('puts numbers, dates and Hebrew back in reading order', () => {
    const items = [
      // A table row, right to left: date, principal, balance.
      ...glyphs('10/03/2026', 400, 500, 'ltr'),
      ...glyphs('1,520.85', 300, 500, 'ltr'),
      ...glyphs('133,905.00', 150, 500, 'ltr'),
      // A heading line above it.
      ...glyphs('לוח', 500, 520, 'rtl'),
      ...glyphs('סילוקין', 470, 520, 'rtl'),
    ];
    expect(rebuildVisualText(items)).toBe('לוח סילוקין\n10/03/2026 1,520.85 133,905.00');
  });
});
