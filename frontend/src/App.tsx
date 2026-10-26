import { Suspense, lazy, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, fetchBaseline, fetchReference, optimize } from './lib/api';
import type { BorrowerProfileRequest, MacroRequest } from './lib/types';
import { useTheme } from './lib/theme';
import { useWizard } from './store/wizardStore';
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

// The refinance and consolidation modes carry the charting library; loading them on demand keeps
// it off the first visit, which lands on the mortgage wizard.
const RefinancePage = lazy(() =>
  import('./pages/RefinancePage').then((module) => ({ default: module.RefinancePage })),
);
const ConsolidationPage = lazy(() =>
  import('./pages/ConsolidationPage').then((module) => ({ default: module.ConsolidationPage })),
);
const CombinedPage = lazy(() =>
  import('./pages/CombinedPage').then((module) => ({ default: module.CombinedPage })),
);

/** The three jobs the platform does. Each is addressable by URL hash so it can be linked to. */
type Mode = 'mortgage' | 'refinance' | 'consolidation' | 'combined';
type MortgageView = 'wizard' | 'results' | 'upload';

const MODES: { id: Mode; icon: string; title: string; subtitle: string }[] = [
  { id: 'mortgage', icon: '🏠', title: 'משכנתא חדשה', subtitle: 'תמהיל אופטימלי והשוואת סלים אחידים' },
  {
    id: 'refinance',
    icon: '🔄',
    title: 'בדיקת כדאיות מיחזור',
    subtitle: 'עמלות פירעון, נקודת איזון וחיסכון',
  },
  { id: 'consolidation', icon: '🧩', title: 'איחוד הלוואות', subtitle: 'הבראה תזרימית כנגד הנכס' },
  { id: 'combined', icon: '🔀', title: 'מיחזור + איחוד', subtitle: 'שני המהלכים יחד, תוכנית אחת' },
];

function modeFromHash(): Mode {
  // `#/<mode>` or `#/<mode>/<section>`; the section is read by the page's own tabs.
  const hash = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return MODES.some((mode) => mode.id === hash) ? (hash as Mode) : 'mortgage';
}

