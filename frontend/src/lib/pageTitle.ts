import { useEffect } from 'react';
import { APP_NAME } from '../components/Logo';

/** The title the page loads with: the app's name and what it does. */
const BASE = typeof document !== 'undefined' ? document.title : '';

/** The app's name, after the screen's own. */
export const titleOf = (screen: string) => `${screen} · ${APP_NAME}`;

/**
 * The browser tab and the history follow the screen: each names its own heading first, so a screen
 * reader announces where it landed and Back lists the questions by name. The page's own title returns
 * once the screen is gone.
 */
export function usePageTitle(screen: string) {
  useEffect(() => {
    document.title = titleOf(screen);
    return () => {
      document.title = BASE;
    };
  }, [screen]);
}
