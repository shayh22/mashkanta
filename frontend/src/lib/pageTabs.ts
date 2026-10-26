import { useCallback, useEffect, useState } from 'react';

/** One section of a mode's tabs; see `components/PageTabs.tsx`. */
export interface PageTab<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly icon: string;
  /** A short marker beside the label — a count, or ! when the tab needs attention. */
  readonly badge?: string;
}

/** The second segment of `#/<mode>/<tab>`. */
function tabFromHash(): string | undefined {
  return window.location.hash.replace(/^#\/?/, '').split('/')[1] || undefined;
}

export function usePageTab<T extends string>(mode: string, tabs: readonly PageTab<T>[]) {
  const pick = useCallback(
    (candidate: string | undefined): T => tabs.find((tab) => tab.id === candidate)?.id ?? tabs[0]!.id,
    [tabs],
  );
  const [active, setActive] = useState<T>(() => pick(tabFromHash()));

  useEffect(() => {
    const onHash = () => setActive(pick(tabFromHash()));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [pick]);

  const select = useCallback(
    (id: T) => {
      setActive(id);
      // replaceState rather than a new history entry: Back should leave the mode, not walk the tabs.
      window.history.replaceState(null, '', `#/${mode}/${id}`);
    },
    [mode],
  );

  return [active, select] as const;
}
