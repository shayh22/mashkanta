import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CategoryId } from '../engine/money/categories';
import { monthlyPicture, type MonthlyPicture } from '../engine/money/picture';
import { readCsv, readXlsx } from '../engine/money/sheets';
import { readStatement, type Statement } from '../engine/money/statementImport';
import { browserStorage, storageKey, uniqueId } from './persistence';

/**
 * The household's statements. Read in the browser and kept in memory only: they never leave the
 * device and are gone when the page closes. What the borrower decides about a business's category
 * is kept, so the next upload is sorted the same way.
 */

export interface MoneyFile {
  readonly id: string;
  readonly name: string;
  readonly statement?: Statement;
  readonly error?: string;
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
  reading: boolean;
  addFiles: (files: readonly File[]) => Promise<void>;
  remove: (id: string) => void;
}

export const useMoney = create<MoneyState>()((set) => ({
  files: [],
  reading: false,
  addFiles: async (files) => {
    set({ reading: true });
    const read = await Promise.all(files.map(readMoneyFile));
    set((state) => ({ files: [...state.files, ...read], reading: false }));
  },
  remove: (id) => set((state) => ({ files: state.files.filter((file) => file.id !== id) })),
}));

interface CategoryState {
  /** By business name, as `payeeOf` writes it. */
  overrides: Record<string, CategoryId>;
  setCategory: (payee: string, category: CategoryId) => void;
  merge: (categories: Record<string, CategoryId>) => void;
}

export const useMoneyCategories = create<CategoryState>()(
  persist(
    (set) => ({
      overrides: {},
      setCategory: (payee, category) => set((state) => ({ overrides: { ...state.overrides, [payee]: category } })),
      // The borrower's own choices win over a later AI pass.
      merge: (categories) => set((state) => ({ overrides: { ...categories, ...state.overrides } })),
    }),
    { name: storageKey('money-categories'), version: 1, storage: browserStorage },
  ),
);

export function useMonthlyPicture(): MonthlyPicture | undefined {
  const files = useMoney((state) => state.files);
  const overrides = useMoneyCategories((state) => state.overrides);
  return useMemo(
    () => monthlyPicture(files.flatMap((file) => (file.statement ? [file.statement] : [])), overrides),
    [files, overrides],
  );
}
