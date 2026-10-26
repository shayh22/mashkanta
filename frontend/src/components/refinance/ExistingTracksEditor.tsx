import { useCallback } from 'react';
import type { DocumentJob, TrackType } from '../../lib/types';
import { formatCurrency, formatPercent } from '../../lib/format';
import { TRACK_OPTIONS } from '../../lib/trackOptions';
import { newTrackId, outstandingBalance, useRefinance } from '../../store/refinanceStore';
import { ApprovalUploader } from '../ApprovalUploader';
import { ScrollRegion, Card, CurrencyField, NumberInput } from '../ui';

/**
 * The mortgage as it stands today, one row per track — what a payoff statement (דוח יתרות לסילוק)
 * lists. Seniority matters as much as the rate: it decides the discount on the capitalization fee.
 */
export function ExistingTracksEditor() {
  const {
    tracks,
    propertyValue,
    setPropertyValue,
    addTrack,
    updateTrack,
    removeTrack,
    setTracks,
    keptIds,
    toggleKept,
  } = useRefinance();
  const balance = outstandingBalance(tracks);

  const seedFromDocument = useCallback(
    (job: DocumentJob) => {
      const extracted = job.result?.tracks ?? [];
      if (extracted.length === 0) {
        return;
      }
      setTracks(
        extracted.map((track) => ({
          id: newTrackId(),
          type: track.track,
          balance: track.amount,
          annualRate: track.annualRate,
          remainingMonths: track.termMonths > 0 ? track.termMonths : 240,
          monthsElapsed: 36,
        })),
      );
    },
    [setTracks],
  );

  return (
    <div className="space-y-5">
      <Card
        title="המשכנתא הקיימת"
        subtitle="הזינו את היתרות מתוך דוח יתרות לסילוק — סכום, ריבית נוכחית, יתרת תקופה וותק לכל מסלול."
        action={
          <button type="button" className="btn-ghost" onClick={addTrack}>
            הוספת מסלול
          </button>
        }
      >
        <div className="mb-5 max-w-sm">
          <CurrencyField
            label="שווי הנכס היום"
            value={propertyValue}
            min={300_000}
            max={10_000_000}
            step={50_000}
            onChange={setPropertyValue}
            hint={`שיעור מימון נוכחי: ${formatPercent(propertyValue > 0 ? balance / propertyValue : 0, 1)} — קובע את מדרגת הריבית בשוק`}
          />
        </div>

        {tracks.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft">הוסיפו מסלול או העלו מסמך כדי להתחיל.</p>
        ) : (
          <ScrollRegion label="טבלת מסלולים קיימים">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-soft">
                  <th className="py-2 text-start font-medium">למחזר</th>
                  <th className="py-2 text-start font-medium">מסלול</th>
                  <th className="py-2 text-start font-medium">יתרת קרן (₪)</th>
                  <th className="py-2 text-start font-medium">ריבית נוכחית (%)</th>
                  <th className="py-2 text-start font-medium">חודשים שנותרו</th>
                  <th className="py-2 text-start font-medium">ותק (חודשים)</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {tracks.map((track) => (
                  <tr key={track.id} className={keptIds.includes(track.id) ? 'opacity-60' : ''}>
                    <td className="py-2 pe-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-600"
                        checked={track.type !== 'ELIGIBILITY' && !keptIds.includes(track.id)}
                        disabled={track.type === 'ELIGIBILITY'}
                        aria-label={`למחזר את מסלול ${TRACK_OPTIONS.find((o) => o.value === track.type)?.label ?? ''}`}
                        title={
                          track.type === 'ELIGIBILITY' ? 'הלוואת זכאות נשארת תמיד — היא מסובסדת' : undefined
                        }
                        onChange={() => toggleKept(track.id)}
                      />
                    </td>
                    <td className="py-2 pe-2">
                      <select
                        className="input min-w-[9rem] py-1.5"
                        value={track.type}
                        aria-label="סוג מסלול"
                        onChange={(event) => updateTrack(track.id, { type: event.target.value as TrackType })}
                      >
                        {TRACK_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pe-2">
                      <NumberInput
                        label="יתרת קרן"
                        value={track.balance}
                        min={0}
                        step={10_000}
                        digits={0}
                        onChange={(value) => updateTrack(track.id, { balance: value })}
                      />
                    </td>
                    <td className="py-2 pe-2">
                      <NumberInput
                        label="ריבית נוכחית באחוזים"
                        value={track.annualRate}
                        scale={100}
                        min={0}
                        max={25}
                        step={0.05}
                        onChange={(value) => updateTrack(track.id, { annualRate: value })}
                      />
                    </td>
                    <td className="py-2 pe-2">
                      <NumberInput
                        label="חודשים שנותרו"
                        value={track.remainingMonths}
                        min={1}
                        max={360}
                        step={12}
                        digits={0}
                        onChange={(value) => updateTrack(track.id, { remainingMonths: Math.round(value) })}
                      />
                    </td>
                    <td className="py-2 pe-2">
                      <NumberInput
                        label="חודשים מאז נטילת ההלוואה"
                        value={track.monthsElapsed}
                        min={0}
                        max={360}
                        step={6}
                        digits={0}
                        onChange={(value) => updateTrack(track.id, { monthsElapsed: Math.round(value) })}
                      />
                    </td>
                    <td className="py-2 text-end">
                      <button
                        type="button"
                        className="text-xs font-medium text-negative"
                        onClick={() => removeTrack(track.id)}
                        aria-label={`הסרת מסלול ${TRACK_OPTIONS.find((o) => o.value === track.type)?.label ?? ''}`}
                      >
                        הסרה
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-ink-muted">
              סך היתרה לסילוק: <span className="tabular font-semibold">{formatCurrency(balance)}</span>
            </p>
          </ScrollRegion>
        )}
      </Card>

      <details className="card group">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          ייבוא מסלולים ממסמך (אישור עקרוני או דוח יתרות)
        </summary>
        <div className="mt-4">
          <ApprovalUploader
            ltv={propertyValue > 0 ? balance / propertyValue : 0.5}
            onExtracted={seedFromDocument}
          />
          <p className="hint">
            הקובץ מעובד בדפדפן בלבד. אחרי הייבוא בדקו ועדכנו את הוותק — הוא אינו מופיע בדרך כלל במסמך.
          </p>
        </div>
      </details>
    </div>
  );
}
