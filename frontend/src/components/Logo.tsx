import { useId } from 'react';

/**
 * The mark: a home whose walls hold a line on the rise — the mortgage, and the household getting
 * better. One drawing from the browser tab to the opening screen; the same as `public/favicon.svg`.
 */
export function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  const gradient = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={`shrink-0 ${className}`} aria-hidden focusable="false">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14b8a6" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill={`url(#${gradient})`} />
      <path d="M11 24.5 24 13l13 11.5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 22.5V35h18V22.5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m18.5 30.5 4-4 3 2.5 4.5-5" fill="none" stroke="#99f6e4" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="30" cy="24" r="1.9" fill="#99f6e4" />
    </svg>
  );
}

export const APP_NAME = 'משכנתא חכמה';
