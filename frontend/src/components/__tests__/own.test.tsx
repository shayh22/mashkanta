import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OwnPage } from '../../pages/OwnPage';
import { useCombinedSettings } from '../../store/combinedStore';
import { useConsolidation } from '../../store/consolidationStore';
import { useFlow } from '../../store/flowStore';
import { useRefinance } from '../../store/refinanceStore';
import { useVisits } from '../../store/visitStore';

beforeAll(() => {
  // Recharts measures its container; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
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

beforeEach(() => {
  window.history.replaceState(null, '', '#/own');
  useRefinance.getState().reset();
  useConsolidation.getState().reset();
  useFlow.setState({ hasDebts: undefined });
  useCombinedSettings.setState({ financeCosts: true });
  useVisits.setState({ visited: [] });
});
afterEach(cleanup);

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OwnPage />
    </QueryClientProvider>,
  );
}

describe("the homeowner's path", () => {
  it('goes from the data to the result, where the mix chosen by the engine is in front', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByText('המשכנתא הקיימת')).toBeTruthy();
    // The illustrative loans the app starts with do not count as the borrower's own.
    expect(screen.getByRole('button', { name: 'אין' }).getAttribute('aria-pressed')).toBe('true');

    await user.click(screen.getByRole('button', { name: /לתוצאה/ }));
    expect(window.location.hash).toBe('#/own/result');
    const result = screen.getByRole('region', { name: 'התוצאה' });
    expect(within(result).getByText('מיחזור המשכנתא')).toBeTruthy();

    const mix = screen.getByRole('region', { name: /התמהיל שנבחר לכם/ });
    expect(within(mix).getByText('נבחר על ידי המנוע לפי ההכנסה ורמת הסיכון שלכם')).toBeTruthy();
    expect(within(mix).getByText('החזר חודשי חדש')).toBeTruthy();
    expect(screen.queryByRole('region', { name: /הלוואה לאיחוד/ })).toBeNull();
  });

  it('adds the consolidation loan when there are other loans', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'יש' }));
    expect(screen.getByText('התחייבויות קיימות')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /לתוצאה/ }));

    expect(within(screen.getByRole('region', { name: 'התוצאה' })).getByText('מיחזור + איחוד הלוואות')).toBeTruthy();
    const loan = screen.getByRole('region', { name: /הלוואה לאיחוד/ });
    expect(within(loan).getByText(/סוגרת 3 הלוואות/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /מה עושים עכשיו/ }));
    expect(screen.getByText('תוכנית פעולה — מיחזור ואיחוד במהלך אחד')).toBeTruthy();
  });

  it('opens the mix editor from the card, and a different choice shows at once', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#/own/result');
    renderPage();
    await user.click(screen.getByRole('button', { name: 'שינוי התמהיל' }));
    expect(screen.getByRole('button', { name: /^שינוי התמהיל.*בחירת המנוע/ }).getAttribute('aria-expanded')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'אותו תמהיל' }));
    expect(useRefinance.getState().proposalMode).toBe('AUTO');
    expect(screen.getByText('אותם מסלולים כמו היום, במחיר שוק')).toBeTruthy();
  });

  it('keeps the details folded until opened', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#/own/result');
    useFlow.setState({ hasDebts: true });
    renderPage();
    const toggle = screen.getByRole('button', { name: /האיחוד: רגולציה ותזרים/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('איחוד בלבד מול איחוד + מיחזור')).toBeNull();
    await user.click(toggle);
    // The section's charts load with it.
    expect(await screen.findByText('איחוד בלבד מול איחוד + מיחזור', {}, { timeout: 5_000 })).toBeTruthy();
    await user.click(screen.getByRole('switch', { name: /לממן את עמלות המיחזור/ }));
    expect(useCombinedSettings.getState().financeCosts).toBe(false);
  });

  it('shows a dearer offer against the engine, with a way back to its choice', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#/own/result');
    const balance = useRefinance.getState().tracks.reduce((sum, track) => sum + track.balance, 0);
    useRefinance.getState().importOffer([
      { id: 'x', type: 'FIXED_UNLINKED', amount: balance, annualRate: 0.075, termMonths: 300 },
    ]);
    renderPage();
    const yardstick = screen.getByRole('group', { name: 'מול בחירת המנוע' });
    expect(within(yardstick).getByText(/התמהיל שהמנוע בוחר שווה .* יותר, בערך נוכחי/)).toBeTruthy();
    await user.click(within(yardstick).getByRole('button', { name: 'מעבר לבחירת המנוע' }));
    expect(useRefinance.getState().proposalMode).toBe('OPTIMAL');
    expect(screen.queryByRole('group', { name: 'מול בחירת המנוע' })).toBeNull();
    expect(screen.getByRole('region', { name: /התמהיל שנבחר לכם/ })).toBeTruthy();
  });

  it("reads a bank's offer and shows it in place of the mix, against the engine's choice", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#/own/result');
    renderPage();
    await user.click(screen.getByRole('button', { name: 'יש לי הצעה מהבנק' }));
    const offer = [
      'אישור עקרוני אחיד — בנק לאומי',
      'פריים מינוס 0.6 · 500,000 ₪ · 264 חודשים',
      'קבועה לא צמודה 4.40% 560,000 ₪ 264 חודשים',
    ].join('\n');
    const input = document.querySelector<HTMLInputElement>('#own-offer input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File([offer], 'offer.txt', { type: 'text/plain' })] } });

    expect(await screen.findByText(/נקראו 2 מסלולים מההצעה/, {}, { timeout: 5_000 })).toBeTruthy();
    expect(useRefinance.getState().proposalMode).toBe('MANUAL');
    expect(useRefinance.getState().manualProposal.map((track) => [track.type, track.amount])).toEqual([
      ['PRIME', 500_000],
      ['FIXED_UNLINKED', 560_000],
    ]);
    const card = screen.getByRole('region', { name: /ההצעה שקיבלתם/ });
    expect(within(card).getByRole('group', { name: 'מול בחירת המנוע' })).toBeTruthy();
  });

  it('keeps a way out when a hand-entered proposal has been emptied', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#/own/result');
    useRefinance.getState().importOffer([]);
    renderPage();
    expect(screen.getByText('אין הצעה לבדוק')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'הוספת מסלול מוצע' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'חזרה לבחירת המנוע' }));
    expect(screen.getByRole('region', { name: /התמהיל שנבחר לכם/ })).toBeTruthy();
  });

  it('asks for an all-purpose loan already on the home only when other loans are in the check', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByText('הלוואה לכל מטרה קיימת על הדירה')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'יש' }));
    expect(screen.getByText('הלוואה לכל מטרה קיימת על הדירה')).toBeTruthy();
  });

  it('counts the refinance as used only once its result is seen', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(useVisits.getState().visited).toEqual([]);
    await user.click(screen.getByRole('button', { name: /לתוצאה/ }));
    expect(useVisits.getState().visited).toEqual(['refinance']);
  });

  it('sums up the combined move by the combined payment, not by the refinance alone', async () => {
    window.history.replaceState(null, '', '#/own/result');
    useFlow.setState({ hasDebts: true });
    renderPage();
    const result = screen.getByRole('region', { name: 'התוצאה' });
    expect(within(result).getByText(/שני המהלכים מורידים .* בחודש/)).toBeTruthy();
    expect(within(result).getByText('נקודת איזון (מיחזור)')).toBeTruthy();
    expect(useVisits.getState().visited).toEqual(['refinance', 'consolidation']);
  });

  const uploadOffer = async (user: ReturnType<typeof userEvent.setup>, lines: string[]) => {
    await user.click(screen.getByRole('button', { name: 'יש לי הצעה מהבנק' }));
    const input = document.querySelector<HTMLInputElement>('#own-offer input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File([lines.join('\n')], 'offer.txt', { type: 'text/plain' })] } });
  };

  it('warns, instead of comparing, when the offer does not add up to what is owed', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#/own/result');
    renderPage();
    // 800,000 of the 1,060,000 owed: a track the reader missed must not pass for a cheaper offer.
    await uploadOffer(user, ['פריים מינוס 0.6 · 400,000 ₪ · 264 חודשים', 'קבועה לא צמודה 4.40% 400,000 ₪ 264 חודשים']);
    const card = await screen.findByRole('region', { name: /ההצעה שקיבלתם/ }, { timeout: 5_000 });
    expect(within(card).getByRole('alert').textContent).toContain('ייתכן שמסלול לא נקרא');
    expect(within(card).queryByRole('group', { name: 'מול בחירת המנוע' })).toBeNull();
  });

  it('does not import the same offer again after the borrower moves on', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#/own/result');
    renderPage();
    await uploadOffer(user, ['פריים מינוס 0.6 · 500,000 ₪ · 264 חודשים', 'קבועה לא צמודה 5.90% 560,000 ₪ 264 חודשים']);
    await screen.findByText(/נקראו 2 מסלולים/, {}, { timeout: 5_000 });
    act(() => useRefinance.getState().setProposalMode('OPTIMAL'));
    const first = useRefinance.getState().tracks[0]!;
    act(() => useRefinance.getState().updateTrack(first.id, { monthsElapsed: first.monthsElapsed + 1 }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(useRefinance.getState().proposalMode).toBe('OPTIMAL');
    expect(screen.queryByText(/נקראו 2 מסלולים/)).toBeNull();
  });

  it('says so when an offer holds nothing new to compare', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#/own/result');
    const { tracks } = useRefinance.getState();
    useRefinance.getState().setTracks([
      ...tracks,
      { id: 'elig', type: 'ELIGIBILITY', balance: 100_000, annualRate: 0.03, remainingMonths: 240, monthsElapsed: 30 },
    ]);
    renderPage();
    await uploadOffer(user, ['הלוואת זכאות 3.00% 100,000 ₪ 240 חודשים']);
    expect(await screen.findByText(/לא נמצאו בהצעה מסלולים חדשים/, {}, { timeout: 5_000 })).toBeTruthy();
    expect(useRefinance.getState().proposalMode).toBe('OPTIMAL');
  });

  it('names a typed mix as the borrower\'s own, not as an offer they received', () => {
    window.history.replaceState(null, '', '#/own/result');
    useRefinance.getState().setProposalMode('MANUAL', [
      { id: 'a', type: 'FIXED_UNLINKED', amount: 1_060_000, annualRate: 0.05, termMonths: 264 },
    ]);
    renderPage();
    expect(screen.getByRole('region', { name: /התמהיל שבניתם/ })).toBeTruthy();
  });
});
