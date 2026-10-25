import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'mashkanta-theme';

function current(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * The colour theme. `public/theme-init.js` has already applied the saved or system choice before
 * React mounts; this hook only reads it back and persists explicit changes. Storage can be
 * unavailable (private windows, blocked site data), so every access is guarded and the toggle
 * still works for the session without it.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(current);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((previous) => {
      const next: Theme = previous === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Not persisted; the choice still holds for this visit.
      }
      return next;
    });
  }, []);

  return [theme, toggle];
}
