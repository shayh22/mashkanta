import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, fetchBaseline, fetchReference, optimize } from './lib/api';
import type { BorrowerProfileRequest, MacroRequest } from './lib/types';
import { useWizard } from './store/wizardStore';
import { MortgageWizard } from './components/MortgageWizard';
import { OfferReview } from './pages/OfferReview';
import { ResultsDashboard } from './pages/ResultsDashboard';
import { ErrorCard, LoadingCard } from './components/ui';

type View = 'wizard' | 'results' | 'upload';

export default function App() {
  const [view, setView] = useState<View>('wizard');
  const { profile, macro, percentile, reset } = useWizard();

  // Reference data and the market baseline are public, cheap and change at most daily.
  const reference = useQuery({ queryKey: ['reference'], queryFn: fetchReference, staleTime: 60 * 60 * 1000 });
  const baseline = useQuery({ queryKey: ['baseline'], queryFn: fetchBaseline, staleTime: 60 * 60 * 1000 });

  const optimization = useMutation({
    mutationFn: (input: { profile: BorrowerProfileRequest; macro: MacroRequest; percentile: number }) =>
      optimize(input.profile, input.macro, input.percentile),
    onSuccess: () => setView('results'),
  });

  const runOptimization = () => optimization.mutate({ profile, macro, percentile });

  return (
    <div className="min-h-screen">
      <Header
        view={view}
        onNavigate={(next) => {
          if (next === 'wizard' && view === 'results') {
            // Returning to the form should not discard the answers already given.
            setView('wizard');
            return;
          }
          setView(next);
        }}
        hasResults={optimization.isSuccess}
      />

      <main className="px-4 py-8">
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
              מספרי תעודת זהות, שמות, כתובות ומספרי חשבון מוסרים מתוך המסמך בזיכרון, לפני כל כתיבה
              לבסיס הנתונים. הקובץ שהועלה נמחק מיד בתום החילוץ.
            </p>
          </div>
        )}
      </main>

      <Footer onReset={reset} />
    </div>
  );
}

function Header({
  view,
  onNavigate,
  hasResults,
}: {
  view: View;
  onNavigate: (view: View) => void;
  hasResults: boolean;
}) {
  const tabs: { id: View; label: string; enabled: boolean }[] = [
    { id: 'wizard', label: 'חישוב תמהיל', enabled: true },
    { id: 'results', label: 'תוצאות', enabled: hasResults },
    { id: 'upload', label: 'בדיקת הצעה שקיבלתי', enabled: true },
  ];

  return (
    <header className="no-print sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            ₪
          </span>
          <div>
            <h1 className="text-sm font-bold text-ink">השוואת משכנתאות חכמה</h1>
            <p className="text-xs text-ink-soft">השוואה אובייקטיבית על בסיס נתונים ציבוריים בלבד</p>
          </div>
        </div>

        <nav className="flex rounded-xl bg-slate-100 p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              disabled={!tab.enabled}
              onClick={() => onNavigate(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                view === tab.id ? 'bg-white text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

function Footer({ onReset }: { onReset: () => void }) {
  return (
    <footer className="no-print border-t border-slate-200/80 bg-white/60 px-4 py-6">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-soft">
          נתוני הריביות מבוססים על פרסומי בנק ישראל, הלשכה המרכזית לסטטיסטיקה ותרומות אנונימיות של
          לווים. אין באמור ייעוץ פיננסי.
        </p>
        <button type="button" className="text-xs font-medium text-brand-600" onClick={onReset}>
          איפוס הנתונים
        </button>
      </div>
    </footer>
  );
}
