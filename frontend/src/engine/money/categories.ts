import type { Transaction } from './statementImport';

/**
 * What a transaction is for, from its description: an ordered list of rules on the words banks and
 * card companies print. The first rule that matches wins, so the narrow ones ("פז גז" is the cooking
 * gas, not fuel) come before the broad ones. Anything no rule knows is "other" — never a guess.
 */

export type CategoryId =
  | 'HOUSING_LOANS'
  | 'LOANS'
  | 'HOME_BILLS'
  | 'TELECOM'
  | 'INSURANCE'
  | 'GROCERIES'
  | 'DINING'
  | 'TRANSPORT'
  | 'HEALTH'
  | 'EDUCATION'
  | 'DONATIONS'
  | 'SUBSCRIPTIONS'
  | 'SHOPPING'
  | 'TRANSFERS_OUT'
  | 'CASH'
  | 'FEES'
  | 'CARD_UNDETAILED'
  | 'OTHER'
  | 'SALARY'
  | 'BENEFITS'
  | 'TRANSFERS_IN'
  | 'REFUNDS'
  | 'ONE_OFF_IN'
  | 'CARD_PAYMENT';

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  HOUSING_LOANS: 'משכנתא',
  LOANS: 'הלוואות',
  HOME_BILLS: 'בית: ארנונה, מים, גז, ועד',
  TELECOM: 'תקשורת וטלוויזיה',
  INSURANCE: 'ביטוחים',
  GROCERIES: 'סופר ומזון',
  DINING: 'מסעדות, קפה ובילוי',
  TRANSPORT: 'תחבורה ורכב',
  HEALTH: 'בריאות ופארם',
  EDUCATION: 'חינוך וחוגים',
  DONATIONS: 'תרומות ומוסדות',
  SUBSCRIPTIONS: 'מנויים ודיגיטל',
  SHOPPING: 'קניות, ביגוד ובית',
  TRANSFERS_OUT: 'העברות: ביט, פייבוקס, בנק',
  CASH: 'משיכות מזומן',
  FEES: 'עמלות וריבית',
  CARD_UNDETAILED: 'כרטיס בלי פירוט',
  OTHER: 'אחר',
  SALARY: 'משכורת',
  BENEFITS: 'קצבאות',
  TRANSFERS_IN: 'העברות נכנסות',
  REFUNDS: 'החזרים',
  ONE_OFF_IN: 'כסף חד-פעמי',
  CARD_PAYMENT: 'חיוב כרטיס',
};

/** Paid every month whatever happens: the floor of the budget. */
export const FIXED_CATEGORIES: ReadonlySet<CategoryId> = new Set([
  'HOUSING_LOANS',
  'LOANS',
  'HOME_BILLS',
  'TELECOM',
  'INSURANCE',
  'SUBSCRIPTIONS',
  'EDUCATION',
]);

type Rule = readonly [CategoryId, RegExp];

