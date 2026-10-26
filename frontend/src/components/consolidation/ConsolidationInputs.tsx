import {
  consumerLoanAverage,
  DEBT_KIND_LABELS,
  type ConsolidationAnalysis,
  type DebtKind,
} from '../../engine/consolidation';
import { monthLabel } from '../../engine/liveMarket';
import { formatCurrency, formatPercent, formatTerm } from '../../lib/format';
import { useConsolidation } from '../../store/consolidationStore';
import { ScrollRegion, Card, CurrencyField, NumberInput, RangeField } from '../ui';

const ACTION_BADGE = {
  CONSOLIDATE: { className: 'badge-ok', label: 'מומלץ לאחד' },
  KEEP: { className: 'badge-neutral', label: 'להשאיר' },
  OPTIONAL: { className: 'badge-warn', label: 'לשיקולכם' },
} as const;

/** Income and what is already secured on the home. */
export function HouseholdCard() {
  const { netIncome, property, setNetIncome, setProperty } = useConsolidation();
  return (
    <Card title="משק הבית והנכס">
      <div className="grid gap-5 sm:grid-cols-2">
        <CurrencyField label="הכנסה נטו חודשית (N)" value={netIncome} min={5_000} max={80_000} step={500} onChange={setNetIncome} />
        <CurrencyField
          label="שווי הנכס"
          value={property.value}
          min={300_000}
          max={10_000_000}
          step={50_000}
          onChange={(value) => setProperty({ value })}
        />
        <CurrencyField
          label="יתרת המשכנתא"
          value={property.mortgageBalance}
          min={0}
          max={5_000_000}
          step={10_000}
          onChange={(value) => setProperty({ mortgageBalance: value })}
        />
        <CurrencyField
          label="החזר המשכנתא החודשי (E)"
          value={property.mortgagePayment}
          min={0}
          max={30_000}
          step={100}
          onChange={(value) => setProperty({ mortgagePayment: value })}
        />
        <CurrencyField
          label="מתוכה בריבית משתנה (פריים / משתנה)"
          value={property.mortgageVariableBalance}
          min={0}
          max={Math.max(property.mortgageBalance, 1)}
          step={10_000}
          onChange={(value) => setProperty({ mortgageVariableBalance: Math.min(value, property.mortgageBalance) })}
        />
        <CurrencyField
          label="הלוואות לכל מטרה קודמות על הנכס"
          value={property.priorAllPurposeBalance}
          min={0}
          max={1_000_000}
          step={5_000}
          onChange={(value) => setProperty({ priorAllPurposeBalance: value })}
        />
        <RangeField
          label="יתרת תקופת המשכנתא"
          value={property.mortgageRemainingMonths}
          min={1}
          max={360}
          step={1}
          display={formatTerm(property.mortgageRemainingMonths)}
          onChange={(value) => setProperty({ mortgageRemainingMonths: value })}
          hint="עד 18 חודשים — לא נספרת"
        />
      </div>
    </Card>
  );
}

