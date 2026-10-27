import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { factsFor } from '../../engine/money/consultRequest';
import { decisionsOf, freedBy } from '../../engine/money/decisions';
import { flexibilityRows } from '../../engine/money/flexibility';
import type { MonthlyPicture } from '../../engine/money/picture';
import { knownSaving, savingIdeas } from '../../engine/money/savings';
import { formatCurrency, formatSignedCurrency } from '../../lib/format';
import { useMoney, useMoneyCategories } from '../../store/moneyStore';
import { SummaryBar } from '../SummaryBar';
import { Card } from '../ui';
import { AdvisorCard, type AdviceTarget } from './AdvisorCard';
import { DecisionBars, FlexibilityBars, SlopeCompare, Waffle } from './charts';
import { Findings } from './Findings';
import { BalanceChart, MonthlyFlowChart } from './flowCharts';
import { periodOf, shortDate } from './format';
import { SavingsCard } from './SavingsCard';
import { ExplainCard, SpendingCard } from './Spending';
import { StepConsult } from './StepConsult';

/**
 * The household journey, one screen at a time. Each screen says one thing in its headline, shows
 * it in one chart, lets the household add what the numbers miss, and leads to the next.
 */

const net = (picture: MonthlyPicture) => picture.income - picture.spending;
const periodLine = (picture: MonthlyPicture) =>
  `${picture.partial ? 'התקופה בקבצים' : `ממוצע ${picture.months.length} חודשים מלאים`}: ${periodOf(picture.months)}`;

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card title={title} subtitle={subtitle}>
      {children}
    </Card>
  );
}

