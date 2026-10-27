import type { TrackType } from './types';

/**
 * The glossary: every term a borrower may not know, in one or two plain sentences. Screens keep
 * their own copy short and point here instead — a term is underlined where it appears, hovering
 * shows its entry in place, and the full list opens from the header.
 */

export interface GlossaryEntry {
  readonly term: string;
  /** One sentence, shown in the tooltip. */
  readonly short: string;
  /** Optional second paragraph, shown only in the glossary. */
  readonly more?: string;
  readonly group: 'tracks' | 'rules' | 'costs' | 'refinance' | 'consolidation' | 'general';
}

export const GLOSSARY_GROUPS: Record<GlossaryEntry['group'], string> = {
  tracks: 'מסלולים',
  rules: 'כללי בנק ישראל',
  costs: 'עלויות וריביות',
  refinance: 'מיחזור',
  consolidation: 'איחוד הלוואות',
  general: 'כללי',
};

export const GLOSSARY = {
  mix: {
    term: 'תמהיל',
    short: 'החלוקה של המשכנתא לכמה מסלולים, כל אחד עם ריבית ותנאים משלו.',
    more: 'תמהיל טוב מאזן בין עלות נמוכה לבין החזר חודשי שלא יקפוץ יותר ממה שתוכלו לשאת.',
    group: 'general',
  },
  prime: {
    term: 'פריים',
    short: 'מסלול שהריבית בו זזה עם ריבית בנק ישראל (ריבית בנק ישראל + 1.5%), ויכולה להשתנות כל חודש.',
    more: 'בדרך כלל הזול ביותר בהתחלה, אבל ההחזר עולה מיד כשבנק ישראל מעלה ריבית. מותר עד ⅔ מההלוואה.',
    group: 'tracks',
  },
  fixedUnlinked: {
    term: 'קבועה לא צמודה (קל"צ)',
    short: 'ריבית קבועה לכל התקופה, בלי הצמדה למדד — ההחזר החודשי ידוע מראש עד הסוף.',
    more: 'הוודאות הכי גבוהה, ולכן בדרך כלל הריבית גבוהה יותר. פירעון מוקדם עלול לעלות בעמלת היוון.',
    group: 'tracks',
  },
  fixedLinked: {
    term: 'קבועה צמודה (ק"צ)',
    short: 'ריבית קבועה, אבל הקרן צמודה למדד — כשיש אינפלציה, היתרה וההחזר גדלים.',
    group: 'tracks',
  },
  variableUnlinked: {
    term: 'משתנה לא צמודה',
    short: 'ריבית שמתעדכנת כל 5 שנים לפי אג"ח ממשלתיות, בלי הצמדה למדד.',
    group: 'tracks',
  },
  variableLinked: {
    term: 'משתנה צמודה',
    short: 'ריבית שמתעדכנת כל 5 שנים, והקרן צמודה למדד.',
    group: 'tracks',
  },
  eligibility: {
    term: 'הלוואת זכאות',
    short: 'הלוואה בריבית מפוקחת ממשרד הבינוי והשיכון למי שזכאי לה. כדאי כמעט תמיד לקחת ולשמור עליה.',
    group: 'tracks',
  },
  indexation: {
    term: 'הצמדה למדד',
    short: 'הקרן גדלה יחד עם מדד המחירים לצרכן. אינפלציה של 3% מגדילה את היתרה ב-3% באותה שנה.',
    group: 'costs',
  },
  ltv: {
    term: 'שיעור מימון (LTV)',
    short: 'כמה אחוז משווי הדירה ממומן במשכנתא. בנק ישראל מגביל אותו: 75% לדירה ראשונה, 70% למשפרים, 50% למשקיעים.',
    group: 'rules',
  },
  pti: {
    term: 'יחס החזר מהכנסה',
    short: 'כמה אחוז מההכנסה נטו הולך להחזרים החודשיים. מעל 40% בנק לא יאשר; מעל 30% זה כבר יקר יותר.',
    group: 'rules',
  },
  directive329: {
    term: 'הוראה 329',
    short: 'כללי בנק ישראל למשכנתאות: לפחות ⅓ בריבית קבועה, עד ⅔ בריבית משתנה, ועד 30 שנה.',
    group: 'rules',
  },
  baskets: {
    term: 'סלים אחידים',
    short: 'שלושה תמהילים קבועים שכל בנק חייב להציע, כדי שאפשר יהיה להשוות בין בנקים באותם תנאים.',
    group: 'rules',
  },
  stress: {
    term: 'תרחיש קיצון',
    short: 'מה יקרה להחזר החודשי אם הריבית או האינפלציה יעלו בחדות — כדי לבדוק שתוכלו לעמוד בזה.',
    group: 'general',
  },
  absorption: {
    term: 'יכולת ספיגה',
    short: 'בכמה שקלים בחודש ההחזר יכול לעלות בלי לפגוע במשק הבית.',
    group: 'general',
  },
  totalCost: {
    term: 'עלות כוללת',
    short: 'כל מה שתשלמו לבנק עד סוף ההלוואה: הקרן, הריבית וההצמדה.',
    group: 'costs',
  },
  irr: {
    term: 'ריבית כוללת מתואמת',
    short: 'ריבית אחת שמסכמת את כל התמהיל, כולל ההצמדה — טובה להשוואה בין הצעות.',
    group: 'costs',
  },
  realRate: {
    term: 'ריבית ריאלית',
    short: 'הריבית אחרי שמנכים את האינפלציה — כמה ההלוואה עולה באמת.',
    group: 'costs',
  },
  margin: {
    term: 'מרווח',
    short: 'התוספת שהבנק גובה מעל ריבית הבסיס. עליו מתמקחים.',
    group: 'costs',
  },
  negotiation: {
    term: 'רמת המיקוח',
    short: 'עד כמה ההצעה שלכם טובה ביחס לממוצע בשוק. מיקוח טוב = ריבית ברבע התחתון.',
    group: 'costs',
  },
  spitzer: {
    term: 'לוח שפיצר',
    short: 'החזר חודשי שווה לאורך כל התקופה; בהתחלה רובו ריבית ובסוף רובו קרן.',
    group: 'costs',
  },
  approval: {
    term: 'אישור עקרוני',
    short: 'מסמך מהבנק עם התנאים שהוא מוכן לתת לכם. בדרך כלל תקף לזמן קצר ואינו מחייב.',
    group: 'general',
  },
  schedule: {
    term: 'לוח סילוקין',
    short: 'טבלה מהבנק עם כל תשלום עתידי: תאריך, קרן, ריבית ויתרה.',
    group: 'general',
  },
  refinance: {
    term: 'מיחזור',
    short: 'החלפת המשכנתא הקיימת במשכנתא חדשה בתנאים טובים יותר — באותו בנק או בבנק אחר.',
    group: 'refinance',
  },
  prepaymentFee: {
    term: 'עמלת פירעון מוקדם',
    short: 'עמלה על החזרת הלוואה בריבית קבועה לפני הזמן, כשהריבית בשוק ירדה מאז שלקחתם. בפריים אין.',
    more: 'כוללת את עמלת ההיוון, עמלת אי-הודעה (0.1% בלי הודעה מראש) ועמלת מדד ממוצע במסלולים צמודים.',
    group: 'refinance',
  },
  seniority: {
    term: 'הנחת ותק',
    short: 'הנחה על עמלת הפירעון המוקדם ככל שעברו יותר שנים מלקיחת ההלוואה.',
    group: 'refinance',
  },
  breakeven: {
    term: 'נקודת איזון',
    short: 'החודש שבו החיסכון בהחזרים כבר כיסה את כל עלויות המעבר.',
    group: 'refinance',
  },
  npv: {
    term: 'ערך נוכחי נקי',
    short: 'כמה המיחזור שווה לכם היום, אחרי העלויות ובהתחשב בכך שחיסכון עתידי שווה פחות מכסף היום.',
    group: 'refinance',
  },
  switchingCosts: {
    term: 'עלויות מעבר',
    short: 'מה שמשלמים כדי לעבור בנק: פתיחת תיק, שמאות, רישום בטחונות וייעוץ.',
    group: 'refinance',
  },
  consolidation: {
    term: 'איחוד הלוואות',
    short: 'סגירת הלוואות יקרות (רכב, כרטיס אשראי) בעזרת הלוואה זולה יותר על הדירה.',
    group: 'consolidation',
  },
  allPurpose: {
    term: 'הלוואה לכל מטרה',
    short: 'הלוואה בשעבוד הדירה שאפשר להשתמש בה לכל דבר, כולל סגירת חובות. מוגבלת ל-50% משווי הדירה.',
    group: 'consolidation',
  },
  relief: {
    term: 'חמצן תזרימי',
    short: 'כמה כסף מתפנה לכם כל חודש אחרי האיחוד.',
    group: 'consolidation',
  },
} as const satisfies Record<string, GlossaryEntry>;

export type TermId = keyof typeof GLOSSARY;

export const TERM_IDS = Object.keys(GLOSSARY) as TermId[];

/** The glossary entry behind each track's name. */
export const TRACK_TERMS: Record<TrackType, TermId> = {
  PRIME: 'prime',
  FIXED_UNLINKED: 'fixedUnlinked',
  FIXED_LINKED: 'fixedLinked',
  VARIABLE_UNLINKED: 'variableUnlinked',
  VARIABLE_LINKED: 'variableLinked',
  ELIGIBILITY: 'eligibility',
};
