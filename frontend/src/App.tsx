import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { APP_NAME, Logo } from './components/Logo';
import { Splash } from './components/Splash';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, fetchBaseline, fetchReference, optimize } from './lib/api';
import type { BorrowerProfileRequest, MacroRequest } from './lib/types';
import { useTheme } from './lib/theme';
import { useWizard } from './store/wizardStore';
import { useGlossary } from './store/glossaryStore';
import { GlossaryPanel, Term } from './components/Glossary';
import type { ManualShares } from './engine/manualMix';
import { useRefinance } from './store/refinanceStore';
import { useConsolidation } from './store/consolidationStore';
import { MortgageWizard } from './components/MortgageWizard';
import { OfferReview } from './pages/OfferReview';
import { ResultsDashboard } from './pages/ResultsDashboard';
import { ErrorCard, LoadingCard } from './components/ui';
import { MarketStatus } from './components/MarketStatus';
import { SinceLastVisit } from './components/SinceLastVisit';
import { useVisits } from './store/visitStore';
import { useMarket } from './store/marketStore';
import { useMoney, useMoneyCategories } from './store/moneyStore';
import { useQuestionnaire } from './store/questionnaireStore';

// The homeowner's path carries the charting library; loading it on demand keeps it off a visit
// that only buys.
const OwnPage = lazy(() => import('./pages/OwnPage').then((module) => ({ default: module.OwnPage })));
const MoneyPage = lazy(() => import('./pages/MoneyPage').then((module) => ({ default: module.MoneyPage })));
const StartPage = lazy(() => import('./pages/StartPage').then((module) => ({ default: module.StartPage })));
const SharedPage = lazy(() => import('./pages/StartPage').then((module) => ({ default: module.SharedPage })));

/**
 * The questionnaire (`#/start`) is the home page. The full tools behind it — every setting, the
 * track playground, a bank's offer checked against the market — stay at their own addresses, linked
 * from the footer as the advanced tools, with the way back to the questionnaire.
 */
type Mode = 'own' | 'buy' | 'money' | 'start' | 'shared';
type MortgageView = 'wizard' | 'results' | 'upload';

const MODES: { id: Mode; title: string }[] = [
  { id: 'own', title: 'יש לי משכנתא' },
  { id: 'buy', title: 'קונים דירה' },
  { id: 'money', title: 'תוכנית הבראה' },
];

/** Links from before the two paths: the three homeowner modes are one path now. */
const LEGACY: Record<string, Mode> = { mortgage: 'buy', refinance: 'own', consolidation: 'own', combined: 'own' };

