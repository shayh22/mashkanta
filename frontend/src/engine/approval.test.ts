import { describe, expect, it } from "vitest";
import { parseApproval } from "./approval";

const PRIME = 0.06;

/** A synthetic standardised approval: one track per row, surrounded by boilerplate. */
const APPROVAL = [
  "אישור עקרוני אחיד — בנק מזרחי טפחות",
  "לכבוד: [REDACTED]",
  "פריים מינוס 0.5 · 400,000 ₪ · 300 חודשים",
  "קבועה לא צמודה 4.65% 350,000 ₪ 25 שנים",
  "קבועה צמודה 3,20% ₪ 250,000 240 חודשים",
  "משתנה צמודה כל 5 שנים 3.10% 100000 360 חודשים",
  'סה"כ הלוואה 1,100,000 ₪',
  "הריבית במסלול קבועה תקפה ל-24 יום",
].join("\n");

describe("parseApproval", () => {
  const parsed = parseApproval(APPROVAL, PRIME);

  it("reads one track per row and skips boilerplate lines", () => {
    expect(parsed.tracks.map((track) => track.track)).toEqual([
      "PRIME",
      "FIXED_UNLINKED",
      "FIXED_LINKED",
      "VARIABLE_LINKED",
    ]);
    expect(parsed.totalAmount).toBe(1_100_000);
    expect(parsed.bankCode).toBe("MIZRAHI");
    expect(parsed.warnings).toEqual([]);
  });

  it("prices a prime row from its margin and the given prime rate", () => {
    expect(parsed.tracks[0]!.annualRate).toBeCloseTo(0.055, 10);
    expect(
      parseApproval("פריים פלוס 0.3 סכום 200,000", PRIME).tracks[0]!.annualRate,
    ).toBeCloseTo(0.063, 10);
    expect(
      parseApproval("פריים -0.25 סכום 200,000", PRIME).tracks[0]!.annualRate,
    ).toBeCloseTo(0.0575, 10);
  });

  it("keeps the absolute rate on a prime row quoted without a margin", () => {
    expect(
      parseApproval("מסלול פריים 5.75% 200,000 ₪", PRIME).tracks[0]!.annualRate,
    ).toBeCloseTo(0.0575, 10);
  });

  it("reads rates with a comma decimal, amounts with or without separators, and terms in months or years", () => {
    const [, fixedUnlinked, fixedLinked, variable] = parsed.tracks;
    expect(fixedUnlinked).toMatchObject({
      annualRate: expect.closeTo(0.0465, 10),
      amount: 350_000,
      termMonths: 300,
    });
    expect(fixedLinked).toMatchObject({
      annualRate: expect.closeTo(0.032, 10),
      amount: 250_000,
      termMonths: 240,
    });
    expect(variable).toMatchObject({ amount: 100_000, termMonths: 360 });
  });

  it("prefers the most specific track name", () => {
    expect(
      parseApproval("משתנה לא צמודה 5.1% 120,000", PRIME).tracks[0]!.track,
    ).toBe("VARIABLE_UNLINKED");
    expect(parseApproval('קל"צ 4.9% 120,000 ₪', PRIME).tracks[0]!.track).toBe(
      "FIXED_UNLINKED",
    );
  });

  it("emits a track without an amount, with a warning, rather than dropping it", () => {
    const result = parseApproval("קבועה צמודה 3.4% 240 חודשים", PRIME);
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]!.amount).toBe(0);
    expect(result.warnings[0]).toContain("ללא סכום");
  });

  it("does not take a term or a year for the principal", () => {
    expect(
      parseApproval("קבועה צמודה 3.4% 2026 360 חודשים", PRIME).tracks[0]!
        .amount,
    ).toBe(0);
  });

  it("ignores a track name without a rate", () => {
    expect(
      parseApproval("מסלול קבועה לא צמודה 350,000 ₪", PRIME).tracks,
    ).toEqual([]);
  });

  it("explains an empty or unrecognised document", () => {
    expect(parseApproval("   ", PRIME).warnings).toEqual([
      "לא הופק טקסט מהמסמך.",
    ]);
    const unknown = parseApproval(
      "מכתב כללי ללא טבלת מסלולים\nשורה נוספת בלי ריבית",
      PRIME,
    );
    expect(unknown.tracks).toEqual([]);
    expect(unknown.totalAmount).toBe(0);
    expect(unknown.warnings[0]).toContain("לא זוהו מסלולי הלוואה");
  });
});
