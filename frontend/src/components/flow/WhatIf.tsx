import { useMemo, useState } from 'react';
import { paymentAt } from '../../engine/amortization';
import type { OfferTrack } from '../../engine/flow/offers';
import { SHOCK_MONTH, whatIf } from '../../engine/flow/whatIf';
import { scenarioOf } from '../../lib/api';
import { formatCurrency, formatPercent } from '../../lib/format';
import { useMarketVersion } from '../../store/marketVersion';
import { useWizard } from '../../store/wizardStore';
import { Panel, Rows } from './parts';

/**
 * "What if": prime up by as much as three points and inflation at any rate up to six, a year from
 * now — the same mix priced again, against today's path.
 */
export function WhatIfPanel({ tracks }: { tracks: readonly OfferTrack[] }) {
  const macro = useWizard((state) => state.macro);
  const market = useMarketVersion();
  const base = useMemo(() => scenarioOf(macro), [macro, market]); // eslint-disable-line react-hooks/exhaustive-deps
  const [primeUp, setPrimeUp] = useState(0.01);
  const [cpi, setCpi] = useState(() => Math.round(base.cpiAnnual * 200) / 200);
  const result = useMemo(() => whatIf(tracks, base, primeUp, cpi), [tracks, base, primeUp, cpi]);
  if (!result) {
    return null;
  }
  const then = paymentAt(result.shocked, SHOCK_MONTH);
  const thenBase = paymentAt(result.base, SHOCK_MONTH);
  const more = (shocked: number, today: number) => {
    const delta = shocked - today;
    return Math.abs(delta) < 1 ? 'בלי שינוי' : `${delta > 0 ? '+' : '−'}${formatCurrency(Math.abs(delta))}`;
  };
  return (
    <Panel title="מה אם">
      <label className="flex flex-col gap-1 text-[15px] font-bold">
        <span className="flex justify-between">
          הפריים עולה, בעוד שנה
          <span className="tabular-nums">+{formatPercent(primeUp, 1)}</span>
        </span>
        <input type="range" min={0} max={0.03} step={0.0025} value={primeUp} onChange={(event) => setPrimeUp(Number(event.target.value))} aria-label="כמה הפריים עולה" className="accent-[rgb(var(--flow-strong))]" />
      </label>
      <label className="flex flex-col gap-1 text-[15px] font-bold">
        <span className="flex justify-between">
          אינפלציה בשנה
          <span className="tabular-nums">{formatPercent(cpi, 1)}</span>
        </span>
        <input type="range" min={0} max={0.06} step={0.005} value={cpi} onChange={(event) => setCpi(Number(event.target.value))} aria-label="אינפלציה בשנה" className="accent-[rgb(var(--flow-strong))]" />
      </label>
      <Rows
        rows={[
          ['ההחזר בעוד שנה', `${formatCurrency(then)} (${more(then, thenBase)})`, true],
          ['ההחזר הגבוה בדרך', `${formatCurrency(result.shocked.maxPayment)} (${more(result.shocked.maxPayment, result.base.maxPayment)})`],
          ['סך הכל תשלמו', `${formatCurrency(result.shocked.totalPaid)} (${more(result.shocked.totalPaid, result.base.totalPaid)})`],
        ]}
      />
      <p className="text-xs text-flow-muted">בסוגריים: מול התרחיש של היום, פריים {formatPercent(base.primeAnnual)} ואינפלציה {formatPercent(base.cpiAnnual, 1)}.</p>
    </Panel>
  );
}
