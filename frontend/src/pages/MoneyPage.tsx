import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { Disclosure } from '../components/Disclosure';
import { SummaryBar } from '../components/SummaryBar';
import { Card, ScrollRegion } from '../components/ui';
import { CATEGORY_LABELS, type CategoryId } from '../engine/money/categories';
import { MAX_PAYEES } from '../engine/money/categorizeRequest';
import { payeeOf, type CategoryLine, type MonthlyPicture } from '../engine/money/picture';
import { categorizePayees, useAiEnabled } from '../lib/aiClient';
import { formatCurrency, formatSignedCurrency } from '../lib/format';
import { usePageTab, type PageTab } from '../lib/pageTabs';
import { useMoney, useMoneyCategories, useMonthlyPicture, type MoneyFile } from '../store/moneyStore';

type Screen = 'data' | 'result';
const SCREENS: PageTab<Screen>[] = [
  { id: 'data', label: 'הקבצים' },
  { id: 'result', label: 'התמונה החודשית' },
];

/** Categories a business can be moved to by hand. */
const SPENDING_CHOICES: readonly CategoryId[] = [
  'GROCERIES',
  'DINING',
  'SHOPPING',
  'HEALTH',
  'TRANSPORT',
  'HOME_BILLS',
  'TELECOM',
  'INSURANCE',
  'EDUCATION',
  'DONATIONS',
  'SUBSCRIPTIONS',
  'TRANSFERS_OUT',
  'CASH',
  'HOUSING_LOANS',
  'FEES',
  'OTHER',
];

const monthName = (month: string, withYear = true) =>
  new Intl.DateTimeFormat('he-IL', withYear ? { month: 'long', year: 'numeric' } : { month: 'long' }).format(
    new Date(`${month}-15T12:00:00Z`),
  );
const shortDate = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;

function periodOf(months: readonly string[]): string {
  const first = months[0]!;
  const last = months[months.length - 1]!;
  if (first === last) {
    return monthName(first);
  }
  return first.slice(0, 4) === last.slice(0, 4)
    ? `${monthName(first, false)}–${monthName(last)}`
    : `${monthName(first)}–${monthName(last)}`;
}

/**
 * "My money": the household's bank and card statements, read in the browser, as one monthly
 * picture — what comes in, what goes out and on what. Two screens: the files, then the picture.
 */
export function MoneyPage() {
  const [screen, setScreen] = usePageTab('money', SCREENS);
  const ready = useMoney((state) => state.files.some((file) => file.statement));
  const go = (next: Screen) => {
    setScreen(next);
    window.scrollTo({ top: 0 });
  };
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      {screen === 'data' || !ready ? <FilesScreen onDone={() => go('result')} /> : <PictureScreen onBack={() => go('data')} />}
    </div>
  );
}

function FilesScreen({ onDone }: { onDone: () => void }) {
  const files = useMoney((state) => state.files);
  const reading = useMoney((state) => state.reading);
  const addFiles = useMoney((state) => state.addFiles);
  const remove = useMoney((state) => state.remove);
  const input = useRef<HTMLInputElement>(null);
  const read = files.filter((file) => file.statement);
  const hasBank = read.some((file) => file.statement!.source === 'BANK');
  const hasCard = read.some((file) => file.statement!.source === 'CARD');

  return (
    <Card title="העלו את החשבונות" subtitle="עו״ש וכרטיסי אשראי, 3 חודשים ומעלה. קובץ Excel או CSV מאתר הבנק או חברת האשראי.">
      <div className="grid gap-3 sm:grid-cols-2">
        <UploadTile
          title="חשבון עו״ש"
          hint="באתר הבנק: תנועות בחשבון ← ייצוא ל-Excel"
          icon="M3 10h18M5 10v8m5-8v8m4-8v8m5-8v8M2 21h20M12 3 3 8h18z"
          onClick={() => input.current?.click()}
        />
        <UploadTile
          title="כרטיס אשראי"
          hint="באתר חברת האשראי: פירוט עסקאות ← ייצוא ל-Excel"
          icon="M2 7.5A2.5 2.5 0 0 1 4.5 5h15A2.5 2.5 0 0 1 22 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 16.5zM2 10h20M6 15h4"
          onClick={() => input.current?.click()}
        />
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept=".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        aria-label="בחירת קבצי עו״ש או כרטיס אשראי"
        onChange={(event) => {
          const chosen = [...(event.target.files ?? [])];
          event.target.value = '';
          if (chosen.length > 0) {
            void addFiles(chosen);
          }
        }}
      />

      {(files.length > 0 || reading) && (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line" aria-label="קבצים שהועלו">
          {files.map((file) => (
            <FileRow key={file.id} file={file} onRemove={() => remove(file.id)} />
          ))}
          {reading && <li className="p-3 text-sm text-ink-soft">קורא…</li>}
        </ul>
      )}

      {hasBank && !hasCard && (
        <p className="mt-3 text-sm text-ink-muted">הוסיפו גם את פירוט כרטיס האשראי — בלעדיו רואים רק את החיוב החודשי, לא על מה.</p>
      )}
      {hasCard && !hasBank && (
        <p className="mt-3 text-sm text-ink-muted">הוסיפו גם את העו״ש — שם המשכורת, המשכנתא וההוראות הקבע.</p>
      )}

      <p className="mt-4 rounded-xl bg-surface-muted p-3 text-sm text-ink-muted">
        הקבצים נקראים בדפדפן שלכם ולא נשלחים לשום מקום. הם לא נשמרים: סגירת הדף מוחקת אותם.
      </p>

      <button type="button" className="btn-primary mt-4 w-full sm:w-auto" disabled={read.length === 0} onClick={onDone}>
        לתמונה החודשית <span aria-hidden>←</span>
      </button>
    </Card>
  );
}

