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
  it('shows both moves together and one plan for them', () => {
    renderPage();
    const result = screen.getByRole('region', { name: 'תוצאת המהלך המשולב' });
    expect(within(result).getByText('אחרי שני המהלכים')).toBeTruthy();
    expect(screen.getByText('איחוד בלבד מול איחוד + מיחזור')).toBeTruthy();
    expect(screen.getByText('תוכנית פעולה — מיחזור ואיחוד במהלך אחד')).toBeTruthy();
    // Edit links lead back to the single-move inputs.
    expect(screen.getAllByRole('link', { name: 'עריכה' }).map((link) => link.getAttribute('href'))).toEqual([
      '#/refinance',
      '#/consolidation',
    ]);
  });

  it('switches between financing the refinance costs and paying them in cash', async () => {
    const user = userEvent.setup();
    renderPage();
    const toggle = screen.getByRole('switch', { name: /לממן את עמלות המיחזור/ });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await user.click(toggle);
    expect(useCombinedSettings.getState().financeCosts).toBe(false);
    expect(screen.getByText(/הכינו .* במזומן/)).toBeTruthy();
  });
});
