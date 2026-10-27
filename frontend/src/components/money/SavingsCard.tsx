import { knownSaving, savingIdeas, type SavingIdea } from '../../engine/money/savings';
import type { MonthlyPicture } from '../../engine/money/picture';
import { formatCurrency } from '../../lib/format';
import { useMoneyCategories } from '../../store/moneyStore';
import { Card } from '../ui';

/** What to do about it: each idea from the statements, with the saving where they show one. */
export function SavingsCard({ picture }: { picture: MonthlyPicture }) {
  const explanations = useMoneyCategories((state) => state.explanations);
  const ideas = savingIdeas(picture, explanations);
  if (ideas.length === 0) {
    return null;
  }
  const known = knownSaving(ideas);
  return (
    <Card
      title="איפה אפשר לחסוך"
      subtitle={known >= 1 ? `לפחות ${formatCurrency(known)} בחודש שרואים בדפים, ועוד מה שכדאי לבדוק.` : 'מה שכדאי לבדוק, לפי הדפים.'}
    >
      <ul className="space-y-3" aria-label="רעיונות לחיסכון">
        {ideas.map((idea) => (
          <SavingRow key={`${idea.kind}:${idea.title}`} idea={idea} />
        ))}
      </ul>
    </Card>
  );
}

function SavingRow({ idea }: { idea: SavingIdea }) {
  const external = idea.action?.href.startsWith('http');
  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{idea.title}</h3>
        {idea.monthly !== undefined && idea.monthly >= 1 ? (
          <span className="tabular text-sm font-semibold text-positive">{formatCurrency(idea.monthly)} בחודש</span>
        ) : (
          <span className="text-xs text-ink-soft">לבדיקה</span>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-muted">{idea.detail}</p>
      {idea.items && idea.items.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-brand-700">הרשימה ({idea.items.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {idea.items.map((item) => (
              <li key={item.description} className="flex justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-ink-muted" dir="auto">
                  {item.description}
                </span>
                <span className="tabular text-ink">{formatCurrency(item.monthly)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {idea.action && (
        <a
          className="btn-ghost mt-2 inline-flex text-sm"
          href={idea.action.href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {idea.action.label} <span aria-hidden>←</span>
        </a>
      )}
    </li>
  );
}

