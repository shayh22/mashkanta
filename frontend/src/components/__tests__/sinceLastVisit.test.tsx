import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LiveMarket } from '../../engine/boiMarket';
import type { VisitSnapshot } from '../../engine/visits';

const lastWeek: VisitSnapshot = {
  at: '2026-10-19T08:00:00Z',
  market: { prime: 0.05, fixedUnlinked: 0.0462, fixedLinked: 0.0329, variableLinked: 0.0319, housingAsOf: '2026-07' },
};

const today: LiveMarket = {
  fetchedAt: '2026-10-26T08:00:00Z',
  prime: { value: 0.0475, asOf: '2026-10-26', since: '2026-09-03' },
  housing: { asOf: '2026-08', fixedUnlinked: 0.0462, fixedLinked: 0.0329, variableLinked: 0.0319, primeMargin: 0.0049 },
  missing: [],
};

/** Each test loads the stores fresh, so the snapshot "left by the previous visit" is read on load. */
async function load(previous?: VisitSnapshot) {
  vi.resetModules();
  localStorage.clear();
  if (previous) {
    localStorage.setItem('mashkanta:visits', JSON.stringify({ state: { last: previous, visited: [] }, version: 1 }));
  }
  const { SinceLastVisit } = await import('../SinceLastVisit');
  const { useMarket } = await import('../../store/marketStore');
  const { useVisits } = await import('../../store/visitStore');
  return { SinceLastVisit, useMarket, useVisits };
}

afterEach(cleanup);

describe('since the last visit', () => {
  it('reports what moved once fresh market figures arrive, and saves this visit', async () => {
    const { SinceLastVisit, useMarket, useVisits } = await load(lastWeek);
    useMarket.setState({ status: 'ready', market: today });
    render(<SinceLastVisit />);

    const banner = screen.getByRole('region', { name: 'מה השתנה מאז הביקור הקודם' });
    expect(banner.textContent).toContain('ריבית הפריים');
    expect(banner.textContent).toContain('5.00% ← 4.75%');
    expect(banner.textContent).toContain('לטובתך');
    expect(banner.textContent).toContain('ממוצעי המשכנתאות של אוגוסט 2026');
    expect(useVisits.getState().last?.market.prime).toBe(0.0475);

    await userEvent.setup().click(screen.getByRole('button', { name: 'הבנתי' }));
    expect(screen.queryByRole('region', { name: 'מה השתנה מאז הביקור הקודם' })).toBeNull();
  });

  it('stays quiet on a first visit and while the figures are still loading', async () => {
    const { SinceLastVisit, useMarket } = await load();
    useMarket.setState({ status: 'ready', market: today });
    const { container } = render(<SinceLastVisit />);
    expect(container.textContent).toBe('');

    cleanup();
    const second = await load(lastWeek);
    second.useMarket.setState({ status: 'loading', market: undefined });
    const { container: loading } = render(<second.SinceLastVisit />);
    expect(loading.textContent).toBe('');
  });
});
