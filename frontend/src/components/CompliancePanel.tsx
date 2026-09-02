import type { ComplianceReport } from '../lib/types';
import { formatPercent } from '../lib/format';
import { Card, LevelBadge } from './ui';

const LEVEL_TEXT = {
  OK: 'תקין',
  WARNING: 'לתשומת לב',
  BLOCKING: 'חריגה רגולטורית',
} as const;

/**
 * The regulatory verdict, finding by finding.
 *
 * Every check is shown, including the ones that passed: a borrower comparing offers needs to see
 * that the LTV is fine as much as that the payment ratio is stretched.
 */
export function CompliancePanel({ compliance }: { compliance: ComplianceReport }) {
  return (
    <Card
      title="בדיקה רגולטורית"
      subtitle="הוראות ניהול בנקאי תקין 329 ו-451 של בנק ישראל"
      action={<LevelBadge level={compliance.level}>{LEVEL_TEXT[compliance.level]}</LevelBadge>}
    >
      <dl className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Ratio label="שיעור מימון" value={compliance.ltv} limit={compliance.maxLtv} />
        <Ratio label="החזר מהכנסה" value={compliance.pti} limit={0.3} />
        <Ratio label="סך התחייבויות" value={compliance.dti} limit={0.4} />
        <Ratio label="בתרחיש קיצון" value={compliance.stressedPti} limit={0.4} />
      </dl>

      <ul className="divide-y divide-slate-100">
        {compliance.findings.map((finding) => (
          <li key={finding.code} className="flex items-start gap-3 py-3">
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                finding.level === 'BLOCKING'
                  ? 'bg-rose-500'
                  : finding.level === 'WARNING'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              aria-hidden
            />
            <div>
              <p className="text-sm font-medium text-ink">{finding.title}</p>
              <p className="mt-0.5 text-sm text-ink-soft">{finding.message}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Ratio({ label, value, limit }: { label: string; value: number; limit: number }) {
  const over = value > limit + 1e-9;
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className={`tabular mt-0.5 text-lg font-semibold ${over ? 'text-amber-600' : 'text-ink'}`}>
        {formatPercent(value, 1)}
      </dd>
      <p className="text-xs text-ink-soft">מתוך {formatPercent(limit, 0)}</p>
    </div>
  );
}
