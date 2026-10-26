import { create } from 'zustand';
import type { TermId } from '../lib/glossary';

/** Whether the glossary panel is open, and which entry it should bring into view. */
export const useGlossary = create<{
  open: boolean;
  focus?: TermId;
  show: (focus?: TermId) => void;
  close: () => void;
}>()((set) => ({
  open: false,
  show: (focus) => set({ open: true, focus }),
  close: () => set({ open: false }),
}));
