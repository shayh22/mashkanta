import { useState } from 'react';
import {
  SEGMENT_LABELS,
  SEGMENT_MAX_LTV,
  TOTAL_STEPS,
  useDerivedMetrics,
  useWizard,
} from '../store/wizardStore';
import type { BuyerSegment, MacroAnchors } from '../lib/types';
import { formatCurrency, formatPercent, formatTerm } from '../lib/format';
import { Card, CurrencyField, Field, ProgressSteps, RangeField, SegmentedControl } from './ui';

const STEP_LABELS = ['נכס והלוואה', 'פרופיל לווה', 'סיכון והעדפות'];

const RISK_DESCRIPTIONS = [
  'שמרן מאוד — ודאות מלאה בהחזר החודשי',
  'שמרן — מעדיף יציבות על פני חיסכון',
  'שמרן',
  'מאוזן־שמרני',
  'מאוזן — שילוב של ודאות וחיסכון',
  'מאוזן',
  'מאוזן־דינמי',
  'דינמי — נכונות לתנודתיות בהחזר',
  'דינמי',
  'דינמי מאוד — מקסימום חיסכון, מקסימום תנודתיות',
];

/**
 * The three-step onboarding wizard.
 *
 * Everything derived — LTV, the payment ceiling, the remaining equity — is computed and shown as
 * the user types. The borrower should never have to submit the form to find out they are over a
 * regulatory limit.
 */
