import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OwnPage } from '../../pages/OwnPage';
import { useCombinedSettings } from '../../store/combinedStore';
import { useConsolidation } from '../../store/consolidationStore';
import { useFlow } from '../../store/flowStore';
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
  window.history.replaceState(null, '', '#/own');
  useRefinance.getState().reset();
  useConsolidation.getState().reset();
  useFlow.setState({ hasDebts: undefined });
  useCombinedSettings.setState({ financeCosts: true });
});
afterEach(cleanup);

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OwnPage />
    </QueryClientProvider>,
  );
}

describe("the homeowner's path", () => {
  it('goes from the data to the result, where the mix chosen by the engine is in front', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByText('המשכנתא הקיימת')).toBeTruthy();
    // The illustrative loans the app starts with do not count as the borrower's own.
    expect(screen.getByRole('button', { name: 'אין' }).getAttribute('aria-pressed')).toBe('true');

    await user.click(screen.getByRole('button', { name: /לתוצאה/ }));
    expect(window.location.hash).toBe('#/own/result');
    const result = screen.getByRole('region', { name: 'התוצאה' });
    expect(within(result).getByText('מיחזור המשכנתא')).toBeTruthy();

    const mix = screen.getByRole('region', { name: /התמהיל שנבחר לכם/ });
    expect(within(mix).getByText('נבחר על ידי המנוע לפי ההכנסה ורמת הסיכון שלכם')).toBeTruthy();
    expect(within(mix).getByText('החזר חודשי חדש')).toBeTruthy();
    expect(screen.queryByRole('region', { name: /הלוואה לאיחוד/ })).toBeNull();
  });

  it('adds the consolidation loan when there are other loans', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'יש' }));
    expect(screen.getByText('התחייבויות קיימות')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /לתוצאה/ }));

    expect(within(screen.getByRole('region', { name: 'התוצאה' })).getByText('מיחזור + איחוד הלוואות')).toBeTruthy();
    const loan = screen.getByRole('region', { name: /הלוואה לאיחוד/ });
    expect(within(loan).getByText(/סוגרת 3 הלוואות/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /מה עושים עכשיו/ }));
    expect(screen.getByText('תוכנית פעולה — מיחזור ואיחוד במהלך אחד')).toBeTruthy();
  });

  it('opens the mix editor from the card, and a different choice shows at once', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#/own/result');
    renderPage();
    await user.click(screen.getByRole('button', { name: 'שינוי התמהיל' }));
    expect(screen.getByRole('button', { name: /^שינוי התמהיל.*בחירת המנוע/ }).getAttribute('aria-expanded')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'אותו תמהיל' }));
    expect(useRefinance.getState().proposalMode).toBe('AUTO');
    expect(screen.getByText('אותם מסלולים כמו היום, במחיר שוק')).toBeTruthy();
  });

  it('keeps the details folded until opened', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#/own/result');
    useFlow.setState({ hasDebts: true });
    renderPage();
    const toggle = screen.getByRole('button', { name: /האיחוד: רגולציה ותזרים/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('איחוד בלבד מול איחוד + מיחזור')).toBeNull();
    await user.click(toggle);
    // The section's charts load with it.
    expect(await screen.findByText('איחוד בלבד מול איחוד + מיחזור', {}, { timeout: 5_000 })).toBeTruthy();
    await user.click(screen.getByRole('switch', { name: /לממן את עמלות המיחזור/ }));
    expect(useCombinedSettings.getState().financeCosts).toBe(false);
  });
});
