import { describe, expect, it } from 'vitest';
import { quoteTrack } from './prepayment';
import { redact } from './redaction';
import {
  isMortgageStatement,
  monthsBetween,
  parseMortgageStatement,
  paymentsRemaining,
  statementToTracks,
} from './statement';

/**
 * A synthetic statement in the layout pdf.js extracts from a Bank Hapoalim "פרטי משכנתאות" letter.
 * Every name, number and amount is invented; the structure — including rows that drop the empty
 * cells of fixed sub-loans — follows the real document.
 */
const STATEMENT = `טלפון: *2401
 לכבוד תאריך: 15/03/2027
ישראל ישראלי מספר זהות:  12345678
הרצל 10
 תל אביב 5
 א.ג.נ,
 הנדון: פרטי משכנתאות
הרינו מתכבדים להוציא לכם את הנתונים הבאים לגבי הלוואות שניתנו ע"י הבנק, נכון ליום 20/03/2027 בהלוואות שמספרן מצוין להלן:
מספר הלוואה קרן הצמדת קרן פיגור / עודף ריבית ריבית נדחית נלווים עמלת פירעון מוקדם יתרה לסילוק תשלום חודשי
 11/00/111111/101 90,000.00 10,000.00 0.02- 120.00 0.00 0.00 0.00 100,119.98 700.00
222222-333
11/10/111111/202 200,000.00 0.00 0.00 400.00 0.00 0.00 300.00 200,700.00 1,200.00
222222-333
11/48/111111/404 50,000.00 0.00 0.00 80.00 0.00 0.00 0.00 50,080.00 600.00
222222-333
11/58/111111/303 80,000.00 15,000.00 0.00 300.00 0.00 0.00 520.00 95,820.00 650.00
222222-333
420,000.00 25,000.00 0.02- 900.00 0.00 0.00 820.00 446,719.98   סה"כ 3,150.00
ניהול הלוואות, רחוב הנגב 11, תל-אביב 61360, ת.ד. 36002, פקס:03-7140792, טל: 2401*
מספר הלוואה ומספר מרכיב  מספר הלוואה ומספר מרכיב  מספר הלוואה ומספר מרכיב  מספר הלוואה ומספר מרכיב
 11/00/111111/101  11/00/111111/101  11/10/111111/202  11/10/111111/202
201 202 201 202
 מטרת הלוואה  מטרת הלוואה  מטרת הלוואה  מטרת הלוואה
הלוואה לדיור לרכישה הלוואה לדיור לרכישה הלוואה לדיור לרכישה הלוואה לדיור לרכישה
 סכום הלוואה מקורי  סכום הלוואה מקורי  סכום הלוואה מקורי  סכום הלוואה מקורי
40,000.00 60,000.00 100,000.00 120,000.00
 מועד ביצוע ההלוואה  מועד ביצוע ההלוואה  מועד ביצוע ההלוואה  מועד ביצוע ההלוואה
01/01/2020 01/06/2022 01/01/2020 01/06/2022
 מועד התשלום הראשון  מועד התשלום הראשון  מועד התשלום הראשון  מועד התשלום הראשון
10/02/2020 10/07/2022 10/02/2020 10/07/2022
 מועד צפוי לתשלום  מועד צפוי לתשלום  מועד צפוי לתשלום  מועד צפוי לתשלום
10/01/2040 10/06/2042 10/01/2045 10/06/2047
אחרון / תאריך סילוק אחרון / תאריך סילוק אחרון / תאריך סילוק אחרון / תאריך סילוק
 סוג הלוואה  סוג הלוואה  סוג הלוואה  סוג הלוואה
בנק בנק בנק בנק
 שיטת פירעון ההלוואה  שיטת פירעון ההלוואה  שיטת פירעון ההלוואה  שיטת פירעון ההלוואה
שפיצר שפיצר שפיצר שפיצר
 סוג ריבית  סוג ריבית  סוג ריבית  סוג ריבית
קבועה קבועה משתנה משתנה
 בסיס לקביעת הריבית ותוספת /  בסיס לקביעת הריבית ותוספת /  בסיס לקביעת הריבית ותוספת /  בסיס לקביעת הריבית ותוספת /
% % P - 0.70% % P - 0.70% %
הפחתה )ריבית סיכון( הפחתה )ריבית סיכון( הפחתה )ריבית סיכון( הפחתה )ריבית סיכון(
 שיעור ריבית נומינלית ליום מכתבנו זה  שיעור ריבית נומינלית ליום מכתבנו זה  שיעור ריבית נומינלית ליום מכתבנו זה  שיעור ריבית נומינלית ליום מכתבנו זה
% % % %
2.500 3.100 4.800 4.800
 שיעור ריבית מתואמת ליום הביצוע  שיעור ריבית מתואמת ליום הביצוע  שיעור ריבית מתואמת ליום הביצוע  שיעור ריבית מתואמת ליום הביצוע
% % % %
2.530 3.140 2.900 4.100
 שיעור ריבית מתואמת ליום מכתבנו זה  שיעור ריבית מתואמת ליום מכתבנו זה  שיעור ריבית מתואמת ליום מכתבנו זה  שיעור ריבית מתואמת ליום מכתבנו זה
2.530 3.140 4.900 4.900
 תדירות שינוי הריבית בחודשים  תדירות שינוי הריבית בחודשים  תדירות שינוי הריבית בחודשים  תדירות שינוי הריבית בחודשים
1 1
 מועד שינוי הריבית הקרוב  מועד שינוי הריבית הקרוב  מועד שינוי הריבית הקרוב  מועד שינוי הריבית הקרוב
10/04/2027 10/04/2027
 בסיס ההצמדה  בסיס ההצמדה  בסיס ההצמדה  בסיס ההצמדה
מדד המחירים לצרכן מדד המחירים לצרכן לא צמוד לא צמוד
 מדד / שער בסיס של ההלוואה  מדד / שער בסיס של ההלוואה  מדד / שער בסיס של ההלוואה  מדד / שער בסיס של ההלוואה
100.0000 110.0000 0.0000 0.0000
 מדד / שער אחרון ידוע  מדד / שער אחרון ידוע  מדד / שער אחרון ידוע  מדד / שער אחרון ידוע
120.0000 120.0000 0.0000 0.0000
 שיעור ריבית הכוללת החזויה  שיעור ריבית הכוללת החזויה  שיעור ריבית הכוללת החזויה  שיעור ריבית הכוללת החזויה
 4.1000  4.6000  *  *
מספר הלוואה ומספר מרכיב  מספר הלוואה ומספר מרכיב
 11/48/111111/404  11/58/111111/303
201 201
 סכום הלוואה מקורי  סכום הלוואה מקורי
70,000.00 85,000.00
 מועד ביצוע ההלוואה  מועד ביצוע ההלוואה
01/01/2021 01/01/2021
 מועד התשלום הראשון  מועד התשלום הראשון
10/02/2021 10/02/2021
 מועד צפוי לתשלום  מועד צפוי לתשלום
10/01/2036 10/01/2051
 סוג הלוואה  סוג הלוואה
בנק בנק
 סוג ריבית  סוג ריבית
קבועה משתנה
 בסיס לקביעת הריבית ותוספת /  בסיס לקביעת הריבית ותוספת /
% H + 3.50% %
 שיעור ריבית נומינלית ליום מכתבנו זה  שיעור ריבית נומינלית ליום מכתבנו זה
% %
3.000 5.200
 שיעור ריבית מתואמת ליום הביצוע  שיעור ריבית מתואמת ליום הביצוע
% %
3.040 2.800
 תדירות שינוי הריבית בחודשים  תדירות שינוי הריבית בחודשים
60
 מועד שינוי הריבית הקרוב  מועד שינוי הריבית הקרוב
10/01/2031
 בסיס ההצמדה  בסיס ההצמדה
לא צמוד מדד המחירים לצרכן
 מדד / שער בסיס של ההלוואה  מדד / שער בסיס של ההלוואה
0.0000 100.0000
 מדד / שער אחרון ידוע  מדד / שער אחרון ידוע
0.0000 118.0000
`;

