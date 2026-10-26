import { afterEach, describe, expect, it, vi } from 'vitest';
import { marketFromBoi, type LiveMarket } from '../engine/boiMarket';
import { applyLiveMarket, liveMarket } from '../engine/liveMarket';
import { allPurposeRates, DEFAULT_TERMS, migrateConsolidation, useConsolidation } from './consolidationStore';
import br from '../engine/__fixtures__/boi/br.csv?raw';
import loans from '../engine/__fixtures__/boi/loans.csv?raw';
import mortgages from '../engine/__fixtures__/boi/mortgages.csv?raw';
import zcm from '../engine/__fixtures__/boi/zcm.csv?raw';
import { fillGaps, useMarket } from './marketStore';

const AUGUST = marketFromBoi(
  { br, zcm, mortgages, loans },
  new Date('2026-10-26T08:00:00Z'),
);
const LATER: LiveMarket = {
  ...AUGUST,
  prime: { value: 0.045, asOf: '2026-11-25', since: '2026-11-24' },
  allPurpose: { asOf: '2026-09', fixedUnlinked: 0.064, variableMarginOverPrime: 0.016 },
};

const serve = (body: unknown, status = 200) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));

describe('market store', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    applyLiveMarket(undefined);
    useMarket.setState({ market: undefined, status: 'idle', error: undefined });
    useConsolidation.getState().reset();
  });

  it('adopts fetched figures and moves untouched loan terms with them', async () => {
    serve(LATER);
    const version = useMarket.getState().version;

    await useMarket.getState().refresh();

    expect(useMarket.getState()).toMatchObject({ status: 'ready', market: LATER, version: version + 1 });
    expect(liveMarket()).toEqual(LATER);
    expect(useConsolidation.getState().terms).toMatchObject({ variableRate: 0.061, fixedRate: 0.064 });
  });

  it('never overwrites rates the borrower entered', async () => {
    useConsolidation.getState().setTerms({ variableRate: 0.07 });
    serve(LATER);

    await useMarket.getState().refresh();

    expect(useConsolidation.getState().terms.variableRate).toBe(0.07);
    expect(useConsolidation.getState().terms.fixedRate).toBe(DEFAULT_TERMS.fixedRate);
  });

  it('keeps the last good figures when a refresh fails', async () => {
    serve(AUGUST);
    await useMarket.getState().refresh();
    serve({ error: 'down' }, 502);

    await useMarket.getState().refresh(true);

    expect(useMarket.getState()).toMatchObject({ status: 'error', market: AUGUST, error: 'HTTP 502' });
    expect(liveMarket()).toEqual(AUGUST);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/market?fresh=1');
  });

  it('rejects a response with nothing usable in it', async () => {
    serve({ fetchedAt: '2026-10-26T08:00:00Z', missing: ['prime', 'housing'] });

    await useMarket.getState().refresh();

    expect(useMarket.getState().status).toBe('error');
    expect(liveMarket()).toBeUndefined();
  });

  it('resets loan terms to the live averages', () => {
    applyLiveMarket(LATER);
    useConsolidation.getState().reset();
    expect(useConsolidation.getState().terms).toMatchObject(allPurposeRates(LATER));
  });

  it('keeps the last good figures for anything a partial read lacks', async () => {
    serve(AUGUST);
    await useMarket.getState().refresh();
    // The mortgage file timed out upstream: prime arrived, the housing averages did not.
    const partial: LiveMarket = {
      fetchedAt: '2026-10-27T08:00:00Z',
      prime: { value: 0.045, asOf: '2026-10-27', since: '2026-10-27' },
      missing: ['housing', 'allPurpose'],
    };
    serve(partial);

    await useMarket.getState().refresh(true);

    const market = useMarket.getState().market!;
    expect(market.prime?.value).toBe(0.045);
    expect(market.housing).toEqual(AUGUST.housing);
    expect(market.history).toEqual(AUGUST.history);
    expect(fillGaps(AUGUST, undefined)).toBe(AUGUST);
  });

  it('asks the edge every time rather than reusing a copy the browser kept', async () => {
    serve(AUGUST);
    await useMarket.getState().refresh();
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
  });

  it('moves default rates saved by an older version onto today\'s defaults, and only those', () => {
    const legacy = { terms: { ...DEFAULT_TERMS, variableRate: 0.065, fixedRate: 0.0685 } };
    expect((migrateConsolidation(legacy, 1) as typeof legacy).terms).toMatchObject(allPurposeRates());
    const own = { terms: { ...DEFAULT_TERMS, variableRate: 0.07, fixedRate: 0.0685 } };
    expect(migrateConsolidation(own, 1)).toBe(own);
    expect(migrateConsolidation(legacy, 2)).toBe(legacy);
  });
});
