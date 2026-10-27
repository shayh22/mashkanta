import type { CategoryId } from './categories';
import type { CategoryLine, MonthlyPicture, Payee } from './picture';

/**
 * Where the household can save, read off its monthly picture. Each idea is a fact from the
 * statements and something to do about it; a shekel figure is given only where the statements
 * support one — the interest and fees already paid, a category back at its own average — and
 * otherwise the idea says what to check, without a guess.
 */

export type SavingKind = 'OVERDRAFT' | 'FEES' | 'RISING' | 'RECURRING' | 'INSURANCE' | 'CASH' | 'MORTGAGE';

export interface SavingIdea {
  readonly kind: SavingKind;
  readonly title: string;
  readonly detail: string;
  /** What it saves a month, where the statements show it; undefined when it needs checking first. */
  readonly monthly?: number;
  /** The businesses it is about, dearest first. */
  readonly items?: readonly Payee[];
  readonly action?: { readonly label: string; readonly href: string };
}

/** Charges a household can cancel, switch or renegotiate; the weekly shop and transfers are not among them. */
const RECURRING_CATEGORIES: ReadonlySet<CategoryId> = new Set([
  'SUBSCRIPTIONS',
  'TELECOM',
  'INSURANCE',
  'HEALTH',
  'EDUCATION',
  'DONATIONS',
  'TRANSPORT',
  'SHOPPING',
  'OTHER',
]);

const FEE = /עמלה|עמלת|דמי כרטיס|דמי ניהול|דמי חבר/;

/**
 * A subscription or standing order: marked so on the card statement, or charged once a month in
 * every month counted. A shop visited every week is neither.
 */
export function recurringPayees(picture: MonthlyPicture): Payee[] {
  const months = picture.months.length;
  if (months < 2 || picture.partial) {
    return [];
  }
  return picture.spendingLines
    .filter((line) => RECURRING_CATEGORIES.has(line.id))
    .flatMap((line) => line.payees)
    .filter((payee) => payee.months === months && payee.monthly >= 5 && (payee.standing || payee.count <= months + 1))
    .sort((a, b) => b.monthly - a.monthly);
}

const lineOf = (picture: MonthlyPicture, id: CategoryId): CategoryLine | undefined =>
  picture.spendingLines.find((line) => line.id === id);

export function savingIdeas(picture: MonthlyPicture): SavingIdea[] {
  const ideas: SavingIdea[] = [];
  const { overdraft } = picture;

  if (overdraft && overdraft.monthsBelow > 0) {
    ideas.push({
      kind: 'OVERDRAFT',
      title: 'לצאת מהמינוס',
      detail:
        `${overdraft.monthsBelow} מתוך ${overdraft.months} החודשים במינוס, עד מינוס ${Math.round(-overdraft.lowest).toLocaleString('he-IL')} ₪ ` +
        `(${overdraft.lowestDate.slice(8, 10)}.${overdraft.lowestDate.slice(5, 7)}). ` +
        'הלוואה בריבית נמוכה או סגירה מחיסכון עולים פחות מריבית המינוס, ומשחררים את המסגרת.',
      ...(overdraft.interestMonthly >= 1 ? { monthly: overdraft.interestMonthly } : {}),
      action: { label: 'לבדוק איחוד הלוואות', href: '#/own' },
    });
  }

  const fees = lineOf(picture, 'FEES')?.payees.filter((payee) => FEE.test(payee.description) && payee.monthly > 0) ?? [];
  const feesMonthly = fees.reduce((sum, payee) => sum + payee.monthly, 0);
  if (feesMonthly >= 5) {
    ideas.push({
      kind: 'FEES',
      title: 'עמלות ודמי כרטיס',
      detail: 'מסלול עמלות בסיסי בבנק, או בקשה לוויתור על דמי הכרטיס, מבטלים את רובן.',
      monthly: feesMonthly,
      items: fees,
    });
  }

  for (const line of picture.spendingLines) {
    if (line.rising && line.id !== 'CARD_UNDETAILED' && line.id !== 'HOUSING_LOANS' && line.id !== 'CASH') {
      ideas.push({
        kind: 'RISING',
        title: `${line.label}: בחודש האחרון מעל הרגיל`,
        detail: `${Math.round(line.lastMonth).toLocaleString('he-IL')} ₪ לעומת ${Math.round(line.monthly).toLocaleString('he-IL')} ₪ בממוצע. חזרה לממוצע חוסכת את ההפרש.`,
        monthly: line.lastMonth - line.monthly,
        items: line.payees.slice(0, 5),
      });
    }
  }

  const recurring = recurringPayees(picture);
  if (recurring.length > 0) {
    const total = recurring.reduce((sum, payee) => sum + payee.monthly, 0);
    ideas.push({
      kind: 'RECURRING',
      title: `${recurring.length} חיובים חוזרים כל חודש`,
      detail: `${Math.round(total).toLocaleString('he-IL')} ₪ בחודש בהוראות קבע ומנויים. עברו על הרשימה: מה לא בשימוש — לבטל, ומה יקר — לבקש הנחה או לעבור ספק.`,
      items: recurring,
    });
  }

  const insurance = lineOf(picture, 'INSURANCE');
  if (insurance && insurance.payees.length >= 2) {
    ideas.push({
      kind: 'INSURANCE',
      title: `${insurance.payees.length} ביטוחים שונים`,
      detail: `${Math.round(insurance.monthly).toLocaleString('he-IL')} ₪ בחודש. ב"הר הביטוח" של משרד האוצר רואים את כל הפוליסות ומגלים כפל ביטוח; ביטוחי משכנתא ורכב כדאי להשוות כל שנה.`,
      items: insurance.payees,
      action: { label: 'הר הביטוח', href: 'https://harb.cma.gov.il/' },
    });
  }

  const cash = lineOf(picture, 'CASH');
  if (cash && picture.spending > 0 && cash.monthly / picture.spending >= 0.04) {
    ideas.push({
      kind: 'CASH',
      title: 'מזומן שלא ידוע לאן הלך',
      detail:
        `${Math.round(cash.monthly).toLocaleString('he-IL')} ₪ בחודש במשיכות` +
        (cash.rising ? `, ובחודש האחרון ${Math.round(cash.lastMonth).toLocaleString('he-IL')} ₪` : '') +
        '. תשלום בכרטיס מראה על מה הולך הכסף — ואז אפשר לתכנן אותו.',
      items: cash.payees.slice(0, 5),
    });
  }

  const mortgage = lineOf(picture, 'HOUSING_LOANS');
  if (mortgage && mortgage.monthly >= 1_000) {
    ideas.push({
      kind: 'MORTGAGE',
      title: 'המשכנתא — ההוצאה הגדולה',
      detail: `${Math.round(mortgage.monthly).toLocaleString('he-IL')} ₪ בחודש. מיחזור של מסלול אחד יקר, בלי לגעת בזולים, יכול להוריד את ההחזר.`,
      action: { label: 'לבדוק את המשכנתא', href: '#/own' },
    });
  }

  return ideas;
}

/** What the ideas with a figure save together, a month. */
export const knownSaving = (ideas: readonly SavingIdea[]) => ideas.reduce((sum, idea) => sum + (idea.monthly ?? 0), 0);
