import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CategoryId } from '../engine/money/categories';
import type { ConsultStep } from '../engine/money/consultRequest';
import type { LoanPlan } from '../engine/money/decisions';
import { overridesOf, type PayeeExplanation } from '../engine/money/explanations';
import { monthlyPicture, type MonthlyPicture } from '../engine/money/picture';
import { readCsv, readXlsx } from '../engine/money/sheets';
import { readStatement, type Statement } from '../engine/money/statementImport';
import { browserStorage, storageKey, uniqueId } from './persistence';

/**
 * The household's statements. Read in the browser and kept in memory only: they never leave the
 * device and are gone when the page closes. What the household says about a business — its
 * category, what it is, whether it can go — is kept, so the next upload reads the same way.
 */

export interface MoneyFile {
  readonly id: string;
  readonly name: string;
  readonly statement?: Statement;
  readonly error?: string;
}

/** A statement's lines, as one string: the same export uploaded twice, under any name, reads the same. */
const fingerprintOf = (statement: Statement) =>
  `${statement.source}\n${statement.transactions.map((t) => `${t.date}|${t.description}|${t.amount}|${t.balance ?? ''}`).join('\n')}`;

/** The newly read files, with any statement already among the uploaded ones marked as such rather than counted twice. */
export function withoutRepeats(existing: readonly MoneyFile[], read: readonly MoneyFile[]): MoneyFile[] {
  const seen = new Set(existing.flatMap((file) => (file.statement ? [fingerprintOf(file.statement)] : [])));
  return read.map((file) => {
    if (!file.statement) {
      return file;
    }
    const fingerprint = fingerprintOf(file.statement);
    if (seen.has(fingerprint)) {
      return { id: file.id, name: file.name, error: 'הקובץ הזה כבר הועלה, ולא נספר פעמיים.' };
    }
    seen.add(fingerprint);
    return file;
  });
}

const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b;
const isOldExcel = (bytes: Uint8Array) => bytes[0] === 0xd0 && bytes[1] === 0xcf;

export async function readMoneyFile(file: File): Promise<MoneyFile> {
  const id = uniqueId('m');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (isOldExcel(bytes)) {
      return { id, name: file.name, error: 'קובץ Excel ישן (xls). שמרו אותו כ-xlsx או CSV ונסו שוב.' };
    }
    const rows = isZip(bytes) ? await readXlsx(bytes) : readCsv(bytes);
    const statement = readStatement(rows, id);
    return statement
      ? { id, name: file.name, statement }
      : { id, name: file.name, error: 'לא מצאנו בקובץ טבלת תנועות עם תאריך, תיאור וסכום.' };
  } catch {
    return { id, name: file.name, error: 'לא הצלחנו לקרוא את הקובץ. העלו Excel (xlsx) או CSV.' };
  }
}

interface MoneyState {
  files: MoneyFile[];
  /** Whether any upload is still being read; `pending` counts them, so one finishing early does not clear it. */
  reading: boolean;
  pending: number;
  /** What the household told the AI on each screen; in memory, like the files. */
  notes: Partial<Record<ConsultStep, string>>;
  setNote: (step: ConsultStep, note: string) => void;
  /** Each loan's terms, as the household knows them, and the move chosen for it; by business name. */
  loans: Record<string, LoanPlan>;
  setLoan: (payee: string, patch: Partial<LoanPlan>) => void;
  /** A report loan's repayment on the statements, chosen by the household: a charge's name, or NOT_ON_STATEMENTS. */
  loanLinks: Record<string, string>;
  linkLoan: (debtId: string, payee: string) => void;
  /** Whether the summary counts refinancing the mortgage into the engine's mix. */
  refinance: boolean;
  setRefinance: (refinance: boolean) => void;
  addFiles: (files: readonly File[]) => Promise<void>;
  remove: (id: string) => void;
}

export const useMoney = create<MoneyState>()((set) => ({
  files: [],
  reading: false,
  pending: 0,
  notes: {},
  setNote: (step, note) => set((state) => ({ notes: { ...state.notes, [step]: note } })),
  loans: {},
  setLoan: (payee, patch) => set((state) => ({ loans: { ...state.loans, [payee]: { move: 'KEEP', ...state.loans[payee], ...patch } } })),
  loanLinks: {},
  linkLoan: (debtId, payee) => set((state) => ({ loanLinks: { ...state.loanLinks, [debtId]: payee } })),
  refinance: false,
  setRefinance: (refinance) => set({ refinance }),
  addFiles: async (files) => {
    set((state) => ({ pending: state.pending + 1, reading: true }));
    const read = await Promise.all(files.map(readMoneyFile));
    set((state) => ({ files: [...state.files, ...withoutRepeats(state.files, read)], pending: state.pending - 1, reading: state.pending > 1 }));
  },
  remove: (id) => set((state) => ({ files: state.files.filter((file) => file.id !== id) })),
}));

interface ExplanationState {
  /** By business name, as `payeeOf` writes it. */
  explanations: Record<string, PayeeExplanation>;
  /** Changes what the household says about one business; an empty field is dropped. */
  explain: (payee: string, patch: PayeeExplanation) => void;
  /** Categories from the AI: never over the household's own. */
  merge: (categories: Record<string, CategoryId>) => void;
}

export const useMoneyCategories = create<ExplanationState>()(
  persist(
    (set) => ({
      explanations: {},
      explain: (payee, patch) =>
        set((state) => {
          const next: Record<string, unknown> = { ...state.explanations[payee], ...patch };
          for (const key of Object.keys(next)) {
            if (next[key] === undefined || next[key] === '') {
              delete next[key];
            }
          }
          const explanations = { ...state.explanations };
          if (Object.keys(next).length > 0) {
            explanations[payee] = next as PayeeExplanation;
          } else {
            delete explanations[payee];
          }
          return { explanations };
        }),
      merge: (categories) =>
        set((state) => {
          const explanations = { ...state.explanations };
          for (const [payee, category] of Object.entries(categories)) {
            if (!explanations[payee]?.category) {
              explanations[payee] = { ...explanations[payee], category };
            }
          }
          return { explanations };
        }),
    }),
    {
      name: storageKey('money-categories'),
      version: 2,
      storage: browserStorage,
      // Version 1 kept a category per business, nothing else.
      migrate: (persisted, version) => {
        if (version < 2) {
          const overrides = ((persisted as { overrides?: Record<string, CategoryId> }) ?? {}).overrides ?? {};
          return { explanations: Object.fromEntries(Object.entries(overrides).map(([payee, category]) => [payee, { category }])) };
        }
        return persisted as ExplanationState;
      },
    },
  ),
);

export function useMonthlyPicture(): MonthlyPicture | undefined {
  const files = useMoney((state) => state.files);
  const explanations = useMoneyCategories((state) => state.explanations);
  return useMemo(
    () => monthlyPicture(files.flatMap((file) => (file.statement ? [file.statement] : [])), overridesOf(explanations)),
    [files, explanations],
  );
}
