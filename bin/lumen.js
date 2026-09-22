#!/usr/bin/env node
// Lumen CLI — run files or drop into an interactive REPL.
//
//   node bin/lumen.js program.lum      run a file
//   node bin/lumen.js --type prog.lum  print the inferred type only
//   node bin/lumen.js                  start the REPL

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { runSource, typeOf, ParseError, TypeError as LumenTypeError, CompileError, RuntimeError, VERSION } from '../src/index.js';

const args = process.argv.slice(2);

function fail(err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}

if (args[0] === '--type') {
  const src = readFileSync(args[1], 'utf8');
  try {
    console.log(typeOf(src));
  } catch (err) {
    fail(err);
  }
  process.exit(0);
}

if (args[0]) {
  const src = readFileSync(args[0], 'utf8');
  try {
    const { value, output, type } = runSource(src);
    for (const line of output) console.log(line);
    if (value !== null) console.log(`=> ${formatValue(value)} : ${type}`);
  } catch (err) {
    fail(err);
  }
  process.exit(0);
}

// ---- REPL ----

console.log(`Lumen ${VERSION} — a tiny functional language. Ctrl+D to exit.`);
const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '>>> ' });
rl.prompt();

let buffer = '';

rl.on('line', (line) => {
  buffer += (buffer ? '\n' : '') + line;
  // keep reading while the program is syntactically incomplete
  try {
    const { value, type, output, statements } = runSource(buffer);
    buffer = '';
    for (const out of output) console.log(out);
    for (const s of statements) console.log(`${s.name} : ${s.type}`);
    if (value !== null && value !== undefined) console.log(`=> ${formatValue(value)} : ${type}`);
  } catch (err) {
    if (err instanceof ParseError && /expected/.test(err.message) && incomplete(buffer)) {
      rl.setPrompt('... ');
      rl.prompt();
      return;
    }
    if (err instanceof LumenTypeError) console.log(`type error: ${err.message}`);
    else if (err instanceof CompileError) console.log(`compile error: ${err.message}`);
    else if (err instanceof RuntimeError) console.log(`runtime error: ${err.message}`);
    else console.log(`error: ${err.message}`);
    buffer = '';
  }
  rl.setPrompt('>>> ');
  rl.prompt();
}).on('close', () => {
  console.log();
  process.exit(0);
});

function incomplete(source) {
  const opens = (source.match(/\(/g) ?? []).length - (source.match(/\)/g) ?? []).length;
  const brackets = (source.match(/\[/g) ?? []).length - (source.match(/\]/g) ?? []).length;
  return opens > 0 || brackets > 0 || /\b(if|fn|then)\b[^;]*$/.test(source);
}

function formatValue(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}