/** The household's other debts, with the engine's advice beside each one. */
export function DebtsTable({ analysis }: { analysis: ConsolidationAnalysis }) {
  const { debts, addDebt, updateDebt, removeDebt, applyRecommendations } = useConsolidation();
  const advice = new Map(analysis.recommendations.map((item) => [item.id, item]));
  const market = consumerLoanAverage();

  return (
    <Card
      title="התחייבויות קיימות"
      subtitle="סמנו מה לאחד"
      action={
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => applyRecommendations(analysis.allocation.blendedRate)}>
            החלת ההמלצות
          </button>
          <button type="button" className="btn-ghost" onClick={addDebt}>
            הוספה
          </button>
        </div>
      }
    >
      <ScrollRegion label="טבלת התחייבויות">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-soft">
              <th className="py-2 text-start font-medium" scope="col">לאחד</th>
              <th className="py-2 text-start font-medium" scope="col">סוג</th>
              <th className="py-2 text-start font-medium" scope="col">יתרה (₪)</th>
              <th className="py-2 text-start font-medium" scope="col">ריבית (%)</th>
              <th className="py-2 text-start font-medium" scope="col">החזר (₪)</th>
              <th className="py-2 text-start font-medium" scope="col">חודשים</th>
              <th className="py-2 text-start font-medium" scope="col">המלצה</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {debts.map((debt) => {
              const item = advice.get(debt.id);
              return (
                <tr key={debt.id} className={debt.include ? '' : 'opacity-90'}>
                  <td className="py-2 pe-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-600"
                      checked={debt.include}
                      aria-label={`לאחד את ${debt.label}`}
                      onChange={(event) => updateDebt(debt.id, { include: event.target.checked })}
                    />
                  </td>
                  <td className="py-2 pe-2">
                    <select
                      className="input min-w-[9rem] py-1.5"
                      aria-label="סוג ההלוואה"
                      value={debt.kind}
                      onChange={(event) => {
                        const kind = event.target.value as DebtKind;
                        updateDebt(debt.id, { kind, label: DEBT_KIND_LABELS[kind] });
                      }}
                    >
                      {(Object.keys(DEBT_KIND_LABELS) as DebtKind[]).map((kind) => (
                        <option key={kind} value={kind}>
                          {DEBT_KIND_LABELS[kind]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pe-2">
                    <NumberInput label="יתרה" value={debt.balance} min={0} step={1_000} digits={0} onChange={(balance) => updateDebt(debt.id, { balance })} />
                  </td>
                  <td className="py-2 pe-2">
                    <NumberInput
                      label="ריבית שנתית באחוזים"
                      value={debt.annualRate}
                      scale={100}
                      min={0}
                      max={40}
                      step={0.25}
                      onChange={(annualRate) => updateDebt(debt.id, { annualRate })}
                    />
                  </td>
                  <td className="py-2 pe-2">
                    <NumberInput
                      label="החזר חודשי"
                      value={debt.monthlyPayment}
                      min={0}
                      step={50}
                      digits={0}
                      onChange={(monthlyPayment) => updateDebt(debt.id, { monthlyPayment })}
                    />
                  </td>
                  <td className="py-2 pe-2">
                    <NumberInput
                      label="חודשים שנותרו"
                      value={debt.remainingMonths}
                      min={1}
                      max={360}
                      step={1}
                      digits={0}
                      onChange={(value) => updateDebt(debt.id, { remainingMonths: Math.max(1, Math.round(value)) })}
                    />
                    {item?.shortTerm && <span className="badge-neutral mt-1">עד 18 ח' — מחוץ ל-PTI</span>}
                  </td>
                  <td className="max-w-[14rem] py-2 pe-2">
                    {item && (
                      <>
                        <span className={ACTION_BADGE[item.action].className}>{ACTION_BADGE[item.action].label}</span>
                        <p className="mt-1 text-xs leading-snug text-ink-soft">{item.reason}</p>
                        {item.aboveMarket !== undefined && (
                          <p className="mt-1 text-xs leading-snug text-caution">
                            גבוהה ב-{(item.aboveMarket * 100).toFixed(1)} נק' מממוצע ההלוואות הצרכניות (
                            {formatPercent(market.rate)}
                            {market.asOf ? `, ${monthLabel(market.asOf)}` : ''}).
                          </p>
                        )}
                      </>
                    )}
                  </td>
                  <td className="py-2 text-end">
                    <button
                      type="button"
                      className="text-xs font-medium text-negative"
                      onClick={() => removeDebt(debt.id)}
                      aria-label={`הסרת ${debt.label}`}
                    >
                      הסרה
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollRegion>
      <p className="mt-3 text-sm text-ink-muted">
        לאיחוד: <span className="tabular font-semibold">{analysis.included.length}</span> הלוואות בסך{' '}
        <span className="tabular font-semibold">
          {formatCurrency(analysis.included.reduce((sum, debt) => sum + debt.balance, 0))}
        </span>
      </p>
    </Card>
  );
}

/** The terms of the new all-purpose loan. */
export function TermsCard({ analysis }: { analysis: ConsolidationAnalysis }) {
  const { terms, setTerms } = useConsolidation();
  const { allocation } = analysis;
  return (
    <Card title="תנאי ההלוואה לכל מטרה" subtitle="עדכנו לפי ההצעה שקיבלתם">
      <div className="grid gap-5 sm:grid-cols-2">
        <RangeField
          label="תקופה"
          value={terms.termMonths}
          min={24}
          max={360}
          step={12}
          display={formatTerm(terms.termMonths)}
          onChange={(termMonths) => setTerms({ termMonths })}
        />
        <RangeField
          label="חלק מועדף בפריים"
          value={terms.preferredVariableShare}
          min={0}
          max={1}
          step={0.05}
          display={formatPercent(terms.preferredVariableShare, 0)}
          onChange={(preferredVariableShare) => setTerms({ preferredVariableShare })}
          hint={allocation.variableCapped ? 'מוגבל ע"י תקרת ⅔ משתנה על סך האשראי בנכס' : undefined}
        />
        <label className="block text-sm font-medium text-ink-muted">
          ריבית פריים כוללת (%)
          <NumberInput
            label="ריבית פריים כוללת באחוזים"
            className="mt-1.5"
            value={terms.variableRate}
            scale={100}
            min={0}
            max={20}
            step={0.05}
            onChange={(variableRate) => setTerms({ variableRate })}
          />
        </label>
        <label className="block text-sm font-medium text-ink-muted">
          ריבית קבועה לא צמודה (%)
          <NumberInput
            label="ריבית קבועה באחוזים"
            className="mt-1.5"
            value={terms.fixedRate}
            scale={100}
            min={0}
            max={20}
            step={0.05}
            onChange={(fixedRate) => setTerms({ fixedRate })}
          />
        </label>
        <CurrencyField
          label="מזומן נוסף"
          value={terms.extraCash}
          min={0}
          max={500_000}
          step={5_000}
          onChange={(extraCash) => setTerms({ extraCash })}
        />
        <CurrencyField
          label="עלויות פתיחה, שמאות ורישום"
          value={terms.closingCosts}
          min={0}
          max={20_000}
          step={250}
          onChange={(closingCosts) => setTerms({ closingCosts })}
        />
      </div>
      <p className="mt-4 text-sm text-ink-muted">
        הלוואה חדשה: <span className="tabular font-semibold">{formatCurrency(allocation.amount)}</span> · פריים{' '}
        <span className="tabular font-semibold">{formatCurrency(allocation.variableAmount)}</span> · קבועה{' '}
        <span className="tabular font-semibold">{formatCurrency(allocation.fixedAmount)}</span> · החזר{' '}
        <span className="tabular font-semibold">{formatCurrency(allocation.payment)}</span>
      </p>
    </Card>
  );
}
