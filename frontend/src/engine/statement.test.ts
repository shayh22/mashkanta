import { describe, expect, it } from 'vitest';
import { quoteTrack } from './prepayment';
import { redact } from './redaction';
import {
  isMortgageStatement,
  monthsBetween,
  parseMortgageStatement,
  paymentsRemaining,
  splitStatedFee,
  statementToTracks,
  type StatementTrack,
} from './statement';
import { STATEMENT } from './__fixtures__/statement';

/** A track by the last digits of its loan number and its sub-loan number. */
const find = (tracks: readonly StatementTrack[], loan: string, component: string) =>
  tracks.find((track) => track.loanNumber.endsWith(loan) && track.id.endsWith(`-${component}`))!;

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
    expect(linked).toMatchObject({
      principal: 90_000,
      indexation: 10_000,
      accruedInterest: 120,
      prepaymentFee: 0,
    });
    expect(parsed.loans[1]).toMatchObject({
      loanNumber: '11/10/111111/202',
      prepaymentFee: 300,
      monthlyPayment: 1_200,
    });
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
    expect(byId('303', '201')).toMatchObject({
      resetMonths: 60,
      nextResetDate: '2031-01-10',
      cpiLinked: true,
    });
    const linked = byId('101', '202');
    expect(linked).toMatchObject({ baseIndex: 110, lastIndex: 120 });
    expect(linked.nominalRate).toBeCloseTo(0.031, 10);
    expect(linked.originationRate).toBeCloseTo(0.0314, 10);
  });

  it('derives prime from a prime-based sub-loan', () => {
    expect(parsed.impliedPrime).toBeCloseTo(0.055, 10);
  });

  it('maps every sub-loan to its track type', () => {
    const types = Object.fromEntries(
      statementToTracks(parsed).map((track) => [
        `${track.loanNumber.slice(-3)}-${track.id.slice(-3)}`,
        track.type,
      ]),
    );
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
    const track = find(statementToTracks(parsed), '303', '201');
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
    const track = find(statementToTracks(parseMortgageStatement(directed)!), '404', '201');
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
  const track = find(statementToTracks(parseMortgageStatement(STATEMENT)!), '303', '201');

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

describe('review findings', () => {
  const parsed = parseMortgageStatement(STATEMENT)!;

  it('gives a prime sub-loan only its notice share of a loan fee that is mostly capitalization', () => {
    // A loan with a fixed and a prime sub-loan of equal size and a 1,000 fee.
    const [fixed, prime] = [
      parsed.components.find((c) => c.rateType === 'FIXED' && !c.cpiLinked)!,
      parsed.components.find((c) => c.primeBased)!,
    ];
    const fees = splitStatedFee(1_000, [fixed!, prime!], [100_000, 100_000], parsed.asOf);
    expect(fees[1]).toBeCloseTo(100, 6); // 0.1% notice on 100,000
    expect(fees[0]).toBeCloseTo(900, 6);
    expect(fees[0]! + fees[1]!).toBeCloseTo(1_000, 6);
  });

  it('falls back to notice weights when the fee is below the notice component', () => {
    const prime = parsed.components.find((c) => c.primeBased)!;
    const fixed = parsed.components.find((c) => c.rateType === 'FIXED' && !c.cpiLinked)!;
    const fees = splitStatedFee(50, [fixed, prime], [100_000, 300_000], parsed.asOf);
    expect(fees[0]).toBeCloseTo(12.5, 6);
    expect(fees[1]).toBeCloseTo(37.5, 6);
  });

  it('keeps the letter date through redaction when there is no "as of" phrase', () => {
    const withoutAsOf = STATEMENT.replace('נכון ליום 20/03/2027', '');
    const result = parseMortgageStatement(redact(withoutAsOf).sanitizedText)!;
    expect(result.asOf).toBe('2027-03-15');
    expect(result.warnings.some((warning) => warning.includes('תאריך הדוח'))).toBe(false);
  });

  it('does not count the average-CPI fee twice when the statement is dated on the 1st–15th', () => {
    const track = { ...find(statementToTracks(parsed), '303', '201'), statedFeeDay: 10 };
    const early = quoteTrack(track, 0.01, { noticeGiven: false, dayOfMonth: 10, cpiAnnual: 0.024 });
    expect(early.total).toBeCloseTo(520, 6);
    const late = quoteTrack(track, 0.01, { noticeGiven: false, dayOfMonth: 20, cpiAnnual: 0.024 });
    expect(late.total).toBeCloseTo(520 - early.cpiFee, 6);
  });

  it('does not guess prime when the reset row cannot be aligned', () => {
    // Drop one of the two "1" reset cells: the row no longer matches the two variable sub-loans.
    const misaligned = STATEMENT.replace(
      /תדירות שינוי הריבית בחודשים\n1 1\n/,
      'תדירות שינוי הריבית בחודשים\n1\n',
    );
    const result = parseMortgageStatement(misaligned)!;
    expect(result.warnings.some((warning) => warning.includes('תדירות שינוי הריבית'))).toBe(true);
    // Both unlinked variable sub-loans carry a P-margin, so they are still recognised as prime.
    const tracks = statementToTracks(result);
    expect(find(tracks, '202', '201').type).toBe('PRIME');
    // A block whose unlinked variable sub-loan has no P-margin is not assumed to be prime.
    const noMargin = misaligned.replace(/P - 0\.70%/g, '');
    expect(find(statementToTracks(parseMortgageStatement(noMargin)!), '202', '201').type).toBe(
      'VARIABLE_UNLINKED',
    );
  });

  it('keeps track ids unique when two loan numbers share their last digits', () => {
    const clash = STATEMENT.split('11/48/111111/404').join('11/48/999999/101');
    const ids = statementToTracks(parseMortgageStatement(clash)!).map((track) => track.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
