import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  EyeOff,
  FileCode2,
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
import { VerticalSplitter } from './workspace/PanelDividers';
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
type PanelCTab = 'sample' | 'custom' | 'output' | 'submissions';
type AutosaveStatus = 'saved' | 'saving' | 'error';

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
const AUTOSAVE_DEBOUNCE_MS = 750;

function getDraftKey(problemId: string, lang: SupportedLanguage): string {
  return `judge_code_draft_${problemId}_${lang}`;
}

function readDraft(problemId: string, lang: SupportedLanguage): string {
  try {
    const val = localStorage.getItem(getDraftKey(problemId, lang));
    if (val !== null && val.trim().length > 0) {
      return val;
    }
  } catch {
    // Storage unavailable
  }
  return STARTER_CODE[lang];
}

function getPhaseRank(phase: UiRunPhase): number {
  if (phase === 'finished') return 2;
  if (phase === 'running') return 1;
  if (phase === 'queued') return 0;
  return -1;
}

export interface SampleRunnerPanelProps {
  problem: Problem;
  contestId?: string;
  panelBHeight?: number;
  onVerticalDragStart?: (e: React.MouseEvent | React.TouchEvent) => void;
  onVerticalKeyDown?: (e: React.KeyboardEvent) => void;
  isVerticalDragging?: boolean;
}