export function MortgageWizard({ anchors, onSubmit }: { anchors?: MacroAnchors; onSubmit: () => void }) {
  const { step, profile, macro, setProfile, setSegment, setMacro, setPreferences, next, back, goTo } =
    useWizard();
  const metrics = useDerivedMetrics();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6">
        <ProgressSteps step={step} labels={STEP_LABELS} onSelect={goTo} />
      </div>

      <div className="animate-fade-up space-y-5">
        {step === 1 && (
          <>
            <Card
              title="הנכס וההלוואה"
              subtitle="הזינו את שווי הנכס והסכום המבוקש. שיעור המימון מחושב בזמן אמת מול תקרת בנק ישראל."
            >
              <div className="space-y-5">
                <SegmentedControl<BuyerSegment>
                  label="סיווג הרוכש"
                  value={profile.segment}
                  onChange={setSegment}
                  options={(Object.keys(SEGMENT_LABELS) as BuyerSegment[]).map((segment) => ({
                    value: segment,
                    title: SEGMENT_LABELS[segment].title,
                    subtitle: SEGMENT_LABELS[segment].subtitle,
                  }))}
                />

                <CurrencyField
                  label="שווי הנכס"
                  value={profile.propertyValue}
                  min={500_000}
                  max={20_000_000}
                  step={10_000}
                  onChange={(value) => setProfile({ propertyValue: value })}
                />

                <CurrencyField
                  label="סכום ההלוואה המבוקש"
                  hint={`הסכום המרבי לסיווג זה: ${formatCurrency(metrics.maxLoan)}`}
                  value={profile.loanAmount}
                  min={100_000}
                  max={Math.max(100_000, metrics.maxLoan)}
                  step={10_000}
                  onChange={(value) => setProfile({ loanAmount: value })}
                  invalid={metrics.ltvExceeded}
                />

                <RangeField
                  label="תקופת ההלוואה"
                  value={profile.termMonths / 12}
                  min={4}
                  max={30}
                  step={1}
                  display={formatTerm(profile.termMonths)}
                  onChange={(years) => setProfile({ termMonths: years * 12 })}
                  hint="תקופה ארוכה מקטינה את ההחזר החודשי ומייקרת משמעותית את העלות הכוללת."
                />

                <LtvMeter ltv={metrics.ltv} maxLtv={SEGMENT_MAX_LTV[profile.segment]} equity={metrics.equity} />
              </div>
            </Card>

            <MacroCard anchors={anchors} macro={macro} onChange={setMacro} />
          </>
        )}

        {step === 2 && (
          <Card
            title="פרופיל הלווה"
            subtitle="ההכנסה וההתחייבויות קובעות את יחס ההחזר, שהוא המגבלה הרגולטורית המחייבת ביותר."
          >
            <div className="space-y-5">
              <CurrencyField
                label="הכנסה חודשית נטו של משק הבית"
                hint="כולל הכנסת בן/בת הזוג ולווים נוספים."
                value={profile.monthlyNetIncome}
                min={5_000}
                max={150_000}
                step={500}
                onChange={(value) => setProfile({ monthlyNetIncome: value })}
              />

              <CurrencyField
                label="החזרי הלוואות קיימים"
                hint="נספרות הלוואות שנותרו להן יותר מ-18 חודשים."
                value={profile.existingMonthlyObligations}
                min={0}
                max={40_000}
                step={100}
                onChange={(value) => setProfile({ existingMonthlyObligations: value })}
              />

              <CurrencyField
                label="הלוואת זכאות ממשרד הבינוי והשיכון"
                hint="אם קיימת זכאות — הסכום ננעל בתמהיל בריבית המפוקחת."
                value={profile.eligibilityAmount}
                min={0}
                max={500_000}
                step={10_000}
                onChange={(value) => setProfile({ eligibilityAmount: value })}
              />

              <PaymentCapacityMeter
                comfortable={metrics.comfortablePayment}
                maximum={metrics.maxAffordablePayment}
                income={profile.monthlyNetIncome}
              />
            </div>
          </Card>
        )}

        {step === 3 && (
          <>
            <Card
              title="סיכון והעדפות"
              subtitle="ככל שתסכימו לתנודתיות גבוהה יותר, כך המנוע יוכל להוזיל את העלות הכוללת."
            >
              <div className="space-y-6">
                <RangeField
                  label="רמת נכונות לסיכון"
                  value={profile.riskTolerance}
                  min={1}
                  max={10}
                  step={1}
                  display={`${profile.riskTolerance} / 10`}
                  onChange={(value) => setProfile({ riskTolerance: value })}
                  hint={RISK_DESCRIPTIONS[profile.riskTolerance - 1]}
                />

                <CurrencyField
                  label="יכולת ספיגה חודשית"
                  hint="העלייה המרבית בהחזר החודשי שמשק הבית יכול לספוג בתרחיש קיצון."
                  value={profile.volatilityCapacity}
                  min={0}
                  max={10_000}
                  step={100}
                  onChange={(value) => setProfile({ volatilityCapacity: value })}
                />

                <PreferenceSliders
                  prime={profile.primePreference}
                  stable={profile.stablePreference}
                  dynamic={profile.dynamicPreference}
                  onChange={setPreferences}
                />
              </div>
            </Card>

            <LiquidityTimeline />
          </>
        )}
      </div>

      <div className="no-print mt-6 flex items-center justify-between gap-3">
        <button type="button" className="btn-ghost" onClick={back} disabled={step === 1}>
          חזרה
        </button>
        {step < TOTAL_STEPS ? (
          <button type="button" className="btn-primary" onClick={next} disabled={metrics.ltvExceeded}>
            המשך
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={onSubmit} disabled={metrics.ltvExceeded}>
            חשב תמהיל אופטימלי
          </button>
        )}
      </div>
    </div>
  );
}

