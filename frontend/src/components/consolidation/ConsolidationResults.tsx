import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CONSOLIDATION_LIMITS, repayWithExtra, type ConsolidationAnalysis } from '../../engine/consolidation';
import { formatCompact, formatCurrency, formatPercent, formatSignedCurrency, formatTerm } from '../../lib/format';
import { useConsolidation } from '../../store/consolidationStore';
import { Card, LevelBadge, RangeField, Stat } from '../ui';
import { WaterfallChart } from '../charts/WaterfallChart';
import { RiskPanel } from '../charts/RiskGauge';
import { ltvRisk, primeRisk, ptiRisk } from '../../engine/risk';

const LEVEL_TEXT = { OK: 'תקין', WARNING: 'לתשומת לב', BLOCKING: 'חוסם' } as const;

/** Feasibility under the October 2026 rules: the ratio, the room left in shekels, and the LTV. */
export function RegulatoryPanel({ analysis }: { analysis: ConsolidationAnalysis }) {
  const r = analysis.regulation;
  const verdict = !r.feasible
    ? { className: 'border-rose-500/30 bg-rose-500/10 text-negative', icon: '✕', title: 'לא עומד בהוראה 329 כפי שהוגדר' }
    : !r.bankFeasible
      ? { className: 'border-amber-500/30 bg-amber-500/10 text-caution', icon: '!', title: 'עומד ברגולציה, מעל מדיניות 40% המקובלת בבנקים' }
      : { className: 'border-emerald-500/30 bg-emerald-500/10 text-positive', icon: '✓', title: 'בר-ביצוע לפי הוראת בנק ישראל מ-1.10.2026' };

  return (
    <div className="space-y-5">
      <section className={`animate-fade-up rounded-2xl border p-5 ${verdict.className}`} aria-live="polite">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface/70 text-lg font-bold" aria-hidden>
            {verdict.icon}
          </span>
          <div>
            <h2 className="text-lg font-bold">{verdict.title}</h2>
            <p className="mt-1 text-sm">
              הסכום המקסימלי שניתן לאחד במסגרת LTV ו-PTI (תקרת 40%):{' '}
              <span className="tabular font-semibold">{formatCurrency(r.maxFeasibleLoan)}</span>
              {r.exemptionRemaining > 0 && (
                <>
                  {' '}· מסלול פטור עד <span className="tabular font-semibold">{formatCurrency(r.exemptionRemaining)}</span>
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      <Card title="מרווח אשראי פנוי" subtitle="(החזר חדש + החזר קיים על הנכס) ÷ (הכנסה − התחייבויות אחרות מעל 18 חודשים)">
        <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat
            label="PTI לפי 1.10.2026"
            value={Number.isFinite(r.pti) ? formatPercent(r.pti, 1) : '—'}
            tone={r.ptiExempt || r.pti <= CONSOLIDATION_LIMITS.PTI_BANK_POLICY ? 'positive' : 'negative'}
            note={r.ptiExempt ? 'פטור — עד 120,000 ₪' : `בנוסחה הקודמת: ${Number.isFinite(r.legacyPti) ? formatPercent(r.legacyPti, 1) : '—'}`}
          />
          <Stat label="החזר פנוי (תקרת 40%)" value={formatCurrency(r.maxPaymentBank)} note={`בתקרת 50%: ${formatCurrency(r.maxPaymentRegulatory)}`} />
          <Stat
            label="כושר אשראי (40%)"
            value={formatCurrency(r.creditRoomBank)}
            note={`בתנאי ההלוואה; בתקרת 50%: ${formatCurrency(r.creditRoomRegulatory)}`}
          />
          <Stat
            label="מחיר התיקון"
            value={formatSignedCurrency(r.maxPaymentRegulatory - r.legacyMaxPaymentRegulatory)}
            note="שינוי בהחזר הפנוי מול הנוסחה הקודמת"
            tone="negative"
          />
        </dl>
        <dl className="mt-5 grid grid-cols-2 gap-5 border-t border-line pt-5 sm:grid-cols-4">
          <Stat label="הכנסה נטו (N)" value={formatCurrency(r.netIncome)} />
          <Stat label="התחייבויות אחרות (F)" value={formatCurrency(r.otherObligations)} />
          <Stat label="החזר קיים על הנכס (E)" value={formatCurrency(r.existingSecuredPayment)} />
          <Stat label="LTV מצטבר" value={formatPercent(r.ltvAfter, 1)} note={`לפני: ${formatPercent(r.ltvBefore, 1)} · תקרה ${formatCurrency(r.maxSecuredTotal)}`} />
        </dl>
      </Card>

      <Card title="בדיקה רגולטורית" subtitle="הוראת ניהול בנקאי תקין 329, כנוסחה מ-1.10.2026 (חוזר ח-06-2840)">
        <ul className="space-y-3">
          {r.findings.map((item) => (
            <li key={item.code} className="flex items-start gap-3">
              <LevelBadge level={item.level}>{LEVEL_TEXT[item.level]}</LevelBadge>
              <div>
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                <p className="mt-0.5 text-sm text-ink-muted">{item.message}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/** Cash-flow relief now against the lifetime cost of stretching short debt over a long term. */
export function BeforeAfterPanel({ analysis }: { analysis: ConsolidationAnalysis }) {
  const data = analysis.timeline
    .filter((point) => point.month === 1 || point.month % 3 === 0)
    .map((point) => ({ month: point.month, before: point.before, after: point.after }));
  const last = data.at(-1)?.month ?? 12;
  const step = last > 15 * 12 ? 60 : last > 6 * 12 ? 24 : 12;
  const ticks: number[] = [];
  for (let month = step; month <= last; month += step) {
    ticks.push(month);
  }

  return (
    <Card title="לפני ואחרי" subtitle="חמצן תזרימי מיידי מול העלות הכוללת לאורך חיי ההלוואה.">
      <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <Stat label="סך החזרים היום" value={formatCurrency(analysis.paymentBefore)} />
        <Stat label="אחרי איחוד" value={formatCurrency(analysis.paymentAfter)} />
        <Stat
          label="חמצן תזרימי"
          value={`${formatSignedCurrency(analysis.monthlyRelief)} לחודש`}
          tone={analysis.monthlyRelief > 0 ? 'positive' : 'negative'}
        />
        <Stat
          label="התייקרות כוללת"
          value={formatSignedCurrency(analysis.extraLifetimeCost)}
          tone={analysis.extraLifetimeCost > 0 ? 'negative' : 'positive'}
          note={`${formatCurrency(analysis.newLoanTotalPaid)} מול ${formatCurrency(analysis.includedRemainingCost)} היום`}
        />
      </dl>

      <div className="mt-6 h-64 w-full text-ink-soft" dir="ltr" role="img" aria-label="החזר חודשי כולל לפני ואחרי האיחוד לאורך הזמן">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} vertical={false} />
            <XAxis
              dataKey="month"
              type="number"
              domain={[1, 'dataMax']}
              ticks={ticks}
              tickFormatter={(month: number) => `${month / 12}`}
              tick={{ fontSize: 12, fill: 'currentColor' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12, fill: 'currentColor' }} tickLine={false} axisLine={false} width={64} />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              labelFormatter={(month: number) => `חודש ${month}`}
              contentStyle={{
                direction: 'rtl',
                borderRadius: 12,
                fontSize: 12,
                background: 'rgb(var(--surface))',
                borderColor: 'rgb(var(--line))',
                color: 'rgb(var(--ink))',
              }}
              cursor={{ stroke: 'currentColor', strokeOpacity: 0.3 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="stepAfter" dataKey="before" name="בלי איחוד" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
            <Line type="stepAfter" dataKey="after" name="עם איחוד" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        ההחזר החודשי הכולל (משכנתא + הלוואות) לאורך השנים. בלי איחוד ההחזר גבוה היום ויורד כשההלוואות מסתיימות;
        עם איחוד הוא נמוך יותר אך נמשך {formatTerm(analysis.allocation.termMonths)}.
      </p>
    </Card>
  );
}

/** What happens if part of the monthly relief is paid back into the loan to shorten it. */
export function ShorteningSimulator({ analysis }: { analysis: ConsolidationAnalysis }) {
  const { reinvestShare, setReinvestShare } = useConsolidation();
  const extraCash = useConsolidation((state) => state.terms.extraCash);
  const relief = Math.max(0, analysis.monthlyRelief);
  const extra = relief * reinvestShare;
  const result = repayWithExtra(analysis.allocation, extra);
  const baseline = analysis.includedRemainingCost + extraCash;
  const difference = result.totalPaid - baseline;

  if (analysis.allocation.amount <= 0) {
    return null;
  }

  return (
    <Card
      title="קיצור תקופה חכם"
      subtitle="מפנים חלק מהחיסכון החודשי להחזר מוקדם — תחילה לפריים, שבו אין עמלת היוון — כדי לבלום את ההתייקרות."
    >
      <RangeField
        label="חלק מהחמצן התזרימי שמוחזר להלוואה"
        value={reinvestShare}
        min={0}
        max={1}
        step={0.05}
        display={`${formatPercent(reinvestShare, 0)} · ${formatCurrency(extra)} לחודש`}
        onChange={setReinvestShare}
      />
      <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
        <Stat label="החזר חודשי בפועל" value={formatCurrency(analysis.allocation.payment + extra)} />
        <Stat label="סיום ההלוואה" value={formatTerm(result.months)} note={`במקום ${formatTerm(analysis.allocation.termMonths)}`} />
        <Stat label="סך תשלומים" value={formatCurrency(result.totalPaid)} />
        <Stat
          label="מול להשאיר את החובות"
          value={formatSignedCurrency(difference)}
          tone={difference > 0 ? 'negative' : 'positive'}
        />
      </dl>
      <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
        {analysis.breakEvenShare === undefined
          ? 'גם החזרת כל החיסכון אינה מונעת התייקרות — שקלו תקופה קצרה יותר או לאחד פחות הלוואות.'
          : analysis.breakEvenShare === 0
            ? 'האיחוד זול יותר כבר בלי החזר מוקדם.'
            : `החזרת ${formatPercent(analysis.breakEvenShare, 0)} מהחיסכון (${formatCurrency(relief * analysis.breakEvenShare)} בחודש) מספיקה כדי שהאיחוד לא יעלה יותר מהמצב היום — ועדיין יישאר חמצן של ${formatCurrency(relief * (1 - analysis.breakEvenShare))} בחודש.`}
      </p>
    </Card>
  );
}

/** Today's total payment, each debt that disappears, the new loan, and the total after. */
export function ConsolidationWaterfall({ analysis }: { analysis: ConsolidationAnalysis }) {
  return (
    <WaterfallChart
      title="מפל ההחזר החודשי"
      subtitle="סך ההחזרים היום, ההלוואות שנסגרות, ההלוואה החדשה — וסך ההחזרים אחרי האיחוד."
      start={analysis.paymentBefore}
      steps={[
        ...analysis.included.map((debt) => ({ label: debt.label, delta: -debt.monthlyPayment })),
        { label: 'הלוואה חדשה', delta: analysis.allocation.payment },
      ]}
      endLabel="אחרי איחוד"
    />
  );
}

/** Stability after consolidation, against the Directive 329 thresholds. */
export function ConsolidationRisk({ analysis }: { analysis: ConsolidationAnalysis }) {
  const r = analysis.regulation;
  return <RiskPanel indicators={[ltvRisk(r.ltvAfter), ptiRisk(r.pti), primeRisk(r.variableShareAfter)]} />;
}
