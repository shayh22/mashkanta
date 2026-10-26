import type { TrackVerdict } from '../../engine/refinance';
import { formatCurrency, formatSignedCurrency } from '../../lib/format';
import { TRACK_LABEL } from '../../lib/trackOptions';
import { useRefinance } from '../../store/refinanceStore';
import { Card, ScrollRegion } from '../ui';

/**
 * Refinancing each track on its own. A track whose fee outweighs what re-pricing saves is better
 * left in place while the rest is refinanced — the one-click selection does exactly that.
 */
export function TrackVerdicts({ verdicts }: { verdicts: TrackVerdict[] }) {
  const { keptIds, setKeptIds } = useRefinance();
  if (verdicts.length === 0) {
    return null;
  }
  const losers = verdicts.filter((verdict) => !verdict.worthwhile).map((verdict) => verdict.id);
  const alreadyApplied = losers.length === keptIds.length && losers.every((id) => keptIds.includes(id));

  return (
    <Card
      title="כדאיות לפי מסלול"
      subtitle="מיחזור כל מסלול בנפרד, באותו בנק ובאותם תנאים. מסלול שעמלתו גבוהה מהחיסכון — עדיף להשאיר."
      action={
        <button
          type="button"
          className="btn-ghost"
          disabled={alreadyApplied}
          onClick={() => setKeptIds(losers)}
        >
          {losers.length === 0 && keptIds.length === 0
            ? 'כל המסלולים משתלמים'
            : alreadyApplied
              ? 'הבחירה מוחלת ✓'
              : 'מחזרו רק את המשתלמים'}
        </button>
      }
    >
      <ScrollRegion label="כדאיות לפי מסלול">
        <table className="tabular w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-soft">
              <th className="py-2 text-start font-medium" scope="col">
                מסלול
              </th>
              <th className="py-2 text-start font-medium" scope="col">
                עמלת פירעון
              </th>
              <th className="py-2 text-start font-medium" scope="col">
                חיסכון חודשי
              </th>
              <th className="py-2 text-start font-medium" scope="col">
                ערך נוכחי נקי
              </th>
              <th className="py-2 text-start font-medium" scope="col">
                המלצה
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {verdicts.map((verdict) => (
              <tr key={verdict.id}>
                <th className="py-2 text-start font-medium text-ink" scope="row">
                  {TRACK_LABEL[verdict.type]}
                </th>
                <td className="py-2">{formatCurrency(verdict.fee)}</td>
                <td className="py-2">{formatSignedCurrency(verdict.monthlySaving)}</td>
                <td className={`py-2 font-medium ${verdict.worthwhile ? 'text-positive' : 'text-negative'}`}>
                  {formatSignedCurrency(verdict.netPresentValue)}
                </td>
                <td className="py-2">
                  <span className={verdict.worthwhile ? 'badge-ok' : 'badge-neutral'}>
                    {verdict.worthwhile ? 'למחזר' : 'להשאיר'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
    </Card>
  );
}
