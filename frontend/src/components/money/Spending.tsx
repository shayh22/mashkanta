import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { CATEGORY_LABELS, type CategoryId } from '../../engine/money/categories';
import { MAX_PAYEES } from '../../engine/money/categorizeRequest';
import { FLEXIBILITY_LABELS, isExplained, MAX_NOTE_LENGTH, type Flexibility } from '../../engine/money/explanations';
import type { CategoryLine, MonthlyPicture, Payee } from '../../engine/money/picture';
import { categorizePayees, useAiEnabled } from '../../lib/aiClient';
import { formatCurrency } from '../../lib/format';
import { useMoneyCategories } from '../../store/moneyStore';
import { Card } from '../ui';
import { SPENDING_CHOICES } from './format';

export function SpendingCard({ picture }: { picture: MonthlyPicture }) {
  const top = picture.spendingLines[0]?.monthly ?? 1;
  const fixedShare = picture.spending > 0 ? picture.fixed / picture.spending : 0;
  const other = picture.spendingLines.find((line) => line.id === 'OTHER');
  return (
    <Card
      title="לאן הולך הכסף"
      subtitle="ממוצע לחודש. לחצו על קטגוריה לראות את בתי העסק ולתקן סיווג."
      fold={`${picture.spendingLines.length} קטגוריות · קבועות ${formatCurrency(picture.fixed)} בחודש`}
    >
      <div className="mb-4 space-y-1.5">
        <div className="flex h-3 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
          <div className="bg-brand-600" style={{ width: `${fixedShare * 100}%` }} />
          <div className="bg-brand-200" style={{ width: `${(1 - fixedShare) * 100}%` }} />
        </div>
        <p className="flex justify-between text-xs text-ink-muted">
          <span>קבועות {formatCurrency(picture.fixed)}</span>
          <span>משתנות {formatCurrency(picture.spending - picture.fixed)}</span>
        </p>
      </div>
      {other && <AiSort line={other} />}
      <ul className="divide-y divide-line" aria-label="קטגוריות">
        {picture.spendingLines.map((line) => (
          <CategoryRow key={line.id} line={line} share={line.monthly / top} />
        ))}
      </ul>
    </Card>
  );
}

const NOTES: Partial<Record<CategoryId, string>> = {
  CASH: 'מזומן — לא ידוע על מה הוצא.',
  TRANSFERS_OUT: 'העברות — לא ידוע למה. כדאי לבדוק מה חוזר כל חודש.',
  CARD_UNDETAILED: 'חיובי כרטיס בלי פירוט.',
  FEES: 'עמלות וריבית — כסף שלא קונה כלום.',
};

