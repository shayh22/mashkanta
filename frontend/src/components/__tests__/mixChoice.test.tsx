import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MortgageWizard } from '../MortgageWizard';
import { MixExplainer } from '../MixExplainer';
import { useWizard } from '../../store/wizardStore';
import { SAMPLE_REQUEST } from '../../engine/mixExplanation.fixture';

const withQuery = (node: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useWizard.getState().reset();
});

describe('choosing the mix in the wizard', () => {
  it('offers automatic or manual, and checks a hand-built mix before it can be priced', async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    useWizard.getState().goTo(3);
    withQuery(<MortgageWizard onSubmit={submit} />);

    expect(screen.getByRole('button', { name: 'חשב תמהיל אופטימלי' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^ידני/ }));
    expect(useWizard.getState().mixMode).toBe('MANUAL');

    // The default split is a third each and adds up.
    const calculate = screen.getByRole('button', { name: 'חשב את התמהיל שלי' }) as HTMLButtonElement;
    expect(calculate.disabled).toBe(false);
    expect(screen.getByText(/עומד בכללי הוראה 329/)).toBeTruthy();

    // 80% prime breaks the 329 shape and the total.
    fireEvent.change(screen.getByRole('spinbutton', { name: 'אחוז במסלול פריים' }), { target: { value: '80' } });
    expect(screen.getByRole('alert').textContent).toContain('147%');
    expect(calculate.disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'פריים + קבועה לא צמודה' }));
    expect(calculate.disabled).toBe(false);
    await user.click(calculate);
    expect(submit).toHaveBeenCalledOnce();
    expect(useWizard.getState().manualShares).toEqual({ PRIME: 1 / 3, FIXED_UNLINKED: 2 / 3 });
  });

  it('warns, without blocking, when the mix breaks Directive 329', async () => {
    useWizard.getState().goTo(3);
    useWizard.getState().setMixMode('MANUAL');
    useWizard.getState().setManualShares({ PRIME: 0.8, FIXED_UNLINKED: 0.2 });
    withQuery(<MortgageWizard onSubmit={() => undefined} />);
    expect(screen.getByText(/מסלול הפריים עולה על שני שלישים/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'חשב את התמהיל שלי' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('explaining a mix with AI', () => {
  function serve(enabled: boolean) {
    const posts: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          posts.push({ url, body: JSON.parse(init.body as string) });
          return new Response(
            JSON.stringify({
              model: 'm',
              explanation: { headline: 'תמהיל שמאזן עלות ויציבות', reasons: ['שני שלישים בקבועה'], risks: ['הפריים יכול לעלות'], askTheBank: ['מה המרווח?'] },
            }),
          );
        }
        return new Response(JSON.stringify({ enabled }));
      }),
    );
    return posts;
  }

  it('stays hidden while AI is off', async () => {
    serve(false);
    withQuery(<MixExplainer request={SAMPLE_REQUEST} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('button', { name: 'הסבר לי את התמהיל' })).toBeNull();
  });

  it('sends the figures only when asked, and shows the explanation', async () => {
    const user = userEvent.setup();
    const posts = serve(true);
    withQuery(<MixExplainer request={SAMPLE_REQUEST} />);
    const button = await screen.findByRole('button', { name: 'הסבר לי את התמהיל' });
    expect(posts).toEqual([]);
    await user.click(button);
    await waitFor(() => expect(screen.getByText('תמהיל שמאזן עלות ויציבות')).toBeTruthy());
    expect(posts).toEqual([{ url: '/api/explain', body: SAMPLE_REQUEST }]);
    expect(screen.getByText('הפריים יכול לעלות')).toBeTruthy();
    expect(screen.getByText('מה המרווח?')).toBeTruthy();
  });
});
