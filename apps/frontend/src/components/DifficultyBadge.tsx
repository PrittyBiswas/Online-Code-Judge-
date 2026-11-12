import { ProblemDifficulty } from '@judge/shared';
import { cn } from '../utils/cn';

interface DifficultyBadgeProps {
  difficulty: ProblemDifficulty;
}

const DIFFICULTY_STYLES: Record<ProblemDifficulty, string> = {
  [ProblemDifficulty.EASY]: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  [ProblemDifficulty.MEDIUM]: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
  [ProblemDifficulty.HARD]: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
};

const DIFFICULTY_LABELS: Record<ProblemDifficulty, string> = {
  [ProblemDifficulty.EASY]: 'Easy',
  [ProblemDifficulty.MEDIUM]: 'Medium',
  [ProblemDifficulty.HARD]: 'Hard',
};

export function DifficultyBadge({ difficulty }: DifficultyBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        DIFFICULTY_STYLES[difficulty] || 'border-slate-700 bg-slate-800 text-slate-300'
      )}
    >
      {DIFFICULTY_LABELS[difficulty] || difficulty}
    </span>
  );
}
