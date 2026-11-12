import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Cpu,
  Loader2,
  Play,
  RotateCcw,
  Send,
} from 'lucide-react';
import { SubmissionStatus, Verdict } from '@judge/shared';
import { useAuth } from '../context/AuthContext';
import {
  fetchSampleRunResult,
  fetchSubmissionById,
  runSampleCode,
  submitOfficialSolution,
} from '../services/submissionsApi';
import { classifyApiError } from '../services/apiClient';
import { CodeEditor } from './CodeEditor';
import type {
  Problem,
  SampleRunOutcome,
  SampleRunResult,
  Submission,
  SupportedLanguage,
} from '../types';

export const STARTER_CODE: Record<SupportedLanguage, string> = {
  javascript: [
    "const fs = require('fs');",
    "const input = fs.readFileSync(0, 'utf8').trim();",
    '',
    '// Write your solution here and print output with console.log',
    'console.log(input);',
  ].join('\n'),
  python: [
    'import sys',
    '',
    'data = sys.stdin.read().strip()',
    '# Write your solution here and print output with print()',
    'print(data)',
  ].join('\n'),
};

const OUTCOME_META: Record<
  SampleRunOutcome,
  { label: string; badgeClass: string; isError: boolean }
> = {
  SUCCESS: {
    label: 'Completed',
    badgeClass: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
    isError: false,
  },
  COMPILATION_ERROR: {
    label: 'Compilation Error',
    badgeClass: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
    isError: true,
  },
  RUNTIME_ERROR: {
    label: 'Runtime Error',
    badgeClass: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
    isError: true,
  },
  TIME_LIMIT_EXCEEDED: {
    label: 'Time Limit Exceeded',
    badgeClass: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
    isError: true,
  },
  MEMORY_LIMIT_EXCEEDED: {
    label: 'Memory Limit Exceeded',
    badgeClass: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
    isError: true,
  },
  OUTPUT_LIMIT_EXCEEDED: {
    label: 'Output Limit Exceeded',
    badgeClass: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
    isError: true,
  },
  INTERNAL_ERROR: {
    label: 'Infrastructure Error',
    badgeClass: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
    isError: true,
  },
};

const VERDICT_META: Record<Verdict, { label: string; badgeClass: string; isAccepted: boolean }> = {
  [Verdict.ACCEPTED]: {
    label: 'Accepted',
    badgeClass: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
    isAccepted: true,
  },
  [Verdict.WRONG_ANSWER]: {
    label: 'Wrong Answer',
    badgeClass: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
    isAccepted: false,
  },
  [Verdict.TIME_LIMIT_EXCEEDED]: {
    label: 'Time Limit Exceeded',
    badgeClass: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
    isAccepted: false,
  },
  [Verdict.MEMORY_LIMIT_EXCEEDED]: {
    label: 'Memory Limit Exceeded',
    badgeClass: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
    isAccepted: false,
  },
  [Verdict.RUNTIME_ERROR]: {
    label: 'Runtime Error',
    badgeClass: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
    isAccepted: false,
  },
  [Verdict.COMPILATION_ERROR]: {
    label: 'Compilation Error',
    badgeClass: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
    isAccepted: false,
  },
  [Verdict.OUTPUT_LIMIT_EXCEEDED]: {
    label: 'Output Limit Exceeded',
    badgeClass: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
    isAccepted: false,
  },
  [Verdict.INTERNAL_ERROR]: {
    label: 'Internal Error',
    badgeClass: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
    isAccepted: false,
  },
};

type UiRunPhase = 'idle' | 'submitting' | 'queued' | 'running' | 'finished' | 'error';

const SAMPLE_POLL_INTERVAL_MS = 500;
const MAX_SAMPLE_POLL_WAIT_MS = 30000;
const MAX_OFFICIAL_POLL_WAIT_MS = 45000;
const MAX_OFFICIAL_POLL_ERRORS = 3;

