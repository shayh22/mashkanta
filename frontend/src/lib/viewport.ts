import { useEffect, useState } from 'react';

/** Tailwind's `sm` breakpoint: below it is a phone. */
const PHONE = '(max-width: 639px)';

const matches = () => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE).matches;

/** Whether the screen is phone-sized; follows rotation and resizing. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(matches);
  useEffect(() => {
    const query = window.matchMedia?.(PHONE);
    if (!query) {
      return;
    }
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return phone;
}
