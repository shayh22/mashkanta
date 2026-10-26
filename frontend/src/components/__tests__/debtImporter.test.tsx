import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

    const debts = useConsolidation.getState().debts;
    expect(debts).toHaveLength(before + 1);
    expect(debts.at(-1)).toMatchObject({ kind: 'CAR', balance: 84_500, annualRate: 0.089, remainingMonths: 41 });
    expect(screen.getByText(/נוספו 1 הלוואות מהמסמך/)).toBeTruthy();
  });

  it('is hidden when AI reading is not switched on', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: false }))));
    const { container } = renderImporter();
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
