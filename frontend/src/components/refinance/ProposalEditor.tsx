import type { ProposedTrack, RouteKind } from '../../engine/refinance';
import type { TrackType } from '../../lib/types';
import { formatCurrency, formatPercent, formatTerm } from '../../lib/format';
import { TRACK_LABEL, TRACK_OPTIONS } from '../../lib/trackOptions';
import { useRefinance } from '../../store/refinanceStore';
import { ScrollRegion, Card, NumberInput, RangeField, SegmentedControl, Toggle } from '../ui';

const ROUTE_TITLES: Record<RouteKind, { title: string; subtitle: string }> = {
  INTERNAL: { title: 'מיחזור פנימי', subtitle: 'באותו בנק — ללא עלויות מעבר' },
  EXTERNAL: { title: 'מעבר לבנק מתחרה', subtitle: 'שמאות, פתיחת תיק ורישום בטחונות' },
};

const COST_FIELDS: { key: 'fileOpening' | 'appraisal' | 'registration' | 'legal'; label: string }[] = [
  { key: 'fileOpening', label: 'פתיחת תיק' },
  { key: 'appraisal', label: 'שמאות' },
  { key: 'registration', label: 'רישום בטחונות' },
  { key: 'legal', label: 'ייעוץ / משפטי' },
];

