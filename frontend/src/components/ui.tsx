import type { ReactNode } from 'react';

/** A titled card: a hairline surface with its heading, and what is inside. */
export function Card({ title, subtitle, children, className = '' }: { title?: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <header className="mb-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Skeleton shown while a calculation is in flight. */
export function LoadingCard({ message }: { message: string }) {
  return (
    <div className="card flex items-center gap-3">
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600"
        aria-hidden
      />
      <p className="text-sm text-ink-muted">{message}</p>
    </div>
  );
}