export function SampleRunnerPanel({
  problem,
  contestId,
  panelBHeight,
  onVerticalDragStart,
  onVerticalKeyDown,
  isVerticalDragging,
}: SampleRunnerPanelProps) {
  const { status: authStatus } = useAuth();
  const location = useLocation();

  const [language, setLanguage] = useState<SupportedLanguage>('javascript');
  const [codeByLang, setCodeByLang] = useState<Record<SupportedLanguage, string>>(() => {
    const initial: Record<SupportedLanguage, string> = { ...STARTER_CODE };
    const langs: SupportedLanguage[] = ['javascript', 'python', 'c', 'cpp', 'java', 'go', 'rust'];
    for (const l of langs) {
      initial[l] = readDraft(problem.id, l);
    }
    return initial;
  });
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('saved');
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Sample & Custom run state
  const [phase, setPhase] = useState<UiRunPhase>('idle');
  const [runResult, setRunResult] = useState<SampleRunResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PanelCTab>('sample');
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
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Handle problem id changes
  useEffect(() => {
    activeProblemIdRef.current = problem.id;
    activeSubmissionIdRef.current = null;
    sampleAbortRef.current?.abort();
    sampleInFlightRef.current = false;
    submitAbortRef.current?.abort();
    closeEventSource();
    submitInFlightRef.current = false;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    // Reload drafts for this problem
    const langs: SupportedLanguage[] = ['javascript', 'python', 'c', 'cpp', 'java', 'go', 'rust'];
    const updatedCodes: Record<SupportedLanguage, string> = { ...STARTER_CODE };
    for (const l of langs) {
      updatedCodes[l] = readDraft(problem.id, l);
    }
    setCodeByLang(updatedCodes);
    setAutosaveStatus('saved');

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
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [problem.id]);

  const currentCode = codeByLang[language];
  const isDirty = currentCode !== STARTER_CODE[language];
  const isSampleBusy = phase === 'submitting' || phase === 'queued' || phase === 'running';
  const isSubmitBusy =
    submitPhase === 'submitting' || submitPhase === 'queued' || submitPhase === 'running';
  const isEditorLocked = isSampleBusy || isSubmitBusy;

  function handleLanguageChange(nextLang: SupportedLanguage) {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    setLanguage(nextLang);
    setConfirmResetOpen(false);

    setCodeByLang((prev) => {
      if (prev[nextLang] && prev[nextLang] !== STARTER_CODE[nextLang]) {
        return prev;
      }
      const draft = readDraft(problem.id, nextLang);
      return { ...prev, [nextLang]: draft };
    });
    setAutosaveStatus('saved');
  }

  function handleCodeChange(nextCode: string) {
    setCodeByLang((prev) => ({ ...prev, [language]: nextCode }));
    setAutosaveStatus('saving');

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(getDraftKey(problem.id, language), nextCode);
        setAutosaveStatus('saved');
      } catch {
        setAutosaveStatus('error');
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  function handleResetRequest() {
    if (!isDirty) {
      setCodeByLang((prev) => ({ ...prev, [language]: STARTER_CODE[language] }));
      return;
    }
    setConfirmResetOpen(true);
  }

  function confirmReset() {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    try {
      localStorage.removeItem(getDraftKey(problem.id, language));
    } catch {
      // Storage unavailable
    }
    setCodeByLang((prev) => ({ ...prev, [language]: STARTER_CODE[language] }));
    setAutosaveStatus('saved');
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
      const intervalId = window.setInterval(async () => {
        if (controller.signal.aborted || activeProblemIdRef.current !== targetProblemId) {
          window.clearInterval(intervalId);
          sampleInFlightRef.current = false;
          return;
        }

        if (Date.now() - startedAt > MAX_SAMPLE_POLL_WAIT_MS) {
          window.clearInterval(intervalId);
          sampleInFlightRef.current = false;
          setPhase('error');
          setErrorMessage('Timed out waiting for sample run execution.');
          return;
        }

        try {
          const res = await fetchSampleRunResult(queued.runId, controller.signal);
          if (controller.signal.aborted || activeProblemIdRef.current !== targetProblemId) {
            window.clearInterval(intervalId);
            sampleInFlightRef.current = false;
            return;
          }

          if (res.status === 'RUNNING') {
            setPhase('running');
          } else if (res.status === 'COMPLETED' || res.status === 'FAILED') {
            window.clearInterval(intervalId);
            sampleInFlightRef.current = false;
            setRunResult({ ...res, isCustomInput: isCustom });
            setPhase('finished');
          }
        } catch (pollErr) {
          if (controller.signal.aborted || activeProblemIdRef.current !== targetProblemId) {
            window.clearInterval(intervalId);
            sampleInFlightRef.current = false;
            return;
          }
          const classified = classifyApiError(pollErr, 'Failed while checking sample run status.');
          if (classified.category === 'cancelled') {
            window.clearInterval(intervalId);
            sampleInFlightRef.current = false;
            return;
          }
          window.clearInterval(intervalId);
          sampleInFlightRef.current = false;
          setPhase('error');
          setErrorMessage(classified.message);
        }
      }, SAMPLE_POLL_INTERVAL_MS);
    } catch (err) {
      sampleInFlightRef.current = false;
      if (controller.signal.aborted || activeProblemIdRef.current !== targetProblemId) return;
      const classified = classifyApiError(err, 'Failed to submit sample run.');
      if (classified.category === 'cancelled') return;
      setPhase('error');
      setErrorMessage(classified.message);
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
    const startedAt = Date.now();
    let consecutiveErrors = 0;

    const intervalId = window.setInterval(async () => {
      if (
        controller.signal.aborted ||
        activeProblemIdRef.current !== targetProblemId ||
        activeSubmissionIdRef.current !== targetSubmissionId
      ) {
        window.clearInterval(intervalId);
        submitInFlightRef.current = false;
        return;
      }

      if (Date.now() - startedAt > MAX_OFFICIAL_POLL_WAIT_MS) {
        window.clearInterval(intervalId);
        submitInFlightRef.current = false;
        updateSubmitPhase('error');
        setSubmitError(
          'Official submission is taking longer than expected. Use Check Status to check later.'
        );
        return;
      }

      try {
        const sub = await fetchSubmissionById(targetSubmissionId, controller.signal);
        if (
          controller.signal.aborted ||
          activeProblemIdRef.current !== targetProblemId ||
          activeSubmissionIdRef.current !== targetSubmissionId
        ) {
          window.clearInterval(intervalId);
          submitInFlightRef.current = false;
          return;
        }

        consecutiveErrors = 0;
        setOfficialSubmission(sub);

        if (sub.status === SubmissionStatus.RUNNING) {
          if (getPhaseRank(submitPhaseRef.current) < 1) {
            updateSubmitPhase('running');
          }
        } else if (sub.status === SubmissionStatus.COMPLETED) {
          window.clearInterval(intervalId);
          submitInFlightRef.current = false;
          updateSubmitPhase('finished');
          setConnectionState('completed');
        }
      } catch (pollErr) {
        if (
          controller.signal.aborted ||
          activeProblemIdRef.current !== targetProblemId ||
          activeSubmissionIdRef.current !== targetSubmissionId
        ) {
          window.clearInterval(intervalId);
          submitInFlightRef.current = false;
          return;
        }

        const classified = classifyApiError(pollErr, 'Failed to poll official submission status.');
        if (classified.category === 'cancelled') {
          window.clearInterval(intervalId);
          submitInFlightRef.current = false;
          return;
        }

        consecutiveErrors += 1;
        if (consecutiveErrors >= MAX_OFFICIAL_POLL_ERRORS) {
          window.clearInterval(intervalId);
          submitInFlightRef.current = false;
          updateSubmitPhase('error');
          setSubmitError(classified.message);
        }
      }
    }, 1000);
  }

  function startSseTracking(
    targetSubmissionId: string,
    targetProblemId: string,
    controller: AbortController
  ) {
    closeEventSource();
    setConnectionState('connecting');

    const sseUrl = getSubmissionLiveStreamUrl(targetSubmissionId);
    let sseErrors = 0;
    let fallbackTriggered = false;

    const triggerPollingFallback = () => {
      if (fallbackTriggered) return;
      fallbackTriggered = true;
      closeEventSource();
      setConnectionState('polling');
      pollSubmissionStatus(targetSubmissionId, targetProblemId, controller);
    };

    let es: EventSource;
    try {
      es = new EventSource(sseUrl, { withCredentials: true });
      eventSourceRef.current = es;
    } catch {
      triggerPollingFallback();
      return;
    }

    es.onopen = () => {
      sseErrors = 0;
      setConnectionState('connected');
    };

    es.onmessage = (rawEvent) => {
      if (
        controller.signal.aborted ||
        activeProblemIdRef.current !== targetProblemId ||
        activeSubmissionIdRef.current !== targetSubmissionId
      ) {
        closeEventSource();
        submitInFlightRef.current = false;
        return;
      }

      let event: SubmissionEvent;
      try {
        event = JSON.parse(rawEvent.data) as SubmissionEvent;
      } catch {
        return;
      }

      if (event.submissionId !== targetSubmissionId) return;

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
    setActiveTab('submissions');

    await pollSubmissionStatus(submissionId, targetProblemId, controller);
  }

  async function handleOfficialSubmit() {
    if (isSubmitBusy || submitInFlightRef.current || authStatus !== 'authenticated') return;

    if (!currentCode.trim()) {
      updateSubmitPhase('error');
      setSubmitError('Code cannot be empty before submitting.');
      setActiveTab('submissions');
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
    setActiveTab('submissions');

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
      className="flex h-full flex-col overflow-hidden bg-slate-950"
    >
      <h2 id="sample-runner-heading" className="sr-only">
        Code Editor &amp; Submission
      </h2>

      {/* Confirmation Dialog */}
      {confirmResetOpen && (
        <div
          role="alertdialog"
          aria-label="Confirm code reset"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200"
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

      {/* Unauthenticated Alert */}
      {authStatus !== 'authenticated' && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/90 px-4 py-2 text-xs text-slate-300">
          <span>Sign in to run sample code or submit an official solution.</span>
          <Link
            to="/login"
            state={{ from: location }}
            className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            Sign in to Run
          </Link>
        </div>
      )}

      {/* PANEL B: CODE EDITOR (Height controlled by panelBHeight) */}
      <div
        style={{
          height: panelBHeight !== undefined ? `${panelBHeight}%` : undefined,
        }}
        className={`flex flex-col min-h-[220px] ${
          panelBHeight === undefined ? 'h-[440px]' : ''
        } overflow-hidden`}
      >
        {/* Editor Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/70 px-3 py-2">
          {/* Left: Language Selector & Autosave Status */}
          <div className="flex items-center gap-2.5">
            <label htmlFor="editor-language" className="sr-only">
              Programming language
            </label>
            <select
              id="editor-language"
              aria-label="Programming language"
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value as SupportedLanguage)}
              disabled={isEditorLocked}
              className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
            >
              <option value="javascript">JavaScript (Node 20)</option>
              <option value="python">Python (3.11)</option>
              <option value="c">C (GCC 13)</option>
              <option value="cpp">C++ (G++ 13)</option>
              <option value="java">Java (OpenJDK 21)</option>
              <option value="go">Go (1.22)</option>
              <option value="rust">Rust (1.77)</option>
            </select>

            {/* Autosave Status Indicator */}
            <div
              aria-live="polite"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1 text-[11px] text-slate-400 select-none"
            >
              {autosaveStatus === 'saving' && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                  <span className="text-amber-300">Saving...</span>
                </>
              )}
              {autosaveStatus === 'saved' && (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-slate-300">Saved</span>
                </>
              )}
              {autosaveStatus === 'error' && (
                <>
                  <AlertCircle className="h-3 w-3 text-rose-400" />
                  <span className="text-rose-300">Save failed</span>
                </>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleResetRequest}
              disabled={isEditorLocked}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Code
            </button>

            <button
              type="button"
              onClick={() => void handleRunSample()}
              disabled={isSampleBusy || authStatus !== 'authenticated'}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSampleBusy && !runResult?.isCustomInput ? (
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
              className="inline-flex items-center gap-1.5 rounded-md border border-indigo-500/40 bg-indigo-950/60 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-900/60 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Terminal className="h-3.5 w-3.5 text-indigo-400" />
              Run Custom
            </button>

            <button
              type="button"
              onClick={() => void handleOfficialSubmit()}
              disabled={isSubmitBusy || authStatus !== 'authenticated'}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
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

        {/* Editor View */}
        <div className="flex-1 min-h-0 w-full overflow-hidden">
          <CodeEditor
            language={language}
            value={currentCode}
            onChange={handleCodeChange}
            readOnly={isEditorLocked}
            height="100%"
          />
        </div>
      </div>

      {/* Splitter between Panel B and Panel C */}
      {onVerticalDragStart && (
        <VerticalSplitter
          onMouseDown={onVerticalDragStart}
          onTouchStart={onVerticalDragStart}
          onKeyDown={onVerticalKeyDown || (() => {})}
          isDragging={Boolean(isVerticalDragging)}
        />
      )}

      {/* PANEL C: EXECUTION & SUBMISSION RESULTS */}
      <div
        style={{
          height:
            panelBHeight !== undefined && onVerticalDragStart
              ? `${100 - panelBHeight}%`
              : undefined,
        }}
        className="flex flex-1 flex-col min-h-[200px] overflow-hidden border-t border-slate-800 bg-slate-950"
      >
        {/* Tab Headers */}
        <div className="flex items-center border-b border-slate-800 bg-slate-900/60 px-2">
          <button
            type="button"
            onClick={() => setActiveTab('sample')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition border-b-2 ${
              activeTab === 'sample'
                ? 'border-indigo-500 bg-slate-900 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Play className="h-3.5 w-3.5" />
            Test Cases
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition border-b-2 ${
              activeTab === 'custom'
                ? 'border-indigo-500 bg-slate-900 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            Custom Input
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('output')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition border-b-2 ${
              activeTab === 'output'
                ? 'border-indigo-500 bg-slate-900 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            Output
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

          <button
            type="button"
            onClick={() => setActiveTab('submissions')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition border-b-2 ${
              activeTab === 'submissions'
                ? 'border-indigo-500 bg-slate-900 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode2 className="h-3.5 w-3.5" />
            Submissions
            {isSubmitBusy && <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />}
            {submitPhase === 'finished' && verdictMeta && (
              <span
                className={`h-2 w-2 rounded-full ${
                  verdictMeta.isAccepted ? 'bg-emerald-400' : 'bg-rose-400'
                }`}
              />
            )}
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* TAB 1: TEST CASES */}
          {activeTab === 'sample' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    Sample Test Cases
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Standard problem test cases defined in the problem description. Click{' '}
                    <strong>Run Sample</strong> in the toolbar above to test against them.
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

          {/* TAB 2: CUSTOM INPUT */}
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
                    className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear Input
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRunCustom()}
                    disabled={isSampleBusy || authStatus !== 'authenticated'}
                    className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
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
                  rows={4}
                  disabled={isSampleBusy}
                  className="w-full resize-y rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                />
                <div className="mt-1 flex justify-end text-[11px] text-slate-500">
                  {customInput.length} / 65536 characters
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: OUTPUT */}
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

          {/* TAB 4: SUBMISSIONS */}
          {activeTab === 'submissions' && (
            <div className="space-y-4">
              {submitPhase === 'idle' && !officialSubmission ? (
                <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
                  <FileCode2 className="mb-2 h-6 w-6 text-slate-600" />
                  <span>No submissions made in this session yet.</span>
                  <span className="mt-1 text-[11px] text-slate-600">
                    Click <strong>Submit</strong> above to test your solution against all official
                    test cases.
                  </span>
                </div>
              ) : (
                <div
                  aria-label="Official submission status"
                  className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4"
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

                  {/* Phase 2 Per-Test-Case Breakdown */}
                  {officialSubmission?.testCaseResults &&
                    officialSubmission.testCaseResults.length > 0 && (
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
                                    <span className="font-semibold text-slate-300">
                                      Test #{idx + 1}
                                    </span>
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
                                      <span className="text-slate-400">
                                        {tc.executionTimeMs} ms
                                      </span>
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
                                        <span className="text-[11px] font-medium text-slate-400">
                                          Input:
                                        </span>
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
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
