import { useId, useRef } from 'react';
import { LATER, type AnswerValue, type Field } from '../../engine/flow/flow';
import { useMoney } from '../../store/moneyStore';
import { DebtImporter } from '../consolidation/DebtImporter';
import { StatementImporter } from '../refinance/StatementImporter';

/**
 * One answer on a questionnaire screen: large buttons for a choice, a figure in its own box, or a
 * document. A screen's first field is its question, shown as full-width buttons; follow-ups open
 * below it in a card, their choices as a row of pills.
 */
export function FieldInput({
  field,
  value,
  onChange,
  primary,
}: {
  field: Field;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | undefined) => void;
  /** The screen's own question, rather than a follow-up. */
  primary: boolean;
}) {
  switch (field.kind) {
    case 'choice':
      return primary ? <BigChoice field={field} value={value} onChange={onChange} /> : <Pills field={field} value={value} onChange={onChange} />;
    case 'multi':
      return <MultiChoice field={field} value={value} onChange={onChange} />;
    case 'money':
    case 'number':
      return <FigureInput field={field} value={value} onChange={onChange} primary={primary} />;
    case 'upload':
      return <Upload field={field} value={value} onChange={onChange} />;
  }
}

const optionClass = (selected: boolean) =>
  `flex min-h-[60px] w-full items-center gap-3 rounded-2xl border-2 px-4 text-start text-[17px] transition ${
    selected ? 'border-flow-strong bg-flow-pick font-extrabold' : 'border-flow-card bg-flow-card font-semibold hover:border-flow-line'
  }`;