/** Live LTV gauge that turns amber near the ceiling and rose above it. */
function LtvMeter({ ltv, maxLtv, equity }: { ltv: number; maxLtv: number; equity: number }) {
  const exceeded = ltv > maxLtv + 1e-9;
  const near = !exceeded && ltv > maxLtv - 0.025;
  const tone = exceeded ? 'bg-rose-500' : near ? 'bg-amber-500' : 'bg-emerald-500';
  // The bar is drawn against the ceiling, not against 100%, so "how close am I" is the visual.
  const width = Math.min(100, (ltv / maxLtv) * 100);

  return (
    <div className="card-muted">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink-muted">שיעור מימון (LTV)</span>
        <span className={`tabular text-lg font-semibold ${exceeded ? 'text-rose-600' : 'text-ink'}`}>
          {formatPercent(ltv, 1)}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${width}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-ink-soft">
        <span>הון עצמי: {formatCurrency(equity)}</span>
        <span>תקרה: {formatPercent(maxLtv, 0)}</span>
      </div>
      {exceeded && (
        <p className="mt-2 text-xs font-medium text-rose-600">
          שיעור המימון חורג מהתקרה הרגולטורית. הקטינו את סכום ההלוואה או הגדילו את ההון העצמי.
        </p>
      )}
    </div>
  );
}

