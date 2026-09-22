import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parse } from '../src/parser.js';

test('parses let bindings', () => {
  const ast = parse('let x = 1 + 2;');
  const stmt = ast.statements[0];
  assert.equal(stmt.kind, 'LetStmt');
  assert.equal(stmt.name, 'x');
  assert.equal(stmt.value.kind, 'BinOp');
  assert.equal(stmt.value.op, '+');
});

test('parses if/then/else', () => {
  const ast = parse('if 1 < 2 then 10 else 20');
  const stmt = ast.statements[0];
  assert.equal(stmt.expr.kind, 'If');
  assert.equal(stmt.expr.then.kind, 'IntLit');
  assert.equal(stmt.expr.els.value, 20);
});

test('parses function literals and calls', () => {
  const ast = parse('let add = fn(a, b) => a + b; add(1, 2)');
  assert.equal(ast.statements[0].value.kind, 'FnLit');
  assert.deepEqual(ast.statements[0].value.params, ['a', 'b']);
  const call = ast.statements[1].expr;
  assert.equal(call.kind, 'Call');
  assert.equal(call.args.length, 2);
});

test('parses do blocks', () => {
  const ast = parse('do { let x = 1; println(x); x + 1 }');
  const block = ast.statements[0].expr;
  assert.equal(block.kind, 'Do');
  assert.equal(block.statements.length, 3);
});

test('binary operators respect precedence', () => {
  const ast = parse('1 + 2 * 3');
  const expr = ast.statements[0].expr;
  assert.equal(expr.op, '+');
  assert.equal(expr.left.value, 1);
  assert.equal(expr.right.op, '*');
});

test('rejects if without else', () => {
  assert.throws(() => parse('if true then 1'), /'else'/);
});

test('rejects unclosed parens', () => {
  assert.throws(() => parse('fn(x => x'), /expected/i);
});