function modeFromHash(): Mode {
  // `#/<mode>` or `#/<mode>/<screen>`; the screen is read by the page itself.
  const hash = window.location.hash.replace(/^#\/?/, '').split('/')[0] ?? '';
  // Own keys only: `#/constructor` must not find Object's.
  if (Object.hasOwn(LEGACY, hash)) {
    window.history.replaceState(null, '', `#/${LEGACY[hash]}`);
    return LEGACY[hash]!;
  }
  // A shared result (`#/s/<result>`) opens on its own page.
  if (hash === 's') {
    return 'shared';
  }
  // The questionnaire is the home page; the full tools stay at their own addresses.
  return MODES.some((mode) => mode.id === hash) ? (hash as Mode) : 'start';
}

export default function App() {
  const [mode, setMode] = useState<Mode>(modeFromHash);
  const [view, setView] = useState<MortgageView>('wizard');
  const { profile, macro, percentile, mixMode, manualShares, setMixMode, reset } = useWizard();
  const [theme, toggleTheme] = useTheme();

  // "Since your last visit" compares results only for the tools in use. The buyer's wizard counts on
  // opening; the homeowner's tools count once their result is seen (see OwnPage), since every visit
  // lands on that path first.
  useEffect(() => {
    if (mode === 'buy') {
      useVisits.getState().markVisited('mortgage');
    }
  }, [mode]);

  useEffect(() => {
    const onHash = () => setMode(modeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Live market figures are read on every load; the last good set is cached, so the app starts on
  // it and only the numbers change when the fresh one arrives.
  const queryClient = useQueryClient();
  const marketVersion = useMarket((state) => state.version);
  useEffect(() => {
    void useMarket.getState().refresh();
  }, []);
  useEffect(() => {
    if (marketVersion > 0) {
      void queryClient.invalidateQueries({ queryKey: ['reference'] });
      void queryClient.invalidateQueries({ queryKey: ['baseline'] });
    }
  }, [marketVersion, queryClient]);

  // Reference data and the market baseline are public, cheap and change at most daily.
  const reference = useQuery({ queryKey: ['reference'], queryFn: fetchReference, staleTime: 60 * 60 * 1000 });
  const baseline = useQuery({ queryKey: ['baseline'], queryFn: fetchBaseline, staleTime: 60 * 60 * 1000 });

  const optimization = useMutation({
    mutationFn: (input: {
      profile: BorrowerProfileRequest;
      macro: MacroRequest;
      percentile: number;
      manualShares?: ManualShares;
    }) => optimize(input.profile, input.macro, input.percentile, input.manualShares),
    onSuccess: () => setView('results'),
  });

  const runOptimization = () =>
    optimization.mutate({ profile, macro, percentile, manualShares: mixMode === 'MANUAL' ? manualShares : undefined });
  /** From a hand-built mix's results: switch to the engine's choice for the same inputs. */
  const adoptEngineMix = () => {
    setMixMode('AUTO');
    optimization.mutate({ profile, macro, percentile });
  };

  // Results priced on the previous market go stale when fresh figures arrive; re-run the same
  // inputs so the mix, the bank comparison and the baseline table agree. Only while they are on
  // screen — re-running from the wizard would jump the borrower to results unasked.
  const repricedFor = useRef(marketVersion);
  useEffect(() => {
    if (marketVersion === repricedFor.current) {
      return;
    }
    repricedFor.current = marketVersion;
    if (view === 'results' && optimization.variables) {
      optimization.mutate(optimization.variables);
    }
  }, [marketVersion, view, optimization]);

  const resetAll = () => {
    reset();
    useRefinance.getState().reset();
    useConsolidation.getState().reset();
    useQuestionnaire.getState().reset();
    useMoney.setState({ files: [], notes: {}, loans: {}, loanLinks: {}, refinance: false });
    useMoneyCategories.setState({ explanations: {} });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        דילוג לתוכן
      </a>
      <Header theme={theme} onToggleTheme={toggleTheme} />
      <GlossaryPanel />
      {mode !== 'start' && mode !== 'shared' && <ToolsBar title={MODES.find((each) => each.id === mode)!.title} />}
      {mode !== 'start' && mode !== 'shared' && <SinceLastVisit />}

      <main id="main" className="flex-1 px-4 pb-10 pt-6" tabIndex={-1}>
        <div {...(mode === 'start' || mode === 'shared' ? {} : { role: 'tabpanel', id: `panel-${mode}`, 'aria-labelledby': `tab-${mode}` })}>
          {mode === 'buy' && (
            <div className="space-y-5">

              {view === 'wizard' && (
                <div className="space-y-5">
                  {optimization.data && (
                    <div className="no-print mx-auto flex w-full max-w-3xl justify-end">
                      <button type="button" className="btn-ghost" onClick={() => setView('results')}>
                        חזרה לתוצאות <span aria-hidden>←</span>
                      </button>
                    </div>
                  )}
                  <MortgageWizard anchors={reference.data?.anchors} onSubmit={runOptimization} />
                  <p className="no-print text-center text-sm text-ink-soft">
                    כבר קיבלתם הצעה מהבנק?{' '}
                    <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setView('upload')}>
                      בדקו אותה מול השוק
                    </button>
                  </p>
                  {optimization.isPending && (
                    <div className="mx-auto w-full max-w-3xl">
                      <LoadingCard message="סורק את כל התמהילים החוקיים ומריץ מבחני קיצון…" />
                    </div>
                  )}
                  {optimization.isError && (
                    <div className="mx-auto w-full max-w-3xl">
                      <ErrorCard
                        title="החישוב נכשל"
                        message={
                          optimization.error instanceof ApiError
                            ? optimization.error.message
                            : 'לא ניתן היה להשלים את החישוב.'
                        }
                        details={optimization.error instanceof ApiError ? optimization.error.details : []}
                      />
                    </div>
                  )}
                </div>
              )}

              {view === 'results' && optimization.data && (
                <ResultsDashboard
                  result={optimization.data}
                  baseline={baseline.data}
                  onEdit={() => setView('wizard')}
                  onAdoptEngineMix={adoptEngineMix}
                />
              )}

              {view === 'upload' && (
                <div className="space-y-5">
                  <div className="no-print mx-auto w-full max-w-4xl">
                    <button type="button" className="btn-ghost" onClick={() => setView(optimization.data ? 'results' : 'wizard')}>
                      <span aria-hidden>→</span> {optimization.data ? 'חזרה לתוצאות' : 'חזרה לחישוב'}
                    </button>
                  </div>
                  <OfferReview />
                  <p className="mx-auto max-w-4xl text-center text-xs text-ink-soft">
                    מספרי תעודת זהות, שמות, כתובות ומספרי חשבון מוסרים מתוך המסמך בזיכרון. אישור עקרוני אחיד
                    מעובד בדפדפן בלבד ואינו נשלח לשום שרת; מסמך בפורמט אחר נשלח לקריאה עם AI רק אם תאשרו זאת.
                  </p>
                </div>
              )}
            </div>
          )}

          {mode === 'own' && (
            <Suspense
              fallback={
                <div className="mx-auto w-full max-w-3xl">
                  <LoadingCard message="טוען…" />
                </div>
              }
            >
              <OwnPage />
            </Suspense>
          )}

          {mode === 'start' && (
            <Suspense
              fallback={
                <div className="mx-auto w-full max-w-3xl">
                  <LoadingCard message="טוען…" />
                </div>
              }
            >
              <StartPage />
            </Suspense>
          )}

          {mode === 'shared' && (
            <Suspense
              fallback={
                <div className="mx-auto w-full max-w-3xl">
                  <LoadingCard message="טוען…" />
                </div>
              }
            >
              <SharedPage key={window.location.hash} />
            </Suspense>
          )}

          {mode === 'money' && (
            <Suspense
              fallback={
                <div className="mx-auto w-full max-w-3xl">
                  <LoadingCard message="טוען…" />
                </div>
              }
            >
              <MoneyPage />
            </Suspense>
          )}
        </div>
      </main>

      <Footer onReset={resetAll} />
    </div>
  );
}

function Header({ theme, onToggleTheme }: { theme: 'light' | 'dark'; onToggleTheme: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const brand = useRef<HTMLAnchorElement>(null);
  // The opening animation lands on the header's mark; until it does, the header's own stays hidden.
  const [landed, setLanded] = useState(false);
  const onLanded = useCallback(() => setLanded(true), []);
  // Section tabs stick directly under the header, whose height changes when the title wraps on a
  // narrow phone; publish the real height for them as --header-h.
  useEffect(() => {
    const header = ref.current;
    if (!header || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() =>
      document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`),
    );
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <header ref={ref} className="no-print sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      <Splash target={brand} onDone={onLanded} />
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
        <a ref={brand} href="#/start" aria-label={`${APP_NAME} · לדף הבית`} className={`flex min-w-0 items-center gap-2.5 ${landed ? '' : 'invisible'}`}>
          <Logo size={32} />
          <h1 className="truncate text-sm font-semibold text-ink">{APP_NAME}</h1>
        </a>
        <div className="flex shrink-0 items-center gap-2">
          <MarketStatus />
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink-muted transition hover:bg-surface-muted hover:text-ink"
            onClick={() => useGlossary.getState().show()}
            aria-label="מילון מונחים"
          >
            <span aria-hidden>📖</span>
            <span aria-hidden className="hidden sm:inline">
              מילון
            </span>
          </button>
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-base transition hover:bg-surface-muted"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'}
            title={theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
          >
            <span aria-hidden>{theme === 'dark' ? '☀️' : '🌙'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/** Above an advanced tool: which one it is, and the way back to the questionnaire. */
function ToolsBar({ title }: { title: string }) {
  return (
    <nav aria-label="כלים מתקדמים" className="no-print px-4 pt-4">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
        <span className="text-sm text-ink-soft">
          כלים מתקדמים · <span className="font-semibold text-ink">{title}</span>
        </span>
        <a href="#/start" className="flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-muted">
          <span aria-hidden>→</span> חזרה לשאלון
        </a>
      </div>
    </nav>
  );
}

function Footer({ onReset }: { onReset: () => void }) {
  return (
    <footer className="no-print border-t border-line px-4 py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-soft">
          נתוני בנק ישראל · כללי <Term id="directive329">הוראה 329</Term> (1.10.2026) · אינו ייעוץ פיננסי
        </p>
        <nav aria-label="הכלים המלאים" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-ink-soft">כלים מתקדמים:</span>
          {MODES.map((item) => (
            <a key={item.id} href={`#/${item.id}`} className="font-medium text-brand-700 hover:underline">
              {item.title}
            </a>
          ))}
        </nav>
        <button type="button" className="text-xs font-medium text-brand-700" onClick={onReset}>
          איפוס הנתונים
        </button>
      </div>
    </footer>
  );
}
