import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BANK_CSV, CARD_ROWS } from '../../engine/money/__fixtures__/statements';
import { MoneyPage } from '../../pages/MoneyPage';
import { useMoney, useMoneyCategories } from '../../store/moneyStore';
import { useConsolidation } from '../../store/consolidationStore';
import { useRefinance } from '../../store/refinanceStore';

beforeAll(() => {
  // Recharts measures its container; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  // jsdom's Blob has no arrayBuffer().
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
});

beforeEach(() => {
  window.history.replaceState(null, '', '#/money');
  useMoney.setState({ files: [], reading: false, pending: 0, notes: {}, loans: {}, loanLinks: {}, refinance: false });
  useRefinance.getState().reset();
  useConsolidation.getState().reset();
  useMoneyCategories.setState({ explanations: {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** AI on or off; each endpoint answers with its entry in `replies`. */
function serve(enabled: boolean, replies: Record<string, unknown> = {}) {
  const posts: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(init.body as string) });
        return new Response(JSON.stringify({ model: 'm', ...(replies[url] as object) }));
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
      <MoneyPage />
    </QueryClientProvider>,
  );
}

/** A category row's name, not the same words among a picker's options. */
const row = (name: string) => screen.queryAllByText(name, { selector: 'summary span' });

const bankFile = () => new File([BANK_CSV], 'bank.csv', { type: 'text/csv' });
/** An Excel day number as the dd/mm/yyyy a CSV export writes. */
const dayOf = (excel: number) => {
  const iso = new Date(Date.UTC(1899, 11, 30) + excel * 86_400_000).toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
};
/** The card export as CSV: the same rows, read by the same reader. */
const cardFile = () =>
  new File(
    [
      CARD_ROWS.map((row) =>
        row
          .map((cell, column) =>
            cell === null ? '' : `"${(typeof cell === 'number' && (column === 0 || column === 4) ? dayOf(cell) : String(cell)).replace(/"/g, '""')}"`,
          )
          .join(','),
      ).join('\n'),
    ],
    'card.csv',
    { type: 'text/csv' },
  );

async function upload(user: ReturnType<typeof userEvent.setup>, files: File[] = [bankFile()]) {
  await user.upload(screen.getByLabelText('בחירת קבצי עו״ש או כרטיס אשראי'), files);
  await waitFor(() => expect(screen.getAllByText('נקרא')).toHaveLength(files.length));
  await user.click(screen.getByRole('button', { name: /לתמונה החודשית/ }));
}

const next = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: /^הבא:/ }));

