import type { RefinanceVerdict, RouteKind } from '../refinance';
import type { Answers, Goal } from './flow';

/**
 * What to do now: the next steps each result calls for, short and in order, ticked off on the
 * device. Each has a stable id, so a tick stays when the result is worked out again.
 */

export interface Task {
  readonly id: string;
  readonly text: string;
}

export interface TaskInput {
  readonly goals: readonly Goal[];
  readonly answers: Answers;
  readonly buy?: { readonly equityShort: number; readonly cheapestBank?: string; readonly mix?: string };
  readonly refinance?: { readonly exact: boolean; readonly verdict?: RefinanceVerdict; readonly route?: RouteKind };
  /** The cheapest of the offers the household got, for the purchase or the refinance, and how many there are. */
  readonly offers?: readonly { readonly goal: 'BUY' | 'REFINANCE'; readonly best: string; readonly count: number }[];
  /** The cheapest loan offer, how many there are, its rate and the market's average. */
  readonly loanOffer?: { readonly best: string; readonly count: number; readonly rate: number; readonly average: number };
  readonly recovery?: {
    readonly hasStatements: boolean;
    /** The businesses the household marked, by name: these tasks stay on the device. */
    readonly cancel: readonly string[];
    readonly reduce: readonly string[];
    readonly overdraft: boolean;
    readonly fees: boolean;
    /** The loans' moves kept, as the decisions name them. */
    readonly loanMoves?: readonly { readonly key: string; readonly label: string }[];
    /** Refinancing the mortgage kept among the decisions, where refinancing is not the goal itself. */
    readonly mortgage?: boolean;
    /** Folding the loans into the mortgage, kept among the decisions. */
    readonly consolidate?: boolean;
  };
}

const shekels = (value: number) => `${Math.round(value).toLocaleString('he-IL')} ₪`;

export function tasksFor(input: TaskInput): Task[] {
  const { goals, answers } = input;
  const tasks: Task[] = [];
  const add = (id: string, text: string) => tasks.push({ id, text });
  // A step already taken is not asked again: offers in hand stand for asking the banks.
  const hasOffers = (goal: 'BUY' | 'REFINANCE') => (input.offers ?? []).some((offer) => offer.goal === goal && offer.count > 0);

  if (goals.includes('BUY') && input.buy) {
    if (input.buy.equityShort > 0) {
      add('buy-equity', `להשלים ${shekels(input.buy.equityShort)} הון עצמי, או לבחור דירה זולה יותר`);
    }
    if (answers.hasEligibility === 'UNKNOWN') {
      add('buy-eligibility', 'לבדוק זכאות באתר משרד הבינוי והשיכון');
    }
    if (!hasOffers('BUY')) {
      add('buy-approval', 'לבקש אישור עקרוני מ-3 בנקים לפחות');
    }
    if (input.buy.mix) {
      add('buy-mix', `להציג לבנקים את התמהיל: ${input.buy.mix}`);
    }
    // The estimate of the cheapest bank gives way to the offers themselves.
    if (input.buy.cheapestBank && !hasOffers('BUY')) {
      add('buy-cheapest', `להתחיל מ${input.buy.cheapestBank}, הזול לתמהיל הזה`);
    }
  }

  if (goals.includes('REFINANCE') && input.refinance) {
    const { exact, verdict, route } = input.refinance;
    if (!exact) {
      add('refi-report', 'להוריד דוח יתרות מאתר הבנק ולהעלות אותו לבדיקה מדויקת');
    } else if (verdict === 'NOT_WORTHWHILE') {
      add('refi-later', 'לבדוק שוב בעוד חצי שנה, או כשהריבית משתנה');
    } else {
      if (!hasOffers('REFINANCE')) {
        add('refi-offer', route === 'EXTERNAL' ? 'לבקש הצעת מיחזור מבנק אחר, לפי התמהיל החדש' : 'לבקש מהבנק שלכם הצעת מיחזור, לפי התמהיל החדש');
      }
      add('refi-fee', 'לבקש מהבנק את עמלת הפירעון המוקדם העדכנית, בכתב');
    }
    // Once folding the loans in is decided, the step is asking the bank for it, below.
    if (answers.hasLoans === 'YES' && !input.recovery?.consolidate) {
      add('refi-loans', 'לבדוק איחוד של ההלוואות הנוספות לתוך המיחזור');
    }
  }

  for (const offer of input.offers ?? []) {
    if (goals.includes(offer.goal)) {
      add(
        `offer-${offer.goal}`,
        offer.count > 1
          ? `להתקדם עם ${offer.best}, הזולה מבין ${offer.count} ההצעות, או להציג אותה לבנקים האחרים`
          : `להציג את ההצעה של ${offer.best} לבנקים נוספים, ולבקש מהם להתחרות בה`,
      );
    }
  }

  if (input.loanOffer) {
    const { best, count, rate, average } = input.loanOffer;
    add('loan-offer', count > 1 ? `לקחת את ההלוואה מ${best}, הזולה מבין ${count} ההצעות` : `לבקש עוד הצעה להלוואה, ולהשוות להצעה של ${best}`);
    if (rate > average + 0.01) {
      add('loan-offer-market', `לבקש מ${best} ריבית קרובה לממוצע השוק, ${(average * 100).toFixed(1)}%`);
    }
  }

  // The account and the loans: for a recovery plan, and for any household that added its statements or loans.
  if (input.recovery) {
    const recovery = input.recovery;
    if (!recovery.hasStatements) {
      add('rec-statements', 'להעלות דפי עו״ש ואשראי של 3 חודשים לפחות');
    }
    for (const payee of recovery.cancel) {
      add(`cancel:${payee}`, `לבטל: ${payee}`);
    }
    for (const payee of recovery.reduce) {
      add(`reduce:${payee}`, `לצמצם: ${payee}`);
    }
    if (recovery.overdraft) {
      add('rec-overdraft', 'לסגור את המינוס: לבדוק הלוואה בריבית נמוכה מריבית המינוס');
    }
    if (recovery.fees) {
      add('rec-fees', 'לבקש מהבנק מסלול עמלות בסיסי, ולוותר על דמי כרטיס');
    }
    for (const move of recovery.loanMoves ?? []) {
      add(move.key, `לבקש מהמלווה: ${move.label}`);
    }
    if (recovery.mortgage && !goals.includes('REFINANCE')) {
      add('rec-mortgage', 'לבקש הצעת מיחזור למשכנתא, לפי התמהיל החדש');
    }
    if (recovery.consolidate) {
      add('rec-consolidate', 'לבקש מהבנק הלוואה לכל מטרה בשעבוד הדירה, לאיחוד ההלוואות שסימנתם');
    }
  }
  return tasks;
}
