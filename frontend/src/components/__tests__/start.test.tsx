import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SharedPage, StartPage } from '../../pages/StartPage';
import { decodeShared } from '../../engine/flow/share';
import { DONE, START, useQuestionnaire } from '../../store/questionnaireStore';
import { useMoney, useMoneyCategories } from '../../store/moneyStore';
import { BANK_CSV, CARD_ROWS } from '../../engine/money/__fixtures__/statements';
import { useRefinance } from '../../store/refinanceStore';
import { useConsolidation } from '../../store/consolidationStore';
import { useWizard } from '../../store/wizardStore';
import { scheduleText } from '../../engine/__fixtures__/schedule';

beforeEach(() => {
  window.history.replaceState(null, '', '#/start');
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  useQuestionnaire.setState({ goals: [], answers: {}, at: START, done: [] });
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
    expect(screen.getByRole('heading', { name: 'כמה שווה הדירה היום, בערך?' })).toBeTruthy();
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

  /** Opens a result screen directly, as a later visit would. */
  const openAt = (at: string) => {
    useQuestionnaire.setState({ at });
    window.history.replaceState(null, '', at === DONE ? '#/start/done' : `#/start/${at}`);
  };
  const go = (title: string) => userEvent.setup().click(screen.getByRole('button', { name: `הבא: ${title}` }));

  it('ends on the situation today, then where it improves, the banks and the plan — each a screen of its own', async () => {
    serve(false);
    useQuestionnaire.setState({
      goals: ['BUY'],
      answers: { propertyValue: 2_000_000, segment: 'FIRST_HOME', equity: 600_000, hasEligibility: 'NO', netIncome: 22_000, hasObligations: 'NO', stability: 'BALANCED' },
      at: 'stability',
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(next());

    // Today: the price, what the household brings and what it must borrow.
    expect(window.location.hash).toBe('#/start/done');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'המצב היום' }));
    const steps = screen.getByRole('navigation', { name: 'שלבי התוצאה' });
    expect(within(steps).getAllByRole('button').map((button) => button.textContent)).toEqual(['המצב היום', 'איפה משפרים', 'השוואה בין בנקים', 'התוכנית']);
    expect(within(steps).getByRole('button', { name: 'המצב היום' }).getAttribute('aria-current')).toBe('step');
    const home = screen.getByRole('region', { name: 'הדירה' });
    expect(within(home).getByRole('img', { name: /^המחיר: הון עצמי .*משכנתא/ })).toBeTruthy();
    expect(within(home).getByText('צריך ללוות')).toBeTruthy();
    expect(within(home).getByText('אחוז מימון').nextSibling!.textContent).toBe('70%');

    // Where it improves: the mix, the first payment.
    await user.click(screen.getByRole('button', { name: 'הבא: איפה משפרים' }));
    expect(window.location.hash).toBe('#/start/improve');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'איפה משפרים' }));
    await screen.findByText('החזר חודשי בהתחלה', {}, { timeout: 10_000 });
    const payment = document.getElementById('buy-result')!;
    expect(payment.tagName).toBe('H3');
    expect(Number(payment.textContent!.replace(/[^\d]/g, ''))).toBeGreaterThan(3_000);
    expect(screen.getByRole('img', { name: /%/ })).toBeTruthy();
    expect(screen.getByText('סך הכל תשלמו')).toBeTruthy();

    // The banks, for that mix: the cheapest first, each other one by what it costs more.
    await user.click(screen.getByRole('button', { name: 'הבא: השוואה בין בנקים' }));
    const banks = screen.getByRole('region', { name: 'הבנקים, לתמהיל הזה' });
    expect(within(banks).getByText('הזול לתמהיל הזה')).toBeTruthy();
    expect(within(banks).getAllByText(/^יקר ב-/).length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'מול הסלים האחידים של הבנקים' })).toBeTruthy();

    // The plan: what to do now, the report, the link and what was answered.
    await user.click(screen.getByRole('button', { name: 'הבא: התוכנית' }));
    expect(window.location.hash).toBe('#/start/plan');
    expect(screen.queryByRole('button', { name: /^הבא/ })).toBeNull();
    const whatsapp = screen.getByRole('link', { name: 'שיתוף בוואטסאפ' }).getAttribute('href')!;
    expect(whatsapp).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(whatsapp)).toContain(`${window.location.origin}/#/s/`);

    const tasks = screen.getByRole('region', { name: 'מה עושים עכשיו' });
    expect(within(tasks).getByText(/להציג לבנקים את התמהיל: .*%/)).toBeTruthy();
    expect(within(tasks).queryByText(/הון עצמי/)).toBeNull();
    const approval = within(tasks).getByRole('checkbox', { name: 'לבקש אישור עקרוני מ-3 בנקים לפחות' }) as HTMLInputElement;
    const count = within(tasks).getByText(/^נשארו/).textContent;
    await user.click(approval);
    expect(approval.checked).toBe(true);
    expect(useQuestionnaire.getState().done).toContain('buy-approval');
    expect(within(tasks).getByText(/^נשארו/).textContent).not.toBe(count);

    // The report: every screen at once, through the browser's print.
    let printed = '';
    const print = vi.fn(() => {
      expect(document.body.dataset.print).toBe('report');
      printed = document.querySelector('.report')!.textContent!;
    });
    window.print = print;
    await user.click(screen.getByRole('button', { name: 'דוח PDF' }));
    expect(print).toHaveBeenCalledOnce();
    for (const part of ['המצב היום', 'צריך ללוות', 'החזר חודשי בהתחלה', 'הבנקים, לתמהיל הזה', 'מה עושים עכשיו']) {
      expect(printed).toContain(part);
    }
    window.dispatchEvent(new Event('afterprint'));
    await waitFor(() => expect(document.querySelector('.report')).toBeNull());
    expect(document.body.dataset.print).toBeUndefined();

    expect(screen.getByRole('heading', { name: 'זה מה שסיפרתם' })).toBeTruthy();
    expect(screen.getByText('2,000,000 ₪')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /כמה עולה הדירה\?/ }));
    expect(screen.getByRole('heading', { name: 'כמה עולה הדירה?' })).toBeTruthy();
  }, 30_000);

  it('walks back through the result screens, and from the first to the questions', async () => {
    serve(false);
    useQuestionnaire.setState({
      goals: ['BUY'],
      answers: { propertyValue: 2_000_000, segment: 'FIRST_HOME', equity: 600_000, hasEligibility: 'NO', netIncome: 22_000, hasObligations: 'NO', stability: 'BALANCED' },
    });
    openAt('compare');
    const user = userEvent.setup();
    renderPage();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'השוואה בין בנקים' }));
    await user.click(screen.getByRole('button', { name: 'חזרה: איפה משפרים' }));
    await user.click(screen.getByRole('button', { name: 'חזרה: המצב היום' }));
    await user.click(screen.getByRole('button', { name: 'חזרה לשאלות' }));
    expect(screen.getByRole('heading', { name: 'מה חשוב לכם יותר?' })).toBeTruthy();
  });

  it('says how much equity is missing above the bank’s ceiling, and takes the household to change it', async () => {
    serve(false);
    useQuestionnaire.setState({
      goals: ['BUY'],
      answers: { propertyValue: 2_000_000, segment: 'UPGRADER', equity: 500_000, hasEligibility: 'NO', netIncome: 25_000, hasObligations: 'NO', stability: 'STABLE' },
    });
    openAt('improve');
    const user = userEvent.setup();
    renderPage();
    const alert = await screen.findByText((text) => text.replace(/\u200f/g, '') === 'חסרים 100,000 ₪ הון עצמי', {}, { timeout: 10_000 });
    expect(alert.closest('[role="alert"]')!.textContent).toContain('עד 70% מהמחיר');
    await user.click(screen.getByRole('button', { name: 'לשנות את ההון העצמי' }));
    expect(screen.getByRole('heading', { name: 'כמה הון עצמי יש לכם?' })).toBeTruthy();
  }, 20_000);

  it('opens the mix’s details in the questionnaire’s own screen, where the term and the risk can be tried', async () => {
    serve(false);
    useQuestionnaire.setState({
      goals: ['BUY'],
      answers: { propertyValue: 2_000_000, segment: 'UPGRADER', equity: 600_000, hasEligibility: 'NO', netIncome: 30_000, hasObligations: 'NO', stability: 'BALANCED' },
    });
    openAt('improve');
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'כל הפרטים' }, { timeout: 10_000 }));
    expect(window.location.hash).toBe('#/start/details-buy');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'פרטי התמהיל' }));
    for (const panel of ['המסלולים', 'אם הריבית או המדד יעלו']) {
      expect(await screen.findByRole('region', { name: panel }, { timeout: 10_000 })).toBeTruthy();
    }
    await user.click(screen.getByRole('radio', { name: '20 שנים' }));
    expect(useQuestionnaire.getState().answers.termYears).toBe(20);
    await user.click(screen.getByRole('radio', { name: 'יציבות' }));
    expect(useQuestionnaire.getState().answers.stability).toBe('STABLE');
    await user.click(screen.getAllByRole('button', { name: 'חזרה לתוצאה' })[0]!);
    expect(window.location.hash).toBe('#/start/improve');
    expect(screen.getByRole('heading', { name: 'איפה משפרים' })).toBeTruthy();
  }, 30_000);

  it('needs no mortgage when the equity covers the price, and has no banks to compare', async () => {
    serve(false);
    useQuestionnaire.setState({
      goals: ['BUY'],
      answers: { propertyValue: 1_000_000, segment: 'FIRST_HOME', equity: 1_200_000, hasEligibility: 'NO', netIncome: 25_000, hasObligations: 'NO', stability: 'STABLE' },
    });
    openAt('improve');
    renderPage();
    expect(screen.getByRole('heading', { name: 'אין צורך במשכנתא' })).toBeTruthy();
    expect(screen.getByText(/ונשארים \u200f?200,000/)).toBeTruthy();
  });

  const typedMortgage = {
    mortgageHow: 'MANUAL',
    mortgageBalance: 800_000,
    mortgagePayment: 7_200,
    mortgageYears: 'TEN_20',
    homeValue: 2_400_000,
    refinanceGoal: 'LOWER_PAYMENT',
    netIncome: 28_000,
    stability: 'BALANCED',
    hasLoans: 'NO',
  };

  it('shows the typed-in mortgage today, estimates the refinance, ranks the banks and points to the exact check', async () => {
    serve(false);
    useQuestionnaire.setState({ goals: ['REFINANCE'], answers: typedMortgage });
    openAt(DONE);
    const user = userEvent.setup();
    renderPage();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'המצב היום' }));
    const today = screen.getByRole('region', { name: 'המשכנתא היום' });
    expect(within(today).getByText('הריבית שזה אומר, בערך')).toBeTruthy();
    expect(within(today).getByText('אחוז מימון היום').nextSibling!.textContent).toBe('33%');

    await go('איפה משפרים');
    await screen.findByText('הערכה ממה שמילאתם', {}, { timeout: 10_000 });
    expect(screen.getByText('ההחזר החודשי יורד ב-')).toBeTruthy();
    expect(Number(document.getElementById('refinance-result')!.textContent!.replace(/[^\d]/g, ''))).toBeGreaterThan(0);
    expect(screen.getByText('הריבית שלכם, בערך')).toBeTruthy();
    expect(screen.getByRole('img', { name: /^היום .*אחרי/ })).toBeTruthy();

    await go('השוואה בין בנקים');
    expect(within(await screen.findByRole('region', { name: 'הבנקים, לתמהיל החדש' }, { timeout: 10_000 })).getByText('הזול לתמהיל הזה')).toBeTruthy();
    await go('התוכנית');
    expect(within(screen.getByRole('region', { name: 'מה עושים עכשיו' })).getByText('להוריד דוח יתרות מאתר הבנק ולהעלות אותו לבדיקה מדויקת')).toBeTruthy();

    await user.click(within(screen.getByRole('navigation', { name: 'שלבי התוצאה' })).getByRole('button', { name: 'איפה משפרים' }));
    await user.click(await screen.findByRole('button', { name: 'כל הפרטים' }));
    expect(screen.getByRole('heading', { name: 'פרטי ההערכה' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'המשכנתא כמו שמילאתם' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'להעלות את הדוח' }));
    expect(screen.getByRole('heading', { name: 'כמה נשאר לשלם על המשכנתא?' })).toBeTruthy();
  }, 30_000);

  it('leads with what is saved over the loan when that is the goal', async () => {
    serve(false);
    useQuestionnaire.setState({ goals: ['REFINANCE'], answers: { ...typedMortgage, refinanceGoal: 'LESS_INTEREST' } });
    openAt('improve');
    renderPage();
    await screen.findByText('הערכה ממה שמילאתם', {}, { timeout: 10_000 });
    expect(screen.getByText('חוסכים לאורך כל התקופה')).toBeTruthy();
  }, 20_000);

  it('says when the typed-in figures cannot be one mortgage', async () => {
    serve(false);
    useQuestionnaire.setState({ goals: ['REFINANCE'], answers: { ...typedMortgage, mortgagePayment: 2_000 } });
    openAt('improve');
    renderPage();
    expect(screen.getByRole('heading', { name: 'ההחזר והיתרה לא מסתדרים' })).toBeTruthy();
  });

  it('checks the uploaded mortgage exactly — each track today, fees, the two routes, payback — with the answers in it', async () => {
    serve(false);
    useRefinance.getState().setTracks([
      { id: 'a', type: 'FIXED_UNLINKED', balance: 500_000, annualRate: 0.068, remainingMonths: 240, monthsElapsed: 60 },
      { id: 'b', type: 'PRIME', balance: 300_000, annualRate: 0.0625, remainingMonths: 240, monthsElapsed: 60 },
    ]);
    useQuestionnaire.setState({ goals: ['REFINANCE'], answers: { mortgageHow: 'UPLOAD', homeValue: 2_400_000, refinanceGoal: 'LOWER_PAYMENT', netIncome: 28_000, stability: 'STABLE', hasLoans: 'NO' } });
    openAt(DONE);
    const user = userEvent.setup();
    renderPage();
    const today = screen.getByRole('region', { name: 'המשכנתא היום' });
    expect(within(today).getAllByRole('listitem')).toHaveLength(2);
    expect(within(today).getByRole('img', { name: /^המסלולים: קבועה לא צמודה .*פריים/ })).toBeTruthy();
    expect(within(today).getByText('יתרה').nextSibling!.textContent).toMatch(/800,000/);
    expect(within(today).getByRole('img').getAttribute('aria-label')).toContain('קבועה לא צמודה');

    await go('איפה משפרים');
    await screen.findByText('עלות המעבר, כולל עמלות', {}, { timeout: 10_000 });
    expect(screen.getByText('הדרך המשתלמת')).toBeTruthy();
    expect(screen.getByText('מחזיר את עצמו תוך')).toBeTruthy();
    expect(screen.queryByText('הערכה ממה שמילאתם')).toBeNull();
    expect(useRefinance.getState().propertyValue).toBe(2_400_000);
    expect(useConsolidation.getState().netIncome).toBe(28_000);

    await go('השוואה בין בנקים');
    expect(screen.getByRole('region', { name: 'שתי הדרכים' })).toBeTruthy();

    // The link carries the exact result's figures, since the report itself cannot travel.
    await go('התוכנית');
    const href = decodeURIComponent(screen.getByRole('link', { name: 'שיתוף בוואטסאפ' }).getAttribute('href')!);
    expect(decodeShared(href.slice(href.indexOf('#/s/') + 4).trim())!.refinance).toMatchObject({ route: expect.stringMatching(/INTERNAL|EXTERNAL/) });

    await user.click(within(screen.getByRole('navigation', { name: 'שלבי התוצאה' })).getByRole('button', { name: 'איפה משפרים' }));
    await user.click(screen.getByRole('button', { name: 'כל הפרטים' }));
    expect(window.location.hash).toBe('#/start/details-refinance');
    expect(within(screen.getByRole('region', { name: 'המסלולים שלכם היום' })).getAllByRole('listitem')).toHaveLength(2);
    expect(within(screen.getByRole('region', { name: 'מה עולה המעבר' })).getByText('עמלת פירעון מוקדם')).toBeTruthy();
  }, 30_000);

  it('shows each result under its own name when there are two', async () => {
    serve(false);
    useQuestionnaire.setState({
      goals: ['REFINANCE', 'BUY'],
      answers: { ...typedMortgage, propertyValue: 2_000_000, segment: 'UPGRADER', equity: 800_000, hasEligibility: 'NO', hasObligations: 'NO' },
    });
    openAt('improve');
    renderPage();
    await screen.findByText('החזר חודשי בהתחלה', {}, { timeout: 10_000 });
    expect(screen.getByText('המשכנתא')).toBeTruthy();
    expect(screen.getByText('הדירה', { selector: 'span' })).toBeTruthy();
  }, 20_000);

  it('lists the loans today, each with what it costs a month', () => {
    serve(false);
    useConsolidation.setState({
      debts: [
        { id: 'l1', kind: 'CAR', label: 'הלוואה לרכב', balance: 60_000, annualRate: 0.08, monthlyPayment: 1_500, remainingMonths: 48, include: false },
        { id: 'l2', kind: 'CREDIT_CARD', label: 'כרטיס', balance: 12_000, annualRate: 0.12, monthlyPayment: 600, remainingMonths: 20, include: false },
      ],
    });
    useQuestionnaire.setState({ goals: ['REFINANCE'], answers: { ...typedMortgage, hasLoans: 'YES' } });
    openAt(DONE);
    renderPage();
    const loans = screen.getByRole('region', { name: 'ההלוואות' });
    expect(within(loans).getAllByRole('listitem')).toHaveLength(2);
    expect(within(loans).getByText('כל ההלוואות, בחודש').nextSibling!.textContent!.replace(/\u200f/g, '')).toContain('2,100');
  });

  it('lists every loan read, adds each new document to the list, and keeps the same loan once', async () => {
    serve(false);
    if (!Blob.prototype.arrayBuffer) {
      Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
        return new Promise<ArrayBuffer>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.readAsArrayBuffer(this);
        });
      };
    }
    useQuestionnaire.setState({ goals: ['REFINANCE'], answers: { mortgageHow: 'MANUAL', hasLoans: 'YES' }, at: 'loansUpload' });
    window.history.replaceState(null, '', '#/start/loansUpload');
    const user = userEvent.setup();
    renderPage();
    const car = new File([scheduleText('bank', 'שיעור ריבית 6%', 80_000)], 'car.txt', { type: 'text/plain' });
    const renovation = new File([scheduleText('bank', 'שיעור ריבית 6%', 40_000)], 'renovation.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('בחירת מסמכי הלוואות'), [car, renovation]);
    // The documents are read one after the other: wait for both.
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'ההלוואות שלכם' })).getAllByRole('listitem')).toHaveLength(2));
    const list = screen.getByRole('region', { name: 'ההלוואות שלכם' });
    expect(next().disabled).toBe(false);

    await user.upload(screen.getByLabelText('בחירת מסמכי הלוואות'), car);
    await screen.findByText('ההלוואה הזו כבר ברשימה');
    expect(within(screen.getByRole('region', { name: 'ההלוואות שלכם' })).getAllByRole('listitem')).toHaveLength(2);

    await user.click(within(list).getAllByRole('button', { name: /^הסרת/ })[0]!);
    expect(within(screen.getByRole('region', { name: 'ההלוואות שלכם' })).getAllByRole('listitem')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'הוספת הלוואה ידנית' }));
    await user.type(screen.getByLabelText('מה ההלוואה'), 'כרטיס');
    await user.type(screen.getByLabelText('יתרה ₪'), '12000');
    await user.type(screen.getByLabelText('החזר בחודש ₪'), '600');
    await user.click(screen.getByRole('button', { name: 'הוספה' }));
    const loans = within(screen.getByRole('region', { name: 'ההלוואות שלכם' })).getAllByRole('listitem');
    expect(loans).toHaveLength(2);
    expect(useConsolidation.getState().debts.find((debt) => debt.label === 'כרטיס')).toMatchObject({ balance: 12_000, monthlyPayment: 600, remainingMonths: 20 });
  });

  /** The fixtures' card export as CSV, as a card company would give it. */
  const cardFile = () => {
    const dayOf = (excel: number) => {
      const iso = new Date(Date.UTC(1899, 11, 30) + excel * 86_400_000).toISOString();
      return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    };
    const csv = CARD_ROWS.map((row) =>
      row.map((cell, column) => (cell === null ? '' : `"${(typeof cell === 'number' && (column === 0 || column === 4) ? dayOf(cell) : String(cell)).replace(/"/g, '""')}"`)).join(','),
    ).join('\n');
    return new File([csv], 'card.csv', { type: 'text/csv' });
  };

  it('walks a recovery plan: the statements, what each unclear charge is, what can go, and the month after', async () => {
    serve(false);
    if (!Blob.prototype.arrayBuffer) {
      Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
        return new Promise<ArrayBuffer>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.readAsArrayBuffer(this);
        });
      };
    }
    useMoneyCategories.setState({ explanations: {} });
    useQuestionnaire.setState({ goals: ['RECOVERY'], answers: { hasMortgage: 'NO' }, at: 'statementsUpload' });
    window.history.replaceState(null, '', '#/start/statementsUpload');
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('בחירת קבצי עו״ש או כרטיס אשראי'), [new File([BANK_CSV], 'bank.csv', { type: 'text/csv' }), cardFile()]);
    await waitFor(() => expect(next().disabled).toBe(false));
    await user.click(next());

    expect(screen.getByRole('heading', { name: 'מה החיובים האלה?' })).toBeTruthy();
    const what = screen.getByRole('radiogroup', { name: /חנות הדוגמאות/ });
    await user.click(within(what).getByRole('radio', { name: 'מנוי' }));
    expect(useMoneyCategories.getState().explanations['חנות הדוגמאות']).toMatchObject({ category: 'SUBSCRIPTIONS' });
    // Answering keeps it on the screen, though it has left "other".
    expect(within(screen.getByRole('radiogroup', { name: /חנות הדוגמאות/ })).getByRole('radio', { name: 'מנוי' }).getAttribute('aria-checked')).toBe('true');
    await user.click(next());

    expect(screen.getByRole('heading', { name: 'מה מזה אפשר לבטל או לצמצם?' })).toBeTruthy();
    await user.click(within(screen.getByRole('radiogroup', { name: /חנות הדוגמאות/ })).getByRole('radio', { name: 'לבטל' }));
    expect(useMoneyCategories.getState().explanations['חנות הדוגמאות']).toMatchObject({ flexibility: 'CANCEL' });
    await user.click(next());
    await user.click(screen.getByRole('button', { name: 'לא מצליחים לחסוך' }));
    await user.click(next());
    await user.click(screen.getByRole('radio', { name: 'לא' }));
    await user.click(next());

    // Today: the month as it is, and where the money goes.
    expect(window.location.hash).toBe('#/start/done');
    const account = screen.getByRole('region', { name: 'החשבון' });
    expect(within(account).getByRole('region', { name: 'לאן הולך הכסף, בחודש' })).toBeTruthy();
    expect(within(account).getByText(/^(נשארים|חסרים) כל חודש, בממוצע$/)).toBeTruthy();
    // No bank to compare for a recovery plan alone.
    expect(within(screen.getByRole('navigation', { name: 'שלבי התוצאה' })).queryByRole('button', { name: 'השוואה בין בנקים' })).toBeNull();

    await go('איפה משפרים');
    const decisions = () => within(screen.getByRole('region', { name: 'תוכנית ההבראה' }));
    const cancel = () => decisions().getByRole('checkbox', { name: /לבטל את מה שסימנתם/ }) as HTMLInputElement;
    expect(cancel().checked).toBe(true);
    const before = document.getElementById('recovery-result')!.textContent;
    await user.click(cancel());
    expect(document.getElementById('recovery-result')!.textContent).not.toBe(before);

    // Left out, it is not a task, and the link does not carry it — nor ever a business's name.
    await go('התוכנית');
    expect(within(screen.getByRole('region', { name: 'מה עושים עכשיו' })).queryByRole('checkbox', { name: 'לבטל: חנות הדוגמאות' })).toBeNull();
    const shared = decodeURIComponent(screen.getByRole('link', { name: 'שיתוף בוואטסאפ' }).getAttribute('href')!);
    const payload = decodeShared(shared.slice(shared.indexOf('#/s/') + 4).trim())!;
    expect(payload.recovery!.decisions.map((decision) => decision.label)).not.toContain('לבטל את מה שסימנתם');
    expect(JSON.stringify(payload)).not.toContain('חנות הדוגמאות');

    // Back on the screen before, the choice is as it was left; kept, it is a task again.
    await user.click(screen.getByRole('button', { name: 'איפה משפרים' }));
    expect(cancel().checked).toBe(false);
    await user.click(cancel());
    await go('התוכנית');
    expect(within(screen.getByRole('region', { name: 'מה עושים עכשיו' })).getByRole('checkbox', { name: 'לבטל: חנות הדוגמאות' })).toBeTruthy();
    const again = decodeURIComponent(screen.getByRole('link', { name: 'שיתוף בוואטסאפ' }).getAttribute('href')!);
    expect(decodeShared(again.slice(again.indexOf('#/s/') + 4).trim())!.recovery!.decisions.map((decision) => decision.label)).toContain('לבטל את מה שסימנתם');

    await user.click(screen.getByRole('button', { name: 'איפה משפרים' }));
    await user.click(decisions().getByRole('button', { name: 'כל הפרטים' }));
    expect(screen.getByRole('heading', { name: 'פרטי החשבון' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'לאן הולך הכסף, בחודש' })).toBeTruthy();
  }, 30_000);

  it('asks for the statements again on a later visit, since they are never kept', async () => {
    serve(false);
    useQuestionnaire.setState({ goals: ['RECOVERY'], answers: { hasMortgage: 'NO', statementsFiles: 'LATER', worries: ['SAVING'], hasLoans: 'NO' } });
    openAt(DONE);
    const user = userEvent.setup();
    renderPage();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'המצב היום' }));
    await user.click(screen.getByRole('button', { name: 'להעלות את דפי החשבון' }));
    expect(screen.getByRole('heading', { name: 'העלו את דפי העו״ש והאשראי' })).toBeTruthy();
  });

  it('shares a link that opens the result on its own page, and takes the answers in only when asked', async () => {
    serve(false);
    const answers = { propertyValue: 2_000_000, segment: 'FIRST_HOME', equity: 600_000, hasEligibility: 'NO', netIncome: 25_000, hasObligations: 'NO', stability: 'BALANCED' };
    useQuestionnaire.setState({ goals: ['BUY'], answers });
    openAt('plan');
    const user = userEvent.setup();
    renderPage();
    const href = decodeURIComponent(screen.getByRole('link', { name: 'שיתוף בוואטסאפ' }).getAttribute('href')!);
    const link = href.slice(href.indexOf(window.location.origin));
    cleanup();

    // Someone else, with a questionnaire of their own.
    useQuestionnaire.setState({ goals: ['RECOVERY'], answers: { hasMortgage: 'NO' }, at: 'worry' });
    window.history.replaceState(null, '', link.slice(window.location.origin.length + 1));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SharedPage />
      </QueryClientProvider>,
    );
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'תוצאה ששותפה איתכם' }));
    await screen.findByText('החזר חודשי בהתחלה', {}, { timeout: 10_000 });
    expect(screen.queryByRole('button', { name: 'כל הפרטים' })).toBeNull();
    expect(useQuestionnaire.getState().goals).toEqual(['RECOVERY']);

    await user.click(screen.getByRole('button', { name: 'לפתוח את התשובות אצלי ולשנות' }));
    expect(useQuestionnaire.getState().goals).toEqual(['RECOVERY']);
    await user.click(screen.getByRole('button', { name: 'כן, לפתוח אצלי' }));
    expect(useQuestionnaire.getState()).toMatchObject({ goals: ['BUY'], at: DONE, answers });
    // The visitor's own answer is replaced, not mixed in.
    expect(useQuestionnaire.getState().answers.hasMortgage).toBeUndefined();
    expect(window.location.hash).toBe('#/start/done');
  }, 30_000);

  it('says when a shared link is not one', () => {
    window.history.replaceState(null, '', '#/s/broken!');
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <SharedPage />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { name: 'הקישור לא תקין' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'שאלון משלי' }).getAttribute('href')).toBe('#/start');
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
