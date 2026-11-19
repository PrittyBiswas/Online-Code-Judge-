import { describe, it, expect } from 'vitest';
import { SupportedLanguage, LANGUAGE_CONFIGS, STARTER_CODE } from '@judge/shared';
import { PROBLEMS_BANK } from '../../../scripts/data/problems-bank.js';

describe('Starter Code Architecture & Solution Scrubbing', () => {
  const ALL_LANGUAGES: SupportedLanguage[] = [
    'javascript',
    'python',
    'c',
    'cpp',
    'java',
    'go',
    'rust',
  ];

  it('guarantees valid starter code for all 7 languages on every problem', () => {
    for (const prob of PROBLEMS_BANK) {
      expect(prob.starterCode, `starterCode object for ${prob.slug}`).toBeDefined();

      for (const lang of ALL_LANGUAGES) {
        const code = prob.starterCode[lang];
        expect(code, `Starter code for ${lang} in ${prob.slug}`).toBeDefined();
        expect(code.trim().length, `Code length for ${lang} in ${prob.slug}`).toBeGreaterThan(20);
      }
    }
  });

  it('ensures all starter templates contain TODO instructions and zero complete solutions', () => {
    for (const prob of PROBLEMS_BANK) {
      for (const lang of ALL_LANGUAGES) {
        const code = prob.starterCode[lang];

        // Must contain a TODO guidance comment
        expect(
          /TODO/i.test(code),
          `Starter code for ${lang} in "${prob.slug}" must contain a TODO comment`
        ).toBe(true);

        // Must not contain full two-sum solution logic
        if (prob.slug === 'two-sum') {
          expect(code).not.toContain('complement');
          expect(code).not.toContain('target - nums');
        }

        // Must not contain full contains-duplicate solution
        if (prob.slug === 'contains-duplicate') {
          expect(code).not.toContain('seen.has');
          expect(code).not.toContain('seen.add');
        }

        // Must not contain full valid-palindrome solution
        if (prob.slug === 'valid-palindrome') {
          expect(code).not.toContain('replace(/[^a-zA-Z0-9]/g');
        }

        // Must not contain full binary-search solution
        if (prob.slug === 'binary-search') {
          expect(code).not.toContain('while (left <= right)');
          expect(code).not.toContain('while left <= right:');
        }
      }
    }
  });

  it('verifies fallback starter templates in @judge/shared also contain TODOs', () => {
    for (const lang of ALL_LANGUAGES) {
      const config = LANGUAGE_CONFIGS[lang];
      expect(config, `Language config for ${lang}`).toBeDefined();
      expect(config.starterCode, `Fallback starter code for ${lang}`).toBeDefined();
      expect(
        /TODO|Write your solution/i.test(config.starterCode),
        `Fallback starter code for ${lang} should indicate where to write code`
      ).toBe(true);

      const sharedStarter = STARTER_CODE[lang];
      expect(sharedStarter).toBeDefined();
    }
  });
});