/** Shows the 30% and 40% payment bands in shekels, which is how borrowers actually think. */
function PaymentCapacityMeter({
  comfortable,
  maximum,
  income,
}: {
  comfortable: number;
  maximum: number;
  income: number;
}) {
  return (
    <div className="card-muted">
      <p className="text-sm font-medium text-ink-muted">כושר ההחזר שלכם</p>
      <dl className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs text-ink-soft">אזור ירוק (עד 30% מההכנסה)</dt>
          <dd className="tabular mt-0.5 text-lg font-semibold text-emerald-600">
            {formatCurrency(comfortable)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">תקרה רגולטורית (40%)</dt>
          <dd className="tabular mt-0.5 text-lg font-semibold text-amber-600">
            {formatCurrency(maximum)}
          </dd>
        </div>
      </dl>
      {income > 0 && maximum === 0 && (
        <p className="mt-2 text-xs font-medium text-rose-600">
          ההתחייבויות הקיימות מנצלות את מלוא יחס ההחזר המותר. לא ניתן לאשר משכנתא נוספת במצב זה.
        </p>
      )}
    </div>
  );
}

/**
 * Three linked sliders that always sum to 100%.
 *
 * Moving one slider redistributes the remainder across the other two in proportion to their
 * current values, so the user's earlier choices are preserved rather than reset.
 */
function PreferenceSliders({
  prime,
  stable,
  dynamic,
  onChange,
}: {
  prime: number;
  stable: number;
  dynamic: number;
  onChange: (prime: number, stable: number, dynamic: number) => void;
}) {
  const rebalance = (changed: 'prime' | 'stable' | 'dynamic', value: number) => {
    const others: ('prime' | 'stable' | 'dynamic')[] = (['prime', 'stable', 'dynamic'] as const).filter(
      (key) => key !== changed,
    );
    const current = { prime, stable, dynamic };
    const remaining = 1 - value;
    const otherSum = others.reduce((sum, key) => sum + current[key], 0);

    const next = { ...current, [changed]: value };
    others.forEach((key) => {
      next[key] = otherSum > 0 ? (current[key] / otherSum) * remaining : remaining / 2;
    });
    onChange(next.prime, next.stable, next.dynamic);
  };

  return (
    <div>
      <p className="label">העדפת תמהיל</p>
      <p className="mb-3 text-xs text-ink-soft">
        חלוקה מבוקשת בין המסלולים. המנוע מתייחס אליה כהעדפה — הרגולציה והתקציב גוברים עליה.
      </p>
      <div className="space-y-4">
        <RangeField
          label="פריים"
          value={Math.round(prime * 100)}
          min={0}
          max={66}
          step={1}
          display={formatPercent(prime, 0)}
          onChange={(value) => rebalance('prime', value / 100)}
        />
        <RangeField
          label="ריבית קבועה (יציב)"
          value={Math.round(stable * 100)}
          min={33}
          max={100}
          step={1}
          display={formatPercent(stable, 0)}
          onChange={(value) => rebalance('stable', value / 100)}
        />
        <RangeField
          label="ריבית משתנה (דינמי)"
          value={Math.round(dynamic * 100)}
          min={0}
          max={66}
          step={1}
          display={formatPercent(dynamic, 0)}
          onChange={(value) => rebalance('dynamic', value / 100)}
        />
      </div>
    </div>
  );
}

/** Optional overrides for the published macro anchors. */
function MacroCard({
  anchors,
  macro,
  onChange,
}: {
  anchors?: MacroAnchors;
  macro: { prime?: number; cpiAnnual?: number };
  onChange: (patch: { prime?: number; cpiAnnual?: number }) => void;
}) {
  const prime = macro.prime ?? anchors?.prime ?? 0.0575;
  const cpi = macro.cpiAnnual ?? anchors?.cpiAnnual ?? 0.024;

  return (
    <Card
      title="הנחות מאקרו"
      subtitle={anchors?.source ?? 'ערכי בסיס'}
      action={
        <button type="button" className="text-xs font-medium text-brand-600" onClick={() => onChange({ prime: undefined, cpiAnnual: undefined })}>
          איפוס לערכים המפורסמים
        </button>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <RangeField
          label="ריבית פריים"
          value={Math.round(prime * 10_000)}
          min={100}
          max={1_200}
          step={5}
          display={formatPercent(prime)}
          onChange={(value) => onChange({ prime: value / 10_000 })}
        />
        <RangeField
          label="אינפלציה שנתית צפויה"
          value={Math.round(cpi * 10_000)}
          min={-100}
          max={800}
          step={5}
          display={formatPercent(cpi)}
          onChange={(value) => onChange({ cpiAnnual: value / 10_000 })}
        />
      </div>
      {anchors && (
        <p className="mt-3 text-xs text-ink-soft">
          עודכן לאחרונה: פריים {anchors.primeUpdatedOn}, מדד {anchors.cpiUpdatedOn}. המדד הבא מתפרסם ב-{anchors.nextCpiOn}.
        </p>
      )}
    </Card>
  );
}

/** The liquidity timeline: future lump sums that change which tracks make sense. */
function LiquidityTimeline() {
  const { profile, addLiquidityEvent, removeLiquidityEvent } = useWizard();
  const [month, setMonth] = useState(60);
  const [amount, setAmount] = useState(200_000);
  const [source, setSource] = useState('קרן השתלמות');

  return (
    <Card
      title="אירועי נזילות צפויים"
      subtitle="סכומים שצפויים להיכנס בעתיד — קרן השתלמות, בונוס, ירושה או תמורת דירה קודמת."
    >
      {profile.liquidityEvents.length > 0 && (
        <ul className="mb-4 space-y-2">
          {profile.liquidityEvents.map((event, index) => (
            <li
              key={`${event.month}-${event.source}-${index}`}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
            >
              <span className="text-sm text-ink-muted">
                {event.source} · חודש {event.month} · {formatCurrency(event.amount)}
                {event.earmarkedForPrepayment && (
                  <span className="badge-neutral ms-2">מיועד לפירעון מוקדם</span>
                )}
              </span>
              <button
                type="button"
                className="text-xs font-medium text-rose-600"
                onClick={() => removeLiquidityEvent(index)}
              >
                הסרה
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="מקור">
          <input className="input" value={source} onChange={(event) => setSource(event.target.value)} />
        </Field>
        <Field label="חודש">
          <input
            className="input tabular"
            type="number"
            min={1}
            max={360}
            dir="ltr"
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
          />
        </Field>
        <Field label="סכום">
          <input
            className="input tabular"
            type="number"
            min={0}
            step={10_000}
            dir="ltr"
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
          />
        </Field>
        <div className="flex items-end">
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => addLiquidityEvent({ month, amount, source, earmarkedForPrepayment: true })}
          >
            הוספה
          </button>
        </div>
      </div>
      <p className="hint">
        סכום המיועד לפירעון מוקדם מזיז את התמהיל אל מסלולים ללא עמלת היוון, כדי שלא תשלמו קנס על הפירעון.
      </p>
    </Card>
  );
}
