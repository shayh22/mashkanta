import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { APP_NAME, Logo } from './Logo';

const SEEN_KEY = 'mashkanta-splash-seen';
const HOLD_MS = 850;
const FLY_MS = 650;

/** Once a session, and never for a visitor who asked for less motion. */
function shouldShow(): boolean {
  if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return false;
  }
  try {
    return window.sessionStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return false;
  }
}

/**
 * The opening: the mark and the name, large in the middle of the page; then they shrink and glide
 * into their place in the header — measured, so they land exactly where the header draws them —
 * and the page shows through. Decorative: hidden from assistive technology, and clicks go through
 * it from the first frame.
 */
export function Splash({ target, onDone }: { target: RefObject<HTMLElement | null>; onDone: () => void }) {
  const [phase, setPhase] = useState<'show' | 'fly' | 'done'>(() => (shouldShow() ? 'show' : 'done'));
  const [flight, setFlight] = useState<string>();
  const brand = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (phase === 'done') {
      onDone();
    }
  }, [phase, onDone]);

  useEffect(() => {
    if (phase !== 'show') {
      return;
    }
    try {
      window.sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Without storage it shows again next time; nothing else depends on it.
    }
    const hold = window.setTimeout(() => {
      const from = brand.current?.getBoundingClientRect();
      const to = target.current?.getBoundingClientRect();
      if (from && to && from.height > 0 && to.height > 0) {
        // Scaled about its top-right corner, the group's corner lands on the header's: right to left.
        const scale = to.height / from.height;
        setFlight(`translate(${to.right - from.right}px, ${to.top - from.top}px) scale(${scale})`);
      }
      setPhase('fly');
    }, HOLD_MS);
    return () => window.clearTimeout(hold);
  }, [phase, target]);

  useEffect(() => {
    if (phase !== 'fly') {
      return;
    }
    const land = window.setTimeout(() => setPhase('done'), FLY_MS);
    return () => window.clearTimeout(land);
  }, [phase]);

  if (phase === 'done') {
    return null;
  }
  const flying = phase === 'fly';
  // In the body, not inside the header: the header's backdrop filter would trap a fixed child.
  return createPortal(
    <div
      aria-hidden
      data-testid="splash"
      className={`pointer-events-none fixed inset-0 z-[60] flex items-center justify-center transition-colors ease-out ${
        flying ? 'bg-canvas/0' : 'bg-canvas'
      }`}
      style={{ transitionDuration: `${FLY_MS}ms` }}
    >
      <div className="flex flex-col items-center gap-4">
        <div
          ref={brand}
          className="flex origin-top-right animate-splash-in items-center gap-4"
          style={{ transform: flying ? flight : undefined, transition: `transform ${FLY_MS}ms cubic-bezier(0.65, 0, 0.35, 1)` }}
        >
          <Logo size={80} />
          <span className="whitespace-nowrap text-4xl font-extrabold text-ink">{APP_NAME}</span>
        </div>
        <p className={`text-sm text-ink-soft transition-opacity duration-200 ${flying ? 'opacity-0' : 'opacity-100'}`}>
          משכנתא, הלוואות ותזרים — במקום אחד
        </p>
      </div>
    </div>,
    document.body,
  );
}
