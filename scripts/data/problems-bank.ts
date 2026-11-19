import { EASY_PROBLEMS, type SeedProblemDef } from './problems/easy.js';
import { MEDIUM_PROBLEMS } from './problems/medium.js';
import { HARD_PROBLEMS } from './problems/hard.js';

export type { SeedProblemDef };

export const PROBLEMS_BANK: SeedProblemDef[] = [
  ...EASY_PROBLEMS,
  ...MEDIUM_PROBLEMS,
  ...HARD_PROBLEMS,
];

export const BANK_METRICS = {
  total: PROBLEMS_BANK.length,
  easy: EASY_PROBLEMS.length,
  medium: MEDIUM_PROBLEMS.length,
  hard: HARD_PROBLEMS.length,
};
