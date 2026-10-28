import { useState } from 'react';
import { sharedLink, type SharedResult } from '../../engine/flow/share';

/**
 * Sharing a result as a link to the site: by WhatsApp, or copied. The link carries the figures
 * and choices — and says so — never a name or a document.
 */
export function ShareBar({ result }: { result: SharedResult }) {
  const [copied, setCopied] = useState(false);
  const link = sharedLink(window.location.origin, result);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      window.prompt('הקישור:', link);
    }
  };
  return (
    <section aria-label="שיתוף" className="flex flex-col gap-2.5 rounded-[20px] bg-flow-card p-4">
      <h3 className="text-base font-extrabold">שיתוף התוצאה</h3>
      <div className="grid grid-cols-2 gap-2.5">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`התוצאה שלי ב"מפתח כלכלי":\n${link}`)}`}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-[52px] items-center justify-center rounded-full bg-flow-ink px-3 text-base font-extrabold text-flow-ground"
        >
          שיתוף בוואטסאפ
        </a>
        <button type="button" onClick={() => void copy()} className="min-h-[52px] rounded-full border-2 border-flow-ink px-3 text-base font-extrabold">
          {copied ? 'הקישור הועתק ✓' : 'העתקת קישור'}
        </button>
      </div>
      <p className="text-xs leading-relaxed text-flow-muted">
        הקישור פותח את התוצאה באתר, עם המספרים והבחירות שלכם. בלי שמות, בלי דפי חשבון ובלי מסמכים. מי שמקבל אותו רואה את המספרים.
      </p>
    </section>
  );
}
