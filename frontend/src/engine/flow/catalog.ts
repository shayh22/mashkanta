import type { Answers, Catalog, Choice, Goal } from './flow';

/**
 * The questions, in the order they are asked. Each screen asks one thing in a few words; anything
 * longer lives in the glossary entry its "?" opens. A section shared by several goals — the
 * mortgage, the other loans — is asked once whichever of them were chosen.
 */

const yesNo: readonly Choice[] = [
  { id: 'YES', label: 'כן' },
  { id: 'NO', label: 'לא' },
];

const has = (goals: ReadonlySet<Goal>, goal: Goal) => goals.has(goal);
/** A household refinancing has a mortgage; one only sorting its finances is asked. */
const hasMortgage = (answers: Answers, goals: ReadonlySet<Goal>) => has(goals, 'REFINANCE') || answers.hasMortgage === 'YES';

export const CATALOG: Catalog = {
  sections: [
    { id: 'mortgage', label: 'המשכנתא שלכם', goals: ['REFINANCE', 'RECOVERY'] },
    { id: 'home', label: 'הדירה', goals: ['BUY'] },
    { id: 'household', label: 'ההכנסה', goals: ['BUY', 'REFINANCE'] },
    { id: 'statements', label: 'החשבון', goals: ['BUY', 'REFINANCE', 'RECOVERY'] },
    { id: 'loans', label: 'הלוואות', goals: ['REFINANCE', 'RECOVERY'] },
  ],
  steps: [
    // The mortgage
    {
      id: 'hasMortgage',
      section: 'mortgage',
      title: 'יש לכם משכנתא?',
      fields: [{ id: 'hasMortgage', label: 'יש לכם משכנתא?', kind: 'choice', options: yesNo }],
      when: (_answers, goals) => !has(goals, 'REFINANCE'),
    },
    {
      id: 'mortgageHow',
      section: 'mortgage',
      title: 'כמה נשאר לשלם על המשכנתא?',
      help: 'balance',
      fields: [
        {
          id: 'mortgageHow',
          label: 'איך תרצו לענות',
          kind: 'choice',
          options: [
            { id: 'UPLOAD', label: 'יש לי דוח מהבנק — אעלה אותו' },
            { id: 'MANUAL', label: 'אמלא בעצמי, בערך' },
          ],
        },
        { id: 'mortgageBalance', label: 'יתרה לסילוק, בערך', kind: 'money', unit: '₪', min: 10_000, max: 10_000_000, when: (a) => a.mortgageHow === 'MANUAL' },
        { id: 'mortgagePayment', label: 'החזר חודשי היום', kind: 'money', unit: '₪', min: 100, max: 100_000, when: (a) => a.mortgageHow === 'MANUAL' },
        {
          id: 'mortgageYears',
          label: 'כמה שנים נשארו?',
          kind: 'choice',
          options: [
            { id: 'UNDER_10', label: 'עד 10' },
            { id: 'TEN_20', label: '10–20' },
            { id: 'TWENTY_30', label: '20–30' },
            { id: 'UNKNOWN', label: 'לא יודע' },
          ],
          when: (a) => a.mortgageHow === 'MANUAL',
        },
      ],
      when: hasMortgage,
    },
    {
      id: 'mortgageUpload',
      section: 'mortgage',
      title: 'העלו את דוח היתרות מהבנק',
      help: 'balanceReport',
      fields: [{ id: 'mortgageReport', label: 'דוח יתרות', kind: 'upload', upload: 'mortgage' }],
      when: (answers, goals) => hasMortgage(answers, goals) && answers.mortgageHow === 'UPLOAD',
    },
    {
      id: 'homeValue',
      section: 'mortgage',
      title: 'כמה שווה הדירה היום, בערך?',
      help: 'ltv',
      fields: [{ id: 'homeValue', label: 'שווי הדירה', kind: 'money', unit: '₪', min: 100_000, max: 30_000_000 }],
      when: (_answers, goals) => has(goals, 'REFINANCE'),
    },
    {
      id: 'refinanceGoal',
      section: 'mortgage',
      title: 'מה הכי חשוב לכם במיחזור?',
      help: 'refinance',
      fields: [
        {
          id: 'refinanceGoal',
          label: 'מה הכי חשוב לכם במיחזור?',
          kind: 'choice',
          options: [
            { id: 'LOWER_PAYMENT', label: 'להוריד את ההחזר החודשי' },
            { id: 'SHORTEN', label: 'לגמור מוקדם יותר' },
            { id: 'LESS_INTEREST', label: 'לשלם פחות ריבית בסך הכל' },
            { id: 'CHECK', label: 'רק לבדוק אם כדאי' },
          ],
        },
      ],
      when: (_answers, goals) => has(goals, 'REFINANCE'),
    },

    // Buying
    {
      id: 'price',
      section: 'home',
      title: 'כמה עולה הדירה?',
      help: 'ltv',
      fields: [{ id: 'propertyValue', label: 'מחיר הדירה', kind: 'money', unit: '₪', min: 100_000, max: 30_000_000 }],
    },
    {
      id: 'buyer',
      section: 'home',
      title: 'איזו דירה זו בשבילכם?',
      help: 'ltv',
      fields: [
        {
          id: 'segment',
          label: 'איזו דירה זו בשבילכם?',
          kind: 'choice',
          options: [
            { id: 'FIRST_HOME', label: 'דירה ראשונה' },
            { id: 'UPGRADER', label: 'מחליפים דירה' },
            { id: 'INVESTOR', label: 'דירה נוספת, להשקעה' },
          ],
        },
      ],
    },
    {
      id: 'equity',
      section: 'home',
      title: 'כמה הון עצמי יש לכם?',
      help: 'equity',
      fields: [{ id: 'equity', label: 'הון עצמי', kind: 'money', unit: '₪', min: 0, max: 30_000_000 }],
    },
    {
      id: 'eligibility',
      section: 'home',
      title: 'יש לכם זכאות ממשרד השיכון?',
      help: 'eligibility',
      fields: [
        {
          id: 'hasEligibility',
          label: 'יש לכם זכאות ממשרד השיכון?',
          kind: 'choice',
          options: [...yesNo, { id: 'UNKNOWN', label: 'לא יודע' }],
        },
        { id: 'eligibilityAmount', label: 'סכום הזכאות', kind: 'money', unit: '₪', min: 1_000, max: 2_000_000, when: (a) => a.hasEligibility === 'YES' },
      ],
    },

    // The household's income: for a buyer's affordability, and for a refinance's new mix
    {
      id: 'income',
      section: 'household',
      title: 'כמה נכנס לכם בחודש, נטו?',
      help: 'netIncome',
      fields: [{ id: 'netIncome', label: 'הכנסה נטו בחודש', kind: 'money', unit: '₪', min: 1_000, max: 500_000 }],
    },
    {
      id: 'obligations',
      section: 'household',
      title: 'יש החזרים חודשיים אחרים?',
      help: 'obligations',
      fields: [
        { id: 'hasObligations', label: 'יש החזרים חודשיים אחרים?', kind: 'choice', options: yesNo },
        { id: 'obligations', label: 'כמה בחודש, בסך הכל', kind: 'money', unit: '₪', min: 1, max: 200_000, when: (a) => a.hasObligations === 'YES' },
      ],
      // A homeowner is asked about their other loans in their own section.
      when: (_answers, goals) => has(goals, 'BUY'),
    },
    {
      id: 'stability',
      section: 'household',
      title: 'מה חשוב לכם יותר?',
      help: 'mix',
      fields: [
        {
          id: 'stability',
          label: 'מה חשוב לכם יותר?',
          kind: 'choice',
          options: [
            { id: 'STABLE', label: 'החזר יציב, גם אם יקר יותר' },
            { id: 'BALANCED', label: 'איזון בין השניים' },
            { id: 'CHEAP', label: 'הכי זול, גם אם ההחזר ישתנה' },
          ],
        },
      ],
    },

    // The account: the heart of a recovery plan; for the other goals, the full picture if wanted.
    {
      id: 'statementsOffer',
      section: 'statements',
      title: 'להוסיף גם את החשבון?',
      help: 'statements',
      fields: [
        {
          id: 'statementsOffer',
          label: 'להוסיף גם את החשבון?',
          kind: 'choice',
          options: [
            { id: 'YES', label: 'כן, לראות לאן הולך הכסף' },
            { id: 'NO', label: 'לא עכשיו' },
          ],
        },
      ],
      when: (_answers, goals) => !has(goals, 'RECOVERY'),
    },
    {
      id: 'statementsUpload',
      section: 'statements',
      title: 'העלו את דפי העו״ש והאשראי',
      help: 'statements',
      fields: [{ id: 'statementsFiles', label: 'דפי חשבון', kind: 'upload', upload: 'statements' }],
      when: (answers, goals) => has(goals, 'RECOVERY') || answers.statementsOffer === 'YES',
    },
    {
      id: 'worry',
      section: 'statements',
      title: 'מה הכי מטריד אתכם?',
      help: 'overdraft',
      fields: [
        {
          id: 'worries',
          label: 'מה הכי מטריד אתכם? אפשר כמה',
          kind: 'multi',
          options: [
            { id: 'OVERDRAFT', label: 'המינוס בחשבון' },
            { id: 'LOANS', label: 'ההחזרים על הלוואות' },
            { id: 'SPENDING', label: 'לא ברור לאן הכסף הולך' },
            { id: 'SAVING', label: 'לא מצליחים לחסוך' },
          ],
        },
      ],
      when: (_answers, goals) => has(goals, 'RECOVERY'),
    },

    // Other loans, asked once for a refinance and a recovery plan alike
    {
      id: 'hasLoans',
      section: 'loans',
      title: 'יש לכם הלוואות נוספות?',
      help: 'consolidation',
      fields: [{ id: 'hasLoans', label: 'יש לכם הלוואות נוספות?', kind: 'choice', options: [...yesNo, { id: 'UNKNOWN', label: 'לא בטוח' }] }],
    },
    {
      id: 'loansUpload',
      section: 'loans',
      title: 'העלו לוח סילוקין או דוח הלוואות',
      help: 'schedule',
      fields: [{ id: 'loansReport', label: 'דוח הלוואות', kind: 'upload', upload: 'loans' }],
      when: (answers) => answers.hasLoans === 'YES',
    },
  ],
};

/** The goals as the opening screen offers them. */
export const GOAL_CHOICES: readonly { readonly id: Goal; readonly title: string; readonly sub: string }[] = [
  { id: 'REFINANCE', title: 'למחזר את המשכנתא', sub: 'להוריד החזר או ריבית' },
  { id: 'BUY', title: 'לקנות דירה', sub: 'כמה אפשר, ובאיזה תמהיל' },
  { id: 'RECOVERY', title: 'לצאת מהמינוס', sub: 'תוכנית הבראה לחשבון' },
];
