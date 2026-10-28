import { priceMix } from '../amortization';
import type { MacroScenario } from '../scenario';
import { trackFromRate } from '../tracks';
import type { TrackType } from '../../lib/types';

/**
 * The offers a household got from the banks — each a set of tracks, read from an approval in
 * principle or typed in — priced the same way as the engine's own mix, so they can stand side by
 * side: the first payment, the worst one on the way, and what the loan costs over its life.
 */

export interface OfferTrack {
  readonly type: TrackType;
  readonly amount: number;
  /** Nominal, a year: 0.05 for 5%. */
  readonly annualRate: number;
  readonly termMonths: number;
}

export interface MortgageOffer {
  readonly id: string;
  /** Which result it is for: the purchase, or the refinance. */
  readonly for: 'BUY' | 'REFINANCE';
  readonly bank: string;
  readonly tracks: readonly OfferTrack[];
}

export interface PricedOffer {
  readonly label: string;
  readonly amount: number;
  readonly initialPayment: number;
  readonly maxPayment: number;
  readonly totalPaid: number;
  /** Interest and indexation over the life of the loan. */
  readonly cost: number;
  readonly rate: number;
}

const validTrack = (track: OfferTrack) =>
  track.amount > 0 && track.annualRate > 0 && track.annualRate < 0.25 && track.termMonths >= 12 && track.termMonths <= 480;

/** An offer priced on the day's scenario; undefined while no track of it can be priced. */
export function priceOffer(offer: Pick<MortgageOffer, 'bank' | 'tracks'>, scenario: MacroScenario): PricedOffer | undefined {
  const tracks = offer.tracks.filter(validTrack);
  if (tracks.length === 0) {
    return undefined;
  }
  const mix = priceMix(
    tracks.map((track) => trackFromRate(track.type, track.amount, track.termMonths, track.annualRate, scenario)),
    scenario,
  );
  return {
    label: offer.bank,
    amount: mix.totalPrincipal,
    initialPayment: mix.initialPayment,
    maxPayment: mix.maxPayment,
    totalPaid: mix.totalPaid,
    cost: mix.totalInterest + mix.totalIndexation,
    rate: mix.weightedInitialRate,
  };
}

/**
 * Cheapest first, by what each shekel borrowed costs over the loan: offers for different amounts
 * still compare fairly.
 */
export function rankOffers<T extends PricedOffer>(offers: readonly T[]): T[] {
  return [...offers].sort((a, b) => a.cost / a.amount - b.cost / b.amount);
}
