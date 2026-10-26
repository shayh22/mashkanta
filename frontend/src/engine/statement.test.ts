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
import { STATEMENT } from './__fixtures__/statement';


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
