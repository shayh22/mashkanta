import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BANK_CSV } from '../../engine/money/__fixtures__/statements';
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
  useMoneyCategories.setState({ overrides: {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function serve(enabled: boolean, categories?: unknown) {
  const posts: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(init.body as string) });
        return new Response(JSON.stringify({ model: 'm', categories }));
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
    expect(within(findings).getByText(/ירד למינוס/)).toBeTruthy();
    // Without the card file, the card bills show as cards without detail.
    expect(within(findings).getByText(/בלי פירוט/)).toBeTruthy();
    expect(row('משכנתא והלוואות')).toHaveLength(1);
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
    await user.selectOptions(screen.getByRole('combobox', { name: 'קטגוריה של בנק-משכ חיוב' }), 'INSURANCE');
    expect(useMoneyCategories.getState().overrides).toEqual({ 'בנק-משכ חיוב': 'INSURANCE' });
    expect(row('משכנתא והלוואות')).toHaveLength(0);
    expect(row('ביטוחים')).toHaveLength(1);
  });

  it('sorts "other" with AI by business names alone', async () => {
    const posts = serve(true, { items: [{ index: 0, category: 'SHOPPING' }] });
    useMoneyCategories.setState({ overrides: { 'בנק-משכ חיוב': 'OTHER' } });
    const user = userEvent.setup();
    renderPage();
    await uploadAndOpen(user);
    await user.click(await screen.findByRole('button', { name: 'מיינו עם AI' }));
    await waitFor(() => expect(screen.getByText(/בתי עסק מוינו/)).toBeTruthy());
    expect(posts).toEqual([{ url: '/api/categorize', body: { payees: ['בנק-משכ חיוב'] } }]);
    // The borrower's own choice stays: AI never overrides it.
    expect(useMoneyCategories.getState().overrides['בנק-משכ חיוב']).toBe('OTHER');
  });
});
