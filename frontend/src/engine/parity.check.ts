/**
 * One-off cross-check of the TypeScript engine against the Java backend.
 *
 * Not part of the test suite: it needs the Spring Boot service running. Kept as a script so the
 * port can be re-verified whenever either side changes.
 *   npx tsx src/engine/parity.check.ts   (backend on :8080)
 */
import { optimize } from './optimizer';
import { profileRisk, type BorrowerProfile } from './profile';
import { baselineScenario } from './scenario';

const profiles: [string, BorrowerProfile][] = [1, 5, 8, 10].map((risk) => [
  `risk ${risk}`,
  {
    propertyValue: 2_400_000,
    loanAmount: 1_680_000,
    termMonths: 300,
    segment: 'FIRST_HOME',
    monthlyNetIncome: 32_000,
    existingMonthlyObligations: 1_500,
    riskTolerance: risk,
    volatilityCapacity: 1_500,
    liquidityEvents: [],
    primePreference: 0.25,
    stablePreference: 0.5,
    dynamicPreference: 0.25,
    eligibilityAmount: 0,
    eligibilityRate: 0,
  },
]);

let worstDrift = 0;

for (const [label, borrower] of profiles) {
  const local = optimize(borrower, profileRisk(borrower), baselineScenario(0.0575, 0.024, 0.042), 0.5);

  const response = await fetch('http://localhost:8080/api/v1/mortgage/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: { ...borrower, liquidityEvents: [] } }),
  });
  const remote = (await response.json()) as {
    recommended: { summary: { initialPayment: number; totalPaid: number; nominalIrr: number } };
    baskets: { name: string; summary: { totalPaid: number } }[];
  };

  const mine = local.recommended.result;
  const theirs = remote.recommended.summary;
  const drift = (a: number, b: number) => (b === 0 ? 0 : Math.abs(a - b) / Math.abs(b));

  const paymentDrift = drift(mine.initialPayment, theirs.initialPayment);
  const totalDrift = drift(mine.totalPaid, theirs.totalPaid);
  const irrDrift = Math.abs(mine.nominalIrr - theirs.nominalIrr);
  worstDrift = Math.max(worstDrift, paymentDrift, totalDrift);

  const mix = local.recommended.allocations
    .map((a) => `${a.hebrewName.split('(')[0]!.trim()} ${(a.share * 100).toFixed(0)}%`)
    .join(', ');

  console.log(`${label}:`);
  console.log(`  TS   payment ${mine.initialPayment.toFixed(2)}  total ${mine.totalPaid.toFixed(0)}  irr ${(mine.nominalIrr * 100).toFixed(4)}%`);
  console.log(`  Java payment ${theirs.initialPayment.toFixed(2)}  total ${theirs.totalPaid.toFixed(0)}  irr ${(theirs.nominalIrr * 100).toFixed(4)}%`);
  console.log(`  mix: ${mix}`);
  console.log(`  drift: payment ${(paymentDrift * 100).toFixed(6)}%  total ${(totalDrift * 100).toFixed(6)}%  irr ${(irrDrift * 100).toFixed(6)}pp`);

  for (const basket of remote.baskets) {
    const localBasket = local.baskets.find((b) => b.name === basket.name);
    if (localBasket) {
      const d = drift(localBasket.result.totalPaid, basket.summary.totalPaid);
      worstDrift = Math.max(worstDrift, d);
      console.log(`  ${basket.name}: drift ${(d * 100).toFixed(6)}%`);
    }
  }
}

console.log(`\nworst relative drift across all comparisons: ${(worstDrift * 100).toFixed(8)}%`);
