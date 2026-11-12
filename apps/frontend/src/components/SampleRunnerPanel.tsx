import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock, Cpu, Loader2, Play, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { runSampleCode, fetchSampleRunResult } from '../services/submissionsApi';
import { classifyApiError } from '../services/apiClient';
import { CodeEditor } from './CodeEditor';
import type { Problem, SampleRunOutcome, SampleRunResult, SupportedLanguage } from '../types';

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

type UiRunPhase = 'idle' | 'submitting' | 'queued' | 'running' | 'finished' | 'error';

const POLL_INTERVAL_MS = 500;
const MAX_POLL_WAIT_MS = 30000;

export function SampleRunnerPanel({ problem }: { problem: Problem }) {
  const { status: authStatus } = useAuth();
  const location = useLocation();

  const [language, setLanguage] = useState<SupportedLanguage>('javascript');
  const [codeByLang, setCodeByLang] = useState<Record<SupportedLanguage, string>>({
    javascript: STARTER_CODE.javascript,
    python: STARTER_CODE.python,
  });
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const [phase, setPhase] = useState<UiRunPhase>('idle');
  const [runResult, setRunResult] = useState<SampleRunResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeProblemIdRef = useRef(problem.id);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    activeProblemIdRef.current = problem.id;
    abortRef.current?.abort();
    inFlightRef.current = false;
    setPhase('idle');
    setRunResult(null);
    setErrorMessage(null);
    setConfirmResetOpen(false);

    return () => {
      abortRef.current?.abort();
    };
  }, [problem.id]);

  const currentCode = codeByLang[language];
  const isDirty = currentCode !== STARTER_CODE[language];
  const isBusy = phase === 'submitting' || phase === 'queued' || phase === 'running';

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
    if (isBusy || inFlightRef.current || authStatus !== 'authenticated') return;

    if (!currentCode.trim()) {
      setPhase('error');
      setErrorMessage('Code cannot be empty before running.');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;

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
        if (Date.now() - startedAt > MAX_POLL_WAIT_MS) {
          setPhase('error');
          setErrorMessage('Sample execution timed out waiting for the judge worker.');
          break;
        }

        await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
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
      inFlightRef.current = false;
    }
  }

  const outcomeMeta = runResult?.outcome ? OUTCOME_META[runResult.outcome] : null;

  return (
    <section
      aria-labelledby="sample-runner-heading"
      className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="sample-runner-heading" className="text-lg font-semibold text-white">
            Code Editor &amp; Sample Runner
          </h2>
          <p className="text-xs text-slate-400">
            Executes inside the isolated Docker sandbox against public sample input only (not saved
            as an official submission).
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
            disabled={isBusy}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50"
          >
            <option value="javascript">JavaScript (Node 20)</option>
            <option value="python">Python (3.11)</option>
          </select>

          <button
            type="button"
            onClick={handleResetRequest}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Code
          </button>

          <button
            type="button"
            onClick={() => void handleRunSample()}
            disabled={isBusy || authStatus !== 'authenticated'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? (
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
          <span>Sign in to execute sample code in the isolated sandbox.</span>
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
        readOnly={isBusy}
      />

      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
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
