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

  it('handles output with and without a final newline consistently', () => {
    expect(compareOutputs('alpha\nbeta', 'alpha\nbeta\n')).toBe(true);
    expect(compareOutputs('alpha\nbeta\r\n', 'alpha\nbeta\n\n')).toBe(true);
    expect(compareOutputs('alpha\r\nbeta\n  \n', 'alpha\nbeta')).toBe(true);
  });

  it('preserves leading whitespace and internal multiple spaces or tabs', () => {
    expect(compareOutputs('  leading\tvalue', '  leading\tvalue  \t')).toBe(true);
    expect(compareOutputs('\tleading', 'leading')).toBe(false);
    expect(compareOutputs('a\tb', 'a b')).toBe(false);
    expect(compareOutputs('x   y\nz  w', 'x   y\nz w')).toBe(false);
  });

  it('compares special characters and Unicode accurately', () => {
    const unicode = '{"msg":"café 🚀 α+β ≈ Σ","path":"C:\\\\dir\\\\file"}  \r\n';
    const expected = '{"msg":"café 🚀 α+β ≈ Σ","path":"C:\\\\dir\\\\file"}\n';
    expect(compareOutputs(unicode, expected)).toBe(true);
    expect(compareOutputs('café 🚀', 'cafe 🚀')).toBe(false);
  });

  it('compares large outputs efficiently without truncation or false positives', () => {
    const lines = Array.from({ length: 8000 }, (_, i) => `row-${i}: ${'x'.repeat(16)}`);
    const expected = lines.join('\n');
    const actualWithTrailingWhitespace = lines.map((l) => `${l}   `).join('\r\n') + '\r\n\n';
    expect(compareOutputs(actualWithTrailingWhitespace, expected)).toBe(true);

    const differingLastLine = [...lines.slice(0, -1), 'row-7999: tampered'].join('\n');
    expect(compareOutputs(differingLastLine, expected)).toBe(false);
  });
});
