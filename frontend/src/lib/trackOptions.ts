import type { TrackType } from './types';

/** The tracks a borrower can pick in a hand-edited table, in the order lenders list them. */
export const TRACK_OPTIONS: { value: TrackType; label: string }[] = [
  { value: 'PRIME', label: 'פריים' },
  { value: 'FIXED_UNLINKED', label: 'קבועה לא צמודה' },
  { value: 'FIXED_LINKED', label: 'קבועה צמודה' },
  { value: 'VARIABLE_UNLINKED', label: 'משתנה לא צמודה' },
  { value: 'VARIABLE_LINKED', label: 'משתנה צמודה' },
  { value: 'ELIGIBILITY', label: 'זכאות' },
];

export const TRACK_LABEL: Record<TrackType, string> = Object.fromEntries(
  TRACK_OPTIONS.map((option) => [option.value, option.label]),
) as Record<TrackType, string>;
