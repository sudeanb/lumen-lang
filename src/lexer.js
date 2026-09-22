// Lumen lexer — turns source text into a token stream.
// Every token carries its line/column so later stages can report precise errors.

const KEYWORDS = new Set(['let', 'fn', 'if', 'then', 'else', 'true', 'false', 'nil', 'do']);

const TWO_CHAR = new Set(['=>', '==', '!=', '<=', '>=', '&&', '||', '++']);
const ONE_CHAR = new Set(['+', '-', '*', '/', '%', '(', ')', '[', ']', '{', '}', ',', ';', '<', '>', '=', '!']);

export class LexError extends Error {
  constructor(message, line, col) {
    super(`${message} (line ${line}, col ${col})`);
    this.line = line;
    this.col = col;
  }
}

export function lex(src) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const advance = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') { line++; col = 1; } else { col++; }
      i++;
    }
  };

  while (i < src.length) {
    const c = src[i];
    const tLine = line;
    const tCol = col;

    if (/\s/.test(c)) { advance(); continue; }

    // line comment
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') advance();
      continue;
    }

    // numbers
    if (/[0-9]/.test(c)) {
      const start = i;
      while (i < src.length && /[0-9]/.test(src[i])) advance();
      tokens.push({ type: 'INT', value: Number(src.slice(start, i)), line: tLine, col: tCol });
      continue;
    }

    // identifiers & keywords
    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) advance();
      const word = src.slice(start, i);
      const type = KEYWORDS.has(word) ? word.toUpperCase() : 'IDENT';
      tokens.push({ type, value: word, line: tLine, col: tCol });
      continue;
    }

    // strings
    if (c === '"') {
      advance();
      const start = i;
      while (i < src.length && src[i] !== '"' && src[i] !== '\n') advance();
      if (src[i] !== '"') throw new LexError('unterminated string literal', tLine, tCol);
      const value = src.slice(start, i);
      advance();
      tokens.push({ type: 'STRING', value, line: tLine, col: tCol });
      continue;
    }

    // operators & punctuation — longest match first
    const pair = src.slice(i, i + 2);
    if (TWO_CHAR.has(pair)) {
      tokens.push({ type: pair, value: pair, line: tLine, col: tCol });
      advance(2);
      continue;
    }
    if (ONE_CHAR.has(c)) {
      tokens.push({ type: c, value: c, line: tLine, col: tCol });
      advance();
      continue;
    }

    throw new LexError(`unexpected character '${c}'`, tLine, tCol);
  }

  tokens.push({ type: 'EOF', value: null, line, col });
  return tokens;
}
