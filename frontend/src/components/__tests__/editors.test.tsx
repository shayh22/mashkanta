import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { STATEMENT } from '../../engine/__fixtures__/statement';
import { useConsolidation, useConsolidationAnalysis } from '../../store/consolidationStore';
import { useRefinance } from '../../store/refinanceStore';
import { DebtsTable } from '../consolidation/ConsolidationInputs';
import { ExistingTracksEditor } from '../refinance/ExistingTracksEditor';

function withQuery(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

// jsdom's Blob has no arrayBuffer(), which every browser the app supports does; read it the old way.
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

beforeEach(() => {
  useRefinance.getState().reset();
  useConsolidation.getState().reset();
});
afterEach(cleanup);

describe('existing mortgage editor', () => {
  it('leaves a track out of the refinance when its box is cleared', async () => {
    const user = userEvent.setup();
    withQuery(<ExistingTracksEditor />);
    const boxes = screen.getAllByRole('checkbox', { name: /למחזר את מסלול/ });
    expect(boxes.every((box) => (box as HTMLInputElement).checked)).toBe(true);
    await user.click(boxes[1]!);
    const second = useRefinance.getState().tracks[1]!;
    expect(useRefinance.getState().keptIds).toEqual([second.id]);
    expect((boxes[1] as HTMLInputElement).checked).toBe(false);
  });

  it('imports a mortgage details statement end to end, through redaction', async () => {
    const user = userEvent.setup();
    withQuery(<ExistingTracksEditor />);
    const file = new File([STATEMENT], 'statement.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('קובץ דוח המשכנתא'), file);
    expect(await screen.findByText(/יובאו 6 מרכיבים מ-4 הלוואות, נכון ליום 20\/03\/2027/)).toBeTruthy();

    const tracks = useRefinance.getState().tracks;
    expect(tracks.map((track) => track.type)).toEqual([
      'FIXED_LINKED',
      'FIXED_LINKED',
      'PRIME',
      'PRIME',
      'FIXED_UNLINKED',
      'VARIABLE_LINKED',
    ]);
    expect(tracks.reduce((sum, track) => sum + (track.statedFee ?? 0), 0)).toBeCloseTo(820, 6);
    // The statement implies prime 5.5%, which differs from the default, so the update is offered.
    expect(screen.getByRole('button', { name: 'עדכון הפריים' })).toBeTruthy();
    // The borrower's identifying details never reach the page.
    expect(document.body.textContent).not.toContain('ישראלי');
    expect(document.body.textContent).not.toContain('12345678');
    expect(screen.getByText(/^הושחרו/).textContent).toContain('מספרי זהות');
  });
});

function DebtsHarness() {
  return <DebtsTable analysis={useConsolidationAnalysis()} />;
}

describe('debts table', () => {
  it('flags debts with 18 months or less as outside the payment-to-income test', () => {
    withQuery(<DebtsHarness />);
    const shortDebt = useConsolidation.getState().debts.find((debt) => debt.remainingMonths <= 18)!;
    const row = screen.getByRole('checkbox', { name: `לאחד את ${shortDebt.label}` }).closest('tr')!;
    expect(within(row).getByText(/מחוץ ל-PTI/)).toBeTruthy();
  });

  it('applies the engine recommendations to the include boxes', async () => {
    const user = userEvent.setup();
    withQuery(<DebtsHarness />);
    for (const box of screen.getAllByRole('checkbox', { name: /^לאחד את/ })) {
      if ((box as HTMLInputElement).checked) {
        await user.click(box);
      }
    }
    expect(useConsolidation.getState().debts.some((debt) => debt.include)).toBe(false);
    await user.click(screen.getByRole('button', { name: 'החלת ההמלצות' }));
    const debts = useConsolidation.getState().debts;
    expect(debts.filter((debt) => debt.remainingMonths > 18).every((debt) => debt.include)).toBe(true);
    expect(debts.filter((debt) => debt.remainingMonths <= 18).some((debt) => debt.include)).toBe(false);
  });
});
