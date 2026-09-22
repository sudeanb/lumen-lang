# Lumen — Language Design

Lumen is a small, statically-typed functional language. This document
describes the language surface, the type system, the bytecode format and the
virtual machine. Everything is implemented from scratch in dependency-free
JavaScript (see `src/`).

## 1. The pipeline

```
source ──lex──▶ tokens ──parse──▶ AST ──typecheck──▶ typed AST
                                                      │
                                              compile ▼
                                       bytecode (Func[]) ──run──▶ value + output
```

| Stage   | File                | Responsibility |
|---------|---------------------|----------------|
| lex     | `src/lexer.js`      | characters → tokens (with line/col) |
| parse   | `src/parser.js`     | tokens → AST (recursive descent + precedence climbing) |
| typecheck | `src/typecheck.js` | Hindley-Milner inference via Algorithm W |
| compile | `src/compiler.js`   | AST → bytecode functions with flat closures |
| run     | `src/vm.js`         | stack VM with explicit call frames |

## 2. Grammar (EBNF)

```ebnf
program    = statement*, EOF
statement  = "let" IDENT "=" expr ";" | expr, ";"?
expr       = if_expr | fn_expr | do_expr | binary
if_expr    = "if" expr "then" expr "else" expr
fn_expr    = "fn" "(" params? ")" "=>" expr
do_expr    = "do" "{" statement* "}"
binary     = unary (OP unary)*          -- precedence-climbed
unary      = ("-" | "!") unary | call
call       = primary ( "(" args? ")" )*
primary    = INT | STRING | "true" | "false" | "nil" | IDENT
            | "(" expr ")" | "[" args? "]"
```

Binary precedence, loosest to tightest:
`||` → `&&` → `== !=` → `< <= > >=` → `++` → `+ -` → `* / %` → unary → call.

`do` blocks sequence side effects; their value is the last expression.

## 3. Type system

Types: `int`, `bool`, `string`, `nil`, `[T]` (homogeneous list) and
`(T1, ..., Tn) -> T` functions.

Inference is **Algorithm W** with union-find substitution:

- `let` bindings are generalized — free type variables become polymorphic
  (`let id = fn(x) => x;` works on every type).
- Closures infer their parameter types as fresh variables.
- `if` requires `bool` condition and unifiable branches.
- `++` concatenates two strings or two lists of the same element type.
- One pragmatic overload: `len` accepts `[a]` or `string`.

Type errors report source line, e.g. `type mismatch: expected 'int' but got
'string' (line 2)`.

Known limitation: `let`-bound recursion works (`let fib = ...`), but mutual
recursion between two top-level bindings is rejected — the second name is not
yet in scope when the first body is checked.

## 4. Bytecode

Each function (including the implicit top-level program, function 0)
compiles to:

```
Func { params, nlocals, ncaptures, code: Instr[] }
```

Instructions:

| Instruction        | Effect |
|--------------------|--------|
| `CONST v`          | push constant |
| `LIST n`           | pop n values, push as list |
| `LOAD_LOCAL s`     | push local slot s |
| `STORE_LOCAL s`    | pop into local slot s |
| `LOAD_CAPTURED i`  | push closure environment slot i |
| `CLOSURE f, caps, self?` | create closure over function f, capturing values per descriptor; `self` indices are patched to the closure itself (recursion fix-up) |
| `BUILTIN name`     | push builtin function |
| `CALL argc`        | call (native frame push or builtin application) |
| `RET`              | return top of stack to caller |
| `POP`, `DUP`       | stack shuffling |
| `JMP a`, `JMPF a`, `JMPT a` | jumps |
| `ADD SUB MUL DIV MOD` | integer arithmetic (DIV/MOD trap on zero) |
| `EQ NEQ LT LTE GT GTE` | comparisons (list equality is deep) |
| `AND OR`           | boolean ops (compiled through short-circuit jumps) |
| `NOT NEG`          | unary ops |
| `CONCAT`           | `++` for two strings or two lists |

`&&`/`||` compile to `DUP` + conditional jump + `POP` so the right operand is
only evaluated when needed.

## 5. Closures

Lumen is immutable, so closures capture free variables **by value** at
creation time (a flat environment array). Free variables are found in a
pre-pass over each lambda, so the parent knows the capture descriptors before
emitting `CLOSURE`.

Recursion needs one trick: when `let f = fn...` is compiled, the binding slot
is allocated *before* the body, and the closure's self-reference slots are
patched to the closure itself after creation (`selfIdx`). Without this, a
closure would capture its own (not-yet-assigned) slot as `nil`.

## 6. Virtual machine

The VM is a plain loop over the instruction array with:

- one operand stack, trimmed to the frame base on return;
- explicit call frames (`func, ip, locals, env, base`) — Lumen recursion does
  not consume JavaScript stack, so deep recursion (tested to 50 000 frames)
  is safe;
- a step budget (default 200M) that turns infinite loops into a clean
  `execution limit exceeded` error — this is what keeps the browser
  playground responsive.

## 7. Roadmap

- mutual recursion & `let rec` pairs
- pattern matching
- tail-call optimization in the VM (`TAILCALL`)
- strings as sequences (`each`, `split` builtins)
- a WASM backend for the VM
