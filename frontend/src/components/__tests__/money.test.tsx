import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BANK_CSV, CARD_ROWS } from '../../engine/money/__fixtures__/statements';
import { MoneyPage } from '../../pages/MoneyPage';
import { useMoney, useMoneyCategories } from '../../store/moneyStore';

beforeAll(() => {
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
  useMoney.setState({ files: [], reading: false });
  useMoneyCategories.setState({ explanations: {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function serve(enabled: boolean, categories?: unknown, advice?: unknown) {
  const posts: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(init.body as string) });
        return new Response(JSON.stringify({ model: 'm', categories, advice }));
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

async function uploadAndOpen(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText('בחירת קבצי עו״ש או כרטיס אשראי'), bankFile());
  const files = await screen.findByRole('list', { name: 'קבצים שהועלו' });
  await waitFor(() => expect(within(files).getByText(/16 תנועות/)).toBeTruthy());
  await user.click(screen.getByRole('button', { name: /לתמונה החודשית/ }));
}

describe('my money', () => {
  it('waits for a statement before the picture, and says the files stay on the device', () => {
    serve(false);
    renderPage();
    expect((screen.getByRole('button', { name: /לתמונה החודשית/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/לא נשלחים לשום מקום/)).toBeTruthy();
  });

  it('reads a bank statement and shows the month: what comes in, what goes out, the overdraft', async () => {
    serve(false);
    const user = userEvent.setup();
    renderPage();
    await uploadAndOpen(user);
    expect(window.location.hash).toBe('#/money/result');
    const summary = screen.getByRole('region', { name: 'התמונה החודשית' });
    expect(within(summary).getByText(/ממוצע 3 חודשים מלאים/)).toBeTruthy();
    const findings = screen.getByRole('list', { name: 'ממצאים' });
    expect(within(findings).getByText(/חד-פעמיים/)).toBeTruthy();
    // The overdraft is an idea to act on, priced by the interest it cost.
    const ideas = screen.getByRole('list', { name: 'רעיונות לחיסכון' });
    expect(within(ideas).getByText('לצאת מהמינוס')).toBeTruthy();
    expect(within(ideas).getByText('המשכנתא — ההוצאה הגדולה')).toBeTruthy();
    // Without the card file, the card bills show as cards without detail.
    expect(within(findings).getByText(/בלי פירוט/)).toBeTruthy();
    expect(row('משכנתא')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /לבדוק את המשכנתא/ }).getAttribute('href')).toBe('#/own');
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
    await uploadAndOpen(user);
    const categories = screen.getByRole('list', { name: 'קטגוריות' });
    await user.selectOptions(within(categories).getByRole('combobox', { name: 'קטגוריה של בנק-משכ חיוב' }), 'INSURANCE');
    expect(useMoneyCategories.getState().explanations).toEqual({ 'בנק-משכ חיוב': { category: 'INSURANCE' } });
    expect(row('משכנתא')).toHaveLength(0);
    expect(row('ביטוחים')).toHaveLength(1);
  });

  it('sorts "other" with AI by business names alone', async () => {
    const posts = serve(true, { items: [{ index: 0, category: 'SHOPPING' }] });
    useMoneyCategories.setState({ explanations: { 'בנק-משכ חיוב': { category: 'OTHER' } } });
    const user = userEvent.setup();
    renderPage();
    await uploadAndOpen(user);
    await user.click(await screen.findByRole('button', { name: 'מיינו עם AI' }));
    await waitFor(() => expect(screen.getByText(/בתי עסק מוינו/)).toBeTruthy());
    expect(posts).toEqual([{ url: '/api/categorize', body: { payees: ['בנק-משכ חיוב'] } }]);
    // The borrower's own choice stays: AI never overrides it.
    expect(useMoneyCategories.getState().explanations['בנק-משכ חיוב']).toEqual({ category: 'OTHER' });
  });

  it('the advisor sends totals only, and adds up what its targets free', async () => {
    const posts = serve(true, undefined, {
      summary: 'קודם המינוס',
      steps: [
        { title: 'לסגור את המינוס', detail: 'מהכסף החד-פעמי', category: null, targetMonthly: null },
        { title: 'פחות במשכנתא?', detail: 'לבדוק מיחזור', category: 'HOUSING_LOANS', targetMonthly: 4_000 },
      ],
      cautions: ['להשאיר כרית'],
    });
    const user = userEvent.setup();
    renderPage();
    await uploadAndOpen(user);
    const advisor = await screen.findByRole('region', { name: 'היועץ' });
    await user.type(within(advisor).getByRole('textbox', { name: /מה חשוב לכם/ }), 'לצאת מהמינוס');
    await user.click(within(advisor).getByRole('button', { name: 'בנו לי תוכנית' }));
    await waitFor(() => expect(within(advisor).getByText('קודם המינוס')).toBeTruthy());
    const sent = posts.find((post) => post.url === '/api/advise')!.body as Record<string, unknown>;
    expect(sent.goal).toBe('לצאת מהמינוס');
    expect(JSON.stringify(sent)).not.toContain('בנק-משכ');
    // Mortgage 5,000 → 4,000: the app's sum, not the model's.
    expect(within(advisor).getByText(/מפנים/).textContent).toContain('1,000');
    expect(within(advisor).getByRole('list', { name: 'התוכנית' }).children).toHaveLength(2);
  });

  it('explains a charge: what it is, where it belongs, and that it can go — and the savings follow', async () => {
    serve(false);
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('בחירת קבצי עו״ש או כרטיס אשראי'), [bankFile(), cardFile()]);
    await waitFor(() => expect(screen.getAllByText('נקרא')).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: /לתמונה החודשית/ }));
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
    const ideas = screen.getByRole('list', { name: 'רעיונות לחיסכון' });
    expect(within(ideas).getByText('מה שסימנתם לביטול')).toBeTruthy();
    expect(within(ideas).getByText('הלוואות')).toBeTruthy();
    // Pressing the same choice again takes it back.
    await user.click(within(first).getByRole('button', { name: 'אפשר לבטל' }));
    expect(useMoneyCategories.getState().explanations['חנות הדוגמאות']!.flexibility).toBeUndefined();
  });
});
