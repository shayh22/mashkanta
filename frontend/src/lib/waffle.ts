/** Shares of a whole as 100 cells, by largest remainder, so the cells always add up to 100. */
export function waffleCells(values: readonly number[]): number[] {
  const positive = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const total = positive.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return positive.map(() => 0);
  }
  const exact = positive.map((value) => (value / total) * 100);
  const cells = exact.map(Math.floor);
  let left = 100 - cells.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest);
  for (const { index } of order) {
    if (left <= 0) {
      break;
    }
    cells[index]! += 1;
    left -= 1;
  }
  return cells;
}