// Money out, or anything on a card. The first match wins.
// Hebrew has no \b: (?<![א-ת]) and (?![א-ת]) mark where a word starts and ends.
const SPENDING: readonly Rule[] = [
  ['FEES', /ריבית|עמלה|עמלת|דמי כרטיס|דמי ניהול|דמי חבר|מס\s*במקור|יתרת זכות/],
  ['CASH', /כספומט|משיכת מזומן|משיכה מכספומט|מזומן/],
  ['HOUSING_LOANS', /משכנתא|משכ(?![א-ת])/],
  ['LOANS', /הלוואה|הלוואות|פירעון/],
  ['DONATIONS', /צדקה|תרומ|עמותת|ע"ר|חל"צ/],
  ['TELECOM', /רמי לוי תקשורת|הוט|\bhot\b|סלקום|פרטנר|פלאפון|בזק|גולן טלקום|\byes\b|012|019|אקספון/i],
  ['HOME_BILLS', /פז גז|סופרגז|אמישראגז|(?<![א-ת])גז(?![א-ת])|עיריית|עירית|מועצה|ארנונה|ועד בית|לוועד בית|חשמל|תאגיד|מעיינות|(?<![א-ת])מי\s|(?<![א-ת])מים(?![א-ת])/],
  ['INSURANCE', /ביטוח|מגדל(?![א-ת])|הראל|הפניקס|כלל ביטוח|כלל חברה|כלל חיים|מנורה|איילון|הכשרה|פספורטכארד/],
  ['SUBSCRIPTIONS', /google|apple|netflix|spotify|claude|anthropic|openai|chatgpt|lovable|microsoft|adobe|youtube|disney|icloud|dropbox|zoom|canva|github|cursor|amazon prime/i],
  ['HEALTH', /סופר.?פארם|פארם|בית מרקחת|קופת חולים|קופ"ח|מאוחדת|מכבי|כללית|לאומית|אופטיק|שיניים|מדיקל|רופא|מרפאה|מגן דוד אדום/],
  ['GROCERIES', /רמי לוי|אושר עד|ויקטורי|שופרסל|יוחננוף|יינות ביתן|carrefour|קרפור|מחסני מזון|חצי חינם|טיב טעם|סופר(?![א-ת])|מכולת|מאפי|מאפה|ירקות|פירות|אטליז|קצב|נטו חיסכון|מעדני|(?<![א-ת])שוק(?![א-ת])/i],
  ['DINING', /קפה|cafe|coffee|פיצה|גלידה|גלידות|גלידוש|מסעד|בורגר|שווארמה|פלאפל|סושי|wolt|וולט|תן ביס|10bis|סיבוס|קייטרינג|ארומה|מקדונלד|דומינו|(?<![א-ת])בר(?![א-ת])/i],
  ['TRANSPORT', /רב-פס|רב פס|רב קו|כביש 6|מ\.תחבורה|משרד התחבורה|סונול|דור אלון|(?<![א-ת])דלק(?![א-ת])|\bten\b|(?<![א-ת])פז(?![א-ת])|yellow|חניה|חניון|פנגו|סלופארק|(?<![א-ת])אגד|מטרופולין|אפיקים|gett|מוסך|צמיג|אוטודיפו|רישוי/i],
  ['EDUCATION', /ביה"ס|בית ספר|בית הספר|גן ילדים|צהרון|(?<![א-ת])חוג|מתנס|מתנ"ס|ועד הורים|תלמוד תורה|ת"ת/],
  ['DONATIONS', /חבד|חב"ד|מוסדות|ישיבת|(?<![א-ת])כולל(?![א-ת])|קרן יחד/],
  ['TRANSFERS_OUT', /\bbit\b|(?<![א-ת])ביט(?![א-ת])|paybox|פייבוקס|העברה/i],
  ['SHOPPING', /איקאה|ikea|shein|aliexpress|amazon|ebay|temu|קסטרו|fox|h&m|zara|תכשיט|פנדורה|ספרים|צעצוע|אופנ|הום סנטר|אייס|סטוק|מקס(?![א-ת])|אוטלט|paypal|desertcart|מוצרי חשמל|ביגוד|נעליים/i],
];

// Money in, on a bank statement.
const INCOME: readonly Rule[] = [
  ['FEES', /ריבית|עמלה|עמלת|מס\s*במקור|יתרת זכות/],
  ['ONE_OFF_IN', /השתל|קרן השתלמות|פדיון|הקמת הלוואה|הלוואה|מענק|ירושה/],
  ['SALARY', /משכורת|שכר/],
  ['BENEFITS', /ביטוח לאומי|קצבה|קצבת|דמי אבטלה|דמי לידה/],
  ['REFUNDS', /החזר|זיכוי|ביטול|קופת חולים|קופ"ח/],
  ['TRANSFERS_IN', /העברה|\bbit\b|(?<![א-ת])ביט(?![א-ת])|paybox|פייבוקס|הפקדה/i],
];

/** The bank lines that pay a card: replaced by the card's own detail when it is uploaded. */
const CARD_BILL = /כ\.א\.ל|כאל|ישראכרט|מקס איט|לאומי קארד|אמריקן אקספרס|דיינרס|חיוב לכרטיס|חיוב זמני למפתח/;

/** The card a bank line pays, when the line names it: "חיוב לכרטיס ויזה 1111" → 1111. */
export function cardPaidBy(transaction: Transaction): string | undefined {
  return /לכרטיס\D*(\d{4})/.exec(transaction.description)?.[1];
}

export function isCardBill(transaction: Transaction): boolean {
  return transaction.source === 'BANK' && transaction.amount < 0 && CARD_BILL.test(transaction.description);
}

export function categorize(transaction: Transaction): CategoryId {
  const text = transaction.description;
  if (transaction.kind?.includes('משיכת מזומן')) {
    return 'CASH';
  }
  if (transaction.source === 'BANK' && transaction.amount > 0) {
    return INCOME.find(([, pattern]) => pattern.test(text))?.[0] ?? 'TRANSFERS_IN';
  }
  if (isCardBill(transaction)) {
    return 'CARD_PAYMENT';
  }
  return SPENDING.find(([, pattern]) => pattern.test(text))?.[0] ?? 'OTHER';
}

/** Money in that is not this household's monthly income. */
export const isIncome = (category: CategoryId) =>
  category === 'SALARY' || category === 'BENEFITS' || category === 'TRANSFERS_IN' || category === 'REFUNDS';
