export interface WaterfallStep {
  readonly label: string;
  /** Signed change in the monthly payment: negative is a saving. */
  readonly delta: number;
}

export interface WaterfallBar {
  readonly label: string;
  /** Invisible offset the visible bar floats on. */
  readonly base: number;
  readonly value: number;
  readonly kind: 'total' | 'down' | 'up';
  /** The signed figure the bar stands for, for labels and tooltips. */
  readonly amount: number;
}

/** Builds floating bars: each step starts where the previous one ended. Sub-shekel steps are dropped. */
export function waterfallBars(
  startLabel: string,
  start: number,
  steps: readonly WaterfallStep[],
  endLabel: string,
): WaterfallBar[] {
  const bars: WaterfallBar[] = [{ label: startLabel, base: 0, value: start, kind: 'total', amount: start }];
  let level = start;
  for (const step of steps) {
    if (Math.abs(step.delta) < 0.5) {
      continue;
    }
    const next = level + step.delta;
    bars.push({
      label: step.label,
      base: Math.min(level, next),
      value: Math.abs(step.delta),
      kind: step.delta < 0 ? 'down' : 'up',
      amount: step.delta,
    });
    level = next;
  }
  bars.push({ label: endLabel, base: 0, value: level, kind: 'total', amount: level });
  return bars;
}
