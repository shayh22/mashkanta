import { payeeOf, type MonthlyPicture } from '../../engine/money/picture';
import { formatCurrency } from '../../lib/format';

/** The facts to read before the figures: money that is not income, cards without detail. */
export function Findings({ picture }: { picture: MonthlyPicture }) {
  const { oneOff, undetailedCards } = picture;
  const items: { key: string; tone: 'caution' | 'neutral'; text: string }[] = [];
  if (oneOff.length > 0) {
    const total = oneOff.reduce((sum, transaction) => sum + transaction.amount, 0);
    items.push({
      key: 'one-off',
      tone: 'neutral',
      text: `נכנסו גם ${formatCurrency(total)} חד-פעמיים (${oneOff.map((t) => payeeOf(t.description)).join(', ')}). לא נספרו כהכנסה — אבל הם מה שכיסה חלק מהפער.`,
    });
  }
  if (undetailedCards.length > 0) {
    items.push({
      key: 'cards',
      tone: 'neutral',
      text: `${undetailedCards.map((card) => (card === 'אשראי' ? 'כרטיס אשראי' : `כרטיס ${card}`)).join(', ')} משולם מהעו״ש בלי פירוט. העלו את הפירוט שלו כדי לראות על מה.`,
    });
  }
  if (items.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-2" aria-label="ממצאים">
      {items.map((item) => (
        <li
          key={item.key}
          className={`rounded-xl p-3 text-sm ${item.tone === 'caution' ? 'bg-amber-500/10 text-caution' : 'bg-surface-muted text-ink-muted'}`}
        >
          {item.text}
        </li>
      ))}
    </ul>
  );
}

