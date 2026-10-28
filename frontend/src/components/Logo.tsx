/**
 * The mark: a key whose head is a home — the key to the household's money, the mortgage included.
 * One drawing from the browser tab to the opening screen; the same as `public/favicon.svg`.
 */
export function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={`shrink-0 ${className}`} aria-hidden focusable="false">
      <rect width="48" height="48" rx="12" fill="#0A2F2B" />
      <path d="M7 23.5 16 15l9 8.5V34H7Z" fill="#fff" />
      <rect x="13.5" y="26" width="5" height="8" rx="1.2" fill="#F2B84B" />
      <rect x="24" y="26.5" width="18" height="3.6" rx="1.8" fill="#fff" />
      <rect x="32.5" y="29" width="3" height="5.5" rx="0.8" fill="#fff" />
      <rect x="37.5" y="29" width="3" height="4" rx="0.8" fill="#fff" />
    </svg>
  );
}

export const APP_NAME = 'מפתח כלכלי';
