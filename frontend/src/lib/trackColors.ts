import type { TrackType } from './types';

/** Palette per track, reused by the allocation bar and the legend so colour means one thing. */
export const TRACK_COLORS: Record<TrackType, string> = {
  PRIME: '#6366F1',
  FIXED_UNLINKED: '#0EA5E9',
  FIXED_LINKED: '#10B981',
  VARIABLE_UNLINKED: '#F59E0B',
  VARIABLE_LINKED: '#F43F5E',
  ELIGIBILITY: '#8B5CF6',
};

