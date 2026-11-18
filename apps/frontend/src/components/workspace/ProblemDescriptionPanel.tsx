import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  FileText,
  Tag,
  BookOpen,
  ListFilter,
  CheckCircle2,
} from 'lucide-react';
import { DifficultyBadge } from '../DifficultyBadge';
import type { Problem } from '../../types';

interface ProblemDescriptionPanelProps {
  problem: Problem;
  contestId?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function ProblemDescriptionPanel({
  problem,
  isCollapsed,
  onToggleCollapse,
}: ProblemDescriptionPanelProps) {
  if (isCollapsed) {
    return (
      <aside
        aria-label="Problem Description (Collapsed)"
        className="hidden lg:flex w-10 flex-col items-center justify-between border-r border-slate-800 bg-slate-900/90 py-4"
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand problem description panel"
          title="Expand problem description"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center gap-2">
          <BookOpen className="h-4 w-4 text-slate-500" />
          <span className="text-[10px] font-medium tracking-wider text-slate-500 uppercase [writing-mode:vertical-lr] rotate-180">
            Description
          </span>
        </div>

        <div />
      </aside>
    );
  }

  return (
    <article
      aria-label="Problem Description"
      className="flex h-full flex-col overflow-hidden border-r border-slate-800 bg-slate-900/80"
    >
      {/* Panel Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
          <BookOpen className="h-4 w-4 text-indigo-400" />
          <span>Problem Description</span>
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Collapse problem description panel"
          title="Collapse panel"
          className="hidden lg:inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="text-[11px]">Collapse</span>
        </button>
      </div>

      {/* Independently Scrollable Problem Body */}
      <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
        <header className="space-y-3 border-b border-slate-800/80 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              {problem.title}
            </h1>
            <DifficultyBadge difficulty={problem.difficulty} />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1">
              <Clock className="h-3.5 w-3.5 text-indigo-400" />
              Time limit: {problem.timeLimitMs} ms
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1">
              <Cpu className="h-3.5 w-3.5 text-indigo-400" />
              Memory limit: {problem.memoryLimitMb} MB
            </span>
          </div>

          {problem.tags && problem.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Tag className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              {problem.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-slate-800 bg-slate-800/80 px-2 py-0.5 text-[11px] text-slate-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* Problem Statement */}
        <section aria-labelledby="problem-statement-heading" className="space-y-2">
          <h2
            id="problem-statement-heading"
            className="flex items-center gap-2 text-sm font-semibold text-slate-100"
          >
            <FileText className="h-4 w-4 text-indigo-400" />
            Problem Statement
          </h2>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
            {problem.statement || problem.description}
          </div>
        </section>

        {/* Input & Output Format */}
        <section aria-labelledby="io-format-heading" className="space-y-3">
          <h2
            id="io-format-heading"
            className="flex items-center gap-2 text-sm font-semibold text-slate-100"
          >
            <ListFilter className="h-4 w-4 text-indigo-400" />
            Input &amp; Output Format
          </h2>
          <div className="space-y-3 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5 text-xs text-slate-300">
            <div>
              <span className="block font-semibold text-slate-200 mb-1">Standard Input:</span>
              <p className="whitespace-pre-wrap text-slate-300">
                {problem.inputFormat ||
                  'Input is provided via standard input (stdin) formatted as described in the problem specifications.'}
              </p>
            </div>
            <div className="border-t border-slate-800/60 pt-2">
              <span className="block font-semibold text-slate-200 mb-1">Standard Output:</span>
              <p className="whitespace-pre-wrap text-slate-300">
                {problem.outputFormat ||
                  'Output your solution to standard output (stdout). Ensure formatting and line breaks match expected results.'}
              </p>
            </div>
          </div>
        </section>

        {/* Constraints */}
        <section aria-labelledby="constraints-heading" className="space-y-2">
          <h2
            id="constraints-heading"
            className="flex items-center gap-2 text-sm font-semibold text-slate-100"
          >
            <CheckCircle2 className="h-4 w-4 text-indigo-400" />
            Constraints
          </h2>
          <div className="space-y-2 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5 text-xs text-slate-300">
            {problem.constraints && (
              <div className="mb-2 whitespace-pre-wrap font-mono text-slate-200">
                {problem.constraints}
              </div>
            )}
            <ul className="list-inside list-disc space-y-1 text-slate-400">
              <li>
                Execution time limit:{' '}
                <strong className="text-slate-200">{problem.timeLimitMs} ms</strong>
              </li>
              <li>
                Memory limit: <strong className="text-slate-200">{problem.memoryLimitMb} MB</strong>
              </li>
              <li>
                Source code size limit: <strong className="text-slate-200">64 KB</strong>
              </li>
            </ul>
          </div>
        </section>

        {/* Examples Section */}
        <section aria-labelledby="examples-heading" className="space-y-4">
          <h2 id="examples-heading" className="text-sm font-semibold text-slate-100">
            Examples
          </h2>
          {problem.examples && problem.examples.length > 0 ? (
            <div className="space-y-4">
              {problem.examples.map((ex, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3"
                >
                  <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                    Example {index + 1}
                  </span>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-800/90 bg-slate-900/90 p-3">
                      <h4 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                        Input
                      </h4>
                      <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-slate-200">
                        <code>{ex.input || '(empty)'}</code>
                      </pre>
                    </div>
                    <div className="rounded-lg border border-slate-800/90 bg-slate-900/90 p-3">
                      <h4 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                        Output
                      </h4>
                      <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-slate-200">
                        <code>{ex.output || '(empty)'}</code>
                      </pre>
                    </div>
                  </div>
                  {ex.explanation && (
                    <div className="rounded-lg border border-slate-800/60 bg-slate-900/40 p-2.5 text-xs text-slate-300">
                      <span className="font-semibold text-slate-200">Explanation: </span>
                      <span>{ex.explanation}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Sample Input
                </h3>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-slate-200">
                  <code>{problem.sampleInput || '(empty)'}</code>
                </pre>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Sample Expected Output
                </h3>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-slate-200">
                  <code>{problem.sampleExpectedOutput || '(empty)'}</code>
                </pre>
              </div>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
