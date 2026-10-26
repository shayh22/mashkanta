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
    window.history.replaceState(null, '', '/#/mortgage');
    document.documentElement.classList.remove('dark');
  });
  afterEach(cleanup);

  it('is a tablist with exactly one selected, focusable tab', () => {
    renderApp();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  it('moves forward with the left arrow in RTL, wraps, and updates the link', async () => {
    const user = userEvent.setup();
    renderApp();
    const [mortgage, refinance, consolidation, combined] = screen.getAllByRole('tab');
    mortgage!.focus();
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(refinance);
    expect(refinance!.getAttribute('aria-selected')).toBe('true');
    expect(window.location.hash).toBe('#/refinance');
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(consolidation);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(combined);
    expect(window.location.hash).toBe('#/combined');
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(mortgage);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(combined);
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(consolidation);
  });

  it('opens the mode named in the link', () => {
    window.history.replaceState(null, '', '/#/consolidation');
    renderApp();
    expect(screen.getByRole('tab', { name: /איחוד הלוואות/ }).getAttribute('aria-selected')).toBe('true');
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