describe('mortgage statement parser', () => {
  const parsed = parseMortgageStatement(STATEMENT)!;

  it('recognises a statement and leaves other documents alone', () => {
    expect(isMortgageStatement(STATEMENT)).toBe(true);
    expect(parseMortgageStatement('אישור עקרוני למשכנתא — פריים 300,000 ₪')).toBeNull();
  });

  it('reads the as-of date and the summary table, trailing minus included', () => {
    expect(parsed.asOf).toBe('2027-03-20');
    expect(parsed.loans).toHaveLength(4);
    const linked = parsed.loans[0]!;
    expect(linked).toMatchObject({ principal: 90_000, indexation: 10_000, accruedInterest: 120, prepaymentFee: 0 });
    expect(parsed.loans[1]).toMatchObject({ loanNumber: '11/10/111111/202', prepaymentFee: 300, monthlyPayment: 1_200 });
    expect(parsed.warnings).toEqual([]);
  });

  it('assigns rows that exist only for variable sub-loans to the variable columns', () => {
    expect(parsed.components).toHaveLength(6);
    const byId = (loan: string, component: string) =>
      parsed.components.find((c) => c.loanNumber.endsWith(loan) && c.component === component)!;
    expect(byId('101', '201').resetMonths).toBeUndefined();
    expect(byId('202', '201')).toMatchObject({ resetMonths: 1, nextResetDate: '2027-04-10' });
    expect(byId('202', '201').primeMargin).toBeCloseTo(-0.007, 10);
    expect(byId('404', '201').resetMonths).toBeUndefined();
    expect(byId('303', '201')).toMatchObject({ resetMonths: 60, nextResetDate: '2031-01-10', cpiLinked: true });
    const linked = byId('101', '202');
    expect(linked).toMatchObject({ baseIndex: 110, lastIndex: 120 });
    expect(linked.nominalRate).toBeCloseTo(0.031, 10);
    expect(linked.originationRate).toBeCloseTo(0.0314, 10);
  });

  it('derives prime from a prime-based sub-loan', () => {
    expect(parsed.impliedPrime).toBeCloseTo(0.055, 10);
  });

  it('maps every sub-loan to its track type', () => {
    const types = Object.fromEntries(statementToTracks(parsed).map((track) => [track.id, track.type]));
    expect(types).toEqual({
      '101-201': 'FIXED_LINKED',
      '101-202': 'FIXED_LINKED',
      '202-201': 'PRIME',
      '202-202': 'PRIME',
      '404-201': 'FIXED_UNLINKED',
      '303-201': 'VARIABLE_LINKED',
    });
  });

  it('splits each loan balance and the bank fee across its sub-loans without losing a shekel', () => {
    const tracks = statementToTracks(parsed);
    for (const loan of parsed.loans) {
      const mine = tracks.filter((track) => track.loanNumber === loan.loanNumber);
      expect(mine.reduce((sum, t) => sum + t.balance, 0)).toBeCloseTo(loan.principal + loan.indexation, 6);
      expect(mine.reduce((sum, t) => sum + (t.statedFee ?? 0), 0)).toBeCloseTo(loan.prepaymentFee, 6);
    }
    // The older, smaller sub-loan has amortised further, so it gets the smaller share.
    const [older, newer] = tracks.filter((track) => track.loanNumber.endsWith('202'));
    expect(older!.balance).toBeLessThan(newer!.balance);
  });

  it('counts remaining payments, seniority and months to the next reset from the statement date', () => {
    const track = statementToTracks(parsed).find((t) => t.id === '303-201')!;
    expect(track.remainingMonths).toBe(286); // April 2027 .. January 2051
    expect(track.monthsElapsed).toBe(74); // January 2021 .. March 2027
    expect(track.monthsToReset).toBe(46);
    expect(track.originationAverageRate).toBeCloseTo(0.028, 10);
  });

  it('flags a block it cannot align instead of guessing', () => {
    const broken = STATEMENT.replace('קבועה משתנה\n', 'קבועה\n');
    const result = parseMortgageStatement(broken)!;
    expect(result.components).toHaveLength(4);
    expect(result.warnings.some((warning) => warning.includes('חסרים נתונים'))).toBe(true);
  });

  it('treats a directed sub-loan as an eligibility track', () => {
    // The second block has exactly two columns; its first is loan 404.
    const directed = STATEMENT.replace('\nבנק בנק\n', '\nזכאות בנק\n');
    const track = statementToTracks(parseMortgageStatement(directed)!).find((t) => t.id === '404-201')!;
    expect(track.type).toBe('ELIGIBILITY');
  });
});

