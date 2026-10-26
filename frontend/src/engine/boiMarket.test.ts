import { describe, expect, it } from 'vitest';
import br from './__fixtures__/boi/br.csv?raw';
import loans from './__fixtures__/boi/loans.csv?raw';
import mortgages from './__fixtures__/boi/mortgages.csv?raw';
import zcm from './__fixtures__/boi/zcm.csv?raw';
import { boiSources, isUsable, latest, marketFromBoi, parseCsv } from './boiMarket';

// Trimmed copies of the real Bank of Israel files, as published in October 2026.
const FILES = { br, zcm, mortgages, loans };
const NOW = new Date('2026-10-26T08:00:00Z');

describe('Bank of Israel market data', () => {
  it('reads every figure from the published files', () => {
    const market = marketFromBoi(FILES, NOW);

    expect(market.missing).toEqual([]);
    expect(market.boiRate?.value).toBeCloseTo(0.0325, 10);
    expect(market.prime).toMatchObject({ value: 0.0475, since: '2026-09-03' });
    expect(market.inflationExpectation?.value).toBeCloseTo(0.019, 3);
    expect(market.bondYield5y?.value).toBeCloseTo(0.0372, 4);
    expect(market.linkedYield5y?.value).toBeCloseTo(0.0178, 4);
    expect(market.housing).toEqual({
      asOf: '2026-08',
      fixedUnlinked: 0.0462,
      fixedLinked: 0.0329,
      variableLinked: 0.0319,
      primeMargin: 0.0049,
    });
    // All-purpose variable: benchmark 4.25 + margin 2.24 against prime 5.00 at the end of August.
    expect(market.allPurpose?.asOf).toBe('2026-08');
    expect(market.allPurpose?.fixedUnlinked).toBeCloseTo(0.0661, 10);
    expect(market.allPurpose?.variableMarginOverPrime).toBeCloseTo(0.0149, 10);
    expect(market.consumerUnsecured).toEqual({ value: 0.079, asOf: '2026-08' });
    expect(isUsable(market)).toBe(true);
  });

  it('reads the monthly history with prime at the end of each month', () => {
    const { history } = marketFromBoi(FILES, NOW);

    // Prime was 5.25% at the end of June, cut to 5.00% in July and 4.75% in September.
    expect(history).toEqual([
      { month: '2026-07', prime: 0.05, fixedUnlinked: 0.0463, fixedLinked: 0.0322, variableLinked: 0.0317 },
      { month: '2026-08', prime: 0.05, fixedUnlinked: 0.0462, fixedLinked: 0.0329, variableLinked: 0.0319 },
    ]);
  });

  it('leaves a gap where a series misses a month instead of borrowing a neighbour', () => {
    const mortgages = FILES.mortgages
      .split('\n')
      .filter((line: string) => !(line.includes(',CPI,F,R,') && line.includes('2026-07')))
      .join('\n');
    const { history } = marketFromBoi({ ...FILES, mortgages }, NOW);

    expect(history?.[0]).toMatchObject({ month: '2026-07', fixedLinked: undefined });
    expect(history?.[1]?.fixedLinked).toBe(0.0329);
  });

  it('degrades piece by piece when a file is missing', () => {
    const market = marketFromBoi({ br: FILES.br }, NOW);

    expect(market.prime?.value).toBe(0.0475);
    expect(market.housing).toBeUndefined();
    expect(market.missing).toEqual(
      expect.arrayContaining(['inflationExpectation', 'bondYield5y', 'housing', 'allPurpose']),
    );
    expect(isUsable(market)).toBe(true);
    expect(isUsable(marketFromBoi({}, NOW))).toBe(false);
  });

  it('rejects implausible values instead of passing them to the engine', () => {
    const br = 'SERIES_CODE,TIME_PERIOD,OBS_VALUE\nMNT_RIB_BOI_D,2026-10-01,325\n';
    const market = marketFromBoi({ br }, NOW);

    expect(market.prime).toBeUndefined();
    expect(market.missing).toContain('prime');
  });

  it('does not mix months between housing series', () => {
    // A September fixed rate is published before the September variable figures.
    const extra = FILES.mortgages
      .split('\n')
      .filter((line: string) => line.includes(',A2C,') && line.includes(',NI,F,R,') && line.includes('2026-08'))
      .map((line: string) => line.replace('2026-08', '2026-09').replace(/,4\.62,/, ',4.70,'));
    const market = marketFromBoi({ ...FILES, mortgages: `${FILES.mortgages.trimEnd()}\n${extra.join('\n')}\n` }, NOW);

    expect(market.housing?.asOf).toBe('2026-09');
    expect(market.housing?.fixedUnlinked).toBeCloseTo(0.047, 10);
    expect(market.housing?.fixedLinked).toBeUndefined();
    expect(market.missing).toContain('housing.fixedLinked');
  });

  it('parses quoted CSV fields', () => {
    const rows = parseCsv('A,COMMENTS,OBS_VALUE\r\nx,"a, ""quoted""\nnote",1.5\r\n');
    expect(rows).toEqual([{ A: 'x', COMMENTS: 'a, "quoted"\nnote', OBS_VALUE: '1.5' }]);
    expect(latest(rows, { A: 'x' })).toBeUndefined(); // no TIME_PERIOD
  });

  it('asks for enough history to reach the latest monthly publication', () => {
    const sources = boiSources(NOW);
    expect(sources.br).toContain('/BR/1.0?startperiod=2025-09-01&format=csv');
    expect(sources.zcm).toContain('/ZCM/1.0?startperiod=2026-06&format=csv');
    expect(sources.mortgages).toContain('/BIR_MRTG_99/1.0?startperiod=2025-09&format=csv');
    expect(sources.loans).toContain('/BIR/1.0?startperiod=2026-04&format=csv');
  });

  it('leaves the date prime took effect unknown when it did not change within the window', () => {
    const br = ['SERIES_CODE,TIME_PERIOD,OBS_VALUE', 'MNT_RIB_BOI_D,2025-10-01,3.25', 'MNT_RIB_BOI_D,2026-10-26,3.25'].join('\n');
    const market = marketFromBoi({ br }, NOW);
    expect(market.prime?.value).toBe(0.0475);
    expect(market.prime?.since).toBeUndefined();
  });
});
