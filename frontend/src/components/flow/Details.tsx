import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { AnswerValue, Answers } from '../../engine/flow/flow';
import { savingIdeas } from '../../engine/money/savings';
import { formatCurrency, formatPercent, formatTerm } from '../../lib/format';
import { bestRoute } from '../../lib/routes';
import type { StressScenario } from '../../lib/types';
import { useMoneyCategories, useMonthlyPicture } from '../../store/moneyStore';
import { isSampleTracks, useRefinance, useRefinanceAnalysis } from '../../store/refinanceStore';
import { useBuyResult, useRefinanceAnswers, useRefinanceEstimate } from './hooks';
import { TRACK_NAMES } from '../../lib/trackColors';
import { Dot, Panel, Rows } from './parts';
import { IncomePanel, OverdraftPanel, SpendingPanel } from './Today';
import { RoutesPanel } from './Compare';

/**
 * The details behind a result, in the questionnaire's own look: no tabs, one column, each part a
 * card with a heading, and the few settings that change the result right here.
 */


function Shell({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="חזרה לתוצאה" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-flow-card">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
        <h2 ref={heading} tabIndex={-1} className="flex-1 text-[28px] font-black leading-tight tracking-tight outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
          {title}
        </h2>
      </div>
      {children}
      <button type="button" onClick={onBack} className="flex min-h-14 items-center justify-center rounded-full bg-flow-ink px-6 text-lg font-extrabold text-flow-ground">
        חזרה לתוצאה
      </button>
    </div>
  );
}