/** The replacement mortgage: a like-for-like re-pricing at the market, or a hand-built mix. */
export function ProposalEditor({ proposal }: { proposal: ProposedTrack[] }) {
  const state = useRefinance();

  return (
    <Card
      title="ההצעה החלופית"
      subtitle="ברירת המחדל מתמחרת את אותם מסלולים ותקופות לפי ריביות השוק — כך רואים את שיפור המחיר בלבד."
    >
      <SegmentedControl
        label="מקור ההצעה"
        value={state.proposalMode}
        options={[
          { value: 'AUTO', title: 'אוטומטית לפי השוק', subtitle: 'אותו תמהיל, מחיר שוק' },
          { value: 'MANUAL', title: 'הצעה שקיבלתי', subtitle: 'עריכה ידנית של המסלולים' },
        ]}
        onChange={(mode) =>
          // The manual table holds only what is being refinanced; kept tracks are added back by
          // the analysis, so seeding them here would freeze them in if they are later un-kept.
          state.setProposalMode(
            mode,
            proposal.filter((track) => !track.carriedOver),
          )
        }
      />

      {state.proposalMode === 'AUTO' ? (
        <div className="mt-5 space-y-4">
          <RangeField
            label="רמת המיקוח"
            value={state.percentile}
            min={0}
            max={1}
            step={0.05}
            display={
              state.percentile <= 0.2
                ? 'מצוינת (עשירון עליון)'
                : state.percentile <= 0.45
                  ? 'טובה'
                  : state.percentile <= 0.6
                    ? 'ממוצע השוק'
                    : 'הצעה ראשונה ללא מיקוח'
            }
            onChange={state.setPercentile}
            hint="ממקם את הריבית בהתפלגות ממוצעי בנק ישראל לפי מסלול ושיעור מימון."
          />
          <ul className="grid gap-2 sm:grid-cols-2">
            {proposal.map((track) => (
              <li key={track.id} className="card-muted flex items-center justify-between !p-3 text-sm">
                <span className="font-medium text-ink">
                  {TRACK_LABEL[track.type]}
                  {track.carriedOver && <span className="badge-neutral ms-2">נשאר כמות שהוא</span>}
                </span>
                <span className="tabular text-ink-muted">
                  {formatCurrency(track.amount)} · {formatPercent(track.annualRate)} ·{' '}
                  {formatTerm(track.termMonths)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-5">
          <ScrollRegion label="טבלת מסלולים מוצעים">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-soft">
                  <th className="py-2 text-start font-medium">מסלול</th>
                  <th className="py-2 text-start font-medium">סכום (₪)</th>
                  <th className="py-2 text-start font-medium">ריבית (%)</th>
                  <th className="py-2 text-start font-medium">חודשים</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {state.manualProposal.map((track) => (
                  <tr key={track.id}>
                    <td className="py-2 pe-2">
                      <select
                        className="input py-1.5"
                        aria-label="סוג מסלול מוצע"
                        value={track.type}
                        onChange={(event) =>
                          state.updateProposed(track.id, { type: event.target.value as TrackType })
                        }
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
                        label="סכום מוצע"
                        value={track.amount}
                        min={0}
                        step={10_000}
                        digits={0}
                        onChange={(value) => state.updateProposed(track.id, { amount: value })}
                      />
                    </td>
                    <td className="py-2 pe-2">
                      <NumberInput
                        label="ריבית מוצעת באחוזים"
                        value={track.annualRate}
                        scale={100}
                        min={0}
                        max={25}
                        step={0.05}
                        onChange={(value) => state.updateProposed(track.id, { annualRate: value })}
                      />
                    </td>
                    <td className="py-2 pe-2">
                      <NumberInput
                        label="תקופה מוצעת בחודשים"
                        value={track.termMonths}
                        min={12}
                        max={360}
                        step={12}
                        digits={0}
                        onChange={(value) =>
                          state.updateProposed(track.id, { termMonths: Math.round(value) })
                        }
                      />
                    </td>
                    <td className="py-2 text-end">
                      <button
                        type="button"
                        className="text-xs font-medium text-negative"
                        onClick={() => state.removeProposed(track.id)}
                      >
                        הסרה
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
          <button type="button" className="btn-ghost mt-3" onClick={state.addProposed}>
            הוספת מסלול מוצע
          </button>
        </div>
      )}
    </Card>
  );
}

/** Timing and switching costs — the inputs that decide how much of the saving survives. */
export function RefinanceSettings() {
  const state = useRefinance();
  return (
    <Card title="מועד, הודעה ועלויות מעבר" subtitle="כל הסכומים ניתנים לעריכה; ברירות המחדל הן הערכה בלבד.">
      <div className="grid gap-5 sm:grid-cols-2">
        <Toggle
          label="נמסרה הודעה מוקדמת (10–45 יום)"
          hint="חוסכת עמלת אי-הודעה של 0.1% מהסכום הנפרע"
          checked={state.noticeGiven}
          onChange={state.setNoticeGiven}
        />
        <div>
          <label className="label" htmlFor="refi-day">
            יום הפירעון בחודש
          </label>
          <input
            id="refi-day"
            type="number"
            dir="ltr"
            className="input tabular"
            min={1}
            max={31}
            value={state.dayOfMonth}
            onChange={(event) => state.setDayOfMonth(Number(event.target.value))}
          />
          <p className="hint">פירעון מה-16 לחודש חוסך את עמלת המדד הממוצע במסלולים צמודים.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {(['INTERNAL', 'EXTERNAL'] as const).map((kind) => (
          <fieldset key={kind} className="card-muted">
            <legend className="sr-only">{ROUTE_TITLES[kind].title}</legend>
            <p className="text-sm font-semibold text-ink">{ROUTE_TITLES[kind].title}</p>
            <p className="hint mt-0.5">{ROUTE_TITLES[kind].subtitle}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {COST_FIELDS.map((field) => (
                <label key={field.key} className="block text-xs text-ink-soft">
                  {field.label} (₪)
                  <NumberInput
                    label={`${field.label} — ${ROUTE_TITLES[kind].title}`}
                    className="mt-1"
                    value={state.routes[kind].costs[field.key]}
                    min={0}
                    step={100}
                    digits={0}
                    onChange={(value) => state.setRouteCost(kind, { [field.key]: value })}
                  />
                </label>
              ))}
              <label className="col-span-2 block text-xs text-ink-soft">
                שינוי ריבית מול ההצעה (נקודות אחוז)
                <NumberInput
                  label={`שינוי ריבית — ${ROUTE_TITLES[kind].title}`}
                  className="mt-1"
                  value={state.routes[kind].rateDelta}
                  scale={100}
                  min={-2}
                  max={2}
                  step={0.05}
                  onChange={(value) => state.setRouteDelta(kind, value)}
                />
              </label>
            </div>
          </fieldset>
        ))}
      </div>
    </Card>
  );
}
