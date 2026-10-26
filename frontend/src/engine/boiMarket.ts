/**
 * Live market data from the Bank of Israel statistics service (SDMX, CSV format).
 *
 * Three dataflows cover everything the engine prices against:
 * - `BR` — the Bank of Israel interest rate; prime is that rate plus 1.5 points.
 * - `ZCM` — inflation expectations and the zero-coupon government curve (monthly averages).
 * - `BIR_MRTG_99` — average rates on new housing loans, and on all-purpose loans secured on a home.
 *
 * This module only parses: it has no network or browser dependency, so the Cloudflare Worker that
 * fetches the files, the dev server and the tests all share it. Every figure is validated against a
 * plausible range and left out when it fails, so a format change upstream degrades to the seeded
 * values instead of feeding nonsense into the engine.
 */

const BASE = 'https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS';

/** The prime rate is set by convention at the Bank of Israel rate plus 1.5 points. */
export const PRIME_SPREAD = 0.015;

/** A dated figure, as a decimal fraction (0.0475 for 4.75%). */
export interface Observation {
  readonly value: number;
  /** The observation's period as published: `YYYY-MM-DD` for daily series, `YYYY-MM` for monthly. */
  readonly asOf: string;
}

export interface LiveMarket {
  /** When the figures were read from the Bank of Israel, ISO timestamp. */
  readonly fetchedAt: string;
  readonly boiRate?: Observation;
  /** Derived from {@link boiRate}; `since` is the first day the current rate applied. */
  readonly prime?: Observation & { readonly since: string };
  /** 5-year inflation expectation implied by the bond market (breakeven). */
  readonly inflationExpectation?: Observation;
  /** 5-year zero-coupon nominal government yield — the anchor for 5-year variable unlinked tracks. */
  readonly bondYield5y?: Observation;
  /** 5-year zero-coupon CPI-linked government yield. */
  readonly linkedYield5y?: Observation;
  /** Average all-in rates on new housing loans in the latest published month. */
  readonly housing?: {
    readonly asOf: string;
    readonly fixedUnlinked?: number;
    readonly fixedLinked?: number;
    readonly variableLinked?: number;
    /** Average margin of unlinked variable (prime-based) loans over their benchmark. */
    readonly primeMargin?: number;
  };
  /** Average rates on all-purpose loans secured on a home, unlinked. */
  readonly allPurpose?: {
    readonly asOf: string;
    readonly fixedUnlinked?: number;
    /** Average all-in variable rate less prime at the end of the same month. */
    readonly variableMarginOverPrime?: number;
  };
  /** Figures that could not be read and fall back to the seeded values. */
  readonly missing: readonly string[];
}

/** The three files to fetch, starting far enough back to reach the latest monthly publication. */
export function boiSources(now: Date): { br: string; zcm: string; mortgages: string } {
  const monthsAgo = (months: number) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
    return date.toISOString().slice(0, 10);
  };
  return {
    br: `${BASE}/BR/1.0?startperiod=${monthsAgo(6)}&format=csv`,
    zcm: `${BASE}/ZCM/1.0?startperiod=${monthsAgo(4).slice(0, 7)}&format=csv`,
    mortgages: `${BASE}/BIR_MRTG_99/1.0?startperiod=${monthsAgo(6).slice(0, 7)}&format=csv`,
  };
}

export type CsvRow = Readonly<Record<string, string>>;

/** RFC 4180 CSV with a header row; quoted fields may contain commas, quotes and newlines. */
export function parseCsv(text: string): CsvRow[] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') {
        i++;
      }
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const [header, ...body] = records.filter((row) => row.some((cell) => cell !== ''));
  if (!header) {
    return [];
  }
  return body.map((row) => Object.fromEntries(header.map((name, index) => [name.trim(), (row[index] ?? '').trim()])));
}

/** The latest observation among rows matching every given dimension, in percent as published. */
export function latest(rows: readonly CsvRow[], match: Readonly<Record<string, string>>): Observation | undefined {
  let best: Observation | undefined;
  for (const row of rows) {
    if (!Object.entries(match).every(([key, value]) => row[key] === value)) {
      continue;
    }
    const raw = row.OBS_VALUE ?? '';
    const value = Number(raw);
    const asOf = row.TIME_PERIOD ?? '';
    if (raw === '' || !Number.isFinite(value) || asOf === '') {
      continue;
    }
    if (!best || asOf > best.asOf) {
      best = { value, asOf };
    }
  }
  return best;
}

/** The value of a daily series in force on a date (the last observation on or before it). */
function onOrBefore(rows: readonly CsvRow[], match: Readonly<Record<string, string>>, date: string) {
  return latest(
    rows.filter((row) => (row.TIME_PERIOD ?? '') <= date),
    match,
  );
}

/** The first period of the run of identical values that ends at the latest observation. */
function inForceSince(rows: readonly CsvRow[], match: Readonly<Record<string, string>>): string | undefined {
  const series = rows
    .filter((row) => Object.entries(match).every(([key, value]) => row[key] === value) && row.OBS_VALUE)
    .map((row) => ({ asOf: row.TIME_PERIOD ?? '', value: Number(row.OBS_VALUE) }))
    .sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
  const last = series.at(-1);
  if (!last) {
    return undefined;
  }
  let since = last.asOf;
  for (let i = series.length - 2; i >= 0 && series[i]!.value === last.value; i--) {
    since = series[i]!.asOf;
  }
  return since;
}

const inRange = (value: number | undefined, min: number, max: number) =>
  value !== undefined && Number.isFinite(value) && value >= min && value <= max ? value : undefined;

/** Converts a published percentage to a fraction, rejecting values outside a plausible range. */
const rate = (percent: number | undefined, min = 0, max = 0.2) =>
  inRange(percent === undefined ? undefined : percent / 100, min, max);

