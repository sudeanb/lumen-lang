// Lumen pipeline — one entry point that wires lexer → parser → typechecker →
// compiler → VM. Browser-safe: no Node APIs anywhere in here.

import { parse } from './parser.js';
import { typecheck, typeToString } from './typecheck.js';
import { compile } from './compiler.js';
import { run, display } from './vm.js';

export { lex } from './lexer.js';
export { parse, ParseError } from './parser.js';
export { typecheck, typeToString, TypeError } from './typecheck.js';
export { compile } from './compiler.js';
export { CompileError, RuntimeError } from './errors.js';
export { run, display } from './vm.js';

export const VERSION = '0.1.0';

/**
 * Run a complete Lumen source program.
 * @returns {{ value: unknown, type: string, output: string[], statements: {name: string, type: string}[] }}
 */
export function runSource(source, options = {}) {
  const ast = parse(source);
  const types = typecheck(ast);
  const bytecode = compile(ast);
  const { value, output } = run(bytecode, options);

  return {
    value,
    type: typeToString(types.result),
    output,
    statements: types.statements
      .map((s, i) => (s ? { name: s.name, type: typeToString(s.type) } : null))
      .filter(Boolean),
  };
}

/**
 * Check types only (no execution) — used by the REPL for `let` echoes.
 */
export function typeOf(source) {
  const ast = parse(source);
  const types = typecheck(ast);
  return typeToString(types.result);
}
