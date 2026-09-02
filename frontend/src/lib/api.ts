import type {
  BaselineResponse,
  BorrowerProfileRequest,
  DocumentJob,
  MacroRequest,
  OptimizationResponse,
  ReferenceResponse,
  SimulationResponse,
  TrackRequest,
} from './types';

/** Same-origin in production; the Vite dev server proxies /api to the backend. */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/** The shape the backend's exception handler returns for anything it rejects. */
interface ApiErrorBody {
  code: string;
  message: string;
  details: string[];
}

/** An API failure carrying the Hebrew message the backend produced, ready to render. */
export class ApiError extends Error {
  readonly code: string;
  readonly details: string[];
  readonly status: number;

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.message ?? 'אירעה שגיאה בתקשורת עם השרת.');
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code ?? 'UNKNOWN';
    this.details = body.details ?? [];
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!response.ok) {
    // The error body is itself JSON; if the server failed before producing one, fall back
    // rather than throwing a parse error over the top of the real failure.
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body as Partial<ApiErrorBody>);
  }

  return (await response.json()) as T;
}

export function fetchReference(): Promise<ReferenceResponse> {
  return request<ReferenceResponse>('/api/v1/reference');
}

export function fetchBaseline(): Promise<BaselineResponse> {
  return request<BaselineResponse>('/api/v1/market-baseline/current');
}

export function optimize(
  profile: BorrowerProfileRequest,
  macro?: MacroRequest,
  percentile?: number,
): Promise<OptimizationResponse> {
  return request<OptimizationResponse>('/api/v1/mortgage/optimize', {
    method: 'POST',
    body: JSON.stringify({ profile, macro, percentile }),
  });
}

export function simulate(
  profile: BorrowerProfileRequest,
  tracks: TrackRequest[],
  macro?: MacroRequest,
  includeSchedule = false,
): Promise<SimulationResponse> {
  return request<SimulationResponse>('/api/v1/mortgage/simulate', {
    method: 'POST',
    body: JSON.stringify({ profile, tracks, macro, includeSchedule }),
  });
}

export async function uploadApproval(file: File, ltv: number, contribute: boolean): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('ltv', String(ltv));
  form.append('contribute', String(contribute));

  const result = await request<{ jobId: string }>('/api/v1/documents/upload-approval', {
    method: 'POST',
    body: form,
  });
  return result.jobId;
}

export function fetchDocumentJob(jobId: string): Promise<DocumentJob> {
  return request<DocumentJob>(`/api/v1/documents/jobs/${jobId}`);
}