const endOfMonth = (period: string) => `${period}-31`;

export interface BoiFiles {
  readonly br: string;
  readonly zcm: string;
  readonly mortgages: string;
}

export function marketFromBoi(files: Partial<BoiFiles>, fetchedAt: Date): LiveMarket {
  const br = parseCsv(files.br ?? '');
  const zcm = parseCsv(files.zcm ?? '');
  const mortgages = parseCsv(files.mortgages ?? '');
  const missing: string[] = [];

  const BOI_RATE = { SERIES_CODE: 'MNT_RIB_BOI_D' };
  const boiObservation = latest(br, BOI_RATE);
  const boiValue = rate(boiObservation?.value, 0, 0.15);
  const boiRate = boiObservation && boiValue !== undefined ? { value: boiValue, asOf: boiObservation.asOf } : undefined;
  const prime = boiRate
    ? { value: round(boiRate.value + PRIME_SPREAD), asOf: boiRate.asOf, since: inForceSince(br, BOI_RATE) ?? boiRate.asOf }
    : undefined;
  if (!prime) {
    missing.push('prime');
  }

  const monthly = (code: string, label: string, min: number, max: number): Observation | undefined => {
    const observation = latest(zcm, { SERIES_CODE: code });
    const value = rate(observation?.value, min, max);
    if (!observation || value === undefined) {
      missing.push(label);
      return undefined;
    }
    return { value, asOf: observation.asOf };
  };
  const inflationExpectation = monthly('EXP_EXB_ZD_5Y_MA', 'inflationExpectation', -0.05, 0.15);
  const bondYield5y = monthly('ZC_TSB_ZND_05Y_MA', 'bondYield5y', -0.02, 0.15);
  const linkedYield5y = monthly('ZC_TSB_ZRD_05Y_MA', 'linkedYield5y', -0.05, 0.1);

  // Averages across all LTV, payment-to-income and property-value bands. A series is published for
  // the whole population (PTI band P01) where the bank reports one; unlinked variable housing loans
  // appear only under band P07, which is taken when P01 is absent.
  const average = (item: string, indexation: string, kind: string, dataType: string) => {
    const base = { BS_ITEM: item, INDEXATION_TYPE: indexation, IR_FV_TYPE: kind, DATA_TYPE: dataType, LTV: 'L0' };
    return latest(mortgages, { ...base, PTI: 'P01' }) ?? latest(mortgages, { ...base, PTI: 'P07' });
  };

  // The month every housing figure is read for: the latest one the fixed unlinked average covers.
  // Mixing months would compare a September fixed rate with an August variable one.
  const anchorMonth = average('A2C', 'NI', 'F', 'R')?.asOf;
  const forMonth = (observation: Observation | undefined) =>
    observation && observation.asOf === anchorMonth ? observation.value : undefined;

  let housing: LiveMarket['housing'];
  if (anchorMonth) {
    const linkedBenchmark = forMonth(average('A2C', 'CPI', 'V', 'RB'));
    const linkedMargin = forMonth(average('A2C', 'CPI', 'V', 'RM'));
    housing = {
      asOf: anchorMonth,
      fixedUnlinked: rate(forMonth(average('A2C', 'NI', 'F', 'R')), 0.005),
      fixedLinked: rate(forMonth(average('A2C', 'CPI', 'F', 'R')), 0, 0.15),
      variableLinked:
        linkedBenchmark !== undefined && linkedMargin !== undefined
          ? rate(linkedBenchmark + linkedMargin, 0, 0.15)
          : undefined,
      primeMargin: rate(forMonth(average('A2C', 'NI', 'V', 'RM')), -0.02, 0.03),
    };
    for (const key of ['fixedUnlinked', 'fixedLinked', 'variableLinked', 'primeMargin'] as const) {
      if (housing[key] === undefined) {
        missing.push(`housing.${key}`);
      }
    }
  } else {
    missing.push('housing');
  }

  let allPurpose: LiveMarket['allPurpose'];
  const apMonth = average('A2B2', 'NI', 'F', 'R')?.asOf;
  if (apMonth) {
    const at = (observation: Observation | undefined) =>
      observation && observation.asOf === apMonth ? observation.value : undefined;
    const benchmark = at(average('A2B2', 'NI', 'V', 'RB'));
    const margin = at(average('A2B2', 'NI', 'V', 'RM'));
    const boiThen = onOrBefore(br, BOI_RATE, endOfMonth(apMonth));
    const primeThen = boiThen ? boiThen.value / 100 + PRIME_SPREAD : undefined;
    const variable = benchmark !== undefined && margin !== undefined ? (benchmark + margin) / 100 : undefined;
    allPurpose = {
      asOf: apMonth,
      fixedUnlinked: rate(at(average('A2B2', 'NI', 'F', 'R')), 0.01, 0.25),
      variableMarginOverPrime:
        variable !== undefined && primeThen !== undefined
          ? inRange(round(variable - primeThen), -0.02, 0.08)
          : undefined,
    };
    for (const key of ['fixedUnlinked', 'variableMarginOverPrime'] as const) {
      if (allPurpose[key] === undefined) {
        missing.push(`allPurpose.${key}`);
      }
    }
  } else {
    missing.push('allPurpose');
  }

  return {
    fetchedAt: fetchedAt.toISOString(),
    boiRate,
    prime,
    inflationExpectation,
    bondYield5y,
    linkedYield5y,
    housing,
    allPurpose,
    missing,
  };
}

/** Rounds away floating-point noise from percent-to-fraction conversion. */
function round(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

/** True when at least the prime rate or the housing averages came through. */
export function isUsable(market: LiveMarket): boolean {
  return market.prime !== undefined || market.housing !== undefined;
}
