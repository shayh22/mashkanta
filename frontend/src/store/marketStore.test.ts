import { afterEach, describe, expect, it, vi } from 'vitest';
import { marketFromBoi, type LiveMarket } from '../engine/boiMarket';
import { applyLiveMarket, liveMarket } from '../engine/liveMarket';
import { allPurposeRates, DEFAULT_TERMS, useConsolidation } from './consolidationStore';
import br from '../engine/__fixtures__/boi/br.csv?raw';
import loans from '../engine/__fixtures__/boi/loans.csv?raw';
import mortgages from '../engine/__fixtures__/boi/mortgages.csv?raw';
import zcm from '../engine/__fixtures__/boi/zcm.csv?raw';
import { useMarket } from './marketStore';

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
});
