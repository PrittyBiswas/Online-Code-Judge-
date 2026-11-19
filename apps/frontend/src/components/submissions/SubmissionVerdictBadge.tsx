import { Verdict, SubmissionStatus } from '../../types';
import { CheckCircle2, XCircle, Clock, AlertTriangle, Cpu, Flame, Loader2 } from 'lucide-react';

interface SubmissionVerdictBadgeProps {
  verdict?: Verdict;
  status?: SubmissionStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export function SubmissionVerdictBadge({
  verdict,
  status,
  size = 'md',
  showIcon = true,
}: SubmissionVerdictBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-semibold',
  }[size];

  if (status === SubmissionStatus.QUEUED) {
    return (
      <span
        className={`inline-flex items-center rounded-md border border-sky-500/30 bg-sky-500/10 text-sky-300 ${sizeClasses}`}
        data-testid="verdict-badge-queued"
      >
        {showIcon && <Clock className="h-3.5 w-3.5 animate-pulse" />}
        <span>In Queue</span>
      </span>
    );
  }

  if (status === SubmissionStatus.RUNNING) {
    return (
      <span
        className={`inline-flex items-center rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-300 ${sizeClasses}`}
        data-testid="verdict-badge-running"
      >
        {showIcon && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        <span>Judging...</span>
      </span>
    );
  }

  switch (verdict) {
    case Verdict.ACCEPTED:
      return (
        <span
          className={`inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 ${sizeClasses}`}
          data-testid="verdict-badge-accepted"
        >
          {showIcon && <CheckCircle2 className="h-3.5 w-3.5" />}
          <span>Accepted</span>
        </span>
      );

    case Verdict.WRONG_ANSWER:
      return (
        <span
          className={`inline-flex items-center rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-300 ${sizeClasses}`}
          data-testid="verdict-badge-wrong-answer"
        >
          {showIcon && <XCircle className="h-3.5 w-3.5" />}
          <span>Wrong Answer</span>
        </span>
      );

    case Verdict.TIME_LIMIT_EXCEEDED:
      return (
        <span
          className={`inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300 ${sizeClasses}`}
          data-testid="verdict-badge-time-limit"
        >
          {showIcon && <Clock className="h-3.5 w-3.5" />}
          <span>Time Limit Exceeded</span>
        </span>
      );

    case Verdict.MEMORY_LIMIT_EXCEEDED:
      return (
        <span
          className={`inline-flex items-center rounded-md border border-orange-500/30 bg-orange-500/10 text-orange-300 ${sizeClasses}`}
          data-testid="verdict-badge-memory-limit"
        >
          {showIcon && <Cpu className="h-3.5 w-3.5" />}
          <span>Memory Limit Exceeded</span>
        </span>
      );

    case Verdict.RUNTIME_ERROR:
      return (
        <span
          className={`inline-flex items-center rounded-md border border-red-500/30 bg-red-500/10 text-red-300 ${sizeClasses}`}
          data-testid="verdict-badge-runtime-error"
        >
          {showIcon && <Flame className="h-3.5 w-3.5" />}
          <span>Runtime Error</span>
        </span>
      );

    case Verdict.COMPILATION_ERROR:
      return (
        <span
          className={`inline-flex items-center rounded-md border border-purple-500/30 bg-purple-500/10 text-purple-300 ${sizeClasses}`}
          data-testid="verdict-badge-compilation-error"
        >
          {showIcon && <AlertTriangle className="h-3.5 w-3.5" />}
          <span>Compilation Error</span>
        </span>
      );

    case Verdict.INTERNAL_ERROR:
    default:
      return (
        <span
          className={`inline-flex items-center rounded-md border border-slate-600 bg-slate-800 text-slate-300 ${sizeClasses}`}
          data-testid="verdict-badge-internal-error"
        >
          {showIcon && <AlertTriangle className="h-3.5 w-3.5" />}
          <span>{verdict || 'Internal Error'}</span>
        </span>
      );
  }
}
