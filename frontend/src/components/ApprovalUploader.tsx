import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, fetchDocumentJob, uploadApproval } from '../lib/api';
import type { DocumentJob } from '../lib/types';
import { formatCurrency, formatPercent } from '../lib/format';
import { toOfferTracks } from '../engine/aiExtraction';
import { isImageFile } from '../engine/documents';
import { AiDocumentReader } from './AiDocumentReader';
import { Card } from './ui';

const REDACTION_LABELS: Record<string, string> = {
  NATIONAL_ID: 'תעודות זהות',
  NAME: 'שמות',
  ADDRESS: 'כתובות',
  ACCOUNT: 'מספרי חשבון',
  PHONE: 'טלפונים',
  EMAIL: 'כתובות דוא"ל',
};

/**
 * Drag-and-drop upload for an approval-in-principle, with a side-by-side verification panel.
 *
 * The extraction is asynchronous, so the component polls the job and stops the moment the job
 * reaches a terminal state — a completed job is not re-fetched, and a failed one is not retried
 * forever behind the user's back.
 */
export function ApprovalUploader({
  title = 'העלאת אישור עקרוני',
  onExtracted,
}: {
  title?: string;
  onExtracted?: (job: DocumentJob) => void;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: (file: File) => uploadApproval(file),
    onSuccess: setJobId,
  });

  const job = useQuery({
    queryKey: ['document-job', jobId],
    queryFn: () => fetchDocumentJob(jobId as string),
    enabled: jobId !== null,
    // Poll while the job is in flight and stop as soon as it settles.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'COMPLETED' || status === 'FAILED' ? false : 1_000;
    },
  });

  // The last file chosen, offered for reading with AI when the local parser finds no tracks in it.
  const [lastFile, setLastFile] = useState<File>();
  const [aiFile, setAiFile] = useState<File>();
  const [aiResult, setAiResult] = useState<{ count: number; warnings: string[] }>();

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) {
        setJobId(null);
        setLastFile(file);
        setAiFile(undefined);
        setAiResult(undefined);
        // A photo or screenshot can only be read with AI.
        if (isImageFile(file)) {
          setAiFile(file);
        } else {
          upload.mutate(file);
        }
      }
    },
    [upload],
  );

  const importFromAi = (data: unknown) => {
    const { items, warnings, bank } = toOfferTracks(data);
    setAiResult({ count: items.length, warnings });
    setAiFile(undefined);
    if (items.length > 0 && onExtracted) {
      const now = new Date().toISOString();
      onExtracted({
        jobId: `ai-${now}`,
        status: 'COMPLETED',
        submittedAt: now,
        completedAt: now,
        redactedSpans: 0,
        result: {
          pageCount: 1,
          redactedSpans: 0,
          redactionsByCategory: {},
          ...(bank ? { bankCode: bank } : {}),
          totalAmount: items.reduce((sum, track) => sum + track.amount, 0),
          tracks: items,
          warnings,
        },
      });
    }
  };

  const result = job.data?.status === 'COMPLETED' ? job.data.result : undefined;
  const completedJob = job.data?.status === 'COMPLETED' ? job.data : undefined;

  useEffect(() => {
    // Nothing recognised in a text document: offer to read it with AI.
    if (completedJob && completedJob.result?.tracks.length === 0 && lastFile) {
      setAiFile(lastFile);
    }
  }, [completedJob, lastFile]);

  useEffect(() => {
    // Notify the parent once the job settles, in an effect rather than during render — polling
    // re-renders this component every second and a render-time callback would fire on each one.
    if (completedJob && onExtracted) {
      onExtracted(completedJob);
    }
  }, [completedJob, onExtracted]);

  return (
    <Card
      title={title}
      term="approval"
    >
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
          dragging ? 'border-brand-500 bg-brand-50' : 'border-line-strong bg-surface-muted/50'
        }`}
      >
        <p className="text-sm font-medium text-ink">גררו לכאן את האישור העקרוני או ההצעה — PDF או צילום מסך</p>
        <p className="mt-1 text-xs text-ink-soft">עד 10MB · הקובץ עצמו אינו נשמר בשום שלב</p>
        <button type="button" className="btn-ghost mt-4" onClick={() => inputRef.current?.click()}>
          בחירת קובץ
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,application/pdf,image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label="בחירת מסמך הצעה או אישור עקרוני"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>

      {aiFile && (
        <AiDocumentReader
          kind="offer"
          file={aiFile}
          reason={
            isImageFile(aiFile)
              ? 'זו תמונה — המחשבון קורא בעצמו רק אישור עקרוני אחיד בקובץ PDF.'
              : 'לא זוהו במסמך מסלולים בפורמט האישור העקרוני האחיד.'
          }
          onData={importFromAi}
        />
      )}
      {aiResult && (
        <div className="mt-3 space-y-1 text-sm" aria-live="polite">
          {aiResult.count > 0 ? (
            <p className="font-medium text-positive">
              ✓ זוהו {aiResult.count} מסלולים עם AI — בדקו אותם בטבלה מול המסמך.
            </p>
          ) : (
            <p className="text-negative">לא זוהו במסמך מסלולי הלוואה. אפשר להזין אותם ידנית.</p>
          )}
          {aiResult.warnings.length > 0 && (
            <ul className="list-inside list-disc text-caution">
              {aiResult.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}


      {upload.isPending && <p className="mt-4 text-sm text-ink-soft">מעלה את הקובץ…</p>}

      {upload.isError && (
        <p className="mt-4 text-sm text-negative">
          {upload.error instanceof ApiError ? upload.error.message : 'העלאת הקובץ נכשלה.'}
        </p>
      )}

      {job.data && job.data.status !== 'COMPLETED' && job.data.status !== 'FAILED' && (
        <p className="mt-4 text-sm text-ink-soft">מעבד את המסמך ומסיר פרטים מזהים…</p>
      )}

      {job.data?.status === 'FAILED' && (
        <p className="mt-4 text-sm text-negative">{job.data.error ?? 'עיבוד המסמך נכשל.'}</p>
      )}

      {result && (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl bg-emerald-500/10 p-3">
            <p className="text-sm font-medium text-positive">
              הוסרו {job.data?.redactedSpans ?? 0} פרטים מזהים לפני כל שמירה
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-positive">
              {Object.entries(result.redactionsByCategory).map(([category, count]) => (
                <li key={category}>
                  {REDACTION_LABELS[category] ?? category}: {count}
                </li>
              ))}
            </ul>
          </div>

          {result.tracks.length > 0 && (
            <div className="overflow-x-auto" role="region" aria-label="טבלה" tabIndex={0}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-ink-soft">
                    <th className="py-2 text-start font-medium">מסלול</th>
                    <th className="py-2 text-start font-medium">סכום</th>
                    <th className="py-2 text-start font-medium">ריבית</th>
                    <th className="py-2 text-start font-medium">תקופה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {result.tracks.map((track, index) => (
                    <tr key={`${track.track}-${index}`}>
                      <td className="py-2 font-medium text-ink">{track.hebrewName}</td>
                      <td className="tabular py-2">{formatCurrency(track.amount)}</td>
                      <td className="tabular py-2">{formatPercent(track.annualRate)}</td>
                      <td className="tabular py-2">{track.termMonths || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line font-semibold">
                    <td className="py-2">סה"כ</td>
                    <td className="tabular py-2">{formatCurrency(result.totalAmount)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {result.warnings.length > 0 && (
            <ul className="list-inside list-disc rounded-xl bg-amber-500/10 p-3 text-xs text-caution">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