function UploadTile({ title, hint, icon, onClick }: { title: string; hint: string; icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded-2xl border-2 border-dashed border-brand-500/60 bg-brand-50/60 p-4 text-start transition hover:bg-brand-50"
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-brand-700" aria-hidden>
        <path d={icon} />
      </svg>
      <span className="text-base font-semibold text-ink">{title}</span>
      <span className="text-xs text-ink-soft">{hint}</span>
    </button>
  );
}

function FileRow({ file, onRemove }: { file: MoneyFile; onRemove: () => void }) {
  const statement = file.statement;
  return (
    <li className="flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink" dir="auto">
          {file.name}
        </p>
        {statement ? (
          <p className="text-xs text-ink-soft">
            {statement.source === 'BANK' ? 'עו״ש' : `כרטיס ${statement.cards.join(', ')}`} · {statement.transactions.length} תנועות ·{' '}
            {shortDate(statement.from)} עד {shortDate(statement.to)}
          </p>
        ) : (
          <p className="text-xs text-negative">{file.error}</p>
        )}
      </div>
      {statement && <span className="badge-ok">נקרא</span>}
      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onRemove} aria-label={`הסרת ${file.name}`}>
        הסרה
      </button>
    </li>
  );
}

function PictureScreen({ onBack }: { onBack: () => void }) {
  const picture = useMonthlyPicture();
  if (!picture) {
    return null;
  }
  const net = picture.income - picture.spending;
  const housing = picture.spendingLines.find((line) => line.id === 'HOUSING_LOANS');

  return (
    <>
      <SummaryBar
        label="התמונה החודשית"
        tone={net < 0 ? 'negative' : 'positive'}
        eyebrow={`${picture.partial ? 'התקופה בקבצים' : `ממוצע ${picture.months.length} חודשים מלאים`}: ${periodOf(picture.months)}`}
        title={net < 0 ? `יוצא ${formatCurrency(-net)} יותר ממה שנכנס, בכל חודש` : `נשארים ${formatCurrency(net)} בכל חודש`}
        figures={[
          { label: 'נכנס בחודש', value: formatCurrency(picture.income) },
          { label: 'יוצא בחודש', value: formatCurrency(picture.spending) },
          {
            label: 'מתוכו קבוע',
            value: formatCurrency(picture.fixed),
            note: picture.spending > 0 ? `${Math.round((picture.fixed / picture.spending) * 100)}% מההוצאות` : undefined,
          },
          { label: 'נשאר בחודש', value: formatSignedCurrency(net), tone: net < 0 ? 'negative' : 'positive' },
        ]}
      />

      {picture.partial && (
        <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-caution">
          אין בקבצים אף חודש מלא, אז אלה הסכומים לתקופה כמו שהיא. לממוצע חודשי, העלו לפחות חודש שלם מכל חשבון.
        </p>
      )}

      <Findings picture={picture} />

      <SpendingCard picture={picture} />

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

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-soft">פרטים נוספים</h2>
        <Disclosure title="חודש אחר חודש" summary={`${picture.byMonth.length} חודשים`}>
          <ScrollRegion label="הכנסות והוצאות לפי חודש">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ink-soft">
                  <th className="py-2 text-start font-medium">חודש</th>
                  <th className="py-2 text-start font-medium">נכנס</th>
                  <th className="py-2 text-start font-medium">יצא</th>
                  <th className="py-2 text-start font-medium">נשאר</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {picture.byMonth.map((month) => (
                  <tr key={month.month}>
                    <td className="py-2">{monthName(month.month)}</td>
                    <td className="py-2">{formatCurrency(month.income)}</td>
                    <td className="py-2">{formatCurrency(month.spending)}</td>
                    <td className={`py-2 font-medium ${month.income - month.spending < 0 ? 'text-negative' : 'text-positive'}`}>
                      {formatSignedCurrency(month.income - month.spending)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        </Disclosure>
      </div>

      <div className="no-print flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost" onClick={onBack}>
          <span aria-hidden>→</span> הקבצים
        </button>
        {housing && (
          <a className="btn-ghost" href="#/own">
            לבדוק את המשכנתא <span aria-hidden>←</span>
          </a>
        )}
      </div>
    </>
  );
}

/** The few facts worth reading first: money that is not income, the overdraft, cards without detail. */
function Findings({ picture }: { picture: MonthlyPicture }) {
  const { overdraft, oneOff, undetailedCards } = picture;
  const items: { key: string; tone: 'caution' | 'neutral'; text: string }[] = [];
  if (oneOff.length > 0) {
    const total = oneOff.reduce((sum, transaction) => sum + transaction.amount, 0);
    items.push({
      key: 'one-off',
      tone: 'neutral',
      text: `נכנסו גם ${formatCurrency(total)} חד-פעמיים (${oneOff.map((t) => payeeOf(t.description)).join(', ')}). לא נספרו כהכנסה — אבל הם מה שכיסה חלק מהפער.`,
    });
  }
  if (overdraft && overdraft.monthsBelow > 0) {
    items.push({
      key: 'overdraft',
      tone: 'caution',
      text: `ב-${overdraft.monthsBelow} מתוך ${overdraft.months} החודשים החשבון ירד למינוס, עד מינוס ${formatCurrency(-overdraft.lowest)} ב-${shortDate(overdraft.lowestDate)}.${
        overdraft.interestMonthly >= 1 ? ` ריבית על המינוס: כ-${formatCurrency(overdraft.interestMonthly)} בחודש.` : ''
      }`,
    });
  }
  if (undetailedCards.length > 0) {
    items.push({
      key: 'cards',
      tone: 'neutral',
      text: `${undetailedCards.map((card) => (card === 'אשראי' ? 'כרטיס אשראי' : `כרטיס ${card}`)).join(', ')} משולם מהעו״ש בלי פירוט. העלו את הפירוט שלו כדי לראות על מה.`,
    });
  }
  if (items.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-2" aria-label="ממצאים">
      {items.map((item) => (
        <li
          key={item.key}
          className={`rounded-xl p-3 text-sm ${item.tone === 'caution' ? 'bg-amber-500/10 text-caution' : 'bg-surface-muted text-ink-muted'}`}
        >
          {item.text}
        </li>
      ))}
    </ul>
  );
}

function SpendingCard({ picture }: { picture: MonthlyPicture }) {
  const top = picture.spendingLines[0]?.monthly ?? 1;
  const fixedShare = picture.spending > 0 ? picture.fixed / picture.spending : 0;
  const other = picture.spendingLines.find((line) => line.id === 'OTHER');
  return (
    <Card title="לאן הולך הכסף" subtitle="ממוצע לחודש. לחצו על קטגוריה לראות את בתי העסק ולתקן סיווג.">
      <div className="mb-4 space-y-1.5">
        <div className="flex h-3 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
          <div className="bg-brand-600" style={{ width: `${fixedShare * 100}%` }} />
          <div className="bg-brand-200" style={{ width: `${(1 - fixedShare) * 100}%` }} />
        </div>
        <p className="flex justify-between text-xs text-ink-muted">
          <span>קבועות {formatCurrency(picture.fixed)}</span>
          <span>משתנות {formatCurrency(picture.spending - picture.fixed)}</span>
        </p>
      </div>
      {other && <AiSort line={other} />}
      <ul className="divide-y divide-line" aria-label="קטגוריות">
        {picture.spendingLines.map((line) => (
          <CategoryRow key={line.id} line={line} share={line.monthly / top} />
        ))}
      </ul>
    </Card>
  );
}

const NOTES: Partial<Record<CategoryId, string>> = {
  CASH: 'מזומן — לא ידוע על מה הוצא.',
  TRANSFERS_OUT: 'העברות — לא ידוע למה. כדאי לבדוק מה חוזר כל חודש.',
  CARD_UNDETAILED: 'חיובי כרטיס בלי פירוט.',
  FEES: 'עמלות וריבית — כסף שלא קונה כלום.',
};

function CategoryRow({ line, share }: { line: CategoryLine; share: number }) {
  const setCategory = useMoneyCategories((state) => state.setCategory);
  const canMove = line.id !== 'CARD_UNDETAILED';
  return (
    <li>
      <details className="group py-2.5">
        <summary className="flex cursor-pointer list-none flex-col gap-1.5">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-ink">
              <span aria-hidden className="me-1 inline-block text-ink-soft transition group-open:rotate-90">
                ‹
              </span>
              {line.label}
            </span>
            <span className="tabular text-sm font-semibold text-ink">{formatCurrency(line.monthly)}</span>
          </span>
          <span className="block h-1.5 rounded-full bg-surface-sunken" aria-hidden>
            <span
              className={`block h-1.5 rounded-full ${line.rising || NOTES[line.id] ? 'bg-amber-500' : 'bg-brand-500'}`}
              style={{ width: `${Math.max(2, share * 100)}%` }}
            />
          </span>
          {line.rising && (
            <span className="text-xs text-caution">בחודש האחרון {formatCurrency(line.lastMonth)} — מעל הממוצע</span>
          )}
        </summary>
        <div className="mt-2 space-y-1 ps-4">
          {NOTES[line.id] && <p className="text-xs text-ink-soft">{NOTES[line.id]}</p>}
          <ul className="space-y-1">
            {line.payees.slice(0, 12).map((payee) => (
              <li key={payee.description} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="min-w-0 flex-1 truncate text-ink-muted" dir="auto">
                  {payee.description}
                </span>
                <span className="tabular text-ink">{formatCurrency(payee.monthly)}</span>
                {canMove && (
                  <select
                    className="input w-auto py-0.5 text-xs"
                    aria-label={`קטגוריה של ${payee.description}`}
                    value={line.id}
                    onChange={(event) => setCategory(payee.description, event.target.value as CategoryId)}
                  >
                    {SPENDING_CHOICES.map((id) => (
                      <option key={id} value={id}>
                        {CATEGORY_LABELS[id]}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
          {line.payees.length > 12 && <p className="text-xs text-ink-soft">ועוד {line.payees.length - 12} בתי עסק</p>}
        </div>
      </details>
    </li>
  );
}

/** Sorts the "other" businesses with AI; only their names are sent. */
function AiSort({ line }: { line: CategoryLine }) {
  const enabled = useAiEnabled();
  const merge = useMoneyCategories((state) => state.merge);
  const payees = line.payees.slice(0, MAX_PAYEES).map((payee) => payee.description);
  const sorter = useMutation({
    mutationFn: async (names: readonly string[]) => {
      const categories = await categorizePayees(names);
      merge(categories);
      return Object.keys(categories).length;
    },
  });
  if (!enabled || payees.length === 0) {
    return null;
  }
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-500/30 bg-brand-50/40 p-3">
      <p className="text-sm text-ink-muted">
        {sorter.isSuccess
          ? `${sorter.data} בתי עסק מוינו. אפשר לתקן כל אחד ידנית.`
          : `${formatCurrency(line.monthly)} בחודש ב"אחר". AI יכול למיין לפי שמות בתי העסק בלבד — בלי סכומים ותאריכים.`}
      </p>
      {!sorter.isSuccess && (
        <button type="button" className="btn-primary" disabled={sorter.isPending} onClick={() => sorter.mutate(payees)}>
          {sorter.isPending ? 'ממיין…' : 'מיינו עם AI'}
        </button>
      )}
      {sorter.isError && (
        <p className="w-full text-sm text-negative" role="alert">
          {sorter.error instanceof Error ? sorter.error.message : 'המיון לא הצליח.'}
        </p>
      )}
    </div>
  );
}
