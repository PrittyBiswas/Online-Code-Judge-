/**
 * Output Normalization & Comparison Rule (AC-SJ-09 / Part 1 M3):
 * 
 * 1. Handles string inputs, normalizing CRLF (\r\n) and CR (\r) into standard LF (\n).
 * 2. Trims trailing whitespace from every individual line.
 * 3. Strips trailing empty or whitespace-only lines from the end of the output.
 * 4. Compares the resulting normalized strings for exact equality.
 * 5. Handles null/undefined inputs gracefully.
 */

export function normalizeOutput(output: string | null | undefined): string {
  if (output == null) {
    return '';
  }

  // Replace null bytes or unsafe control sequences
  const sanitized = output.replace(/\0/g, '');

  // Split lines across standard line breaks
  const lines = sanitized.split(/\r?\n/);

  // Trim trailing whitespace on each line
  const trimmedLines = lines.map((line) => line.replace(/[ \t\r]+$/, ''));

  // Trim trailing empty lines from the end of the output
  while (trimmedLines.length > 0 && trimmedLines[trimmedLines.length - 1] === '') {
    trimmedLines.pop();
  }

  return trimmedLines.join('\n');
}

/**
 * Compares actual program stdout against expected output according to AC-SJ-09.
 */
export function compareOutputs(
  actual: string | null | undefined,
  expected: string | null | undefined
): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected);
}

