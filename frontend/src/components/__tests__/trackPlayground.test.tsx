import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TrackPlayground } from '../own/TrackPlayground';
import { useRefinance } from '../../store/refinanceStore';
import { useTrackPlanStore } from '../../store/trackPlanStore';

beforeEach(() => {
  useRefinance.getState().reset();
  useRefinance.getState().setTracks([
    { id: 'p', type: 'PRIME', balance: 420_000, annualRate: 0.0625, remainingMonths: 264, monthsElapsed: 48 },
    { id: 'f', type: 'FIXED_UNLINKED', balance: 380_000, annualRate: 0.061, remainingMonths: 264, monthsElapsed: 48 },
    { id: 'l', type: 'FIXED_LINKED', balance: 260_000, annualRate: 0.02, remainingMonths: 204, monthsElapsed: 48 },
  ]);
  useTrackPlanStore.setState({ actions: {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function serve(enabled: boolean, plan?: unknown) {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(init.body as string) });
        return new Response(JSON.stringify({ model: 'm', plan }));
      }
      return new Response(JSON.stringify({ enabled }));
    }),
  );
  return posts;
}

function renderPlayground() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TrackPlayground />
    </QueryClientProvider>,
  );
}

const outcome = () => screen.getByRole('region', { name: 'תוצאת המשחק' });

describe('the track playground', () => {
  it('starts from the per-track advice and prices a plan the borrower changes', async () => {
    serve(false);
    const user = userEvent.setup();
    renderPlayground();
    // The linked track at 2% is below today's market: it is marked worth keeping.
    expect(screen.getAllByText('ריבית טובה — כדאי לשמור')).toHaveLength(1);
    expect(screen.getAllByText('המלצה')).toHaveLength(3);

    const prime = screen.getByRole('combobox', { name: 'מה לעשות במסלול פריים' });
    await user.selectOptions(prime, 'PREPAY');
    expect(screen.getByRole('spinbutton', { name: 'סכום לפירעון במסלול פריים' })).toBeTruthy();
    expect(within(outcome()).getByText(/מחסכונות/)).toBeTruthy();
    expect(screen.getAllByText('המלצה')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'חזרה להמלצה לפי מסלול' }));
    expect(screen.getAllByText('המלצה')).toHaveLength(3);
    expect(useTrackPlanStore.getState().actions).toEqual({});
  });

  it('never offers to refinance an eligibility loan', () => {
    serve(false);
    useRefinance.getState().setTracks([
      { id: 'e', type: 'ELIGIBILITY', balance: 100_000, annualRate: 0.03, remainingMonths: 200, monthsElapsed: 40 },
    ]);
    renderPlayground();
    const select = screen.getByRole('combobox', { name: /מה לעשות במסלול/ });
    expect(within(select).queryByRole('option', { name: 'למחזר' })).toBeNull();
  });

  it('hides the goal box while AI is off', async () => {
    serve(false);
    renderPlayground();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('textbox', { name: /מה אתם רוצים להשיג/ })).toBeNull();
  });

  it('sends the goal with the track figures and applies the plan that comes back', async () => {
    const posts = serve(true, {
      actions: [
        { index: 0, action: 'KEEP', newType: null, termYears: null, prepayAmount: null },
        { index: 1, action: 'REFINANCE', newType: 'PRIME', termYears: 20, prepayAmount: null },
        { index: 2, action: 'KEEP', newType: null, termYears: null, prepayAmount: null },
      ],
      summary: 'שומרים את הצמודה הזולה וממחזרים את הקבועה',
      cautions: ['פריים משתנה עם הריבית'],
    });
    const user = userEvent.setup();
    renderPlayground();
    const goal = await screen.findByRole('textbox', { name: /מה אתם רוצים להשיג/ });
    await user.type(goal, 'לשמור את הצמודה');
    await user.click(screen.getByRole('button', { name: 'הציעו לי תוכנית' }));

    await waitFor(() => expect(screen.getByText('שומרים את הצמודה הזולה וממחזרים את הקבועה')).toBeTruthy());
    expect(screen.getByText(/פריים משתנה עם הריבית/)).toBeTruthy();
    expect(posts).toHaveLength(1);
    const [sent] = posts as [{ url: string; body: { goal: string; tracks: object[] } }];
    expect(sent.url).toBe('/api/plan');
    expect(sent.body.goal).toBe('לשמור את הצמודה');
    expect(Object.keys(sent.body.tracks[0]!).sort()).toEqual(
      ['annualRate', 'balance', 'index', 'marketRate', 'refinanceFee', 'remainingMonths', 'type'],
    );

    // The plan is the borrower's now: no track follows the advice, and the fixed track becomes prime.
    expect(screen.queryAllByText('המלצה')).toHaveLength(0);
    const fixed = screen.getByRole('combobox', { name: 'מה לעשות במסלול קבועה לא צמודה' }) as HTMLSelectElement;
    expect(fixed.value).toBe('REFINANCE');
    expect((screen.getByRole('combobox', { name: 'מסלול חדש במקום קבועה לא צמודה' }) as HTMLSelectElement).value).toBe('PRIME');
  });
});
