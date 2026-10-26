import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * The travelling marker behind a segmented control or under a tab row (after Segmented Control and
 * Underline Tabs on design.yaps.ai, MIT): one element that glides to the selected item on a slight
 * overshoot instead of the selection jumping. Measured from the items themselves, so it follows
 * any width — Hebrew labels, a badge, a row that scrolls sideways — and re-measures on resize.
 */
export function useGlide<T extends HTMLElement>(active: number) {
  const items = useRef<(T | null)[]>([]);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number }>();

  useLayoutEffect(() => {
    const measure = () => {
      const item = items.current[active];
      if (item) {
        setBox({ left: item.offsetLeft, top: item.offsetTop, width: item.offsetWidth, height: item.offsetHeight });
      }
    };
    measure();
    const parent = items.current[active]?.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    for (const item of items.current) {
      if (item) {
        observer.observe(item);
      }
    }
    return () => observer.disconnect();
  }, [active]);

  const style: CSSProperties | undefined = box && {
    position: 'absolute',
    left: 0,
    top: box.top,
    width: box.width,
    height: box.height,
    transform: `translateX(${box.left}px)`,
  };

  return { items, style };
}

/** The glide itself: a spring-like overshoot, and none at all for reduced motion. */
export const GLIDE_CLASS =
  'pointer-events-none transition-[transform,width] duration-300 ease-[cubic-bezier(0.34,1.36,0.64,1)] motion-reduce:transition-none';