export function SampleRunnerPanel({ problem }: { problem: Problem }) {
  const { status: authStatus } = useAuth();
  const location = useLocation();

  const [language, setLanguage] = useState<SupportedLanguage>('javascript');
  const [codeByLang, setCodeByLang] = useState<Record<SupportedLanguage, string>>({
    javascript: STARTER_CODE.javascript,
    python: STARTER_CODE.python,
  });
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Sample run state
  const [phase, setPhase] = useState<UiRunPhase>('idle');
  const [runResult, setRunResult] = useState<SampleRunResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Official submission state
  const [submitPhase, setSubmitPhase] = useState<UiRunPhase>('idle');
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [officialSubmission, setOfficialSubmission] = useState<Submission | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const activeProblemIdRef = useRef(problem.id);
  const sampleAbortRef = useRef<AbortController | null>(null);
  const sampleInFlightRef = useRef(false);
  const submitAbortRef = useRef<AbortController | null>(null);
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    activeProblemIdRef.current = problem.id;
    sampleAbortRef.current?.abort();
    sampleInFlightRef.current = false;
    submitAbortRef.current?.abort();
    submitInFlightRef.current = false;

    setPhase('idle');
    setRunResult(null);
    setErrorMessage(null);
    setSubmitPhase('idle');
    setSubmissionId(null);
    setOfficialSubmission(null);
    setSubmitError(null);
    setConfirmResetOpen(false);

    return () => {
      sampleAbortRef.current?.abort();
      submitAbortRef.current?.abort();
    };
  }, [problem.id]);

  const currentCode = codeByLang[language];
  const isDirty = currentCode !== STARTER_CODE[language];
  const isSampleBusy = phase === 'submitting' || phase === 'queued' || phase === 'running';
  const isSubmitBusy =
    submitPhase === 'submitting' || submitPhase === 'queued' || submitPhase === 'running';
  const isEditorLocked = isSampleBusy || isSubmitBusy;

  function handleCodeChange(nextCode: string) {
    setCodeByLang((prev) => ({ ...prev, [language]: nextCode }));
  }

  function handleResetRequest() {
    if (!isDirty) {
      setCodeByLang((prev) => ({ ...prev, [language]: STARTER_CODE[language] }));
      return;
    }
    setConfirmResetOpen(true);
  }

  function confirmReset() {
    setCodeByLang((prev) => ({ ...prev, [language]: STARTER_CODE[language] }));
    setConfirmResetOpen(false);
  }

  async function handleRunSample() {
    if (isSampleBusy || sampleInFlightRef.current || authStatus !== 'authenticated') return;

    if (!currentCode.trim()) {
      setPhase('error');
      setErrorMessage('Code cannot be empty before running.');
      return;
    }

    sampleAbortRef.current?.abort();
    const controller = new AbortController();
    sampleAbortRef.current = controller;
    sampleInFlightRef.current = true;

    const targetProblemId = problem.id;
    setPhase('submitting');
    setErrorMessage(null);
    setRunResult(null);

    try {
      const queued = await runSampleCode(
        {
          problemId: targetProblemId,
          code: currentCode,
          language,
        },
        controller.signal
      );

      if (controller.signal.aborted || activeProblemIdRef.current !== targetProblemId) return;
      setPhase('queued');

      const startedAt = Date.now();
      while (!controller.signal.aborted && activeProblemIdRef.current === targetProblemId) {
        if (Date.now() - startedAt > MAX_SAMPLE_POLL_WAIT_MS) {
          setPhase('error');
          setErrorMessage('Sample execution timed out waiting for the judge worker.');
          break;
        }

        await new Promise((resolve) => window.setTimeout(resolve, SAMPLE_POLL_INTERVAL_MS));
        if (controller.signal.aborted || activeProblemIdRef.current !== targetProblemId) return;

        const latest = await fetchSampleRunResult(queued.runId, controller.signal);
        if (controller.signal.aborted || activeProblemIdRef.current !== targetProblemId) return;

        if (latest.status === 'QUEUED') {
          setPhase('queued');
          continue;
        }
        if (latest.status === 'RUNNING') {
          setPhase('running');
          continue;
        }

        setRunResult(latest);
        setPhase('finished');
        break;
      }
    } catch (err) {
      if (controller.signal.aborted || activeProblemIdRef.current !== targetProblemId) return;
      const classified = classifyApiError(err, 'Failed to execute sample code.');
      if (classified.category === 'cancelled') return;
      setPhase('error');
      setErrorMessage(classified.message);
    } finally {
      sampleInFlightRef.current = false;
    }
  }

  async function pollSubmissionStatus(
    targetSubmissionId: string,
    targetProblemId: string,
    controller: AbortController
  ) {
    const startedAt = Date.now();
    let pollDelayMs = 600;
    let consecutiveErrors = 0;

    while (!controller.signal.aborted && activeProblemIdRef.current === targetProblemId) {
      if (Date.now() - startedAt > MAX_OFFICIAL_POLL_WAIT_MS) {
        setSubmitPhase('error');
        setSubmitError(
          'Judging is taking longer than expected. Your submission is still in progress—click Check Status to refresh.'
        );
        break;
      }

      await new Promise((resolve) => window.setTimeout(resolve, pollDelayMs));
      if (controller.signal.aborted || activeProblemIdRef.current !== targetProblemId) return;

      try {
        const latest = await fetchSubmissionById(targetSubmissionId, controller.signal);
        if (controller.signal.aborted || activeProblemIdRef.current !== targetProblemId) return;

        consecutiveErrors = 0;
        if (latest.status === SubmissionStatus.QUEUED) {
          setSubmitPhase('queued');
        } else if (latest.status === SubmissionStatus.RUNNING) {
          setSubmitPhase('running');
        } else {
          setOfficialSubmission(latest);
          setSubmitPhase('finished');
          break;
        }
      } catch (pollErr) {
        if (controller.signal.aborted || activeProblemIdRef.current !== targetProblemId) return;
        const classified = classifyApiError(pollErr, 'Failed to check submission status.');
        if (classified.category === 'cancelled') return;

        consecutiveErrors += 1;
        if (
          classified.category === 'forbidden' ||
          classified.category === 'not_found' ||
          classified.category === 'unauthorized' ||
          consecutiveErrors >= MAX_OFFICIAL_POLL_ERRORS
        ) {
          setSubmitPhase('error');
          setSubmitError(classified.message);
          break;
        }
      }

      pollDelayMs = Math.min(Math.round(pollDelayMs * 1.4), 2500);
    }
  }

  async function handleResumeStatusCheck() {
    if (
      !submissionId ||
      isSubmitBusy ||
      submitInFlightRef.current ||
      authStatus !== 'authenticated'
    ) {
      return;
    }

    submitAbortRef.current?.abort();
    const controller = new AbortController();
    submitAbortRef.current = controller;
    submitInFlightRef.current = true;

    const targetProblemId = problem.id;
    setSubmitError(null);
    setSubmitPhase('queued');

    try {
      await pollSubmissionStatus(submissionId, targetProblemId, controller);
    } finally {
      submitInFlightRef.current = false;
    }
  }

  async function handleOfficialSubmit() {
    if (isSubmitBusy || submitInFlightRef.current || authStatus !== 'authenticated') return;

    if (!currentCode.trim()) {
      setSubmitPhase('error');
      setSubmitError('Code cannot be empty before submitting.');
      return;
    }

    submitAbortRef.current?.abort();
    const controller = new AbortController();
    submitAbortRef.current = controller;
    submitInFlightRef.current = true;

    const targetProblemId = problem.id;
    setSubmitPhase('submitting');
    setSubmitError(null);
    setSubmissionId(null);
    setOfficialSubmission(null);

    try {
      const created = await submitOfficialSolution(
        {
          problemId: targetProblemId,
          code: currentCode,
          language,
        },
        controller.signal
      );

      if (controller.signal.aborted || activeProblemIdRef.current !== targetProblemId) return;
      setSubmissionId(created.id);
      setSubmitPhase('queued');

      await pollSubmissionStatus(created.id, targetProblemId, controller);
    } catch (err) {
      if (controller.signal.aborted || activeProblemIdRef.current !== targetProblemId) return;
      const classified = classifyApiError(err, 'Failed to submit solution.');
      if (classified.category === 'cancelled') return;
      setSubmitPhase('error');
      setSubmitError(classified.message);
    } finally {
      submitInFlightRef.current = false;
    }
  }

  const outcomeMeta = runResult?.outcome ? OUTCOME_META[runResult.outcome] : null;
  const verdictMeta = officialSubmission?.verdict ? VERDICT_META[officialSubmission.verdict] : null;

  return (
    <section
      aria-labelledby="sample-runner-heading"
      className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="sample-runner-heading" className="text-lg font-semibold text-white">
            Code Editor &amp; Submission
          </h2>
          <p className="text-xs text-slate-400">
            Run Sample tests public sample input only; Submit evaluates against all official hidden
            test cases.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="editor-language" className="sr-only">
            Programming language
          </label>
          <select
            id="editor-language"
            aria-label="Programming language"
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value as SupportedLanguage);
              setConfirmResetOpen(false);
            }}
            disabled={isEditorLocked}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
          >
            <option value="javascript">JavaScript (Node 20)</option>
            <option value="python">Python (3.11)</option>
          </select>

          <button
            type="button"
            onClick={handleResetRequest}
            disabled={isEditorLocked}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Code
          </button>

          <button
            type="button"
            onClick={() => void handleRunSample()}
            disabled={isSampleBusy || authStatus !== 'authenticated'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSampleBusy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {phase === 'submitting'
                  ? 'Sending...'
                  : phase === 'queued'
                    ? 'Queued...'
                    : 'Running...'}
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Run Sample
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => void handleOfficialSubmit()}
            disabled={isSubmitBusy || authStatus !== 'authenticated'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitBusy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {submitPhase === 'submitting'
                  ? 'Submitting...'
                  : submitPhase === 'queued'
                    ? 'Queued...'
                    : 'Judging...'}
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Submit
              </>
            )}
          </button>
        </div>
      </div>

      {confirmResetOpen && (
        <div
          role="alertdialog"
          aria-label="Confirm code reset"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200"
        >
          <span>Discard your current {language} edits and reset to starter code?</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={confirmReset}
              className="rounded-md bg-amber-500/20 px-3 py-1 font-semibold text-amber-100 hover:bg-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              Confirm Reset
            </button>
            <button
              type="button"
              onClick={() => setConfirmResetOpen(false)}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-slate-200 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {authStatus !== 'authenticated' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-xs text-slate-300">
          <span>Sign in to run sample code or submit an official solution.</span>
          <Link
            to="/login"
            state={{ from: location }}
            className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            Sign in to Run
          </Link>
        </div>
      )}

      <CodeEditor
        language={language}
        value={currentCode}
        onChange={handleCodeChange}
        readOnly={isEditorLocked}
      />

      {submitPhase !== 'idle' && (
        <div
          aria-label="Official submission status"
          className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Official Submission Verdict
            </h3>

            {submitPhase === 'submitting' && (
              <span role="status" className="text-xs text-emerald-300">
                Creating submission...
              </span>
            )}
            {submitPhase === 'queued' && (
              <span role="status" className="text-xs text-amber-300">
                QUEUED — Waiting for judge worker...
              </span>
            )}
            {submitPhase === 'running' && (
              <span role="status" className="text-xs text-indigo-300">
                RUNNING — Executing official test suite...
              </span>
            )}
            {submitPhase === 'finished' && verdictMeta && (
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${verdictMeta.badgeClass}`}
                >
                  {verdictMeta.isAccepted ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <AlertCircle className="h-3 w-3" />
                  )}
                  {verdictMeta.label}
                </span>
                {officialSubmission?.executionTimeMs !== undefined && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="h-3 w-3" />
                    {officialSubmission.executionTimeMs} ms
                  </span>
                )}
                {officialSubmission?.memoryUsedKb !== undefined &&
                  officialSubmission.memoryUsedKb > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <Cpu className="h-3 w-3" />
                      {officialSubmission.memoryUsedKb} KB
                    </span>
                  )}
              </div>
            )}
          </div>

          {submissionId && (
            <p className="text-xs text-slate-500">
              Submission ID: <code className="text-slate-300">{submissionId}</code>
            </p>
          )}

          {officialSubmission?.failedTestIndex !== undefined && (
            <p className="text-xs text-slate-300">
              Stopped at test case #{officialSubmission.failedTestIndex + 1}
            </p>
          )}

          {submitPhase === 'error' && submitError && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
            >
              <span>{submitError}</span>
              {submissionId && (
                <button
                  type="button"
                  onClick={() => void handleResumeStatusCheck()}
                  className="rounded-md border border-rose-400/40 bg-rose-500/20 px-3 py-1 font-semibold text-rose-100 hover:bg-rose-500/30 focus:outline-none focus:ring-2 focus:ring-rose-400"
                >
                  Check Status
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Execution Output
          </h3>
          {phase === 'idle' && <span className="text-xs text-slate-500">Ready to run</span>}
          {phase === 'submitting' && (
            <span role="status" className="text-xs text-indigo-300">
              Submitting sample run...
            </span>
          )}
          {phase === 'queued' && (
            <span role="status" className="text-xs text-amber-300">
              Queued for sandbox execution...
            </span>
          )}
          {phase === 'running' && (
            <span role="status" className="text-xs text-indigo-300">
              Running in isolated Docker sandbox...
            </span>
          )}
          {phase === 'finished' && outcomeMeta && (
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${outcomeMeta.badgeClass}`}
              >
                {outcomeMeta.isError ? (
                  <AlertCircle className="h-3 w-3" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                {outcomeMeta.label}
              </span>
              {runResult?.executionTimeMs !== undefined && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3 w-3" />
                  {runResult.executionTimeMs} ms
                </span>
              )}
              {runResult?.memoryUsedKb !== undefined && runResult.memoryUsedKb > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <Cpu className="h-3 w-3" />
                  {runResult.memoryUsedKb} KB
                </span>
              )}
            </div>
          )}
        </div>

        {phase === 'error' && errorMessage && (
          <div
            role="alert"
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
          >
            {errorMessage}
          </div>
        )}

        {runResult?.errorMessage && (
          <div
            role="alert"
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
          >
            {runResult.errorMessage}
          </div>
        )}

        {runResult && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <h4 className="mb-1 text-xs font-medium text-slate-400">Standard Output (stdout)</h4>
              <pre className="min-h-[64px] overflow-x-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono text-xs text-slate-200">
                <code>{runResult.stdout || '(empty)'}</code>
              </pre>
            </div>
            <div>
              <h4 className="mb-1 text-xs font-medium text-slate-400">Standard Error (stderr)</h4>
              <pre className="min-h-[64px] overflow-x-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono text-xs text-rose-200">
                <code>{runResult.stderr || '(none)'}</code>
              </pre>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
