import { checkManualMix, MANUAL_TRACKS, sharesTotal, type ManualShares } from '../engine/manualMix';
import { formatCurrency, formatPercent } from '../lib/format';
import { TRACK_LABEL } from '../lib/trackOptions';
import type { TrackType } from '../lib/types';
import { NumberInput } from './ui';

const PRESETS: { label: string; shares: ManualShares }[] = [
  { label: 'שליש שליש שליש', shares: { PRIME: 1 / 3, FIXED_LINKED: 1 / 3, VARIABLE_LINKED: 1 / 3 } },
  { label: 'פריים + קבועה לא צמודה', shares: { PRIME: 1 / 3, FIXED_UNLINKED: 2 / 3 } },
  { label: '100% קבועה לא צמודה', shares: { FIXED_UNLINKED: 1 } },
];

const TRACK_HINTS: Partial<Record<TrackType, string>> = {
  PRIME: 'משתנה כל חודש עם ריבית בנק ישראל · עד ⅔',
  FIXED_UNLINKED: 'החזר קבוע וידוע לכל התקופה',
  FIXED_LINKED: 'ריבית קבועה, הקרן צמודה למדד',
  VARIABLE_UNLINKED: 'הריבית מתעדכנת כל 5 שנים',
  VARIABLE_LINKED: 'מתעדכנת כל 5 שנים, צמודה למדד',
};

/**
 * The mix built by hand: a percentage per track, with the amount it means and the Directive 329
 * shape rules checked as the borrower types. An eligibility loan is outside the split and counts
 * towards the fixed-rate floor.
 */
export function ManualMixEditor({
  shares,
  loanAmount,
  eligibilityAmount,
  onChange,
  onReplace,
}: {
  shares: ManualShares;
  loanAmount: number;
  eligibilityAmount: number;
  onChange: (track: TrackType, share: number) => void;
  onReplace: (shares: ManualShares) => void;
}) {
  const locked = Math.min(eligibilityAmount, loanAmount);
  const free = loanAmount - locked;
  const check = checkManualMix(shares, loanAmount > 0 ? locked / loanAmount : 0);
  const total = sharesTotal(shares);

  return (
    <div>
      <p className="label">התמהיל שלכם</p>
      <p className="mb-3 text-xs text-ink-soft">
        חלקו {formatCurrency(free)} בין המסלולים
        {locked > 0 ? ` (הלוואת הזכאות, ${formatCurrency(locked)}, נשארת בנפרד)` : ''}. הריביות יתומחרו לפי ממוצעי
        השוק, בדיוק כמו בתמהיל האוטומטי.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <span className="self-center text-xs text-ink-soft">התחלה מ:</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted hover:border-brand-400 hover:text-brand-700"
            onClick={() => onReplace(preset.shares)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-line/60 rounded-xl border border-line">
        {MANUAL_TRACKS.map((track) => {
          const share = shares[track] ?? 0;
          return (
            <li key={track} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{TRACK_LABEL[track]}</p>
                <p className="text-xs text-ink-soft">{TRACK_HINTS[track]}</p>
              </div>
              <span className="tabular w-24 text-end text-xs text-ink-muted">{formatCurrency(free * share)}</span>
              <div className="flex w-24 items-center gap-1">
                <NumberInput
                  label={`אחוז במסלול ${TRACK_LABEL[track]}`}
                  value={share}
                  scale={100}
                  digits={0}
                  min={0}
                  max={100}
                  step={5}
                  onChange={(value) => onChange(track, value)}
                />
                <span className="text-xs text-ink-soft">%</span>
              </div>
            </li>
          );
        })}
        <li className="flex items-center justify-between px-3 py-2.5 text-sm">
          <span className="font-medium text-ink">סה"כ</span>
          <span className={`tabular font-semibold ${check.totalError ? 'text-negative' : 'text-positive'}`}>
            {Math.round(total * 100)}%
          </span>
        </li>
      </ul>

      <div className="mt-3 space-y-1 text-xs" aria-live="polite">
        {check.totalError && (
          <p className="text-negative" role="alert">
            {check.totalError}
          </p>
        )}
        {!check.totalError &&
          (check.violations.length === 0 ? (
            <p className="text-positive">
              ✓ עומד בכללי הוראה 329: פריים {formatPercent(check.primeShare, 0)}, משתנה {formatPercent(check.variableShare, 0)},
              קבועה {formatPercent(check.fixedShare, 0)}.
            </p>
          ) : (
            <ul className="space-y-1 text-caution">
              {check.violations.map((violation) => (
                <li key={violation}>⚠️ {violation} בנק לא יאשר תמהיל כזה — אפשר לחשב אותו להשוואה בלבד.</li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}
