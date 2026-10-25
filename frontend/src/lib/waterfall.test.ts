import { describe, expect, it } from 'vitest';
import { waterfallBars } from './waterfall';

describe('waterfall bars', () => {
  it('floats each step on the running total and closes on the end total', () => {
    const bars = waterfallBars('היום', 10_000, [
      { label: 'רכב', delta: -2_000 },
      { label: 'כרטיס', delta: -1_000 },
      { label: 'הלוואה חדשה', delta: 1_500 },
    ], 'אחרי');
    expect(bars.map((bar) => bar.kind)).toEqual(['total', 'down', 'down', 'up', 'total']);
    expect(bars[1]).toMatchObject({ base: 8_000, value: 2_000 });
    expect(bars[2]).toMatchObject({ base: 7_000, value: 1_000 });
    expect(bars[3]).toMatchObject({ base: 7_000, value: 1_500 });
    expect(bars[4]).toMatchObject({ base: 0, value: 8_500 });
  });

  it('drops steps smaller than half a shekel', () => {
    expect(waterfallBars('a', 100, [{ label: 'x', delta: 0.2 }], 'b')).toHaveLength(2);
  });
});
