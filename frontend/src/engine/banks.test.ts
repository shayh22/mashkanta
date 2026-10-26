import { describe, expect, it } from "vitest";
import type { TrackType } from "../lib/types";
import { BANK_SHEETS, compareBanks } from "./banks";
import { baselineScenario } from "./scenario";

const scenario = baselineScenario(0.0575, 0.024, 0.042);
const mix = new Map<TrackType, number>([
  ["PRIME", 1 / 3],
  ["FIXED_UNLINKED", 1 / 3],
  ["FIXED_LINKED", 1 / 3],
]);

describe("compareBanks", () => {
  const quotes = compareBanks(mix, 1_200_000, 300, 0.6, scenario);

  it("quotes every lender, ranked by the total paid over the life of the loan", () => {
    expect(quotes).toHaveLength(BANK_SHEETS.length);
    expect(quotes.map((quote) => quote.rank)).toEqual(
      BANK_SHEETS.map((_, index) => index + 1),
    );
    for (let i = 1; i < quotes.length; i++) {
      expect(quotes[i]!.totalPaid).toBeGreaterThanOrEqual(
        quotes[i - 1]!.totalPaid,
      );
    }
    expect(quotes[0]!.costAboveBest).toBe(0);
    expect(quotes.at(-1)!.costAboveBest).toBeCloseTo(
      quotes.at(-1)!.totalPaid - quotes[0]!.totalPaid,
      6,
    );
  });

  it("applies each lender's offsets to the same base rate", () => {
    const byCode = new Map(quotes.map((quote) => [quote.code, quote]));
    const mizrahi = byCode.get("MIZRAHI")!;
    const jerusalem = byCode.get("JERUSALEM")!;
    for (const track of mix.keys()) {
      const offsetGap =
        (BANK_SHEETS.find((s) => s.code === "JERUSALEM")!.offsets[track] ?? 0) -
        (BANK_SHEETS.find((s) => s.code === "MIZRAHI")!.offsets[track] ?? 0);
      expect(jerusalem.rates[track]! - mizrahi.rates[track]!).toBeCloseTo(
        offsetGap,
        10,
      );
    }
  });

  it("prices only the tracks in the mix", () => {
    for (const quote of quotes) {
      expect(Object.keys(quote.rates).sort()).toEqual([...mix.keys()].sort());
      expect(quote.initialPayment).toBeGreaterThan(0);
      expect(quote.maxPayment).toBeGreaterThanOrEqual(
        quote.initialPayment - 1e-6,
      );
      expect(quote.totalPaid).toBeGreaterThan(1_200_000);
    }
  });

  it("skips negligible shares and returns nothing for an empty mix", () => {
    const tiny = compareBanks(
      new Map<TrackType, number>([
        ["PRIME", 1],
        ["FIXED_LINKED", 1e-7],
      ]),
      1_000_000,
      240,
      0.5,
      scenario,
    );
    expect(Object.keys(tiny[0]!.rates)).toEqual(["PRIME"]);
    expect(compareBanks(new Map(), 1_000_000, 240, 0.5, scenario)).toEqual([]);
  });

  it("keeps market shares and pricing offsets within sane bounds", () => {
    const share = BANK_SHEETS.reduce(
      (sum, sheet) => sum + sheet.marketShare,
      0,
    );
    expect(share).toBeGreaterThan(0.9);
    expect(share).toBeLessThanOrEqual(1);
    for (const sheet of BANK_SHEETS) {
      for (const offset of Object.values(sheet.offsets)) {
        expect(Math.abs(offset)).toBeLessThanOrEqual(0.005);
      }
    }
  });
});
