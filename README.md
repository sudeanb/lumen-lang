# ☉ Lumen

**A tiny statically-typed functional programming language — lexer, parser,
Hindley-Milner type inference, bytecode compiler and stack virtual machine,
written from scratch with zero dependencies.**

[![CI](https://github.com/sudeanb/lumen-lang/actions/workflows/ci.yml/badge.svg)](https://github.com/sudeanb/lumen-lang/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-green)](package.json)

🌐 **[Try it live in the playground →](https://sudeanb.github.io/lumen-lang/playground/)**
(write Lumen, see inferred types, run it — everything executes client-side)

```lumen
let fib = fn(n) =>
  if n < 2 then n else fib(n - 1) + fib(n - 2);

println(fib(10));   // 55
fib(20)             // => 6765 : int
```

## What's inside

Every stage of a real language toolchain, implemented by hand:

| Stage | What it does | Highlights |
|---|---|---|
| **Lexer** | source → tokens | precise line/col error reporting |
| **Parser** | tokens → AST | recursive descent + precedence climbing, `if/then/else`, `fn`, `do` blocks |
| **Type checker** | full **Hindley-Milner** inference (Algorithm W) | let-polymorphism, union-find unification, occurs check |
| **Compiler** | AST → bytecode | flat closures with by-value capture, recursion fix-up, short-circuit lowering |
| **Virtual machine** | bytecode → results | explicit call frames (deep recursion without JS stack overflow), step budget |

~1,200 lines of dependency-free ESM JavaScript. No build step, no transpiler.

## Quick start

```bash
git clone https://github.com/sudeanb/lumen-lang.git
cd lumen-lang

node bin/lumen.js examples/fib.lum   # run a program
node bin/lumen.js                    # start the REPL
node --test test/                    # run the test suite (37 tests)
```

The REPL shows inferred types as you go:

```
>>> let id = fn(x) => x;
id : ('a) -> 'a
>>> id(42)
=> 42 : int
>>> id("hi")
=> "hi" : string
```

## The language in one minute

```lumen
// immutable bindings
let name = "Lumen";

// first-class functions & closures
let make_adder = fn(n) => fn(x) => x + n;
let add10 = make_adder(10);
add10(5)                        // 15

// let-polymorphism: one map, every type
let map = fn(xs, f) =>
  if len(xs) == 0 then xs
  else [f(head(xs))] ++ map(tail(xs), f);

map([1, 2, 3], fn(x) => x * x)   // [1, 4, 9]

// do-blocks sequence side effects
let loop = fn(i) =>
  if i > 3 then nil
  else do { println(i); loop(i + 1); };
```

Values: `int`, `bool`, `string`, `nil`, homogeneous lists `[T]`, functions.
Types are **always inferred** — no annotations anywhere.

## Language tour — see also

- [examples/](examples/) — runnable programs (quicksort, closures, fizzbuzz)
- [docs/DESIGN.md](docs/DESIGN.md) — full design document: grammar, Algorithm W,
  bytecode ISA table, closure representation, VM internals
- [playground/](playground/) — source of the browser playground

## Design decisions worth reading about

- **Why Hindley-Milner?** Inference is the hard, interesting part. Generalization
  makes `id` polymorphic while `fib` stays monomorphic — Algorithm W does both
  in ~300 lines ([docs/DESIGN.md §3](docs/DESIGN.md#3-type-system)).
- **Closures by value.** The language is immutable, so capturing the
  environment at creation time is always sound. Recursion is handled with a
  `selfIdx` fix-up that patches the closure into its own environment
  ([§5](docs/DESIGN.md#5-closures)).
- **Explicit VM frames.** A 50 000-deep Lumen recursion test passes without
  touching the JavaScript stack ([§6](docs/DESIGN.md#6-virtual-machine)).

## Limitations (honest list)

- No mutual recursion between top-level bindings yet (single-`let` recursion works)
- Integers only for arithmetic; strings/lists are append-only via `++`
- No pattern matching or tail-call elimination yet — see the roadmap in the
  [design doc](docs/DESIGN.md#7-roadmap)

## License

[MIT](LICENSE)
