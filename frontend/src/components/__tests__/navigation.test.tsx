import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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

describe('navigation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/#/buy');
    document.documentElement.classList.remove('dark');
  });
  afterEach(cleanup);

  it('opens on the questionnaire, with no tabs, and the full tools a link away in the footer', async () => {
    window.history.replaceState(null, '', '/');
    renderApp();
    expect(await screen.findByRole('heading', { name: 'מה נסדר היום?' }, { timeout: 10_000 })).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    const tools = screen.getByRole('navigation', { name: 'הכלים המלאים' });
    expect(within(tools).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['#/own', '#/buy', '#/money']);
    expect(screen.getByRole('link', { name: /לדף הבית/ }).getAttribute('href')).toBe('#/start');
  });

  it('opens a full tool at its own address, with the way back to the questionnaire', () => {
    renderApp();
    const bar = screen.getByRole('navigation', { name: 'כלים מתקדמים' });
    expect(bar.textContent).toContain('קונים דירה');
    expect(within(bar).getByRole('link', { name: /חזרה לשאלון/ }).getAttribute('href')).toBe('#/start');
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it.each([
    ['#/refinance/results', 'יש לי משכנתא', '#/own'],
    ['#/consolidation', 'יש לי משכנתא', '#/own'],
    ['#/combined/plan', 'יש לי משכנתא', '#/own'],
    ['#/mortgage', 'קונים דירה', '#/buy'],
  ])('sends an old link %s to the tool that replaced it', (hash, tool, now) => {
    window.history.replaceState(null, '', `/${hash}`);
    renderApp();
    expect(screen.getByRole('navigation', { name: 'כלים מתקדמים' }).textContent).toContain(tool);
    expect(window.location.hash).toBe(now);
  });

  it('opens the questionnaire for an address it does not know', async () => {
    window.history.replaceState(null, '', '/#/constructor');
    renderApp();
    expect(await screen.findByRole('heading', { name: 'מה נסדר היום?' }, { timeout: 10_000 })).toBeTruthy();
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
