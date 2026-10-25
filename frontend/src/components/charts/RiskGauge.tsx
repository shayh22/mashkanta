import { overallRisk, RISK_LABELS, type RiskIndicator, type RiskLevel } from '../../engine/risk';
import { formatPercent } from '../../lib/format';
import { Card } from '../ui';

const LEVEL_ICON: Record<RiskLevel, string> = { LOW: '✓', MEDIUM: '!', HIGH: '✕' };
const LEVEL_BADGE: Record<RiskLevel, string> = { LOW: 'badge-ok', MEDIUM: 'badge-warn', HIGH: 'badge-danger' };

/** Status hues are reserved for state and never reused as a series colour. */
const ZONE = { LOW: '#10B981', MEDIUM: '#F59E0B', HIGH: '#F43F5E' } as const;

const CX = 60;
const CY = 56;
const R = 46;

/** A point on the dial's half-circle, 0 at the left end and 1 at the right. */
function point(fraction: number, radius = R): [number, number] {
  const angle = Math.PI * (1 - Math.min(1, Math.max(0, fraction)));
  return [CX + radius * Math.cos(angle), CY - radius * Math.sin(angle)];
}

function arc(from: number, to: number): string {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
}

/** One semicircular dial with a needle, its zones drawn at the regulatory thresholds. */
export function Gauge({ indicator }: { indicator: RiskIndicator }) {
  const scale = (value: number) => value / indicator.scaleMax;
  const [nx, ny] = point(scale(indicator.value), R - 10);
  return (
    <figure
      className="flex flex-col items-center text-center"
      role="meter"
      aria-label={indicator.label}
      aria-valuemin={0}
      aria-valuemax={indicator.scaleMax}
      aria-valuenow={Math.min(indicator.value, indicator.scaleMax)}
      aria-valuetext={`${formatPercent(indicator.value, 1)} — ${RISK_LABELS[indicator.level]}`}
    >
      <svg viewBox="0 0 120 66" className="w-full max-w-[9.5rem]" aria-hidden>
        <path d={arc(0, 1)} stroke="rgb(var(--line))" strokeWidth={10} fill="none" strokeLinecap="round" />
        <path d={arc(0, scale(indicator.warn))} stroke={ZONE.LOW} strokeWidth={10} fill="none" strokeLinecap="round" />
        <path d={arc(scale(indicator.warn) + 0.012, scale(indicator.danger))} stroke={ZONE.MEDIUM} strokeWidth={10} fill="none" />
        <path d={arc(scale(indicator.danger) + 0.012, 1)} stroke={ZONE.HIGH} strokeWidth={10} fill="none" strokeLinecap="round" />
        <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="rgb(var(--ink))" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={4.5} fill="rgb(var(--ink))" stroke="rgb(var(--surface))" strokeWidth={2} />
      </svg>
      <figcaption className="mt-1">
        <span className="tabular block text-lg font-bold text-ink">{formatPercent(indicator.value, 1)}</span>
        <span className="block text-xs font-medium text-ink-muted">{indicator.label}</span>
        <span className={`${LEVEL_BADGE[indicator.level]} mt-1.5`}>
          <span aria-hidden>{LEVEL_ICON[indicator.level]}</span> {RISK_LABELS[indicator.level]}
        </span>
      </figcaption>
    </figure>
  );
}

/** A row of dials with the overall verdict and an explanation per indicator. */
export function RiskPanel({ indicators, title = 'מד יציבות תזרימית' }: { indicators: RiskIndicator[]; title?: string }) {
  const overall = overallRisk(indicators);
  return (
    <Card
      title={title}
      subtitle="רמזור לפי ספי בנק ישראל: שיעור מימון, החזר מהכנסה וחשיפה לריבית משתנה ולמדד."
      action={
        <span className={LEVEL_BADGE[overall]}>
          <span aria-hidden>{LEVEL_ICON[overall]}</span> {RISK_LABELS[overall]}
        </span>
      }
    >
      <div className={`grid grid-cols-2 gap-4 ${indicators.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>
        {indicators.map((indicator) => (
          <Gauge key={indicator.key} indicator={indicator} />
        ))}
      </div>
      <ul className="mt-4 space-y-1 border-t border-line pt-3 text-xs text-ink-soft">
        {indicators.map((indicator) => (
          <li key={indicator.key}>
            <span className="font-medium text-ink-muted">{indicator.label}:</span> {indicator.explanation}
          </li>
        ))}
      </ul>
    </Card>
  );
}
