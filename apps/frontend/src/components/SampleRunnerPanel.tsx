import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  EyeOff,
  Loader2,
  Play,
  Radio,
  RotateCcw,
  Send,
  Terminal,
  Trash2,
} from 'lucide-react';
import { SubmissionStatus, Verdict } from '@judge/shared';
import { useAuth } from '../context/AuthContext';
import {
  fetchSampleRunResult,
  fetchSubmissionById,
  getSubmissionLiveStreamUrl,
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
  SubmissionEvent,
  SupportedLanguage,
} from '../types';
import { STARTER_CODE as SHARED_STARTER_CODE } from '@judge/shared';

export const STARTER_CODE: Record<SupportedLanguage, string> = SHARED_STARTER_CODE;

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
  [Verdict.NOT_EXECUTED]: {
    label: 'Not Executed',
    badgeClass: 'border-slate-700 bg-slate-800/40 text-slate-400',
    isAccepted: false,
  },
};

type UiRunPhase = 'idle' | 'submitting' | 'queued' | 'running' | 'finished' | 'error';
type ConnectionState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'polling' | 'completed';

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  idle: '',
  connecting: 'Connecting',
  connected: 'Live updates connected',
  reconnecting: 'Reconnecting',
  polling: 'Using polling fallback',
  completed: 'Submission completed',
};

const SAMPLE_POLL_INTERVAL_MS = 500;
const MAX_SAMPLE_POLL_WAIT_MS = 30000;
const MAX_OFFICIAL_POLL_WAIT_MS = 45000;
const MAX_OFFICIAL_POLL_ERRORS = 3;

function getPhaseRank(phase: UiRunPhase): number {
  if (phase === 'finished') return 2;
  if (phase === 'running') return 1;
  if (phase === 'queued') return 0;
  return -1;
}