/** Step 2: what comes in and goes out, month by month, and how low the account goes. */
export function FlowStep({ picture }: { picture: MonthlyPicture }) {
  const explanations = useMoneyCategories((state) => state.explanations);
  const left = net(picture);
  const { overdraft } = picture;
  return (
    <>
      <SummaryBar
        label="נכנס ויוצא"
        tone={left < 0 ? 'negative' : 'positive'}
        eyebrow={periodLine(picture)}
        title={left < 0 ? `יוצא ${formatCurrency(-left)} יותר ממה שנכנס, בכל חודש` : `נשארים ${formatCurrency(left)} בכל חודש`}
        figures={[
          { label: 'נכנס בחודש', value: formatCurrency(picture.income) },
          { label: 'יוצא בחודש', value: formatCurrency(picture.spending) },
          { label: 'נשאר בחודש', value: formatSignedCurrency(left), tone: left < 0 ? 'negative' : 'positive' },
        ]}
      />
      {picture.partial && (
        <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-caution">
          אין בקבצים אף חודש מלא, אז אלה הסכומים לתקופה כמו שהיא. לממוצע חודשי, העלו לפחות חודש שלם מכל חשבון.
        </p>
      )}
      <ChartCard title="חודש אחר חודש" subtitle="עמודה כהה: נכנס · כתומה: יצא · הקו: מה שנשאר">
        <MonthlyFlowChart months={picture.byMonth} />
      </ChartCard>
      <Findings picture={picture} />
      {picture.balances.length > 1 && (
        <ChartCard
          title="יתרת החשבון"
          subtitle={
            overdraft && overdraft.monthsBelow > 0
              ? `ב-${overdraft.monthsBelow} מתוך ${overdraft.months} החודשים מתחת לאפס, עד מינוס ${formatCurrency(-overdraft.lowest)} (${shortDate(overdraft.lowestDate)})${overdraft.interestMonthly >= 1 ? ` · ריבית כ-${formatCurrency(overdraft.interestMonthly)} בחודש` : ''}`
              : 'היתרה לא ירדה מתחת לאפס.'
          }
        >
          <BalanceChart balances={picture.balances} />
        </ChartCard>
      )}
      {picture.incomeLines.length > 0 && (
        <Card title="מה נכנס">
          <ul className="divide-y divide-line">
            {picture.incomeLines.map((line) => (
              <li key={line.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="text-ink">{line.label}</span>
                <span className="tabular font-semibold text-ink">{formatCurrency(line.monthly)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <StepConsult step="flow" facts={factsFor('flow', picture, explanations)} />
    </>
  );
}

/** Step 3: where every hundred shekels go, and what each large charge really is. */
export function SpendingStep({ picture }: { picture: MonthlyPicture }) {
  const explanations = useMoneyCategories((state) => state.explanations);
  const lines = picture.spendingLines;
  const top = lines.slice(0, 5);
  const rest = lines.slice(5).reduce((sum, line) => sum + line.monthly, 0);
  const groups = [...top.map((line) => ({ key: line.id, label: line.label, value: line.monthly })), ...(rest > 0 ? [{ key: 'rest', label: 'כל השאר', value: rest }] : [])];
  return (
    <>
      <section aria-label="לאן הולך הכסף" className="space-y-1 px-1">
        <p className="text-xs font-medium text-ink-soft">{periodLine(picture)}</p>
        <h2 className="text-xl font-bold text-ink">
          {formatCurrency(picture.spending)} יוצאים בכל חודש. {top[0] ? `הכי הרבה: ${top[0].label}.` : ''}
        </h2>
      </section>
      <ChartCard title="מכל 100 ₪ שיוצאים" subtitle="כל ריבוע הוא שקל מתוך מאה">
        <Waffle groups={groups} caption="חלוקת ההוצאות לפי קטגוריה" />
      </ChartCard>
      <ExplainCard picture={picture} />
      <SpendingCard picture={picture} />
      <StepConsult step="spending" facts={factsFor('spending', picture, explanations)} />
    </>
  );
}

/** Step 4: what the household can give up, and the ideas the statements show. */
export function SavingsStep({ picture, onExplain }: { picture: MonthlyPicture; onExplain: () => void }) {
  const explanations = useMoneyCategories((state) => state.explanations);
  const ideas = savingIdeas(picture, explanations);
  const known = knownSaving(ideas);
  const rows = flexibilityRows(picture, explanations);
  const explainedAny = rows.some((row) => row.must + row.reduce + row.cancel > 0);
  return (
    <>
      <section aria-label="איפה אפשר לחסוך" className="space-y-1 px-1">
        <p className="text-xs font-medium text-ink-soft">{periodLine(picture)}</p>
        <h2 className="text-xl font-bold text-ink">
          {known >= 1 ? `לפחות ${formatCurrency(known)} בחודש אפשר לחסוך כבר עכשיו` : 'הנה מה שכדאי לבדוק'}
        </h2>
      </section>
      <ChartCard title="על מה אפשר לוותר" subtitle="כל קטגוריה לפי מה שאמרתם עליה. הקו: אחרי מה שסימנתם לביטול.">
        <FlexibilityBars rows={rows} />
        {!explainedAny && (
          <p className="mt-3 text-sm text-ink-muted">
            עוד לא סימנתם מה חובה ומה אפשר לצמצם.{' '}
            <button type="button" className="font-medium text-brand-700 hover:underline" onClick={onExplain}>
              חזרה להסבר ההוצאות
            </button>
          </p>
        )}
      </ChartCard>
      <SavingsCard picture={picture} />
      <StepConsult step="savings" facts={factsFor('savings', picture, explanations)} />
    </>
  );
}

/** Step 5: the decisions, before and after, and the advisor's plan from everything said on the way. */
export function SummaryStep({ picture }: { picture: MonthlyPicture }) {
  const explanations = useMoneyCategories((state) => state.explanations);
  const notesByStep = useMoney((state) => state.notes);
  const notes = useMemo(() => Object.values(notesByStep).filter((note): note is string => !!note && note.trim().length >= 3), [notesByStep]);
  const [targets, setTargets] = useState<readonly AdviceTarget[]>([]);
  const onTargets = useCallback((next: readonly AdviceTarget[]) => setTargets(next), []);
  const decisions = decisionsOf(picture, explanations, targets);
  const [unchosen, setUnchosen] = useState<ReadonlySet<string>>(new Set());
  const chosen = new Set(decisions.map((d) => d.key).filter((key) => !unchosen.has(key)));
  const freed = freedBy(decisions, chosen);
  const before = net(picture);
  const after = before + freed;
  const toggle = (key: string) =>
    setUnchosen((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  return (
    <>
      <SummaryBar
        label="הסיכום"
        tone={after < 0 ? (after > before ? 'caution' : 'negative') : 'positive'}
        eyebrow={periodLine(picture)}
        title={after < 0 ? `אחרי ההחלטות: חסרים ${formatCurrency(-after)} בחודש` : `אחרי ההחלטות: נשארים ${formatCurrency(after)} בחודש`}
        figures={[
          { label: 'היום בחודש', value: formatSignedCurrency(before), tone: before < 0 ? 'negative' : 'positive' },
          { label: 'ההחלטות מפנות', value: formatCurrency(freed), tone: 'positive' },
          { label: 'אחרי', value: formatSignedCurrency(after), tone: after < 0 ? 'negative' : 'positive' },
        ]}
        action={
          <button type="button" className="btn-ghost no-print px-2 py-1 text-xs" onClick={() => window.print()}>
            הדפסה או PDF
          </button>
        }
      />

      <Card title="ההחלטות" subtitle="סמנו את מה שאתם עושים; הכל מתעדכן.">
        {decisions.length === 0 ? (
          <p className="text-sm text-ink-muted">עוד אין החלטות עם סכום. סמנו בשלב "לאן הולך הכסף" מה אפשר לבטל, או בקשו תוכנית מהיועץ למטה.</p>
        ) : (
          <ul className="divide-y divide-line" aria-label="החלטות">
            {decisions.map((decision) => (
              <li key={decision.key}>
                <label className="flex cursor-pointer items-center gap-3 py-2.5">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={chosen.has(decision.key)} onChange={() => toggle(decision.key)} />
                  <span className="min-w-0 flex-1 text-sm text-ink">{decision.label}</span>
                  {decision.source === 'advisor' && <span className="badge-neutral">מהיועץ</span>}
                  <span className="tabular text-sm font-semibold text-positive">{formatCurrency(decision.monthly)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {freed >= 1 && (
        <>
          <ChartCard title="היום ואחרי" subtitle="מה נשאר בחודש, ומה יוצא">
            <SlopeCompare
              series={[
                { key: 'net', label: 'נשאר בחודש', before, after, higherIsBetter: true },
                { key: 'spending', label: 'יוצא בחודש', before: picture.spending, after: picture.spending - freed, higherIsBetter: false },
              ]}
            />
          </ChartCard>
          <ChartCard title="מה כל החלטה מפנה" subtitle="בכל חודש">
            <DecisionBars items={decisions.filter((d) => chosen.has(d.key))} />
          </ChartCard>
        </>
      )}

      <AdvisorCard picture={picture} notes={notes} onTargets={onTargets} />
    </>
  );
}
