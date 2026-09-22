import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runSource } from '../src/index.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const example = (name) => readFileSync(join(root, 'examples', name), 'utf8');

test('arithmetic and precedence', () => {
  assert.equal(runSource('2 + 3 * 4').value, 14);
  assert.equal(runSource('(2 + 3) * 4').value, 20);
  assert.equal(runSource('10 / 3').value, 3);
  assert.equal(runSource('10 % 3').value, 1);
  assert.equal(runSource('-5 + 2').value, -3);
});

test('strings concatenate with ++', () => {
  const r = runSource('"foo" ++ "bar"');
  assert.equal(r.value, 'foobar');
});

test('lists: construction, concat, equality', () => {
  assert.deepEqual(runSource('[1, 2] ++ [3, 4]').value, [1, 2, 3, 4]);
  assert.equal(runSource('[[1, 2], [3]] == [[1, 2], [3]]').value, true);
  assert.equal(runSource('[1, 2] == [1, 3]').value, false);
  assert.deepEqual(runSource('[1, 2, 3]').value, [1, 2, 3]);
});

test('fib(20) computes 6765 through compiled bytecode', () => {
  const r = runSource(`
    let fib = fn(n) => if n < 2 then n else fib(n - 1) + fib(n - 2);
    fib(20)
  `);
  assert.equal(r.value, 6765);
});

test('deep recursion does not blow the JS stack (iterative VM frames)', () => {
  const r = runSource(`
    let sum = fn(n) => if n == 0 then 0 else n + sum(n - 1);
    sum(50000)
  `);
  assert.equal(r.value, 1250025000);
});

test('closures capture by value', () => {
  const r = runSource(`
    let make_adder = fn(n) => fn(x) => x + n;
    let add10 = make_adder(10);
    add10(5)
  `);
  assert.equal(r.value, 15);
});

test('short-circuit && and ||', () => {
  assert.equal(runSource('false && (1 / 0 == 0)').value, false);
  assert.equal(runSource('true || (1 / 0 == 0)').value, true);
});

test('do blocks sequence side effects', () => {
  const r = runSource(`
    let loop = fn(i) => if i > 3 then nil else do { println(i * i); loop(i + 1); };
    loop(1)
  `);
  assert.deepEqual(r.output, ['1', '4', '9']);
});

test('division by zero is a clean runtime error', () => {
  assert.throws(() => runSource('1 / 0'), /division by zero/);
});

test('infinite loops hit the execution limit', () => {
  assert.throws(
    () => runSource('let loop = fn(n) => loop(n + 1); loop(0)', { maxSteps: 100000 }),
    /execution limit/,
  );
});

test('fizzbuzz example runs end to end', () => {
  const r = runSource(example('fizzbuzz.lum'));
  assert.deepEqual(r.output.slice(0, 5), ['1', '2', 'Fizz', '4', 'Buzz']);
  assert.equal(r.output[14], 'FizzBuzz');
});

test('quicksort example sorts correctly', () => {
  const r = runSource(example('lists.lum'));
  assert.deepEqual(r.output[0], '[1, 2, 3, 4, 5, 6, 7, 8, 9]');
  assert.deepEqual(r.output[1], '[1, 4, 9]');
});

test('closures example prints composed results', () => {
  const r = runSource(example('closures.lum'));
  assert.deepEqual(r.output, ['15', '105', '11', '12']);
});

test('fib example prints 55 and returns 6765', () => {
  const r = runSource(example('fib.lum'));
  assert.deepEqual(r.output, ['55']);
  assert.equal(r.value, 6765);
});
