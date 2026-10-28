import { sharesTotal, type ManualShares } from '../../engine/manualMix';

/** Shares that add up to the whole: the ones a manual mix is priced with. */
export const usableShares = (shares: ManualShares | undefined) => (shares && Math.abs(sharesTotal(shares) - 1) <= 0.005 ? shares : undefined);
