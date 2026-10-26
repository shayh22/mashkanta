import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AI_DOCUMENT_LABELS, AI_MAX_PAGES, AI_MAX_TEXT, type AiDocumentKind } from '../engine/aiExtraction';
import { prepareForAi, type AiPayload } from '../engine/documents';
import { extractWithAi, useAiEnabled } from '../lib/aiClient';

/**
 * The fallback for a document no local parser recognised: offer to read it with AI, show exactly
 * what would be sent, and send it only on the borrower's say-so. Text goes out redacted; an image
 * cannot be redacted, so sending one takes an explicit second confirmation.
 */
export function AiDocumentReader({
  kind,
  file,
  reason,
  onData,
}: {
  kind: AiDocumentKind;
  file: File;
  /** Why the local reading failed, in the borrower's terms. */
  reason: string;
  onData: (data: unknown) => void;
}) {
  const enabled = useAiEnabled();
  const [payload, setPayload] = useState<AiPayload>();
  const [prepareError, setPrepareError] = useState<string>();
  const [imageConsent, setImageConsent] = useState(false);

  useEffect(() => {
    let live = true;
    setPayload(undefined);
    setPrepareError(undefined);
    setImageConsent(false);
    prepareForAi(file, AI_MAX_TEXT, AI_MAX_PAGES)
      .then((prepared) => live && setPayload(prepared))
      .catch((error: unknown) => live && setPrepareError(error instanceof Error ? error.message : 'קריאת הקובץ נכשלה.'));
    return () => {
      live = false;
    };
  }, [file]);

  const reader = useMutation({
    mutationFn: () => extractWithAi(kind, { text: payload?.text, images: payload?.images }),
    onSuccess: onData,
  });

  const images = payload?.images ?? [];
  const canSend = enabled && payload && (images.length === 0 || imageConsent) && !reader.isPending;

  return (
    <section className="mt-4 space-y-3 rounded-xl border border-brand-500/30 bg-brand-50/50 p-4 text-sm" aria-label="קריאת המסמך עם AI">
      <p className="text-ink">
        <span aria-hidden>🤖 </span>
        {reason}
      </p>

      {!enabled ? (
        <p className="text-ink-soft">קריאת מסמכים בפורמט לא מוכר עם AI אינה מופעלת כרגע. אפשר להזין את הנתונים ידנית.</p>
      ) : prepareError ? (
        <p className="text-negative" role="alert">
          {prepareError}
        </p>
      ) : !payload ? (
        <p className="text-ink-soft">מכין את המסמך…</p>
      ) : (
        <>
          <p className="text-ink-muted">
            אפשר לנסות לקרוא את ה{AI_DOCUMENT_LABELS[kind]} עם AI: המסמך יישלח לשירות OpenRouter, שיחזיר רק את
            השדות הנדרשים. שום דבר לא נשמר אצלנו, והנתונים יוצגו לאישורכם לפני שיוזנו.
          </p>

          {payload.text !== undefined && (
            <>
              <p className="text-positive">
                ✓ יישלח טקסט בלבד, אחרי השחרת פרטים מזהים
                {payload.redaction && payload.redaction.spanCount > 0 ? ` (${payload.redaction.spanCount} הושחרו)` : ''}.
                {payload.truncated ? ' המסמך ארוך — יישלח החלק הראשון שלו.' : ''}
              </p>
              <details>
                <summary className="cursor-pointer text-xs font-medium text-brand-700">הצגת הטקסט שיישלח</summary>
                <pre
                  className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-xs text-ink-muted"
                  tabIndex={0}
                >
                  {payload.text}
                </pre>
              </details>
            </>
          )}

          {images.length > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-caution">
              <p className="font-medium">
                ⚠️ זו סריקה או תמונה — אי אפשר להשחיר בה פרטים אישיים. {images.length === 1 ? 'התמונה תישלח' : `${images.length} עמודים יישלחו`} כמו
                שהם, כולל שם, מספר זהות וכתובת אם הם מופיעים.
              </p>
              <div className="flex flex-wrap gap-2">
                {images.map((image, index) => (
                  <img
                    key={index}
                    src={image}
                    alt={`עמוד ${index + 1} שיישלח`}
                    className="h-24 rounded border border-line bg-surface object-contain"
                  />
                ))}
              </div>
              <label className="flex items-start gap-2 text-ink">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-brand-600"
                  checked={imageConsent}
                  onChange={(event) => setImageConsent(event.target.checked)}
                />
                אני מאשר/ת לשלוח את {images.length === 1 ? 'התמונה' : 'העמודים'} כפי שהם לקריאה עם AI.
              </label>
            </div>
          )}

          <button type="button" className="btn-primary" disabled={!canSend} onClick={() => reader.mutate()}>
            {reader.isPending ? 'קורא את המסמך…' : 'קריאה עם AI'}
          </button>
          {reader.isError && (
            <p className="text-negative" role="alert">
              {reader.error instanceof Error ? reader.error.message : 'קריאת המסמך נכשלה.'}
            </p>
          )}
        </>
      )}
    </section>
  );
}
