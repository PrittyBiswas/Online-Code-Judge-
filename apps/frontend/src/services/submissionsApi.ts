import { apiClient, getWithRetry } from './apiClient';
import type { SampleRunResult, SampleRunStatus, SupportedLanguage } from '../types';

export interface RunSampleRequest {
  problemId: string;
  code: string;
  language: SupportedLanguage;
}

interface RunSampleEnqueueEnvelope {
  data: {
    runId: string;
    status: SampleRunStatus;
  };
}

interface SampleRunStatusEnvelope {
  data: {
    sampleRun: SampleRunResult;
  };
}

export async function runSampleCode(
  payload: RunSampleRequest,
  signal?: AbortSignal
): Promise<{ runId: string; status: SampleRunStatus }> {
  const response = await apiClient.post<RunSampleEnqueueEnvelope>(
    '/api/submissions/run-sample',
    {
      problemId: payload.problemId,
      code: payload.code,
      language: payload.language,
    },
    { signal }
  );
  return response.data.data;
}

export async function fetchSampleRunResult(
  runId: string,
  signal?: AbortSignal
): Promise<SampleRunResult> {
  const envelope = await getWithRetry<SampleRunStatusEnvelope>(
    `/api/submissions/run-sample/${encodeURIComponent(runId)}`,
    { signal },
    1
  );
  return envelope.data.sampleRun;
}

