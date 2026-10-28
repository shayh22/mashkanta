import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../../App';
import { START, useQuestionnaire } from '../../store/questionnaireStore';

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

const picked = (name: RegExp) => (screen.getByRole('checkbox', { name }) as HTMLInputElement).checked;

describe('navigation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    document.documentElement.classList.remove('dark');
    useQuestionnaire.setState({ goals: [], answers: {}, at: START });
  });
  afterEach(cleanup);

  it('is the questionnaire, with no tabs and no other tools beside it', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: 'מה נסדר היום?' }, { timeout: 10_000 })).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByRole('navigation', { name: 'הכלים המלאים' })).toBeNull();
    expect(screen.getByRole('link', { name: /לדף הבית/ }).getAttribute('href')).toBe('#/start');
  });

  it.each([
    ['#/own', /למחזר את המשכנתא/],
    ['#/refinance/results', /למחזר את המשכנתא/],
    ['#/consolidation', /למחזר את המשכנתא/],
    ['#/buy', /לקנות דירה/],
    ['#/mortgage', /לקנות דירה/],
    ['#/money', /לצאת מהמינוס/],
  ])('sends the old address %s to the questionnaire, its goal chosen', async (hash, goal) => {
    window.history.replaceState(null, '', `/${hash}`);
    renderApp();
    expect(await screen.findByRole('heading', { name: 'מה נסדר היום?' }, { timeout: 10_000 })).toBeTruthy();
    expect(window.location.hash).toBe('#/start');
    expect(picked(goal)).toBe(true);
  });

  it('leaves the goals already chosen as they are', async () => {
    useQuestionnaire.setState({ goals: ['RECOVERY'] });
    window.history.replaceState(null, '', '/#/buy');
    renderApp();
    expect(await screen.findByRole('heading', { name: 'מה נסדר היום?' }, { timeout: 10_000 })).toBeTruthy();
    expect(useQuestionnaire.getState().goals).toEqual(['RECOVERY']);
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
