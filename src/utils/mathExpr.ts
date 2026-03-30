/**
 * Evaluate simple math expressions from user input.
 * Supports: +, -, *, x (multiply), / (divide), // (floor divide), parentheses.
 * Returns NaN if the expression is invalid.
 */
export function evaluateMathExpr(input: string): number {
  // Normalize: replace 'x' and '×' with '*', '//' with a placeholder
  const normalized = input
    .replace(/\s+/g, '')
    .replace(/\/\//g, '\0') // placeholder for floor division
    .replace(/[x×]/gi, '*')
    .replace(/\0/g, '//');

  if (!normalized) return NaN;

  let pos = 0;

  function peek(): string { return normalized[pos] ?? ''; }
  function consume(): string { return normalized[pos++]; }

  function parseNumber(): number {
    // Handle unary minus/plus
    if (peek() === '-') { consume(); return -parseNumber(); }
    if (peek() === '+') { consume(); return parseNumber(); }

    // Parenthesized expression
    if (peek() === '(') {
      consume(); // '('
      const val = parseAddSub();
      if (peek() === ')') consume();
      return val;
    }

    // Numeric literal
    const start = pos;
    while (/[\d.]/.test(peek())) consume();
    const str = normalized.slice(start, pos);
    if (!str) return NaN;
    return Number(str);
  }

  function parseMulDiv(): number {
    let left = parseNumber();
    while (true) {
      if (peek() === '*') { consume(); left *= parseNumber(); }
      else if (normalized[pos] === '/' && normalized[pos + 1] === '/') {
        pos += 2; left = Math.floor(left / parseNumber());
      }
      else if (peek() === '/') { consume(); left /= parseNumber(); }
      else break;
    }
    return left;
  }

  function parseAddSub(): number {
    let left = parseMulDiv();
    while (true) {
      if (peek() === '+') { consume(); left += parseMulDiv(); }
      else if (peek() === '-') { consume(); left -= parseMulDiv(); }
      else break;
    }
    return left;
  }

  const result = parseAddSub();
  // If there are unconsumed characters, the expression is invalid
  if (pos < normalized.length) return NaN;
  return result;
}

/**
 * Parse a numeric input string, evaluating math expressions if present.
 * Falls back to `fallback` if the result is NaN or non-finite.
 */
export function parseMathInput(input: string, fallback: number): number {
  const result = evaluateMathExpr(input);
  return isFinite(result) ? result : fallback;
}
