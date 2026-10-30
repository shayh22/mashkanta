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

