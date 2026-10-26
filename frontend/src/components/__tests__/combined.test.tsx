import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CombinedPage } from '../../pages/CombinedPage';
import { useCombinedSettings } from '../../store/combinedStore';
import { useConsolidation } from '../../store/consolidationStore';
import { useRefinance } from '../../store/refinanceStore';

beforeAll(() => {
  // Recharts measures its container; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  window.history.replaceState(null, '', '#/combined');
  useRefinance.getState().reset();
  useConsolidation.getState().reset();
  useCombinedSettings.setState({ financeCosts: true });
});
afterEach(cleanup);

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CombinedPage />
    </QueryClientProvider>,
  );
}

describe('combined refinance and consolidation page', () => {
  it('keeps the result in view and shows each part of the move in its own tab', async () => {
    const user = userEvent.setup();
    renderPage();
    const result = screen.getByRole('region', { name: 'תוצאת המהלך המשולב' });
    expect(within(result).getByText('החזר חודשי כולל')).toBeTruthy();
    expect(within(result).getByText('חמצן תזרימי')).toBeTruthy();

    // The inputs tab opens first; its edit links lead to the matching tab of each single move.
    expect(screen.getByRole('tab', { name: /הנתונים/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByRole('link', { name: 'עריכה' }).map((link) => link.getAttribute('href'))).toEqual([
      '#/refinance/data',
      '#/consolidation/household',
    ]);

    await user.click(screen.getByRole('tab', { name: /איחוד בלבד מול משולב/ }));
    expect(screen.getByText('איחוד בלבד מול איחוד + מיחזור')).toBeTruthy();
    expect(window.location.hash).toBe('#/combined/compare');

    await user.click(screen.getByRole('button', { name: /הבא: תזרים וסיכון/ }));
    expect(screen.getByRole('tab', { name: /תזרים וסיכון/ }).getAttribute('aria-selected')).toBe('true');

    await user.click(screen.getByRole('tab', { name: /תוכנית פעולה/ }));
    expect(screen.getByText('תוכנית פעולה — מיחזור ואיחוד במהלך אחד')).toBeTruthy();
  });

  it('switches between financing the refinance costs and paying them in cash', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('tab', { name: /איחוד בלבד מול משולב/ }));
    const toggle = screen.getByRole('switch', { name: /לממן את עמלות המיחזור/ });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await user.click(toggle);
    expect(useCombinedSettings.getState().financeCosts).toBe(false);
    await user.click(screen.getByRole('tab', { name: /תוכנית פעולה/ }));
    expect(screen.getByText(/הכינו .* במזומן/)).toBeTruthy();
  });

  it('moves between section tabs with the arrow keys, right to left', async () => {
    const user = userEvent.setup();
    renderPage();
    const first = screen.getByRole('tab', { name: /הנתונים/ });
    first.focus();
    await user.keyboard('{ArrowLeft}');
    const second = screen.getByRole('tab', { name: /איחוד בלבד מול משולב/ });
    expect(second.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(second);
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: /תוכנית פעולה/ }).getAttribute('aria-selected')).toBe('true');
    // Only the selected tab is in the tab order.
    expect(screen.getAllByRole('tab').filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
  });

  it('opens the section named in the link', () => {
    window.history.replaceState(null, '', '#/combined/cashflow');
    renderPage();
    expect(screen.getByRole('tab', { name: /תזרים וסיכון/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('combined-tab-cashflow');
  });
});
