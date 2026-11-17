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
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
            {problem.statement}
          </p>
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
          <div className="space-y-2 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5 text-xs text-slate-300">
            <div>
              <span className="font-semibold text-slate-200">Standard Input: </span>
              <span>
                Input is provided via standard input (stdin) formatted as described in the problem
                specifications.
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-200">Standard Output: </span>
              <span>
                Output your solution to standard output (stdout). Ensure formatting and line breaks
                match expected results.
              </span>
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
          <ul className="list-inside list-disc space-y-1 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5 text-xs text-slate-300">
            <li>
              Execution time must not exceed{' '}
              <strong className="text-slate-100">{problem.timeLimitMs} ms</strong>.
            </li>
            <li>
              Memory usage must not exceed{' '}
              <strong className="text-slate-100">{problem.memoryLimitMb} MB</strong>.
            </li>
            <li>
              Source code size must be under <strong className="text-slate-100">64 KB</strong>.
            </li>
          </ul>
        </section>

        {/* Public Example Input & Output */}
        <section aria-labelledby="sample-io-heading" className="space-y-3">
          <h2 id="sample-io-heading" className="text-sm font-semibold text-slate-100">
            Public Example
          </h2>
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
        </section>
      </div>
    </article>
  );
}
