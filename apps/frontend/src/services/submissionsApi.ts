import { apiClient, getWithRetry } from './apiClient';
import type {
  SampleRunResult,
  SampleRunStatus,
  Submission,
  SubmissionStatus,
  SupportedLanguage,
} from '../types';

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

interface OfficialSubmitEnvelope {
  data: {
    id: string;
    status: SubmissionStatus;
  };
}

interface OfficialSubmissionDetailEnvelope {
  data: {
    submission: Submission;
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

export async function submitOfficialSolution(
  payload: RunSampleRequest,
  signal?: AbortSignal
): Promise<{ id: string; status: SubmissionStatus }> {
  const response = await apiClient.post<OfficialSubmitEnvelope>(
    '/api/submissions',
    {
      problemId: payload.problemId,
      code: payload.code,
      language: payload.language,
    },
    { signal }
  );
  return response.data.data;
}

export async function fetchSubmissionById(
  submissionId: string,
  signal?: AbortSignal
): Promise<Submission> {
  const envelope = await getWithRetry<OfficialSubmissionDetailEnvelope>(
    `/api/submissions/${encodeURIComponent(submissionId)}`,
    { signal },
    1
  );
  return envelope.data.submission;
}
