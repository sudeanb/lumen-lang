import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parse } from '../src/parser.js';
import { typecheck, typeToString } from '../src/typecheck.js';

const typeOf = (src) => {
  const { result } = typecheck(parse(src));
  return typeToString(result);
};

const statementType = (src, name) => {
  const { statements } = typecheck(parse(src));
  const found = statements.find((s) => s && s.name === name);
  return typeToString(found.type);
};

test('infers literal types', () => {
  assert.equal(typeOf('42'), 'int');
  assert.equal(typeOf('"hi"'), 'string');
  assert.equal(typeOf('true'), 'bool');
  assert.equal(typeOf('nil'), 'nil');
  assert.equal(typeOf('[1, 2, 3]'), '[int]');
});

test('infers function types', () => {
  assert.equal(typeOf('fn(x) => x + 1'), '(int) -> int');
  assert.equal(statementType('let add = fn(a, b) => a + b;', 'add'), '(int, int) -> int');
});

test('infers recursive fib as int -> int', () => {
  const src = `
    let fib = fn(n) => if n < 2 then n else fib(n - 1) + fib(n - 2);
    fib(20)
  `;
  assert.equal(statementType(src, 'fib'), '(int) -> int');
  assert.equal(typeOf(src), 'int');
});

test('let-polymorphism: one identity, many types', () => {
  const src = `
    let id = fn(x) => x;
    id(42)
  `;
  assert.equal(typeOf(src), 'int');
  assert.equal(typeOf('let id = fn(x) => x; id(true)'), 'bool');
  assert.equal(typeOf('let id = fn(x) => x; id([1, 2])'), '[int]');
});

test('rejects adding bool to int', () => {
  assert.throws(() => typeOf('1 + true'), /type mismatch/);
});

test('rejects undefined variables', () => {
  assert.throws(() => typeOf('nope + 1'), /undefined variable 'nope'/);
});

test('rejects branch type mismatch', () => {
  assert.throws(() => typeOf('if true then 1 else "x"'), /type mismatch/);
});

test('rejects calling a non-function', () => {
  assert.throws(() => typeOf('let x = 1; x(2)'), /type mismatch/);
});

test('do blocks: value is the last expression', () => {
  assert.equal(typeOf('do { let x = 1; x + 1 }'), 'int');
  assert.equal(typeOf('do { println("hi"); 42 }'), 'int');
});

test('len accepts lists and strings', () => {
  assert.equal(typeOf('len([1, 2])'), 'int');
  assert.equal(typeOf('len("hello")'), 'int');
});
