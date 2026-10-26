import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../../App';

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

describe('mode navigation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/#/buy');
    document.documentElement.classList.remove('dark');
  });
  afterEach(cleanup);

  it('offers two paths as a tablist with one selected, focusable tab', () => {
    renderApp();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['יש לי משכנתא', 'קונים דירה']);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0]);
  });

  it('moves with the arrow keys, right to left, and updates the link', async () => {
    const user = userEvent.setup();
    renderApp();
    const [own, buy] = screen.getAllByRole('tab');
    buy!.focus();
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(own);
    expect(own!.getAttribute('aria-selected')).toBe('true');
    expect(window.location.hash).toBe('#/own');
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(buy);
    expect(window.location.hash).toBe('#/buy');
  });

  it.each([
    ['#/refinance/results', 'יש לי משכנתא', '#/own'],
    ['#/consolidation', 'יש לי משכנתא', '#/own'],
    ['#/combined/plan', 'יש לי משכנתא', '#/own'],
    ['#/mortgage', 'קונים דירה', '#/buy'],
  ])('sends an old link %s to the path that replaced it', (hash, tab, now) => {
    window.history.replaceState(null, '', `/${hash}`);
    renderApp();
    expect(screen.getByRole('tab', { name: tab }).getAttribute('aria-selected')).toBe('true');
    expect(window.location.hash).toBe(now);
  });

  it('toggles the dark theme from the header', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'מעבר למצב כהה' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'מעבר למצב בהיר' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
