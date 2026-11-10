import { describe, it, expect } from 'vitest';
import { compareOutputs, normalizeOutput } from '../src/utils/output-comparator.js';

describe('Output Comparator (AC-SJ-09 / Part 1 M3)', () => {
  it('considers identical single-line outputs as equal', () => {
    expect(compareOutputs('42', '42')).toBe(true);
  });

  it('ignores trailing whitespace on each line (AC-SJ-09)', () => {
    const actual = 'hello   \nworld\t  ';
    const expected = 'hello\nworld';
    expect(compareOutputs(actual, expected)).toBe(true);
  });

  it('ignores trailing blank lines at the end of the output', () => {
    const actual = '1 2 3\n\n\n';
    const expected = '1 2 3';
    expect(compareOutputs(actual, expected)).toBe(true);
  });

  it('normalizes Windows CRLF to standard LF', () => {
    const actual = 'line1\r\nline2\r\n';
    const expected = 'line1\nline2';
    expect(compareOutputs(actual, expected)).toBe(true);
  });

  it('does NOT ignore leading or internal whitespace differences', () => {
    expect(compareOutputs('  42', '42')).toBe(false);
    expect(compareOutputs('1  2', '1 2')).toBe(false);
  });

  it('detects mismatched content correctly', () => {
    expect(compareOutputs('Wrong Answer', 'Accepted')).toBe(false);
  });

  it('handles empty outputs and null/undefined gracefully', () => {
    expect(compareOutputs('', '')).toBe(true);
    expect(compareOutputs('   \n  \n', '')).toBe(true);
    expect(compareOutputs(null, '')).toBe(true);
    expect(compareOutputs(undefined, null)).toBe(true);
  });

  it('sanitizes null bytes (EC-05)', () => {
    const outputWithNull = 'hello\0 world\0\n';
    const cleanOutput = 'hello world';
    expect(normalizeOutput(outputWithNull)).toBe(cleanOutput);
    expect(compareOutputs(outputWithNull, cleanOutput)).toBe(true);
  });
});