function BigChoice({ field, value, onChange }: { field: Field; value: AnswerValue | undefined; onChange: (value: string) => void }) {
  return (
    <div role="radiogroup" aria-label={field.label} className="flex flex-col gap-2.5">
      {field.options!.map((option) => {
        const selected = value === option.id;
        return (
          <button key={option.id} type="button" role="radio" aria-checked={selected} className={optionClass(selected)} onClick={() => onChange(option.id)}>
            <span
              aria-hidden
              className={`h-[22px] w-[22px] shrink-0 rounded-full bg-flow-card ${selected ? 'border-[7px] border-flow-strong' : 'border-2 border-flow-line'}`}
            />
            <span className="flex-1">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function MultiChoice({ field, value, onChange }: { field: Field; value: AnswerValue | undefined; onChange: (value: string[] | undefined) => void }) {
  const chosen = Array.isArray(value) ? (value as string[]) : [];
  const toggle = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((each) => each !== id) : [...chosen, id];
    onChange(next.length > 0 ? field.options!.map((option) => option.id).filter((each) => next.includes(each)) : undefined);
  };
  return (
    <div role="group" aria-label={field.label} className="flex flex-col gap-2.5">
      {field.options!.map((option) => {
        const selected = chosen.includes(option.id);
        return (
          <button key={option.id} type="button" aria-pressed={selected} className={optionClass(selected)} onClick={() => toggle(option.id)}>
            <span
              aria-hidden
              className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border-2 ${selected ? 'border-flow-strong bg-flow-strong' : 'border-flow-line bg-flow-card'}`}
            >
              {selected && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" className="text-flow-on-strong">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              )}
            </span>
            <span className="flex-1">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Pills({ field, value, onChange }: { field: Field; value: AnswerValue | undefined; onChange: (value: string) => void }) {
  const label = useId();
  return (
    <div className="flex flex-col gap-2">
      <span id={label} className="text-[15px] font-bold">
        {field.label}
      </span>
      <div role="radiogroup" aria-labelledby={label} className="flex flex-wrap gap-2">
        {field.options!.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.id)}
              className={`min-h-11 rounded-full px-4 text-[15px] transition ${
                selected ? 'border-2 border-flow-strong bg-flow-pick font-extrabold' : 'border border-flow-line bg-flow-card font-semibold hover:border-flow-strong'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Digits only, grouped as they are typed: "820000" reads "820,000". */
const digitsOf = (text: string) => text.replace(/[^\d]/g, '');

function FigureInput({
  field,
  value,
  onChange,
  primary,
}: {
  field: Field;
  value: AnswerValue | undefined;
  onChange: (value: number | undefined) => void;
  primary: boolean;
}) {
  const id = useId();
  const shown = typeof value === 'number' ? Math.round(value).toLocaleString('en-US') : '';
  const out = typeof value === 'number' && ((field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max));
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={primary ? 'sr-only' : 'text-[15px] font-bold'}>
        {field.label}
      </label>
      <div
        className={`flex min-h-[56px] items-center gap-2 rounded-2xl border-2 bg-flow-card px-4 ${
          out ? 'border-negative' : typeof value === 'number' ? 'border-flow-strong' : 'border-flow-line'
        } focus-within:border-flow-strong`}
      >
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          dir="ltr"
          className="w-full bg-transparent text-right text-[22px] font-extrabold text-flow-ink outline-none focus-visible:ring-0 placeholder:text-base placeholder:font-medium placeholder:text-flow-muted"
          value={shown}
          placeholder={field.placeholder ?? 'הקלידו סכום'}
          aria-invalid={out || undefined}
          onChange={(event) => {
            const digits = digitsOf(event.target.value);
            onChange(digits ? Number(digits) : undefined);
          }}
        />
        {field.unit && <span className="text-lg text-flow-muted">{field.unit}</span>}
      </div>
      {out && (
        <p className="text-sm text-negative">
          {field.min !== undefined && (value as number) < field.min
            ? `לפחות ${field.min.toLocaleString('he-IL')}${field.unit ? ` ${field.unit}` : ''}`
            : `עד ${field.max!.toLocaleString('he-IL')}${field.unit ? ` ${field.unit}` : ''}`}
        </p>
      )}
    </div>
  );
}

function Upload({ field, value, onChange }: { field: Field; value: AnswerValue | undefined; onChange: (value: AnswerValue | undefined) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {field.upload === 'mortgage' && <StatementImporter />}
      {field.upload === 'loans' && <DebtImporter />}
      {field.upload === 'statements' && <StatementsUpload />}
      {value !== true && (
        <button
          type="button"
          aria-pressed={value === LATER}
          onClick={() => onChange(value === LATER ? undefined : LATER)}
          className="min-h-11 self-center rounded-full px-4 text-base font-bold text-flow-strong underline-offset-4 hover:underline"
        >
          {value === LATER ? 'אעלה בכל זאת' : 'אין לי עכשיו — אמשיך בלי'}
        </button>
      )}
    </div>
  );
}

/** Bank and card statements, read in the browser and kept in memory only. */
function StatementsUpload() {
  const input = useRef<HTMLInputElement>(null);
  const files = useMoney((state) => state.files);
  const reading = useMoney((state) => state.reading);
  const addFiles = useMoney((state) => state.addFiles);
  const read = files.filter((file) => file.statement);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-flow-strong bg-flow-card p-5 text-center"
      >
        <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-flow-pick">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-flow-strong">
            <path d="M12 16V4" />
            <path d="m7 9 5-5 5 5" />
            <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
        </span>
        <span className="text-xl font-extrabold">בחרו קבצים</span>
        <span className="text-sm text-flow-muted">עו״ש וכרטיס אשראי · Excel או CSV · כמה ביחד</span>
      </button>
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
        <ul aria-label="קבצים שהועלו" className="flex flex-col gap-1.5">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-2 rounded-xl bg-flow-card px-3 py-2 text-sm">
              <span className="truncate" dir="auto">
                {file.name}
              </span>
              <span className={file.statement ? 'font-bold text-flow-strong' : 'text-negative'}>
                {file.statement ? (file.statement.source === 'BANK' ? 'עו״ש · נקרא' : 'אשראי · נקרא') : file.error}
              </span>
            </li>
          ))}
          {reading && <li className="px-3 py-2 text-sm text-flow-muted">קורא…</li>}
        </ul>
      )}
      {read.length > 0 && <p className="sr-only" role="status">{`${read.length} קבצים נקראו`}</p>}
      <p className="flex items-center gap-2 rounded-2xl bg-flow-pick px-3.5 py-3 text-sm">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-flow-strong">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        נקראים אצלכם במכשיר, לא נשלחים ולא נשמרים.
      </p>
    </div>
  );
}
