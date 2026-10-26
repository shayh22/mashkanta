import { useEffect, useState } from 'react';
import { planToText, type ActionPlan, type Priority } from '../engine/actionPlan';
import { Card } from './ui';

const PRIORITY: Record<Priority, { badge: string; label: string }> = {
  HIGH: { badge: 'badge-danger', label: 'עכשיו' },
  MEDIUM: { badge: 'badge-warn', label: 'חשוב' },
  LOW: { badge: 'badge-neutral', label: 'לשקול' },
};

/**
 * The personalised action plan, with print-to-PDF and share.
 *
 * Printing marks the body so the print stylesheet shows only this card — the browser's own PDF
 * output keeps the Hebrew text selectable and right-to-left, which a bundled PDF renderer would
 * not do without shipping a font.
 */
export function ActionPlanReport({ plan }: { plan: ActionPlan }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const clear = () => delete document.body.dataset.print;
    window.addEventListener('afterprint', clear);
    return () => window.removeEventListener('afterprint', clear);
  }, []);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const print = () => {
    document.body.dataset.print = 'report';
    window.print();
  };

  const share = async () => {
    const text = planToText(plan);
    try {
      if (navigator.share) {
        await navigator.share({ title: plan.title, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // The user cancelled the share sheet, or the clipboard is blocked; nothing to report.
    }
  };

  return (
    <Card
      className="report"
      title={plan.title}
      subtitle={`הופק ב-${plan.generatedOn} · מבוסס על הנתונים שהוזנו ועל ממוצעי בנק ישראל`}
      action={
        <div className="no-print flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={print}>
            הדפסה / PDF
          </button>
          <button type="button" className="btn-primary" onClick={share}>
            {copied ? 'הועתק ✓' : 'שיתוף'}
          </button>
        </div>
      }
    >
      <p className="rounded-xl bg-brand-50 px-4 py-3 text-base font-semibold text-brand-700">{plan.headline}</p>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        {plan.sections.map((section) => (
          <section key={section.title} className="break-inside-avoid">
            <h3 className="mb-2 text-sm font-bold text-ink">{section.title}</h3>
            <ol className="space-y-2.5">
              {section.items.map((item, index) => (
                <li key={`${section.title}-${index}`} className="flex items-start gap-2.5">
                  <span className={`${PRIORITY[item.priority].badge} mt-0.5 shrink-0`}>{PRIORITY[item.priority].label}</span>
                  <div>
                    <p className="text-sm font-medium text-ink">{item.text}</p>
                    {item.detail && <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{item.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <p className="mt-5 border-t border-line pt-3 text-xs text-ink-soft">
        כלי השוואה המבוסס על נתונים ציבוריים ועל הוראה 329 בנוסחה מ-1.10.2026. אין באמור ייעוץ פיננסי;
        ההחלטה הסופית ותנאי ההלוואה נקבעים מול הבנק.
      </p>
    </Card>
  );
}