describe('statement privacy', () => {
  it('masks the addressee block and an eight-digit identity number before parsing', () => {
    const { sanitizedText, byCategory } = redact(STATEMENT);
    expect(sanitizedText).not.toContain('ישראלי');
    expect(sanitizedText).not.toContain('12345678');
    expect(sanitizedText).not.toContain('הרצל 10');
    expect(sanitizedText).not.toContain('תל אביב 5');
    expect(byCategory.NATIONAL_ID).toBeGreaterThanOrEqual(1);
    // Redaction must not damage the figures the parser needs.
    const parsed = parseMortgageStatement(sanitizedText)!;
    expect(parsed.loans).toHaveLength(4);
    expect(parsed.components).toHaveLength(6);
  });
});

describe('the bank fee in the prepayment quote', () => {
  const track = statementToTracks(parseMortgageStatement(STATEMENT)!).find((t) => t.id === '303-201')!;

  it('uses the stated fee as is, on a no-notice repayment after the 15th', () => {
    const quote = quoteTrack(track, 0.01, { noticeGiven: false, dayOfMonth: 20, cpiAnnual: 0.024 });
    expect(quote.source).toBe('BANK');
    expect(quote.total).toBeCloseTo(520, 6);
  });

  it('takes the notice part out when notice is given, and adds the CPI fee before the 16th', () => {
    const notice = quoteTrack(track, 0.01, { noticeGiven: true, dayOfMonth: 20, cpiAnnual: 0.024 });
    expect(notice.total).toBeCloseTo(520 - track.balance * 0.001, 6);
    const early = quoteTrack(track, 0.01, { noticeGiven: false, dayOfMonth: 10, cpiAnnual: 0.024 });
    expect(early.cpiFee).toBeGreaterThan(0);
    expect(early.total).toBeCloseTo(520 + early.cpiFee, 6);
  });
});

describe('calendar arithmetic', () => {
  it('counts whole months and remaining payments', () => {
    expect(monthsBetween('2020-01-15', '2020-02-14')).toBe(0);
    expect(monthsBetween('2020-01-15', '2020-02-15')).toBe(1);
    expect(paymentsRemaining('2026-10-26', '2039-11-10')).toBe(157);
    expect(paymentsRemaining('2026-10-05', '2026-10-10')).toBe(1);
    expect(paymentsRemaining('2026-10-26', '2026-10-10')).toBe(0);
  });
});