function CategoryRow({ line, share }: { line: CategoryLine; share: number }) {
  const explanations = useMoneyCategories((state) => state.explanations);
  const canMove = line.id !== 'CARD_UNDETAILED';
  return (
    <li>
      <details className="group py-2.5">
        <summary className="flex cursor-pointer list-none flex-col gap-1.5">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-ink">
              <span aria-hidden className="me-1 inline-block text-ink-soft transition group-open:rotate-90">
                ‹
              </span>
              {line.label}
            </span>
            <span className="tabular text-sm font-semibold text-ink">{formatCurrency(line.monthly)}</span>
          </span>
          <span className="block h-1.5 rounded-full bg-surface-sunken" aria-hidden>
            <span
              className={`block h-1.5 rounded-full ${line.rising || NOTES[line.id] ? 'bg-amber-500' : 'bg-brand-500'}`}
              style={{ width: `${Math.max(2, share * 100)}%` }}
            />
          </span>
          {line.rising && (
            <span className="text-xs text-caution">בחודש האחרון {formatCurrency(line.lastMonth)} — מעל הממוצע</span>
          )}
        </summary>
        <div className="mt-2 space-y-1 ps-4">
          {NOTES[line.id] && <p className="text-xs text-ink-soft">{NOTES[line.id]}</p>}
          <ul className="space-y-1.5">
            {line.payees.slice(0, 12).map((payee) => {
              const explanation = explanations[payee.description];
              return (
                <li key={payee.description} className="text-xs">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1 truncate text-ink-muted" dir="auto">
                      {payee.description}
                    </span>
                    {explanation?.flexibility && <span className="badge-neutral">{FLEXIBILITY_LABELS[explanation.flexibility]}</span>}
                    <span className="tabular text-ink">{formatCurrency(payee.monthly)}</span>
                  </div>
                  {explanation?.note && <p className="text-ink-soft">{explanation.note}</p>}
                  {canMove && (
                    <details className="mt-0.5">
                      <summary className="cursor-pointer font-medium text-brand-700">הסבר</summary>
                      <PayeeExplainer payee={payee} category={line.id} />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
          {line.payees.length > 12 && <p className="text-xs text-ink-soft">ועוד {line.payees.length - 12} בתי עסק</p>}
        </div>
      </details>
    </li>
  );
}

/**
 * What the household knows and the statement does not: what a charge really is, where it belongs,
 * and whether it can go. Every change applies at once to the picture, the savings and the advisor.
 */
function PayeeExplainer({ payee, category }: { payee: Payee; category: CategoryId }) {
  const explanation = useMoneyCategories((state) => state.explanations[payee.description]);
  const explain = useMoneyCategories((state) => state.explain);
  const name = payee.description;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        className="input min-w-0 flex-1 basis-48 py-1 text-xs"
        maxLength={MAX_NOTE_LENGTH}
        placeholder="מה זה? למשל: החזר הלוואה מהפנסיה"
        aria-label={`מה זה ${name}`}
        value={explanation?.note ?? ''}
        onChange={(event) => explain(name, { note: event.target.value })}
      />
      <select
        className="input w-auto py-1 text-xs"
        aria-label={`קטגוריה של ${name}`}
        value={category}
        onChange={(event) => explain(name, { category: event.target.value as CategoryId })}
      >
        {SPENDING_CHOICES.map((id) => (
          <option key={id} value={id}>
            {CATEGORY_LABELS[id]}
          </option>
        ))}
      </select>
      <div className="flex gap-1" role="group" aria-label={`אפשר לוותר על ${name}?`}>
        {(Object.keys(FLEXIBILITY_LABELS) as Flexibility[]).map((flexibility) => {
          const pressed = explanation?.flexibility === flexibility;
          return (
            <button
              key={flexibility}
              type="button"
              aria-pressed={pressed}
              onClick={() => explain(name, { flexibility: pressed ? undefined : flexibility })}
              className={`rounded-lg border px-2 py-1 text-xs ${
                pressed ? 'border-brand-600 bg-brand-600 text-on-brand' : 'border-line bg-surface text-ink-muted hover:border-brand-500'
              }`}
            >
              {FLEXIBILITY_LABELS[flexibility]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Categories whose charges speak for themselves, or cannot be explained one by one. */
const SELF_EXPLAINED: ReadonlySet<CategoryId> = new Set(['HOUSING_LOANS', 'GROCERIES', 'CASH', 'FEES', 'CARD_UNDETAILED']);

/**
 * "What is this?" for the largest charges — the ones that move the picture most: a pension loan
 * the statement names after the insurer, a standing order nobody remembers.
 */
export function ExplainCard({ picture }: { picture: MonthlyPicture }) {
  const explanations = useMoneyCategories((state) => state.explanations);
  const [more, setMore] = useState(false);
  const candidates = picture.spendingLines
    .filter((line) => !SELF_EXPLAINED.has(line.id))
    .flatMap((line) => line.payees.map((payee) => ({ payee, category: line.id, label: line.label })))
    .filter((entry) => entry.payee.monthly >= 50)
    .sort((a, b) => b.payee.monthly - a.payee.monthly)
    .slice(0, 16);
  if (candidates.length === 0) {
    return null;
  }
  const explained = candidates.filter((entry) => isExplained(explanations[entry.payee.description])).length;
  const shown = candidates.slice(0, more ? 16 : 6);
  return (
    <Card
      title="מה זה? ההוצאות הגדולות"
      subtitle="ספרו מה כל הוצאה ואם אפשר לוותר עליה — החיסכון והיועץ יתאימו את עצמם."
      action={<span className="badge-neutral shrink-0">הוסברו {explained} מתוך {candidates.length}</span>}
      fold={`הוסברו ${explained} מתוך ${candidates.length} · הקישו להסביר`}
    >
      <ul className="divide-y divide-line" aria-label="הוצאות להסבר">
        {shown.map(({ payee, category, label }) => (
          <li key={payee.description} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium text-ink" dir="auto">
                {payee.description}
              </span>
              <span className="tabular text-sm font-semibold text-ink">{formatCurrency(payee.monthly)} בחודש</span>
            </div>
            <p className="text-xs text-ink-soft">
              זוהה כ: {label}
              {payee.standing ? ' · הוראת קבע' : ''}
            </p>
            <PayeeExplainer payee={payee} category={category} />
          </li>
        ))}
      </ul>
      {candidates.length > 6 && (
        <button type="button" className="btn-ghost mt-2 text-sm" onClick={() => setMore(!more)}>
          {more ? 'פחות' : `עוד ${candidates.length - 6}`}
        </button>
      )}
    </Card>
  );
}

/** Sorts the "other" businesses with AI; only their names are sent. */
function AiSort({ line }: { line: CategoryLine }) {
  const enabled = useAiEnabled();
  const merge = useMoneyCategories((state) => state.merge);
  const payees = line.payees.slice(0, MAX_PAYEES).map((payee) => payee.description);
  const sorter = useMutation({
    mutationFn: async (names: readonly string[]) => {
      const categories = await categorizePayees(names);
      merge(categories);
      return Object.keys(categories).length;
    },
  });
  if (!enabled || payees.length === 0) {
    return null;
  }
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-500/30 bg-brand-50/40 p-3">
      <p className="text-sm text-ink-muted">
        {sorter.isSuccess
          ? `${sorter.data} בתי עסק מוינו. אפשר לתקן כל אחד ידנית.`
          : `${formatCurrency(line.monthly)} בחודש ב"אחר". AI יכול למיין לפי שמות בתי העסק בלבד — בלי סכומים ותאריכים.`}
      </p>
      {!sorter.isSuccess && (
        <button type="button" className="btn-primary" disabled={sorter.isPending} onClick={() => sorter.mutate(payees)}>
          {sorter.isPending ? 'ממיין…' : 'מיינו עם AI'}
        </button>
      )}
      {sorter.isError && (
        <p className="w-full text-sm text-negative" role="alert">
          {sorter.error instanceof Error ? sorter.error.message : 'המיון לא הצליח.'}
        </p>
      )}
    </div>
  );
}

