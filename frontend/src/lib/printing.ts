import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * Whether the browser is printing right now. Registered when the module loads — before any
 * component's own listener — so a chart that mounts inside a print-time render can read it.
 */
let printingNow = false;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', () => {
    printingNow = true;
  });
  window.addEventListener('afterprint', () => {
    printingNow = false;
  });
}

export const isPrinting = () => printingNow;

/**
 * True while the browser prints. Tabs render one section at a time, but a printed or saved-as-PDF
 * report should hold all of them, so pages render every section while this is set. The state is
 * flushed synchronously in `beforeprint`, before the browser lays out the page for printing.
 */
export function usePrinting(): boolean {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  return printing;
}
