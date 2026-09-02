import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, fetchDocumentJob, uploadApproval } from '../lib/api';
import type { DocumentJob } from '../lib/types';
import { formatCurrency, formatPercent } from '../lib/format';
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
  ltv,
  onExtracted,
}: {
  ltv: number;
  onExtracted?: (job: DocumentJob) => void;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [contribute, setContribute] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: (file: File) => uploadApproval(file, ltv, contribute),
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

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) {
        setJobId(null);
        upload.mutate(file);
      }
    },
    [upload],
  );

  const result = job.data?.status === 'COMPLETED' ? job.data.result : undefined;
  const completedJob = job.data?.status === 'COMPLETED' ? job.data : undefined;

  useEffect(() => {
    // Notify the parent once the job settles, in an effect rather than during render — polling
    // re-renders this component every second and a render-time callback would fire on each one.
    if (completedJob && onExtracted) {
      onExtracted(completedJob);
    }
  }, [completedJob, onExtracted]);

  return (
    <Card
      title="העלאת אישור עקרוני"
      subtitle="חילוץ אוטומטי של המסלולים והריביות מתוך האישור העקרוני האחיד."
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
          dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50/50'
        }`}
      >
        <p className="text-sm font-medium text-ink">גררו לכאן את קובץ ה-PDF של האישור העקרוני</p>
        <p className="mt-1 text-xs text-ink-soft">עד 10MB · הקובץ עצמו אינו נשמר בשום שלב</p>
        <button type="button" className="btn-ghost mt-4" onClick={() => inputRef.current?.click()}>
          בחירת קובץ
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,application/pdf"
          className="sr-only"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>

      <label className="mt-3 flex items-start gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={contribute}
          onChange={(event) => setContribute(event.target.checked)}
        />
        <span>
          אני מאשר/ת לתרום את תנאי ההצעה באופן אנונימי לבסיס הנתונים הציבורי. נשמרים רק שם הבנק,
          המסלול, הריבית ושיעור המימון — ללא כל פרט מזהה.
        </span>
      </label>

      {upload.isPending && <p className="mt-4 text-sm text-ink-soft">מעלה את הקובץ…</p>}

      {upload.isError && (
        <p className="mt-4 text-sm text-rose-600">
          {upload.error instanceof ApiError ? upload.error.message : 'העלאת הקובץ נכשלה.'}
        </p>
      )}

      {job.data && job.data.status !== 'COMPLETED' && job.data.status !== 'FAILED' && (
        <p className="mt-4 text-sm text-ink-soft">מעבד את המסמך ומסיר פרטים מזהים…</p>
      )}

      {job.data?.status === 'FAILED' && (
        <p className="mt-4 text-sm text-rose-600">{job.data.error ?? 'עיבוד המסמך נכשל.'}</p>
      )}

      {result && (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl bg-emerald-50 p-3">
            <p className="text-sm font-medium text-emerald-800">
              הוסרו {job.data?.redactedSpans ?? 0} פרטים מזהים לפני כל שמירה
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-emerald-700">
              {Object.entries(result.redactionsByCategory).map(([category, count]) => (
                <li key={category}>
                  {REDACTION_LABELS[category] ?? category}: {count}
                </li>
              ))}
            </ul>
          </div>

          {result.tracks.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-ink-soft">
                    <th className="py-2 text-start font-medium">מסלול</th>
                    <th className="py-2 text-start font-medium">סכום</th>
                    <th className="py-2 text-start font-medium">ריבית</th>
                    <th className="py-2 text-start font-medium">תקופה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
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
                  <tr className="border-t border-slate-200 font-semibold">
                    <td className="py-2">סה"כ</td>
                    <td className="tabular py-2">{formatCurrency(result.totalAmount)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {result.warnings.length > 0 && (
            <ul className="list-inside list-disc rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
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