describe('my money, step by step', () => {
  it('waits for a statement before the journey, and says the files stay on the device', () => {
    serve(false);
    renderPage();
    expect((screen.getByRole('button', { name: /לתמונה החודשית/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'שלב 2: נכנס ויוצא' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/לא נשלחים לשום מקום/)).toBeTruthy();
  });

  it('walks the screens: in and out, where it goes, loans and mortgage, where to save, the summary', async () => {
    serve(false);
    const user = userEvent.setup();
    renderPage();
    await upload(user);

    expect(window.location.hash).toBe('#/money/flow');
    expect(screen.getByRole('button', { name: 'שלב 2: נכנס ויוצא' }).getAttribute('aria-current')).toBe('step');
    const flow = screen.getByRole('region', { name: 'נכנס ויוצא' });
    expect(within(flow).getByText(/ממוצע 3 חודשים מלאים/)).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'ממצאים' })).getByText(/חד-פעמיים/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'יתרת החשבון' })).toBeTruthy();

    await next(user);
    expect(window.location.hash).toBe('#/money/spending');
    expect(screen.getByRole('img', { name: /חלוקת ההוצאות לפי קטגוריה/ })).toBeTruthy();
    expect(row('משכנתא')).toHaveLength(1);

    await next(user);
    expect(window.location.hash).toBe('#/money/debts');
    expect(screen.getByRole('heading', { name: /בחודש הולכים להחזרים/ })).toBeTruthy();
    // The mortgage in the homeowner path is still the illustrative one: asked for, not priced.
    expect(screen.getByRole('link', { name: 'להזנת המשכנתא' }).getAttribute('href')).toBe('#/own');

    await next(user);
    expect(window.location.hash).toBe('#/money/savings');
    const ideas = screen.getByRole('list', { name: 'רעיונות לחיסכון' });
    expect(within(ideas).getByText('לצאת מהמינוס')).toBeTruthy();
    expect(within(ideas).getByText('המשכנתא — ההוצאה הגדולה')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'כל קטגוריה לפי מה שאפשר לוותר עליו' })).toBeTruthy();

    await next(user);
    expect(window.location.hash).toBe('#/money/summary');
    expect(screen.queryByRole('button', { name: /^הבא:/ })).toBeNull();
    const decisions = screen.getByRole('list', { name: 'החלטות' });
    expect(within(decisions).getByText('לצאת מהמינוס (בלי ריבית)')).toBeTruthy();
    const summary = screen.getByRole('region', { name: 'הסיכום' });
    expect(within(summary).getByText(/אחרי ההחלטות/)).toBeTruthy();
    // Unticking a decision takes its saving out.
    await user.click(within(decisions).getByRole('checkbox'));
    expect(screen.queryByRole('heading', { name: 'היום ואחרי' })).toBeNull();
  });

  it('says what is wrong with a file it cannot read', async () => {
    serve(false);
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('בחירת קבצי עו״ש או כרטיס אשראי'), new File(['שם,טלפון\nדוגמה,050\n'], 'contacts.csv'));
    expect(await screen.findByText(/לא מצאנו בקובץ טבלת תנועות/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'הסרת contacts.csv' }));
    expect(screen.queryByText('contacts.csv')).toBeNull();
  });

  it('moves a business to another category, and remembers it', async () => {
    serve(false);
    const user = userEvent.setup();
    renderPage();
    await upload(user);
    await next(user);
    const categories = screen.getByRole('list', { name: 'קטגוריות' });
    await user.selectOptions(within(categories).getByRole('combobox', { name: 'קטגוריה של בנק-משכ חיוב' }), 'INSURANCE');
    expect(useMoneyCategories.getState().explanations).toEqual({ 'בנק-משכ חיוב': { category: 'INSURANCE' } });
    expect(row('משכנתא')).toHaveLength(0);
    expect(row('ביטוחים')).toHaveLength(1);
  });

  it('sorts "other" with AI by business names alone', async () => {
    const posts = serve(true, { '/api/categorize': { categories: { items: [{ index: 0, category: 'SHOPPING' }] } } });
    useMoneyCategories.setState({ explanations: { 'בנק-משכ חיוב': { category: 'OTHER' } } });
    const user = userEvent.setup();
    renderPage();
    await upload(user);
    await next(user);
    await user.click(await screen.findByRole('button', { name: 'מיינו עם AI' }));
    await waitFor(() => expect(screen.getByText(/בתי עסק מוינו/)).toBeTruthy());
    expect(posts.filter((post) => post.url === '/api/categorize')).toEqual([{ url: '/api/categorize', body: { payees: ['בנק-משכ חיוב'] } }]);
    // The borrower's own choice stays: AI never overrides it.
    expect(useMoneyCategories.getState().explanations['בנק-משכ חיוב']).toEqual({ category: 'OTHER' });
  });

  it('on each screen, tells the AI what the numbers miss — the totals and the words only — and keeps it for the summary', async () => {
    const posts = serve(true, {
      '/api/consult': { answer: { answer: 'הבונוס מסביר את אוגוסט', points: ['לא לבנות עליו'] } },
      '/api/advise': { advice: { summary: 'תוכנית', steps: [{ title: 'פחות במשכנתא', detail: 'מיחזור', category: 'HOUSING_LOANS', targetMonthly: 4_000 }], cautions: [] } },
    });
    const user = userEvent.setup();
    renderPage();
    await upload(user);
    const box = await screen.findByRole('region', { name: 'ספרו ל-AI' });
    await user.type(within(box).getByRole('textbox'), 'ביוני קיבלתי בונוס');
    await user.click(within(box).getByRole('button', { name: 'שאלו את היועץ' }));
    await waitFor(() => expect(within(box).getByText('הבונוס מסביר את אוגוסט')).toBeTruthy());
    const consult = posts.find((post) => post.url === '/api/consult')!.body as { step: string; question: string; facts: { label: string }[] };
    expect(consult.step).toBe('flow');
    expect(consult.question).toBe('ביוני קיבלתי בונוס');
    expect(JSON.stringify(consult)).not.toContain('בנק-משכ');

    await next(user);
    await next(user);
    await next(user);
    await next(user);
    const advisor = await screen.findByRole('region', { name: 'היועץ' });
    expect(within(advisor).getByText(/ו-1 ההערות שכתבתם/)).toBeTruthy();
    await user.type(within(advisor).getByRole('textbox', { name: /מה חשוב לכם/ }), 'לצאת מהמינוס');
    await user.click(within(advisor).getByRole('button', { name: 'בנו לי תוכנית' }));
    await waitFor(() => expect(within(advisor).getByText('תוכנית')).toBeTruthy());
    const advise = posts.find((post) => post.url === '/api/advise')!.body as { notes: string[] };
    expect(advise.notes).toEqual(['ביוני קיבלתי בונוס']);
    // The advisor's target joins the decisions, priced by the app: 5,000 → 4,000.
    const decisions = screen.getByRole('list', { name: 'החלטות' });
    expect(within(decisions).getByText('מהיועץ')).toBeTruthy();
    expect(within(decisions).getByText(/משכנתא: יעד 4,000/)).toBeTruthy();
  });

  it('explains a charge: what it is, where it belongs, and that it can go — and the savings follow', async () => {
    serve(false);
    const user = userEvent.setup();
    renderPage();
    await upload(user, [bankFile(), cardFile()]);
    await next(user);
    const card = screen.getByRole('heading', { name: 'מה זה? ההוצאות הגדולות' }).closest('section')!;
    // The largest charge whose kind is not obvious leads the list; the mortgage is not asked about.
    const first = within(within(card).getByRole('list', { name: 'הוצאות להסבר' })).getAllByRole('listitem')[0]!;
    expect(within(first).getByText('חנות הדוגמאות')).toBeTruthy();
    expect(within(card).queryByText('בנק-משכ חיוב')).toBeNull();
    await user.type(within(first).getByRole('textbox', { name: 'מה זה חנות הדוגמאות' }), 'הלוואה מהפנסיה');
    await user.selectOptions(within(first).getByRole('combobox', { name: 'קטגוריה של חנות הדוגמאות' }), 'LOANS');
    await user.click(within(first).getByRole('button', { name: 'אפשר לבטל' }));
    expect(useMoneyCategories.getState().explanations['חנות הדוגמאות']).toEqual({
      note: 'הלוואה מהפנסיה',
      category: 'LOANS',
      flexibility: 'CANCEL',
    });
    expect(within(card).getByText(/הוסברו 1 מתוך/)).toBeTruthy();
    await next(user);
    await next(user);
    const ideas = screen.getByRole('list', { name: 'רעיונות לחיסכון' });
    expect(within(ideas).getByText('מה שסימנתם לביטול')).toBeTruthy();
    expect(within(ideas).getByText('הלוואות')).toBeTruthy();
    await next(user);
    expect(within(screen.getByRole('list', { name: 'החלטות' })).getByText('לבטל את מה שסימנתם')).toBeTruthy();
  });

  it('turns a loan into a balloon: what it frees a month, and what it costs at the end', async () => {
    serve(false);
    useMoneyCategories.setState({ explanations: { 'חנות הדוגמאות': { category: 'LOANS', note: 'הלוואה מהפנסיה' } } });
    const user = userEvent.setup();
    renderPage();
    await upload(user, [bankFile(), cardFile()]);
    await user.click(screen.getByRole('button', { name: 'שלב 4: הלוואות ומשכנתא' }));
    const loan = within(screen.getByRole('list', { name: 'ההלוואות' })).getAllByRole('listitem')[0]!;
    expect(within(loan).getByText(/מה היתרה|את היתרה, הריבית/)).toBeTruthy();
    const fill = async (name: string, value: string) => {
      const input = within(loan).getByRole('spinbutton', { name });
      await user.clear(input);
      await user.type(input, value);
      await user.tab();
    };
    await fill('יתרה של חנות הדוגמאות', '20000');
    await fill('ריבית של חנות הדוגמאות', '6');
    await fill('חודשים שנותרו בחנות הדוגמאות', '36');
    await user.click(within(loan).getByRole('radio', { name: /בלון/ }));
    // 667 a month by the statements; a balloon pays the interest only: 20,000 × 6% / 12 = 100.
    expect(within(loan).getByText(/בסוף:.*20,000/)).toBeTruthy();
    expect(within(loan).getByText(/בסיכום: .*567.* פחות בחודש/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'שלב 6: הסיכום' }));
    const decisions = screen.getByRole('list', { name: 'החלטות' });
    expect(within(decisions).getByText('חנות הדוגמאות: בלון')).toBeTruthy();
    expect(within(decisions).getByText(/בסוף התקופה 20,000 ₪ בבת אחת/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /החזרי הלוואות ומשכנתא/ })).toBeTruthy();
  });

  it("offers the engine's refinance once the household's own mortgage is in", async () => {
    serve(false);
    useRefinance.getState().setTracks([
      { id: 'a', type: 'FIXED_UNLINKED', balance: 500_000, annualRate: 0.068, remainingMonths: 240, monthsElapsed: 60 },
      { id: 'b', type: 'PRIME', balance: 300_000, annualRate: 0.0625, remainingMonths: 240, monthsElapsed: 60 },
    ]);
    const user = userEvent.setup();
    renderPage();
    await upload(user);
    await user.click(screen.getByRole('button', { name: 'שלב 4: הלוואות ומשכנתא' }));
    expect(screen.queryByRole('link', { name: 'להזנת המשכנתא' })).toBeNull();
    const include = await screen.findByRole('checkbox', { name: /לכלול את המיחזור בסיכום/ });
    await user.click(include);
    expect(useMoney.getState().refinance).toBe(true);
    await user.click(screen.getByRole('button', { name: 'שלב 6: הסיכום' }));
    expect(within(screen.getByRole('list', { name: 'החלטות' })).getByText('מיחזור המשכנתא לתמהיל של המנוע')).toBeTruthy();
  });

  it('keeps every kind of document a tap away on every step', async () => {
    serve(false);
    const user = userEvent.setup();
    renderPage();
    // The first screen: the plan's name and the four kinds of document.
    expect(screen.getByRole('heading', { name: 'תוכנית הבראה' })).toBeTruthy();
    for (const name of [/חשבון עו״ש/, /כרטיס אשראי/, /דוח משכנתא/, /דוח הלוואות/]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    await upload(user);
    const bar = screen.getByRole('region', { name: 'המסמכים שלכם' });
    expect(within(bar).getByText(/דף חשבון אחד/)).toBeTruthy();
    await user.click(within(bar).getByRole('button', { name: /הוספה/ }));
    await user.click(within(bar).getByRole('button', { name: /דוח משכנתא/ }));
    // The homeowner path's own reader: the mortgage is entered once for the whole site.
    expect(within(bar).getByRole('button', { name: /דוח משכנתא/ }).getAttribute('aria-pressed')).toBe('true');
    expect(within(bar).getByLabelText(/דוח המשכנתא|קובץ|מסמך/)).toBeTruthy();
  });

  it("fills a loan's terms from the loans report, and lists a report loan the statements do not show", async () => {
    serve(false);
    useMoneyCategories.setState({ explanations: { 'חנות הדוגמאות': { category: 'LOANS' } } });
    useConsolidation.setState({
      debts: [
        { id: 'r1', kind: 'OTHER', label: 'הלוואה מהפנסיה', balance: 20_000, annualRate: 0.05, monthlyPayment: 670, remainingMonths: 30, include: true },
        { id: 'r2', kind: 'CAR', label: 'הלוואת רכב', balance: 40_000, annualRate: 0.07, monthlyPayment: 1_100, remainingMonths: 40, include: true },
      ],
    });
    const user = userEvent.setup();
    renderPage();
    await upload(user, [bankFile(), cardFile()]);
    await user.click(screen.getByRole('button', { name: 'שלב 4: הלוואות ומשכנתא' }));
    const loans = [...screen.getByRole('list', { name: 'ההלוואות' }).children] as HTMLElement[];
    expect(loans).toHaveLength(2);
    // 667 a month on the statements ≈ 670 in the report: the same loan, its terms from the report.
    expect(within(loans[0]!).getByText(/הפרטים מהדוח/)).toBeTruthy();
    expect((within(loans[0]!).getByRole('spinbutton', { name: 'יתרה של חנות הדוגמאות' }) as HTMLInputElement).value).toMatch(/20,?000/);
    expect(within(loans[1]!).getByText('הלוואת רכב')).toBeTruthy();
    expect(within(loans[1]!).getByText(/לפי הדוח/)).toBeTruthy();
    await user.click(within(loans[1]!).getByRole('radio', { name: /לפרוס/ }));
    await user.click(screen.getByRole('button', { name: 'שלב 6: הסיכום' }));
    expect(within(screen.getByRole('list', { name: 'החלטות' })).getByText(/הלוואת רכב: פריסה ל-/)).toBeTruthy();
  });

  it('counts a report loan once: linked to its charge, or on its own when paid elsewhere', async () => {
    serve(false);
    // A pension loan, charged under the insurer.
    useMoneyCategories.setState({ explanations: { 'חנות הדוגמאות': { category: 'INSURANCE' } } });
    useConsolidation.setState({
      debts: [{ id: 'r1', kind: 'OTHER', label: 'הלוואה מהפנסיה', balance: 20_000, annualRate: 0.05, monthlyPayment: 690, remainingMonths: 30, include: true }],
    });
    const user = userEvent.setup();
    renderPage();
    await upload(user, [bankFile(), cardFile()]);
    await user.click(screen.getByRole('button', { name: 'שלב 4: הלוואות ומשכנתא' }));
    let cards = [...screen.getByRole('list', { name: 'ההלוואות' }).children] as HTMLElement[];
    // Found under insurance by its payment: one card, the statements' charge with the report's terms.
    expect(cards).toHaveLength(1);
    const link = within(cards[0]!).getByRole('combobox', { name: 'איפה ההחזר של הלוואה מהפנסיה בדפי החשבון' }) as HTMLSelectElement;
    expect(link.value).toBe('חנות הדוגמאות');
    await user.selectOptions(link, 'NONE');
    cards = [...screen.getByRole('list', { name: 'ההלוואות' }).children] as HTMLElement[];
    expect(cards).toHaveLength(1);
    expect(within(cards[0]!).getByText(/לפי הדוח/)).toBeTruthy();
  });

  it('shows the mortgage and the loans the site holds, a tap away in the documents', async () => {
    serve(false);
    useRefinance.getState().setTracks([
      { id: 'a', type: 'FIXED_UNLINKED', balance: 500_000, annualRate: 0.068, remainingMonths: 240, monthsElapsed: 60 },
      { id: 'b', type: 'PRIME', balance: 300_000, annualRate: 0.0625, remainingMonths: 240, monthsElapsed: 60 },
    ]);
    useConsolidation.setState({
      debts: [{ id: 'r1', kind: 'CAR', label: 'הלוואת רכב', balance: 40_000, annualRate: 0.07, monthlyPayment: 1_100, remainingMonths: 40, include: true }],
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /דוח משכנתא/ }));
    const mortgage = screen.getByRole('region', { name: 'המשכנתא שנקראה' });
    expect(within(mortgage).getByText(/2 מסלולים/)).toBeTruthy();
    expect(within(mortgage).getAllByRole('row')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: /דוח הלוואות/ }));
    const loans = screen.getByRole('region', { name: 'ההלוואות שנקראו' });
    expect(within(loans).getByText('הלוואת רכב')).toBeTruthy();
  });

  it('on a phone, folds what is secondary — the AI box, the categories, each saving idea — into a line each', async () => {
    serve(true, { '/api/consult': { answer: { answer: 'תשובה', points: [] } } });
    const realMatchMedia = window.matchMedia;
    vi.stubGlobal('matchMedia', (query: string) =>
      query.includes('max-width')
        ? { matches: true, addEventListener() {}, removeEventListener() {} }
        : (realMatchMedia?.(query) ?? { matches: false, addEventListener() {}, removeEventListener() {} }),
    );
    const user = userEvent.setup();
    renderPage();
    await upload(user);
    // The AI box: one line until it is wanted.
    const ask = await screen.findByRole('button', { name: /יש משהו שהמספרים לא מספרים/ });
    expect(screen.queryByRole('region', { name: 'ספרו ל-AI' })).toBeNull();
    await user.click(ask);
    expect(screen.getByRole('region', { name: 'ספרו ל-AI' })).toBeTruthy();

    await next(user);
    const categories = screen.getByRole('button', { name: /לאן הולך הכסף.*קטגוריות/ });
    expect(categories.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list', { name: 'קטגוריות' })).toBeNull();
    await user.click(categories);
    expect(screen.getByRole('list', { name: 'קטגוריות' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'שלב 5: איפה לחסוך' }));
    const overdraft = screen.getByRole('button', { name: /לצאת מהמינוס/ });
    expect(screen.queryByText(/הלוואה בריבית נמוכה/)).toBeNull();
    await user.click(overdraft);
    expect(screen.getByText(/הלוואה בריבית נמוכה/)).toBeTruthy();
  });
});