function Pills<T extends string | number>({ label, value, options, onPick }: { label: string; value: T; options: readonly { id: T; label: string }[]; onPick: (id: T) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[15px] font-bold">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            onClick={() => onPick(option.id)}
            className={`min-h-11 rounded-full px-4 text-[15px] ${value === option.id ? 'border-2 border-flow-strong bg-flow-pick font-extrabold' : 'border border-flow-line font-semibold'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The hardest scenarios, each payment once; a fixed mix's payment that no scenario moves, in a line. */
function StressRows({ initial, scenarios }: { initial: number; scenarios: readonly StressScenario[] }) {
  const moving = scenarios.filter((scenario) => scenario.maxPayment > initial + 1);
  if (moving.length === 0) {
    return <p className="text-[15px]">ההחזר קבוע: הוא לא זז גם אם הריבית או המדד יעלו.</p>;
  }
  const seen = new Set<number>();
  const hardest = [...moving]
    .sort((a, b) => b.maxPayment - a.maxPayment)
    .filter((scenario) => {
      const key = Math.round(scenario.maxPayment);
      return !seen.has(key) && seen.add(key);
    })
    .slice(0, 4);
  return (
    <Rows
      rows={hardest.map((scenario) => [
        scenario.label,
        <span key={scenario.id} className={scenario.breachesCapacity ? 'text-negative' : ''}>
          עד {formatCurrency(scenario.maxPayment)}
        </span>,
      ])}
    />
  );
}


/** A buyer's mix: the term and the appetite for risk to try, every track, the stress, the baskets, the banks and the other terms. */
export function BuyDetails({ answers, onAnswer, onBack }: { answers: Answers; onAnswer: (field: string, value: AnswerValue) => void; onBack: () => void }) {
  const { plan, result } = useBuyResult(answers);
  const data = result.data;
  const term = typeof answers.termYears === 'number' ? answers.termYears : plan?.kind === 'LOAN' ? plan.profile.termMonths / 12 : 25;
  return (
    <Shell title="פרטי התמהיל" onBack={onBack}>
      <Panel title="לנסות אחרת">
        <Pills label="תקופה" value={term} options={[15, 20, 25, 30].map((years) => ({ id: years, label: `${years} שנים` }))} onPick={(years) => onAnswer('termYears', years)} />
        <Pills
          label="מה חשוב לכם"
          value={(answers.stability as string) ?? 'BALANCED'}
          options={[
            { id: 'STABLE', label: 'יציבות' },
            { id: 'BALANCED', label: 'איזון' },
            { id: 'CHEAP', label: 'הכי זול' },
          ]}
          onPick={(stability) => onAnswer('stability', stability)}
        />
      </Panel>
      {result.isPending && plan?.kind === 'LOAN' && (
        <p role="status" className="rounded-[20px] bg-flow-card p-5 text-base text-flow-muted">
          מחשב…
        </p>
      )}
      {data && (
        <>
          <Panel title="המסלולים">
            <ul className="flex flex-col">
              {data.recommended.summary.allocations
                .filter((track) => track.share > 0.0005)
                .map((track) => (
                  <li key={`${track.track}-${track.termMonths}`} className="flex flex-col gap-1 border-b border-flow-line py-2.5 last:border-b-0">
                    <span className="flex items-center gap-2 text-[15px] font-extrabold">
                      <Dot type={track.track} />
                      {track.hebrewName}
                      <span className="ms-auto tabular-nums">{formatCurrency(track.amount)}</span>
                    </span>
                    <span className="text-sm text-flow-muted">
                      {formatPercent(track.annualRate)} · {formatTerm(track.termMonths)} · {formatCurrency(track.initialPayment)} בחודש
                      {track.maxPayment > track.initialPayment + 1 ? ` · עד ${formatCurrency(track.maxPayment)}` : ''}
                    </span>
                  </li>
                ))}
            </ul>
            <Rows
              rows={[
                ['החזר בהתחלה', formatCurrency(data.recommended.summary.initialPayment), true],
                ['ריבית', formatCurrency(data.recommended.summary.totalInterest)],
                ['הצמדה למדד', formatCurrency(data.recommended.summary.totalIndexation)],
                ['סך הכל תשלמו', formatCurrency(data.recommended.summary.totalPaid), true],
              ]}
            />
          </Panel>

          <Panel title="אם הריבית או המדד יעלו">
            <StressRows initial={data.recommended.summary.initialPayment} scenarios={data.recommended.stress.scenarios} />
          </Panel>

          {data.termSensitivity.length > 0 && (
            <Panel title="תקופות אחרות">
              <Rows
                rows={data.termSensitivity.map((option) => [
                  formatTerm(option.termMonths),
                  <span key={option.termMonths} className={option.affordable ? '' : 'text-negative'}>
                    {formatCurrency(option.initialPayment)} · סה״כ {formatCurrency(option.totalPaid)}
                  </span>,
                ])}
              />
            </Panel>
          )}
        </>
      )}
      <p className="text-xs leading-relaxed text-flow-muted">לפי ריביות השוק של בנק ישראל. אינו ייעוץ ואינו הצעה של בנק.</p>
    </Shell>
  );
}

/** A homeowner's refinance: both routes, each track today, the new mix and what the switch costs. */
export function RefinanceDetails({ answers, onEdit, onBack }: { answers: Answers; onEdit: (step: string) => void; onBack: () => void }) {
  const tracks = useRefinance((state) => state.tracks);
  return isSampleTracks(tracks) ? (
    <EstimateDetails answers={answers} onEdit={onEdit} onBack={onBack} />
  ) : (
    <ExactDetails answers={answers} onBack={onBack} />
  );
}

function ExactDetails({ answers, onBack }: { answers: Answers; onBack: () => void }) {
  useRefinanceAnswers(answers);
  const tracks = useRefinance((state) => state.tracks);
  const { comparison, perTrack, proposal } = useRefinanceAnalysis();
  const route = comparison ? bestRoute(comparison) : undefined;
  return (
    <Shell title="פרטי המיחזור" onBack={onBack}>
      {comparison && route && (
        <>
          <RoutesPanel comparison={comparison} />

          <Panel title="המסלולים שלכם היום">
            <ul className="flex flex-col">
              {tracks.map((track) => {
                const verdict = perTrack.find((each) => each.id === track.id);
                return (
                  <li key={track.id} className="flex flex-col gap-1 border-b border-flow-line py-2.5 last:border-b-0">
                    <span className="flex items-center gap-2 text-[15px] font-extrabold">
                      <Dot type={track.type} />
                      {TRACK_NAMES[track.type]}
                      <span className="ms-auto tabular-nums">{formatCurrency(track.balance)}</span>
                    </span>
                    <span className="text-sm text-flow-muted">
                      {formatPercent(track.annualRate)} · נשארו {formatTerm(track.remainingMonths)}
                    </span>
                    {verdict && (
                      <span className={`text-sm font-bold ${verdict.worthwhile ? 'text-flow-strong' : 'text-flow-muted'}`}>
                        {verdict.worthwhile ? `כדאי למחזר · ${formatCurrency(verdict.monthlySaving)} בחודש` : 'עדיף להשאיר'}
                        {verdict.fee > 0 ? ` · עמלה ${formatCurrency(verdict.fee)}` : ''}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="התמהיל החדש">
            <ul className="flex flex-col">
              {proposal.map((track) => (
                <li key={track.id} className="flex items-center gap-2 border-b border-flow-line py-2.5 text-[15px] last:border-b-0">
                  <Dot type={track.type} />
                  <span className="font-bold">{TRACK_NAMES[track.type]}</span>
                  {track.carriedOver && <span className="text-xs text-flow-muted">נשאר כמו שהוא</span>}
                  <span className="ms-auto text-sm text-flow-muted tabular-nums">
                    {formatPercent(track.annualRate)} · {formatCurrency(track.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <Rows
              rows={[
                ['החזר היום', formatCurrency(route.currentPayment)],
                ['החזר אחרי', formatCurrency(route.proposedPayment), true],
              ]}
            />
          </Panel>

          <Panel title="מה עולה המעבר">
            <Rows
              rows={[
                ['עמלת פירעון מוקדם', formatCurrency(route.prepayment.total)],
                ['עלויות מעבר (שמאות, פתיחת תיק…)', formatCurrency(route.switchingCost)],
                ['סך הכל ביום המעבר', formatCurrency(route.upfrontCost), true],
                ['חיסכון נטו לאורך התקופה', formatCurrency(route.lifetimeSaving), true],
              ]}
            />
          </Panel>
        </>
      )}
      <p className="text-xs leading-relaxed text-flow-muted">לפי דוח היתרות וריביות השוק של בנק ישראל. אינו ייעוץ ואינו הצעה של בנק.</p>
    </Shell>
  );
}

function EstimateDetails({ answers, onEdit, onBack }: { answers: Answers; onEdit: (step: string) => void; onBack: () => void }) {
  const { estimate, result } = useRefinanceEstimate(answers);
  const proposed = result.data?.recommended.summary;
  return (
    <Shell title="פרטי ההערכה" onBack={onBack}>
      {estimate?.kind === 'ESTIMATE' && proposed && (
        <>
          <Panel title="המשכנתא כמו שמילאתם">
            <Rows
              rows={[
                ['יתרה', formatCurrency(estimate.current.balance)],
                ['החזר בחודש', formatCurrency(estimate.current.payment)],
                ['נשארו', formatTerm(estimate.current.months)],
                ['הריבית שזה אומר, בערך', formatPercent(estimate.current.rate), true],
              ]}
            />
          </Panel>
          <Panel title="תמהיל חדש לאותה יתרה ותקופה">
            <ul className="flex flex-col">
              {proposed.allocations
                .filter((track) => track.share > 0.0005)
                .map((track) => (
                  <li key={`${track.track}-${track.termMonths}`} className="flex items-center gap-2 border-b border-flow-line py-2.5 text-[15px] last:border-b-0">
                    <Dot type={track.track} />
                    <span className="font-bold">{track.hebrewName}</span>
                    <span className="ms-auto text-sm text-flow-muted tabular-nums">
                      {formatPercent(track.annualRate)} · {Math.round(track.share * 100)}%
                    </span>
                  </li>
                ))}
            </ul>
            <Rows
              rows={[
                ['החזר בהתחלה', formatCurrency(proposed.initialPayment), true],
                ['סך הכל', formatCurrency(proposed.totalPaid)],
              ]}
            />
          </Panel>
        </>
      )}
      <div className="flex flex-col gap-1.5 rounded-2xl bg-flow-accent/25 p-3.5 text-[15px]">
        <span className="font-extrabold">לחישוב מדויק, עם עמלות</span>
        <span>מעלים את דוח היתרות מהבנק: כל מסלול, עמלת הפירעון המוקדם והדרך המשתלמת.</span>
        <button type="button" onClick={() => onEdit('mortgageHow')} className="min-h-11 self-start font-bold underline underline-offset-4">
          להעלות את הדוח
        </button>
      </div>
    </Shell>
  );
}

/** The recovery plan's details: where the money goes, what comes in, the balance, and every idea to save. */
export function RecoveryDetails({ onBack }: { onBack: () => void }) {
  const picture = useMonthlyPicture();
  const explanations = useMoneyCategories((state) => state.explanations);
  const ideas = useMemo(() => (picture ? savingIdeas(picture, explanations) : []), [picture, explanations]);
  if (!picture) {
    return (
      <Shell title="פרטי החשבון" onBack={onBack}>
        <p className="rounded-[20px] bg-flow-card p-5 text-base">אין כרגע דפי חשבון במכשיר. העלו אותם שוב בשאלון.</p>
      </Shell>
    );
  }
  return (
    <Shell title="פרטי החשבון" onBack={onBack}>
      <SpendingPanel picture={picture} />
      <IncomePanel picture={picture} />
      <OverdraftPanel picture={picture} />

      {ideas.length > 0 && (
        <Panel title="איפה אפשר לחסוך">
          <ul className="flex flex-col">
            {ideas.map((idea, index) => (
              <li key={`${idea.kind}-${index}`} className="flex flex-col gap-1 border-b border-flow-line py-2.5 last:border-b-0">
                <span className="flex items-center justify-between gap-2 text-[15px] font-extrabold">
                  {idea.title}
                  {idea.monthly !== undefined && idea.monthly >= 1 && <span className="tabular-nums text-flow-strong">+{formatCurrency(idea.monthly)}</span>}
                </span>
                <span className="text-sm text-flow-muted">{idea.detail}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <p className="text-xs leading-relaxed text-flow-muted">לפי {picture.months.length} חודשים מלאים. הקבצים נקראו במכשיר ולא נשמרו.</p>
    </Shell>
  );
}
