import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { ExplainRequest } from '../engine/mixExplanation';
import { explainMix, useAiEnabled } from '../lib/aiClient';

/**
 * "Explain this mix" with AI. The engine (or the borrower) chose the mix and the engine computed
 * every figure; the model only puts them into words. Shown only when AI is switched on, sent only
 * on request, and what is sent can be inspected first.
 */
export function MixExplainer({ request }: { request?: ExplainRequest }) {
  const enabled = useAiEnabled();
  const key = useMemo(() => (request ? JSON.stringify(request) : ''), [request]);
  const explainer = useMutation({ mutationFn: (body: ExplainRequest) => explainMix(body) });
  const { reset } = explainer;

  // A new mix makes the previous explanation wrong; drop it rather than leave it beside new figures.
  useEffect(() => reset(), [key, reset]);

  if (!enabled || !request) {
    return null;
  }
  const explanation = explainer.data;

  return (
    <section className="card space-y-3 border-brand-500/30 bg-brand-50/40" aria-label="הסבר התמהיל עם AI">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">
            <span aria-hidden>🤖 </span>
            {request.chosenBy === 'BORROWER' ? 'מה אומר התמהיל שבחרתם?' : 'למה דווקא התמהיל הזה?'}
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">הסבר AI במילים פשוטות · נשלחים רק מספרי התמהיל, בלי פרטים מזהים</p>
        </div>
        {!explanation && (
          <button
            type="button"
            className="btn-primary no-print"
            disabled={explainer.isPending}
            onClick={() => explainer.mutate(request)}
          >
            {explainer.isPending ? 'מכין הסבר…' : 'הסבר לי את התמהיל'}
          </button>
        )}
      </div>

      {!explanation && (
        <details className="no-print">
          <summary className="cursor-pointer text-xs font-medium text-brand-700">מה יישלח</summary>
          <pre
            dir="ltr"
            className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-xs text-ink-muted"
            tabIndex={0}
          >
            {JSON.stringify(request, null, 2)}
          </pre>
        </details>
      )}

      {explainer.isError && (
        <p className="text-sm text-negative" role="alert">
          {explainer.error instanceof Error ? explainer.error.message : 'ההסבר לא התקבל.'}
        </p>
      )}

      {explanation && (
        <div className="space-y-3 text-sm" aria-live="polite">
          <p className="font-medium text-ink">{explanation.headline}</p>
          <ExplanationList title="למה כך" items={explanation.reasons} />
          <ExplanationList title="על מה לשים לב" items={explanation.risks} tone="caution" />
          <ExplanationList title="מה לשאול בבנק" items={explanation.askTheBank} />
          <p className="text-xs text-ink-soft">
            נכתב עם AI. המספרים הם של המחשבון; ההסבר אינו ייעוץ פיננסי ועלול לטעות בניסוח — בדקו מול הטבלאות.
          </p>
        </div>
      )}
    </section>
  );
}

function ExplanationList({ title, items, tone }: { title: string; items: readonly string[]; tone?: 'caution' }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div>
      <h3 className="text-xs font-semibold text-ink-muted">{title}</h3>
      <ul className={`mt-1 list-inside list-disc space-y-1 ${tone === 'caution' ? 'text-caution' : 'text-ink'}`}>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
