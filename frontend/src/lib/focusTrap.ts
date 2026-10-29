import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps the keyboard inside an open dialog: Tab from its last control goes back to its first, and
 * Shift+Tab from the first to the last, so the page behind, which a screen reader is told is
 * inert, is never reached by tabbing. Escape and giving the focus back stay with the dialog.
 */
export function useFocusTrap(container: RefObject<HTMLElement>, active = true) {
  useEffect(() => {
    if (!active) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      const root = container.current;
      if (event.key !== 'Tab' || !root) {
        return;
      }
      const controls = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      const current = document.activeElement;
      if (!root.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [container, active]);
}
