import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StartPage } from '../../pages/StartPage';
import { DONE, START, useQuestionnaire } from '../../store/questionnaireStore';
import { useMoney } from '../../store/moneyStore';
import { useRefinance } from '../../store/refinanceStore';
import { useConsolidation } from '../../store/consolidationStore';
import { useWizard } from '../../store/wizardStore';

beforeEach(() => {
  window.history.replaceState(null, '', '#/start');
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  useQuestionnaire.setState({ goals: [], answers: {}, at: START });
  useMoney.setState({ files: [], reading: false, pending: 0 });
  useRefinance.getState().reset();
  useConsolidation.getState().reset();
  useWizard.getState().reset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** AI on or off; נועם answers with `reply`. Returns the requests posted. */
function serve(enabled: boolean, reply?: unknown) {
  const posts: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(init.body as string) });
        return new Response(JSON.stringify({ model: 'm', answer: reply }));
      }
      return new Response(JSON.stringify({ enabled }));
    }),
  );
  return posts;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StartPage />
    </QueryClientProvider>,
  );
}

const next = () => screen.getByRole('button', { name: 'הבא' }) as HTMLButtonElement;

describe('the questionnaire', () => {
  it('starts from any of the three goals, and asks the shared questions once', async () => {
    serve(false);
    const user = userEvent.setup();
    renderPage();
    const start = screen.getByRole('button', { name: /בואו נתחיל/ }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /למחזר את המשכנתא/ }));
    await user.click(screen.getByRole('checkbox', { name: /לצאת מהמינוס/ }));
    expect(start.textContent).toContain('2 מטרות');
    await user.click(start);

    const heading = screen.getByRole('heading', { name: 'כמה נשאר לשלם על המשכנתא?' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText(/המשכנתא שלכם · 1 מתוך/)).toBeTruthy();
    expect(window.location.hash).toBe('#/start/mortgageHow');
    expect(useQuestionnaire.getState().goals).toEqual(['REFINANCE', 'RECOVERY']);
  });

  it('opens the follow-up questions an answer calls for, and goes on only once they are answered', async () => {
    serve(false);
    useQuestionnaire.setState({ goals: ['REFINANCE'], at: 'mortgageHow' });
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByLabelText('יתרה לסילוק, בערך')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'אמלא בעצמי, בערך' }));
    expect(next().disabled).toBe(true);

    await user.type(screen.getByLabelText('יתרה לסילוק, בערך'), '820000');
    expect((screen.getByLabelText('יתרה לסילוק, בערך') as HTMLInputElement).value).toBe('820,000');
    await user.type(screen.getByLabelText('החזר חודשי היום'), '50');
    expect(screen.getByText('לפחות 100 ₪')).toBeTruthy();
    await user.type(screen.getByLabelText('החזר חודשי היום'), '00');
    await user.click(screen.getByRole('radio', { name: '10–20' }));
    expect(next().disabled).toBe(false);
    expect(useQuestionnaire.getState().answers).toMatchObject({ mortgageBalance: 820_000, mortgagePayment: 5_000, mortgageYears: 'TEN_20' });

    await user.click(next());
    expect(screen.getByRole('heading', { name: 'מה הכי חשוב לכם במיחזור?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'לשאלה הקודמת' }));
    expect(screen.getByRole('heading', { name: 'כמה נשאר לשלם על המשכנתא?' })).toBeTruthy();
    expect((screen.getByLabelText('יתרה לסילוק, בערך') as HTMLInputElement).value).toBe('820,000');
  });

  it('explains from the glossary first, without the AI, and gives the focus back on closing', async () => {
    const posts = serve(true);
    useQuestionnaire.setState({ goals: ['REFINANCE'], at: 'mortgageHow' });
    const user = userEvent.setup();
    renderPage();
    const help = screen.getByRole('button', { name: 'הסבר על השאלה' });
    await user.click(help);
    const sheet = screen.getByRole('dialog', { name: 'מה זה יתרה לסילוק?' });
    expect(within(sheet).getAllByText('מהמילון · בלי AI').length).toBeGreaterThan(0);

    await user.type(within(sheet).getByLabelText('שאלה לנועם'), 'מה זה פריים?');
    await user.click(within(sheet).getByRole('button', { name: 'שליחה' }));
    expect(within(sheet).getByText(/^פריים: /)).toBeTruthy();
    expect(posts).toHaveLength(0);
    expect(within(sheet).getByRole('button', { name: 'לשאול את נועם בכל זאת' })).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(help);
  });

  it('lets נועם fill in the answers from what was written, masked, once confirmed', async () => {
    const posts = serve(true, {
      reply: 'מילאתי: החזר 4,800 ₪, 10–20 שנה.',
      fill: [
        { field: 'mortgageHow', value: 'MANUAL' },
        { field: 'mortgagePayment', value: '4800' },
        { field: 'mortgageYears', value: 'TEN_20' },
      ],
    });
    useQuestionnaire.setState({ goals: ['REFINANCE'], at: 'mortgageHow' });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'שאלו את נועם' }));
    const sheet = screen.getByRole('dialog');
    const box = within(sheet).getByLabelText('שאלה לנועם');
    await waitFor(() => expect(document.activeElement).toBe(box));
    await user.type(box, 'אני ת.ז. 000000018, משלמים 4,800 בחודש, 17 שנה');
    await user.click(within(sheet).getByRole('button', { name: 'שליחה' }));
    await within(sheet).findByText('מילאתי: החזר 4,800 ₪, 10–20 שנה.');

    expect(posts[0]!.url).toBe('/api/noam');
    expect(JSON.stringify(posts[0]!.body)).not.toContain('000000018');
    expect(within(sheet).getByText('החזר חודשי היום: 4,800 ₪')).toBeTruthy();
    expect(useQuestionnaire.getState().answers.mortgagePayment).toBeUndefined();

    await user.click(within(sheet).getByRole('button', { name: 'אישור' }));
    expect(useQuestionnaire.getState().answers).toMatchObject({ mortgageHow: 'MANUAL', mortgagePayment: 4_800, mortgageYears: 'TEN_20' });
    await user.click(within(sheet).getByRole('button', { name: 'סגירה' }));
    expect((screen.getByLabelText('החזר חודשי היום') as HTMLInputElement).value).toBe('4,800');
  });

  it('says when נועם is off, and still answers from the glossary', async () => {
    const posts = serve(false);
    useQuestionnaire.setState({ goals: ['BUY'], at: 'income' });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'שאלו את נועם' }));
    const sheet = screen.getByRole('dialog');
    await user.type(within(sheet).getByLabelText('שאלה לנועם'), 'כמה כדאי לי לבקש?');
    await user.click(within(sheet).getByRole('button', { name: 'שליחה' }));
    expect(within(sheet).getByRole('alert').textContent).toContain('נועם לא זמין');
    expect(posts).toHaveLength(0);
  });

  it('lets a document wait for later, and goes on', async () => {
    serve(false);
    useQuestionnaire.setState({ goals: ['RECOVERY'], answers: { hasMortgage: 'NO' }, at: 'statementsUpload' });
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole('button', { name: /בחרו קבצים/ })).toBeTruthy();
    expect(next().disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'אין לי עכשיו — אמשיך בלי' }));
    expect(next().disabled).toBe(false);
    await user.click(next());
    expect(screen.getByRole('heading', { name: 'מה הכי מטריד אתכם?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'המינוס בחשבון' }));
    await user.click(screen.getByRole('button', { name: 'לא מצליחים לחסוך' }));
    expect(useQuestionnaire.getState().answers.worries).toEqual(['OVERDRAFT', 'SAVING']);
  });

  it('ends on the buyer’s result — the first payment, the mix — then what was answered, each a tap from changing', async () => {
    serve(false);
    useQuestionnaire.setState({
      goals: ['BUY'],
      answers: { propertyValue: 2_000_000, segment: 'FIRST_HOME', equity: 600_000, hasEligibility: 'NO', netIncome: 22_000, hasObligations: 'NO', stability: 'BALANCED' },
      at: 'stability',
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(next());
    expect(window.location.hash).toBe('#/start/done');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'התוצאה שלכם' }));
    await screen.findByText('החזר חודשי בהתחלה', {}, { timeout: 10_000 });
    const payment = document.getElementById('buy-result')!;
    expect(payment.tagName).toBe('H3');
    expect(Number(payment.textContent!.replace(/[^\d]/g, ''))).toBeGreaterThan(3_000);
    expect(screen.getByRole('img', { name: /%/ })).toBeTruthy();
    expect(screen.getByText('סך הכל תשלמו')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'שיתוף בוואטסאפ' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(screen.queryByRole('link', { name: 'לתמהיל לדירה' })).toBeNull();

    expect(screen.getByRole('heading', { name: 'זה מה שסיפרתם' })).toBeTruthy();
    expect(screen.getByText('2,000,000 ₪')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /כמה עולה הדירה\?/ }));
    expect(screen.getByRole('heading', { name: 'כמה עולה הדירה?' })).toBeTruthy();
  }, 20_000);

  it('says how much equity is missing above the bank’s ceiling, and takes the household to change it', async () => {
    serve(false);
    useQuestionnaire.setState({
      goals: ['BUY'],
      answers: { propertyValue: 2_000_000, segment: 'UPGRADER', equity: 500_000, hasEligibility: 'NO', netIncome: 25_000, hasObligations: 'NO', stability: 'STABLE' },
      at: DONE,
    });
    window.history.replaceState(null, '', '#/start/done');
    const user = userEvent.setup();
    renderPage();
    const alert = await screen.findByText((text) => text.replace(/\u200f/g, '') === 'חסרים 100,000 ₪ הון עצמי', {}, { timeout: 10_000 });
    expect(alert.closest('[role="alert"]')!.textContent).toContain('עד 70% מהמחיר');
    await user.click(screen.getByRole('button', { name: 'לשנות את ההון העצמי' }));
    expect(screen.getByRole('heading', { name: 'כמה הון עצמי יש לכם?' })).toBeTruthy();
  }, 20_000);

  it('hands the answers to the full mix screen, for every detail and setting', async () => {
    serve(false);
    useQuestionnaire.setState({
      goals: ['BUY'],
      answers: { propertyValue: 2_000_000, segment: 'UPGRADER', equity: 500_000, hasEligibility: 'NO', netIncome: 25_000, hasObligations: 'YES', obligations: 900, stability: 'STABLE' },
      at: DONE,
    });
    window.history.replaceState(null, '', '#/start/done');
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'כל הפרטים' }, { timeout: 10_000 }));
    expect(window.location.hash).toBe('#/buy');
    // The loan asked for is kept; the wizard shows it within the upgrader's ceiling.
    expect(useWizard.getState()).toMatchObject({
      requestedLoanAmount: 1_500_000,
      profile: { propertyValue: 2_000_000, loanAmount: 1_400_000, monthlyNetIncome: 25_000, existingMonthlyObligations: 900, segment: 'UPGRADER', riskTolerance: 3 },
    });
  }, 20_000);

  it('needs no mortgage when the equity covers the price', async () => {
    serve(false);
    useQuestionnaire.setState({
      goals: ['BUY'],
      answers: { propertyValue: 1_000_000, segment: 'FIRST_HOME', equity: 1_200_000, hasEligibility: 'NO', netIncome: 25_000, hasObligations: 'NO', stability: 'STABLE' },
      at: DONE,
    });
    window.history.replaceState(null, '', '#/start/done');
    renderPage();
    expect(screen.getByRole('heading', { name: 'אין צורך במשכנתא' })).toBeTruthy();
    expect(screen.getByText(/ונשארים \u200f?200,000/)).toBeTruthy();
  });

  it('links each goal whose result is not here yet to its page', async () => {
    serve(false);
    useQuestionnaire.setState({ goals: ['RECOVERY'], answers: { hasMortgage: 'NO', statementsFiles: 'LATER', worries: ['SAVING'], hasLoans: 'NO' }, at: DONE });
    window.history.replaceState(null, '', '#/start/done');
    renderPage();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'זה מה שסיפרתם' }));
    expect(screen.getByRole('link', { name: 'לתוכנית ההבראה' }).getAttribute('href')).toBe('#/money');
  });

  it('offers to pick up where the household stopped, or to start again', async () => {
    serve(false);
    useQuestionnaire.setState({ goals: ['BUY'], answers: { propertyValue: 2_000_000 }, at: START });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'להמשיך' }));
    expect(screen.getByRole('heading', { name: 'איזו דירה זו בשבילכם?' })).toBeTruthy();

    cleanup();
    useQuestionnaire.setState({ at: START });
    window.history.replaceState(null, '', '#/start');
    renderPage();
    await user.click(screen.getByRole('button', { name: 'להתחיל מחדש' }));
    expect(useQuestionnaire.getState()).toMatchObject({ goals: [], answers: {}, at: START });
    expect(screen.queryByText('להמשיך מאיפה שעצרתם?')).toBeNull();
  });

  it('follows the browser’s Back and a link to a screen', async () => {
    serve(false);
    useQuestionnaire.setState({ goals: ['BUY'], answers: { propertyValue: 2_000_000 }, at: 'price' });
    window.history.replaceState(null, '', '#/start/equity');
    renderPage();
    expect(screen.getByRole('heading', { name: 'כמה הון עצמי יש לכם?' })).toBeTruthy();
    window.history.replaceState(null, '', '#/start/price');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await screen.findByRole('heading', { name: 'כמה עולה הדירה?' });
  });
});
