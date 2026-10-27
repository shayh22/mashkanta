import { DebtsStep } from '../components/money/Debts';
import { DocumentsBar, FilesStep } from '../components/money/FilesStep';
import { FlowStep, SavingsStep, SpendingStep, SummaryStep } from '../components/money/Steps';
import { usePageTab, type PageTab } from '../lib/pageTabs';
import { useMoney, useMonthlyPicture } from '../store/moneyStore';

type StepId = 'files' | 'flow' | 'spending' | 'debts' | 'savings' | 'summary';

const STEPS: PageTab<StepId>[] = [
  { id: 'files', label: 'הקבצים' },
  { id: 'flow', label: 'נכנס ויוצא' },
  { id: 'spending', label: 'לאן הולך הכסף' },
  { id: 'debts', label: 'הלוואות ומשכנתא' },
  { id: 'savings', label: 'איפה לחסוך' },
  { id: 'summary', label: 'הסיכום' },
];

/**
 * The recovery plan ("תוכנית הבראה"): the household's bank and card statements, read in the browser, walked through one
 * screen at a time — the files, what comes in and goes out, where it goes, the loans and the
 * mortgage, where to save, and the decisions. Every screen has one headline, one chart and a box to tell the AI what it misses.
 */
export function MoneyPage() {
  const [step, setStep] = usePageTab('money', STEPS);
  const ready = useMoney((state) => state.files.some((file) => file.statement));
  const picture = useMonthlyPicture();
  const current: StepId = ready && picture ? step : 'files';
  const index = STEPS.findIndex((item) => item.id === current);
  const go = (next: StepId) => {
    setStep(next);
    window.scrollTo({ top: 0 });
  };
  const previous = STEPS[index - 1];
  const next = STEPS[index + 1];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <JourneyProgress current={index} ready={ready} onSelect={go} />
      {current === 'files' || !picture ? (
        <FilesStep onDone={() => go('flow')} />
      ) : (
        <>
          <DocumentsBar />
          {current === 'flow' && <FlowStep picture={picture} />}
          {current === 'spending' && <SpendingStep picture={picture} />}
          {current === 'debts' && <DebtsStep picture={picture} />}
          {current === 'savings' && <SavingsStep picture={picture} onExplain={() => go('spending')} />}
          {current === 'summary' && <SummaryStep picture={picture} />}
          <nav className="no-print flex items-center justify-between gap-3 pt-2" aria-label="מעבר בין שלבים">
            {previous ? (
              <button type="button" className="btn-ghost" onClick={() => go(previous.id)}>
                <span aria-hidden>→</span> {previous.label}
              </button>
            ) : (
              <span />
            )}
            {next && (
              <button type="button" className="btn-primary" onClick={() => go(next.id)}>
                הבא: {next.label} <span aria-hidden>←</span>
              </button>
            )}
          </nav>
        </>
      )}
    </div>
  );
}

/** Where the household is in the journey: a bar in steps, the current one named. */
function JourneyProgress({ current, ready, onSelect }: { current: number; ready: boolean; onSelect: (step: StepId) => void }) {
  return (
    <nav className="no-print space-y-2" aria-label="שלבים">
      <p className="text-sm text-ink-soft sm:hidden">
        שלב {current + 1} מתוך {STEPS.length} · <span className="font-semibold text-ink">{STEPS[current]!.label}</span>
      </p>
      <ol className="grid grid-cols-6 gap-1.5">
        {STEPS.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              disabled={index > 0 && !ready}
              aria-current={index === current ? 'step' : undefined}
              aria-label={`שלב ${index + 1}: ${item.label}`}
              className="group flex w-full flex-col gap-1.5 text-start disabled:cursor-not-allowed"
            >
              <span
                className={`h-1.5 w-full rounded-full transition-colors duration-300 ${
                  index < current ? 'bg-brand-500' : index === current ? 'bg-brand-700' : 'bg-surface-sunken group-enabled:group-hover:bg-line-strong'
                }`}
              />
              <span
                className={`hidden truncate text-xs sm:block ${index === current ? 'font-semibold text-ink' : index < current ? 'text-ink-muted' : 'text-ink-soft'}`}
              >
                {index + 1}. {item.label}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
