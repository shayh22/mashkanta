import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TrackPlayground } from '../own/TrackPlayground';
import { useRefinance } from '../../store/refinanceStore';
import { useTrackPlan, useTrackPlanStore } from '../../store/trackPlanStore';

beforeEach(() => {
  useRefinance.getState().reset();
  useRefinance.getState().setTracks([
    { id: 'p', type: 'PRIME', balance: 420_000, annualRate: 0.0625, remainingMonths: 264, monthsElapsed: 48 },
    { id: 'f', type: 'FIXED_UNLINKED', balance: 380_000, annualRate: 0.061, remainingMonths: 264, monthsElapsed: 48 },
    { id: 'l', type: 'FIXED_LINKED', balance: 260_000, annualRate: 0.02, remainingMonths: 204, monthsElapsed: 48 },
  ]);
  useTrackPlanStore.setState({ actions: {}, goal: '', answer: undefined });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function serve(enabled: boolean, plan?: unknown, answered: Promise<void> = Promise.resolve()) {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(init.body as string) });
        await answered;
        return new Response(JSON.stringify({ model: 'm', plan }));
      }
      return new Response(JSON.stringify({ enabled }));
    }),
  );
  return posts;
}

function Playground() {
  return <TrackPlayground plan={useTrackPlan()} />;
}

function renderPlayground() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Playground />
    </QueryClientProvider>,
  );
}

const PLAN = {
  actions: [
    { index: 0, action: 'KEEP', newType: null, termYears: null, prepayAmount: null },
    { index: 1, action: 'REFINANCE', newType: 'PRIME', termYears: 20, prepayAmount: null },
    { index: 2, action: 'KEEP', newType: null, termYears: null, prepayAmount: null },
  ],
  summary: 'שומרים את הצמודה הזולה וממחזרים את הקבועה',
  cautions: ['פריים משתנה עם הריבית'],
};

function later() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
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
    // The dear fixed track pays to refinance on its own; the cheap linked one is kept.
    expect((screen.getByRole('combobox', { name: 'מה לעשות במסלול קבועה לא צמודה' }) as HTMLSelectElement).value).toBe('REFINANCE');
    expect((screen.getByRole('combobox', { name: 'מה לעשות במסלול קבועה צמודה' }) as HTMLSelectElement).value).toBe('KEEP');

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
    const posts = serve(true, PLAN);
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

  it('applies nothing when the tracks change while the answer is on its way', async () => {
    const gate = later();
    serve(true, PLAN, gate.promise);
    const user = userEvent.setup();
    renderPlayground();
    await user.type(await screen.findByRole('textbox', { name: /מה אתם רוצים להשיג/ }), 'לשמור את הצמודה');
    await user.click(screen.getByRole('button', { name: 'הציעו לי תוכנית' }));
    act(() => useRefinance.getState().removeTrack('l'));
    await act(async () => gate.release());
    expect(await screen.findByText(/המסלולים השתנו/)).toBeTruthy();
    expect(useTrackPlanStore.getState().actions).toEqual({});
    expect(screen.queryByText(PLAN.summary)).toBeNull();
  });

  it('still applies the answer, and keeps the goal, when the section is folded meanwhile', async () => {
    const gate = later();
    serve(true, PLAN, gate.promise);
    const user = userEvent.setup();
    const view = renderPlayground();
    await user.type(await screen.findByRole('textbox', { name: /מה אתם רוצים להשיג/ }), 'לשמור את הצמודה');
    await user.click(screen.getByRole('button', { name: 'הציעו לי תוכנית' }));
    view.unmount();
    await act(async () => gate.release());
    await waitFor(() => expect(useTrackPlanStore.getState().actions.f).toEqual({ kind: 'REFINANCE', type: 'PRIME', termMonths: 240 }));
    renderPlayground();
    expect(await screen.findByText(PLAN.summary)).toBeTruthy();
    expect((screen.getByRole('textbox', { name: /מה אתם רוצים להשיג/ }) as HTMLTextAreaElement).value).toBe('לשמור את הצמודה');
  });

  it('keeps a track the borrower marked to keep, and a track at a good rate, out of the advice', () => {
    serve(false);
    useRefinance.setState({ keptIds: ['p', 'f'] });
    renderPlayground();
    for (const name of ['פריים', 'קבועה לא צמודה', 'קבועה צמודה']) {
      expect((screen.getByRole('combobox', { name: `מה לעשות במסלול ${name}` }) as HTMLSelectElement).value).toBe('KEEP');
    }
  });

  it('never advises a refinance that the playground prices at a loss', () => {
    serve(false);
    // Opening costs at the current bank make refinancing the small dear track a loss.
    const routes = useRefinance.getState().routes;
    useRefinance.setState({ routes: { ...routes, INTERNAL: { ...routes.INTERNAL, costs: { ...routes.INTERNAL.costs, fileOpening: 60_000 } } } });
    renderPlayground();
    expect((screen.getByRole('combobox', { name: 'מה לעשות במסלול קבועה לא צמודה' }) as HTMLSelectElement).value).toBe('KEEP');
  });
});
