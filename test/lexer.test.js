import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { lex } from '../src/lexer.js';

test('lexes integers and identifiers', () => {
  const tokens = lex('42 foo');
  assert.deepEqual(
    tokens.map((t) => [t.type, t.value]),
    [['INT', 42], ['IDENT', 'foo'], ['EOF', null]],
  );
});

test('recognizes keywords', () => {
  const tokens = lex('let fn if then else true false nil do');
  assert.deepEqual(
    tokens.map((t) => t.type),
    ['LET', 'FN', 'IF', 'THEN', 'ELSE', 'TRUE', 'FALSE', 'NIL', 'DO', 'EOF'],
  );
});

test('splits two-char operators before one-char ones', () => {
  const tokens = lex('a <= b == c => d ++ e');
  assert.deepEqual(
    tokens.map((t) => t.type),
    ['IDENT', '<=', 'IDENT', '==', 'IDENT', '=>', 'IDENT', '++', 'IDENT', 'EOF'],
  );
});

test('strings and comments', () => {
  const tokens = lex('"hello world" // trailing comment\n"x"');
  assert.deepEqual(
    tokens.map((t) => [t.type, t.value]),
    [['STRING', 'hello world'], ['STRING', 'x'], ['EOF', null]],
  );
});

test('tracks line numbers', () => {
  const tokens = lex('1\n2\n\n3');
  assert.equal(tokens[0].line, 1);
  assert.equal(tokens[1].line, 2);
  assert.equal(tokens[2].line, 4);
});

test('rejects unterminated strings', () => {
  assert.throws(() => lex('"oops'), /unterminated string/);
});
