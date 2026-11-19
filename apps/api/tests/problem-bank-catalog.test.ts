import { describe, it, expect } from 'vitest';
import { ProblemDifficulty } from '@judge/shared';
import { PROBLEMS_BANK, BANK_METRICS } from '../../../scripts/data/problems-bank.js';

describe('Problem Bank Catalog Verification', () => {
  it('contains exactly 50 distinct algorithmic problems', () => {
    expect(PROBLEMS_BANK).toHaveLength(50);
    expect(BANK_METRICS.total).toBe(50);

    const slugs = new Set(PROBLEMS_BANK.map((p) => p.slug));
    expect(slugs.size).toBe(50);

    const titles = new Set(PROBLEMS_BANK.map((p) => p.title));
    expect(titles.size).toBe(50);
  });

  it('has exact difficulty distribution: 20 Easy, 20 Medium, 10 Hard', () => {
    const easyCount = PROBLEMS_BANK.filter((p) => p.difficulty === ProblemDifficulty.EASY).length;
    const mediumCount = PROBLEMS_BANK.filter(
      (p) => p.difficulty === ProblemDifficulty.MEDIUM
    ).length;
    const hardCount = PROBLEMS_BANK.filter((p) => p.difficulty === ProblemDifficulty.HARD).length;

    expect(easyCount).toBe(20);
    expect(mediumCount).toBe(20);
    expect(hardCount).toBe(10);
    expect(BANK_METRICS.easy).toBe(20);
    expect(BANK_METRICS.medium).toBe(20);
    expect(BANK_METRICS.hard).toBe(10);
  });

  it('covers all 15 required algorithmic categories', () => {
    const REQUIRED_CATEGORIES = [
      'Arrays',
      'Strings',
      'Hash Tables',
      'Two Pointers',
      'Sliding Window',
      'Binary Search',
      'Sorting',
      'Linked Lists',
      'Stack and Queue',
      'Trees and Binary Trees',
      'Graphs',
      'Recursion and Backtracking',
      'Greedy Algorithms',
      'Dynamic Programming',
      'Mathematics',
    ];

    const allTags = new Set(PROBLEMS_BANK.flatMap((p) => p.tags));
    for (const cat of REQUIRED_CATEGORIES) {
      expect(allTags.has(cat), `Category "${cat}" should be represented`).toBe(true);
    }
  });

  it('guarantees complete problem specifications for every problem', () => {
    for (const prob of PROBLEMS_BANK) {
      expect(prob.title.trim().length, `Title of ${prob.slug}`).toBeGreaterThanOrEqual(3);
      expect(prob.slug.trim().length, `Slug of ${prob.title}`).toBeGreaterThanOrEqual(3);
      expect(prob.statement.trim().length, `Statement of ${prob.slug}`).toBeGreaterThanOrEqual(20);
      expect(prob.inputFormat.trim().length, `Input format of ${prob.slug}`).toBeGreaterThanOrEqual(
        10
      );
      expect(
        prob.outputFormat.trim().length,
        `Output format of ${prob.slug}`
      ).toBeGreaterThanOrEqual(5);
      expect(prob.constraints.trim().length, `Constraints of ${prob.slug}`).toBeGreaterThanOrEqual(
        5
      );

      expect(prob.timeLimitMs, `Time limit of ${prob.slug}`).toBeGreaterThanOrEqual(1000);
      expect(prob.timeLimitMs, `Time limit of ${prob.slug}`).toBeLessThanOrEqual(5000);
      expect(prob.memoryLimitMb, `Memory limit of ${prob.slug}`).toBeGreaterThanOrEqual(128);
      expect(prob.memoryLimitMb, `Memory limit of ${prob.slug}`).toBeLessThanOrEqual(512);

      expect(prob.tags.length, `Tags for ${prob.slug}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('ensures every problem has at least 2 public examples with explanations', () => {
    for (const prob of PROBLEMS_BANK) {
      expect(prob.examples.length, `Examples count for ${prob.slug}`).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < prob.examples.length; i++) {
        const ex = prob.examples[i];
        expect(ex.input, `Example ${i} input in ${prob.slug}`).toBeDefined();
        expect(ex.output, `Example ${i} output in ${prob.slug}`).toBeDefined();
        expect(
          ex.explanation && ex.explanation.length > 0,
          `Example ${i} explanation in ${prob.slug}`
        ).toBe(true);
      }
    }
  });

  it('ensures every problem has at least 2 public sample cases and at least 3 hidden test cases', () => {
    for (const prob of PROBLEMS_BANK) {
      const publicCases = prob.testCases.filter((tc) => !tc.isHidden);
      const hiddenCases = prob.testCases.filter((tc) => tc.isHidden);

      expect(publicCases.length, `Public test cases for ${prob.slug}`).toBeGreaterThanOrEqual(2);
      expect(hiddenCases.length, `Hidden test cases for ${prob.slug}`).toBeGreaterThanOrEqual(3);
      expect(prob.testCases.length, `Total test cases for ${prob.slug}`).toBeGreaterThanOrEqual(5);

      for (const tc of prob.testCases) {
        expect(tc.input, `Input for test case in ${prob.slug}`).toBeDefined();
        expect(tc.output, `Output for test case in ${prob.slug}`).toBeDefined();
      }
    }
  });
});
