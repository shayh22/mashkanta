import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MarketTrends } from '../MarketTrends';
import { useMarket } from '../../store/marketStore';
import type { LiveMarket } from '../../engine/boiMarket';

beforeAll(() => {
  // Recharts measures its container; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  useMarket.setState({ market: undefined });
});

const market: LiveMarket = {
  fetchedAt: '2026-10-26T08:00:00Z',
  prime: { value: 0.0475, asOf: '2026-10-26', since: '2026-09-03' },
  history: [
    { month: '2025-09', prime: 0.06, fixedUnlinked: 0.0488, fixedLinked: 0.034, variableLinked: 0.0354 },
    { month: '2026-01', prime: 0.055, fixedUnlinked: 0.0479, variableLinked: 0.0347 },
    { month: '2026-08', prime: 0.05, fixedUnlinked: 0.0462, fixedLinked: 0.0329, variableLinked: 0.0319 },
  ],
  missing: [],
};

describe('market trends', () => {
  it('summarises the change in each series and offers the figures as a table', () => {
    useMarket.setState({ market });
    render(<MarketTrends />);

    expect(screen.getByText(/ספטמבר 2025 – אוגוסט 2026/)).toBeTruthy();
    expect(screen.getAllByText("ירידה של 0.26 נק'")).toHaveLength(1); // fixed unlinked 4.88 → 4.62
    expect(screen.getByText("ירידה של 1.00 נק'")).toBeTruthy(); // prime 6.00 → 5.00
    const table = screen.getByRole('table');
    // A month a series did not publish shows a dash, not a borrowed value.
    expect(table.textContent).toContain('—');
    expect(table.textContent).toContain('4.62%');
    expect(screen.getByText(/הפריים כיום: 4.75%/)).toBeTruthy();
  });

  it('renders nothing until there is a history to show', () => {
    const { container } = render(<MarketTrends />);
    expect(container.textContent).toBe('');
  });
});