export default function App() {
  const [mode, setMode] = useState<Mode>(modeFromHash);
  const [view, setView] = useState<MortgageView>('wizard');
  const { profile, macro, percentile, reset } = useWizard();
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    useVisits.getState().markVisited(mode);
  }, [mode]);

  useEffect(() => {
    const onHash = () => setMode(modeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (next: Mode) => {
    setMode(next);
    if (modeFromHash() !== next) {
      window.history.replaceState(null, '', `#/${next}`);
    }
  };

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
    mutationFn: (input: { profile: BorrowerProfileRequest; macro: MacroRequest; percentile: number }) =>
      optimize(input.profile, input.macro, input.percentile),
    onSuccess: () => setView('results'),
  });

  const runOptimization = () => optimization.mutate({ profile, macro, percentile });

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
      <ModeNav mode={mode} onSelect={navigate} />
      <SinceLastVisit />

      <main id="main" className="flex-1 px-4 pb-10 pt-6" tabIndex={-1}>
        <div role="tabpanel" id={`panel-${mode}`} aria-labelledby={`tab-${mode}`}>
          {mode === 'mortgage' && (
            <div className="space-y-5">
              <MortgageSubNav view={view} onSelect={setView} hasResults={optimization.isSuccess} />

              {view === 'wizard' && (
                <div className="space-y-5">
                  <MortgageWizard anchors={reference.data?.anchors} onSubmit={runOptimization} />
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
                />
              )}

              {view === 'upload' && (
                <div className="space-y-5">
                  <OfferReview />
                  <p className="mx-auto max-w-4xl text-center text-xs text-ink-soft">
                    מספרי תעודת זהות, שמות, כתובות ומספרי חשבון מוסרים מתוך המסמך בזיכרון. הקובץ מעובד בדפדפן
                    בלבד ואינו נשלח לשום שרת.
                  </p>
                </div>
              )}
            </div>
          )}

          {mode !== 'mortgage' && (
            <Suspense
              fallback={
                <div className="mx-auto w-full max-w-3xl">
                  <LoadingCard message="טוען…" />
                </div>
              }
            >
              {mode === 'refinance' && <RefinancePage />}
              {mode === 'consolidation' && <ConsolidationPage />}
              {mode === 'combined' && <CombinedPage />}
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
    <header ref={ref} className="no-print sticky top-0 z-40 border-b border-line/70 bg-surface/75 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 text-lg font-bold text-white shadow-glow">
            ₪
          </span>
          <div>
            <h1 className="text-sm font-bold text-ink">השוואת משכנתאות חכמה</h1>
            <p className="hidden text-xs text-ink-soft sm:block">
              מיחזור, איחוד הלוואות ותמהיל — על בסיס נתונים ציבוריים בלבד
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <MarketStatus />
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-base transition hover:bg-surface-muted"
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

/**
 * The three modes as an ARIA tablist. Arrow keys move between tabs; in a right-to-left layout the
 * left arrow moves forward, which is where the next tab visually is.
 */
function ModeNav({ mode, onSelect }: { mode: Mode; onSelect: (mode: Mode) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0;
    let target = index + step;
    if (event.key === 'Home') {
      target = 0;
    } else if (event.key === 'End') {
      target = MODES.length - 1;
    } else if (step === 0) {
      return;
    }
    event.preventDefault();
    target = (target + MODES.length) % MODES.length;
    onSelect(MODES[target]!.id);
    refs.current[target]?.focus();
  };

  return (
    <nav className="no-print px-4 pt-5" aria-label="מצבי עבודה">
      <div
        role="tablist"
        aria-label="מצב עבודה"
        className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
      >
        {MODES.map((item, index) => {
          const selected = item.id === mode;
          return (
            <button
              key={item.id}
              ref={(element) => {
                refs.current[index] = element;
              }}
              id={`tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`group flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center transition sm:flex-row sm:items-start sm:gap-3 sm:px-4 sm:text-start ${
                selected
                  ? 'border-brand-500/60 bg-surface shadow-glow ring-1 ring-brand-500/40'
                  : 'border-line/80 bg-surface/60 hover:bg-surface hover:shadow-card'
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg transition ${
                  selected ? 'bg-brand-50' : 'bg-surface-sunken group-hover:bg-brand-50'
                }`}
                aria-hidden
              >
                {item.icon}
              </span>
              <span>
                <span
                  className={`block text-xs font-semibold sm:text-sm ${selected ? 'text-brand-700' : 'text-ink'}`}
                >
                  {item.title}
                </span>
                <span className="hidden text-xs text-ink-soft sm:block">{item.subtitle}</span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function MortgageSubNav({
  view,
  onSelect,
  hasResults,
}: {
  view: MortgageView;
  onSelect: (view: MortgageView) => void;
  hasResults: boolean;
}) {
  const items: { id: MortgageView; label: string; enabled: boolean }[] = [
    { id: 'wizard', label: 'חישוב תמהיל', enabled: true },
    { id: 'results', label: 'תוצאות', enabled: hasResults },
    { id: 'upload', label: 'בדיקת הצעה שקיבלתי', enabled: true },
  ];
  return (
    <div className="no-print mx-auto flex w-full max-w-6xl justify-center">
      <div
        className="inline-flex rounded-xl border border-line/80 bg-surface-sunken/80 p-0.5"
        role="group"
        aria-label="שלבי משכנתא חדשה"
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={!item.enabled}
            aria-pressed={view === item.id}
            onClick={() => onSelect(item.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
              view === item.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Footer({ onReset }: { onReset: () => void }) {
  return (
    <footer className="no-print border-t border-line/70 bg-surface/60 px-4 py-6 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-soft">
          נתוני הריביות מבוססים על פרסומי בנק ישראל, הלשכה המרכזית לסטטיסטיקה ותרומות אנונימיות של לווים.
          הכללים הרגולטוריים לפי הוראה 329 בנוסחה מ-1.10.2026. אין באמור ייעוץ פיננסי.
        </p>
        <button type="button" className="text-xs font-medium text-brand-700" onClick={onReset}>
          איפוס הנתונים
        </button>
      </div>
    </footer>
  );
}
