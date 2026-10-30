import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { APP_NAME, Logo } from './components/Logo';
import { Splash } from './components/Splash';
import { useTheme } from './lib/theme';
import { useWizard } from './store/wizardStore';
import { useGlossary } from './store/glossaryStore';
import { GlossaryPanel, Term } from './components/Glossary';
import { useRefinance } from './store/refinanceStore';
import { useConsolidation } from './store/consolidationStore';
import { LoadingCard } from './components/ui';
import { MarketStatus } from './components/MarketStatus';
import { useMarket } from './store/marketStore';
import { useMoney, useMoneyCategories } from './store/moneyStore';
import { START, useQuestionnaire } from './store/questionnaireStore';
import { useTrackPlanStore } from './store/trackPlanStore';
import type { Goal } from './engine/flow/flow';

const StartPage = lazy(() => import('./pages/StartPage').then((module) => ({ default: module.StartPage })));
const SharedPage = lazy(() => import('./pages/StartPage').then((module) => ({ default: module.SharedPage })));

/**
 * The questionnaire (`#/start`) is the whole app: the goals, the questions and the result screens,
 * every tool inside them. A shared result (`#/s/<result>`) opens on its own page.
 */
type Mode = 'start' | 'shared';

/**
 * The addresses of the tools that stood beside the questionnaire, and of the paths before them:
 * each leads to the questionnaire, its goal chosen when none is yet.
 */
const RETIRED: Record<string, Goal> = {
  own: 'REFINANCE',
  refinance: 'REFINANCE',
  consolidation: 'REFINANCE',
  combined: 'REFINANCE',
  buy: 'BUY',
  mortgage: 'BUY',
  money: 'RECOVERY',
};

function modeFromHash(): Mode {
  const hash = window.location.hash.replace(/^#\/?/, '').split('/')[0] ?? '';
  if (hash === 's') {
    return 'shared';
  }
  // Own keys only: `#/constructor` must not find Object's.
  if (Object.hasOwn(RETIRED, hash)) {
    const questionnaire = useQuestionnaire.getState();
    if (questionnaire.goals.length === 0) {
      questionnaire.setGoals([RETIRED[hash]!]);
      questionnaire.go(START);
    }
    window.history.replaceState(null, '', '#/start');
  }
  return 'start';
}

export default function App() {
  const [mode, setMode] = useState<Mode>(modeFromHash);
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    const onHash = () => setMode(modeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Live market figures are read on every load; the last good set is cached, so the app starts on
  // it and only the numbers change when the fresh one arrives.
  useEffect(() => {
    void useMarket.getState().refresh();
  }, []);

  const resetAll = () => {
    useWizard.getState().reset();
    useRefinance.getState().reset();
    useConsolidation.getState().reset();
    useQuestionnaire.getState().reset();
    useTrackPlanStore.setState({ actions: {}, answer: undefined, goal: '' });
    useMoney.setState({ files: [], notes: {}, loans: {}, loanLinks: {}, refinance: false });
    useMoneyCategories.setState({ explanations: {} });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        // The address is the screen: following "#main" would leave it for an unknown one.
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        דילוג לתוכן
      </a>
      <Header theme={theme} onToggleTheme={toggleTheme} />
      <GlossaryPanel />

      <main id="main" className="flex-1 px-4 pb-10 pt-6" tabIndex={-1}>
        <Suspense
          fallback={
            <div className="mx-auto w-full max-w-3xl">
              <LoadingCard message="טוען…" />
            </div>
          }
        >
          {mode === 'shared' ? <SharedPage key={window.location.hash} /> : <StartPage />}
        </Suspense>
      </main>

      <Footer onReset={resetAll} />
    </div>
  );
}

function Header({ theme, onToggleTheme }: { theme: 'light' | 'dark'; onToggleTheme: () => void }) {
  const brand = useRef<HTMLAnchorElement>(null);
  // The opening animation lands on the header's mark; until it does, the header's own stays hidden.
  const [landed, setLanded] = useState(false);
  const onLanded = useCallback(() => setLanded(true), []);
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
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

function Footer({ onReset }: { onReset: () => void }) {
  return (
    <footer className="no-print border-t border-line px-4 py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-soft">
          נתוני בנק ישראל · כללי <Term id="directive329">הוראה 329</Term> (1.10.2026) · אינו ייעוץ פיננסי
        </p>
        <button type="button" className="text-xs font-medium text-brand-700" onClick={onReset}>
          איפוס הנתונים
        </button>
      </div>
    </footer>
  );
}