export function SampleRunnerPanel({
  problem,
  contestId,
}: {
  problem: Problem;
  contestId?: string;
}) {
  const { status: authStatus } = useAuth();
  const location = useLocation();

  const [language, setLanguage] = useState<SupportedLanguage>('javascript');
  const [codeByLang, setCodeByLang] = useState<Record<SupportedLanguage, string>>({
    ...STARTER_CODE,
  });
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Sample & Custom run state
  const [phase, setPhase] = useState<UiRunPhase>('idle');
  const [runResult, setRunResult] = useState<SampleRunResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'sample' | 'custom' | 'output'>('sample');
  const [customInput, setCustomInput] = useState<string>('');
  const [expandedTests, setExpandedTests] = useState<Record<number, boolean>>({});

  function toggleTestExpand(idx: number) {
    setExpandedTests((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  // Official submission state
  const [submitPhase, setSubmitPhase] = useState<UiRunPhase>('idle');
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [officialSubmission, setOfficialSubmission] = useState<Submission | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const activeProblemIdRef = useRef(problem.id);
  const activeSubmissionIdRef = useRef<string | null>(null);
  const submitPhaseRef = useRef<UiRunPhase>('idle');
  const sampleAbortRef = useRef<AbortController | null>(null);
  const sampleInFlightRef = useRef(false);
  const submitAbortRef = useRef<AbortController | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const submitInFlightRef = useRef(false);

  function closeEventSource() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }

  function updateSubmitPhase(next: UiRunPhase) {
    submitPhaseRef.current = next;
    setSubmitPhase(next);
  }

  useEffect(() => {
    activeProblemIdRef.current = problem.id;
    activeSubmissionIdRef.current = null;
    sampleAbortRef.current?.abort();
    sampleInFlightRef.current = false;
    submitAbortRef.current?.abort();
    closeEventSource();
    submitInFlightRef.current = false;

    setPhase('idle');
    setRunResult(null);
    setErrorMessage(null);
    updateSubmitPhase('idle');
    setConnectionState('idle');
    setSubmissionId(null);
    setOfficialSubmission(null);
    setSubmitError(null);
    setConfirmResetOpen(false);
    setActiveTab('sample');
    setCustomInput('');
    setExpandedTests({});

    return () => {
      sampleAbortRef.current?.abort();
      submitAbortRef.current?.abort();
      closeEventSource();
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

  async function handleRunExecution(isCustom: boolean = false) {
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
    setActiveTab('output');

    try {
      const queued = await runSampleCode(
        {
          problemId: targetProblemId,
          code: currentCode,
          language,
          contestId,
          ...(isCustom ? { customInput } : {}),
        },
        controller.signal
      );

      if (controller.signal.aborted || activeProblemIdRef.current !== targetProblemId) return;
      setPhase('queued');

      const startedAt = Date.now();
      while (!controller.signal.aborted && activeProblemIdRef.current === targetProblemId) {
        if (Date.now() - startedAt > MAX_SAMPLE_POLL_WAIT_MS) {
          setPhase('error');
          setErrorMessage('Execution timed out waiting for the judge worker.');
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
      const classified = classifyApiError(err, 'Failed to execute code.');
      if (classified.category === 'cancelled') return;
      setPhase('error');
      setErrorMessage(classified.message);
    } finally {
      sampleInFlightRef.current = false;
    }
  }

  function handleRunSample() {
    return handleRunExecution(false);
  }

  function handleRunCustom() {
    return handleRunExecution(true);
  }

  async function pollSubmissionStatus(
    targetSubmissionId: string,
    targetProblemId: string,
    controller: AbortController
  ) {
    setConnectionState('polling');
    const startedAt = Date.now();
    let pollDelayMs = 600;
    let consecutiveErrors = 0;

    try {
      while (
        !controller.signal.aborted &&
        activeProblemIdRef.current === targetProblemId &&
        activeSubmissionIdRef.current === targetSubmissionId
      ) {
        if (Date.now() - startedAt > MAX_OFFICIAL_POLL_WAIT_MS) {
          updateSubmitPhase('error');
          setSubmitError(
            'Judging is taking longer than expected. Your submission is still in progress—click Check Status to refresh.'
          );
          break;
        }

        await new Promise((resolve) => window.setTimeout(resolve, pollDelayMs));
        if (
          controller.signal.aborted ||
          activeProblemIdRef.current !== targetProblemId ||
          activeSubmissionIdRef.current !== targetSubmissionId
        ) {
          return;
        }

        try {
          const latest = await fetchSubmissionById(targetSubmissionId, controller.signal);
          if (
            controller.signal.aborted ||
            activeProblemIdRef.current !== targetProblemId ||
            activeSubmissionIdRef.current !== targetSubmissionId
          ) {
            return;
          }

          consecutiveErrors = 0;
          if (latest.status === SubmissionStatus.QUEUED) {
            if (getPhaseRank(submitPhaseRef.current) < 0) updateSubmitPhase('queued');
          } else if (latest.status === SubmissionStatus.RUNNING) {
            if (getPhaseRank(submitPhaseRef.current) < 1) updateSubmitPhase('running');
          } else {
            setOfficialSubmission(latest);
            updateSubmitPhase('finished');
            setConnectionState('completed');
            break;
          }
        } catch (pollErr) {
          if (
            controller.signal.aborted ||
            activeProblemIdRef.current !== targetProblemId ||
            activeSubmissionIdRef.current !== targetSubmissionId
          ) {
            return;
          }
          const classified = classifyApiError(pollErr, 'Failed to check submission status.');
          if (classified.category === 'cancelled') return;

          consecutiveErrors += 1;
          if (
            classified.category === 'forbidden' ||
            classified.category === 'not_found' ||
            classified.category === 'unauthorized' ||
            consecutiveErrors >= MAX_OFFICIAL_POLL_ERRORS
          ) {
            updateSubmitPhase('error');
            setSubmitError(classified.message);
            break;
          }
        }

        pollDelayMs = Math.min(Math.round(pollDelayMs * 1.4), 2500);
      }
    } finally {
      submitInFlightRef.current = false;
    }
  }

  function startSseTracking(
    targetSubmissionId: string,
    targetProblemId: string,
    controller: AbortController
  ) {
    if (typeof EventSource === 'undefined') {
      void pollSubmissionStatus(targetSubmissionId, targetProblemId, controller);
      return;
    }

    closeEventSource();
    setConnectionState('connecting');

    const streamUrl = getSubmissionLiveStreamUrl(targetSubmissionId);
    const es = new EventSource(streamUrl, { withCredentials: true });
    eventSourceRef.current = es;
    let sseErrors = 0;
    let fallbackStarted = false;

    const triggerPollingFallback = () => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      closeEventSource();
      if (
        controller.signal.aborted ||
        activeProblemIdRef.current !== targetProblemId ||
        activeSubmissionIdRef.current !== targetSubmissionId ||
        submitPhaseRef.current === 'finished'
      ) {
        submitInFlightRef.current = false;
        return;
      }
      void pollSubmissionStatus(targetSubmissionId, targetProblemId, controller);
    };

    es.onopen = () => {
      if (
        controller.signal.aborted ||
        activeProblemIdRef.current !== targetProblemId ||
        activeSubmissionIdRef.current !== targetSubmissionId
      ) {
        es.close();
        return;
      }
      sseErrors = 0;
      setConnectionState('connected');
    };

    es.onmessage = (msg) => {
      if (
        controller.signal.aborted ||
        activeProblemIdRef.current !== targetProblemId ||
        activeSubmissionIdRef.current !== targetSubmissionId
      ) {
        es.close();
        return;
      }

      let event: SubmissionEvent;
      try {
        event = JSON.parse(msg.data) as SubmissionEvent;
      } catch {
        return;
      }

      if (!event || event.submissionId !== targetSubmissionId) {
        return;
      }

      const isTerminal =
        Boolean(event.verdict) ||
        event.status === SubmissionStatus.COMPLETED ||
        Object.values(Verdict).includes(event.status as Verdict);

      if (isTerminal) {
        const finalVerdict =
          event.verdict ??
          (Object.values(Verdict).includes(event.status as Verdict)
            ? (event.status as Verdict)
            : Verdict.INTERNAL_ERROR);

        setOfficialSubmission({
          id: targetSubmissionId,
          problemId: targetProblemId,
          userId: '',
          code: '',
          language,
          status: SubmissionStatus.COMPLETED,
          verdict: finalVerdict,
          executionTimeMs: event.executionTimeMs,
          memoryUsedKb: event.memoryUsedKb,
          failedTestIndex: event.failedTestIndex,
          retryCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        updateSubmitPhase('finished');
        setConnectionState('completed');
        submitInFlightRef.current = false;
        closeEventSource();
        return;
      }

      if (event.status === SubmissionStatus.RUNNING) {
        if (getPhaseRank(submitPhaseRef.current) < 1) {
          updateSubmitPhase('running');
        }
      } else if (event.status === SubmissionStatus.QUEUED) {
        if (getPhaseRank(submitPhaseRef.current) < 0) {
          updateSubmitPhase('queued');
        }
      }
    };

    es.onerror = () => {
      if (
        controller.signal.aborted ||
        activeProblemIdRef.current !== targetProblemId ||
        activeSubmissionIdRef.current !== targetSubmissionId ||
        submitPhaseRef.current === 'finished'
      ) {
        closeEventSource();
        submitInFlightRef.current = false;
        return;
      }

      sseErrors += 1;
      if (sseErrors < 2 && es.readyState !== EventSource.CLOSED) {
        setConnectionState('reconnecting');
        return;
      }

      triggerPollingFallback();
    };
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
    closeEventSource();
    const controller = new AbortController();
    submitAbortRef.current = controller;
    submitInFlightRef.current = true;

    const targetProblemId = problem.id;
    activeSubmissionIdRef.current = submissionId;
    setSubmitError(null);
    updateSubmitPhase('queued');

    await pollSubmissionStatus(submissionId, targetProblemId, controller);
  }

  async function handleOfficialSubmit() {
    if (isSubmitBusy || submitInFlightRef.current || authStatus !== 'authenticated') return;

    if (!currentCode.trim()) {
      updateSubmitPhase('error');
      setSubmitError('Code cannot be empty before submitting.');
      return;
    }

    submitAbortRef.current?.abort();
    closeEventSource();
    const controller = new AbortController();
    submitAbortRef.current = controller;
    submitInFlightRef.current = true;

    const targetProblemId = problem.id;
    activeSubmissionIdRef.current = null;
    updateSubmitPhase('submitting');
    setConnectionState('idle');
    setSubmitError(null);
    setSubmissionId(null);
    setOfficialSubmission(null);

    try {
      const created = await submitOfficialSolution(
        {
          problemId: targetProblemId,
          code: currentCode,
          language,
          contestId,
        },
        controller.signal
      );

      if (controller.signal.aborted || activeProblemIdRef.current !== targetProblemId) {
        submitInFlightRef.current = false;
        return;
      }

      activeSubmissionIdRef.current = created.id;
      setSubmissionId(created.id);
      updateSubmitPhase('queued');

      startSseTracking(created.id, targetProblemId, controller);
    } catch (err) {
      submitInFlightRef.current = false;
      if (controller.signal.aborted || activeProblemIdRef.current !== targetProblemId) return;
      const classified = classifyApiError(err, 'Failed to submit solution.');
      if (classified.category === 'cancelled') return;
      updateSubmitPhase('error');
      setSubmitError(classified.message);
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
            <option value="c">C (GCC 13)</option>
            <option value="cpp">C++ (G++ 13)</option>
            <option value="java">Java (OpenJDK 21)</option>
            <option value="go">Go (1.22)</option>
            <option value="rust">Rust (1.77)</option>
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
            onClick={() => void handleRunCustom()}
            disabled={isSampleBusy || authStatus !== 'authenticated'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-950/60 px-3.5 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-900/60 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Terminal className="h-3.5 w-3.5 text-indigo-400" />
            Run Custom
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
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Official Submission Verdict
              </h3>
              {connectionState !== 'idle' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300">
                  <Radio className="h-3 w-3 text-indigo-400" />
                  {CONNECTION_LABELS[connectionState]}
                </span>
              )}
            </div>

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

          {officialSubmission?.testCaseResults && officialSubmission.testCaseResults.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-slate-800 pt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Test Case Breakdown ({officialSubmission.testCaseResults.length} Tests)
              </h4>
              <div className="space-y-2">
                {officialSubmission.testCaseResults.map((tc, idx) => {
                  const tcMeta = VERDICT_META[tc.verdict] || {
                    label: tc.verdict,
                    badgeClass: 'border-slate-700 bg-slate-800 text-slate-300',
                    isAccepted: false,
                  };
                  const isExpanded = Boolean(expandedTests[idx]);

                  return (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-300">Test #{idx + 1}</span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tcMeta.badgeClass}`}
                          >
                            {tcMeta.label}
                          </span>
                          {tc.isHidden && (
                            <span className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                              <EyeOff className="h-3 w-3" />
                              Hidden
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          {tc.executionTimeMs > 0 && (
                            <span className="text-slate-400">{tc.executionTimeMs} ms</span>
                          )}
                          {tc.memoryUsedKb > 0 && (
                            <span className="text-slate-400">{tc.memoryUsedKb} KB</span>
                          )}
                          {!tc.isHidden && (
                            <button
                              type="button"
                              onClick={() => toggleTestExpand(idx)}
                              className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
                            >
                              {isExpanded ? (
                                <>
                                  <span>Hide Details</span>
                                  <ChevronUp className="h-3 w-3" />
                                </>
                              ) : (
                                <>
                                  <span>View Details</span>
                                  <ChevronDown className="h-3 w-3" />
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {!tc.isHidden && isExpanded && (
                        <div className="mt-3 grid gap-2 border-t border-slate-800 pt-2 md:grid-cols-2">
                          {tc.sampleInput !== undefined && (
                            <div>
                              <span className="text-[11px] font-medium text-slate-400">Input:</span>
                              <pre className="mt-1 overflow-x-auto rounded bg-slate-950 p-2 font-mono text-[11px] text-slate-200">
                                <code>{tc.sampleInput || '(empty)'}</code>
                              </pre>
                            </div>
                          )}
                          {tc.sampleExpectedOutput !== undefined && (
                            <div>
                              <span className="text-[11px] font-medium text-slate-400">
                                Expected Output:
                              </span>
                              <pre className="mt-1 overflow-x-auto rounded bg-slate-950 p-2 font-mono text-[11px] text-slate-200">
                                <code>{tc.sampleExpectedOutput || '(empty)'}</code>
                              </pre>
                            </div>
                          )}
                          {tc.actualOutput !== undefined && (
                            <div className="md:col-span-2">
                              <span className="text-[11px] font-medium text-slate-400">
                                Your Output:
                              </span>
                              <pre className="mt-1 overflow-x-auto rounded bg-slate-950 p-2 font-mono text-[11px] text-slate-200">
                                <code>{tc.actualOutput || '(empty)'}</code>
                              </pre>
                            </div>
                          )}
                          {tc.diagnostic && (
                            <div className="md:col-span-2">
                              <span className="text-[11px] font-medium text-rose-400">
                                Diagnostic:
                              </span>
                              <pre className="mt-1 overflow-x-auto rounded bg-slate-950 p-2 font-mono text-[11px] text-rose-300">
                                <code>{tc.diagnostic}</code>
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
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

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
        <div className="flex border-b border-slate-800 bg-slate-900/50">
          <button
            type="button"
            onClick={() => setActiveTab('sample')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === 'sample'
                ? 'border-b-2 border-indigo-500 bg-slate-900 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Play className="h-3.5 w-3.5" />
            Sample Cases
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === 'custom'
                ? 'border-b-2 border-indigo-500 bg-slate-900 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            Custom Input
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('output')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition ${
              activeTab === 'output'
                ? 'border-b-2 border-indigo-500 bg-slate-900 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            Execution Output
            {phase === 'running' && (
              <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
            )}
            {phase === 'finished' && runResult && (
              <span
                className={`h-2 w-2 rounded-full ${
                  outcomeMeta?.isError ? 'bg-rose-400' : 'bg-emerald-400'
                }`}
              />
            )}
          </button>
        </div>

        <div className="p-4">
          {activeTab === 'sample' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    Predefined Sample Case
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Standard problem test case defined in the problem description. Click{' '}
                    <strong>Run Sample</strong> in the toolbar above to test against it.
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
                <span className="text-slate-400">
                  Sample case is loaded and ready. Switch to <strong>Custom Input</strong> to test
                  your own arbitrary input data.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'custom' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    Custom Standard Input
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Arbitrary input passed to stdin without modifying problem statistics.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomInput('')}
                    disabled={!customInput || isSampleBusy}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear Input
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRunCustom()}
                    disabled={isSampleBusy || authStatus !== 'authenticated'}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <Play className="h-3 w-3" />
                    Run Custom Input
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="custom-stdin" className="sr-only">
                  Custom Standard Input
                </label>
                <textarea
                  id="custom-stdin"
                  aria-label="Custom standard input"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Enter custom input data here (passed via stdin)..."
                  rows={5}
                  disabled={isSampleBusy}
                  className="w-full resize-y rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                />
                <div className="mt-1 flex justify-end text-[11px] text-slate-500">
                  {customInput.length} / 65536 characters
                </div>
              </div>
            </div>
          )}

          {activeTab === 'output' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Execution Output
                  </h4>
                  {runResult?.isCustomInput && (
                    <span className="rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                      Custom Input Run
                    </span>
                  )}
                  {runResult && !runResult.isCustomInput && (
                    <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                      Sample Run
                    </span>
                  )}
                </div>

                {phase === 'idle' && <span className="text-xs text-slate-500">Ready to run</span>}
                {phase === 'submitting' && (
                  <span role="status" className="text-xs text-indigo-300">
                    Submitting code execution...
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

              {runResult ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <h5 className="mb-1 text-xs font-medium text-slate-400">
                      Standard Output (stdout)
                    </h5>
                    <pre className="min-h-[64px] overflow-x-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono text-xs text-slate-200">
                      <code>{runResult.stdout || '(empty)'}</code>
                    </pre>
                  </div>
                  <div>
                    <h5 className="mb-1 text-xs font-medium text-slate-400">
                      Standard Error (stderr)
                    </h5>
                    <pre className="min-h-[64px] overflow-x-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono text-xs text-rose-200">
                      <code>{runResult.stderr || '(none)'}</code>
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-slate-800 text-xs text-slate-500">
                  Run sample cases or custom input to see output.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
