import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DebtImporter } from '../consolidation/DebtImporter';
import { useConsolidation } from '../../store/consolidationStore';

beforeAll(() => {
  // jsdom's Blob has no arrayBuffer(); the document reader needs it.
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useConsolidation.getState().reset();
});

const STATEMENT = `לכבוד ישראל ישראלי ת.ז. 123456782
פירוט הלוואות לתאריך 20/10/2026
הלוואה לרכישת רכב  יתרה 84,500  ריבית 8.9%  החזר חודשי 2,150  תשלומים שנותרו 41`;

function serveAi(answer: unknown) {
  const calls: { method: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined });
      return init?.method === 'POST'
        ? new Response(JSON.stringify({ kind: 'consumerLoans', model: 'm', data: answer }))
        : new Response(JSON.stringify({ enabled: true }));
    }),
  );
  return calls;
}

const renderImporter = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DebtImporter />
    </QueryClientProvider>,
  );

describe('importing loans from a document', () => {
  it('sends only redacted text, on consent, and adds the chosen loans after confirmation', async () => {
    const calls = serveAi({
      loans: [
        { kind: 'CAR', label: 'רכב', balance: 84_500, annualRatePercent: 8.9, monthlyPayment: 2_150, remainingMonths: 41 },
        { kind: 'OTHER', label: 'אחרת', balance: 9_000, annualRatePercent: 11, monthlyPayment: 500, remainingMonths: 20 },
      ],
    });
    const user = userEvent.setup();
    renderImporter();
    const before = useConsolidation.getState().debts.length;

    await user.upload(await screen.findByLabelText('מסמך פירוט הלוואות'), new File([STATEMENT], 'loans.txt', { type: 'text/plain' }));
    const send = await screen.findByRole('button', { name: 'קריאה עם AI' });
    // Nothing leaves before the borrower agrees.
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    await user.click(send);

    const sent = calls.find((call) => call.method === 'POST')!.body as { kind: string; text: string };
    expect(sent.kind).toBe('consumerLoans');
    expect(sent.text).toContain('84,500');
    expect(sent.text).not.toContain('123456782');
    expect(sent.text).not.toContain('ישראל ישראלי');

    const table = await screen.findByRole('region', { name: 'הלוואות שזוהו במסמך' });
    expect(within(table).getAllByRole('checkbox')).toHaveLength(2);
    await user.click(within(table).getByRole('checkbox', { name: 'להוסיף את אחרת' }));
    await user.click(screen.getByRole('button', { name: 'הוספה לרשימה' }));

    // Added in place of the illustrative loans, never beside them.
    const debts = useConsolidation.getState().debts;
    expect(before).toBeGreaterThan(1);
    expect(debts).toHaveLength(1);
    expect(debts.at(-1)).toMatchObject({ kind: 'CAR', balance: 84_500, annualRate: 0.089, remainingMonths: 41 });
    expect(screen.getByText(/נוספו 1 הלוואות מהמסמך/)).toBeTruthy();
  });

  it('reads an amortization schedule in the browser, without AI', async () => {
    const calls = serveAi({ loans: [] });
    const user = userEvent.setup();
    renderImporter();
    const rows = ['לוח סילוקין', 'שיעור ריבית שנתית 6%'];
    let balance = 30_000;
    for (let month = 1; month <= 12; month++) {
      const interest = Math.round(balance * 0.005 * 100) / 100;
      const principal = 2_400;
      balance = Math.round((balance - principal) * 100) / 100;
      rows.push(`10/${String(month).padStart(2, '0')}/2020 ${principal.toFixed(2)} ${interest.toFixed(2)} ${(principal + interest).toFixed(2)} ${balance.toFixed(2)}`);
    }
    for (let month = 1; month <= 12; month++) {
      const interest = Math.round(balance * 0.005 * 100) / 100;
      const principal = Math.min(balance, 500);
      balance = Math.round((balance - principal) * 100) / 100;
      rows.push(`10/${String(month).padStart(2, '0')}/2099 ${principal.toFixed(2)} ${interest.toFixed(2)} ${(principal + interest).toFixed(2)} ${balance.toFixed(2)}`);
    }

    await user.upload(await screen.findByLabelText('מסמך פירוט הלוואות'), new File([rows.join('\n')], 'schedule.txt', { type: 'text/plain' }));

    expect(await screen.findByText(/לוח סילוקין: שולמו 12 מתוך 24 תשלומים/)).toBeTruthy();
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'הוספה לרשימה' }));
    expect(useConsolidation.getState().debts.at(-1)).toMatchObject({ balance: 1_200, annualRate: 0.06, remainingMonths: 12 });
  });

  it('without AI, says a document it does not know must be entered by hand', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: false }))));
    const user = userEvent.setup();
    renderImporter();
    await user.upload(await screen.findByLabelText('מסמך פירוט הלוואות'), new File(['שלום'], 'note.txt', { type: 'text/plain' }));
    expect(await screen.findByText(/זה לא לוח סילוקין שהמחשבון מכיר/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'קריאה עם AI' })).toBeNull();
  });
});
