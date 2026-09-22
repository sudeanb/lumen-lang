import { runSource } from '../src/index.js';

const code = document.getElementById('code');
const out = document.getElementById('out');
const runBtn = document.getElementById('run');

const PRESETS = {
  fib: `// classic naive fibonacci
let fib = fn(n) =>
  if n < 2 then n else fib(n - 1) + fib(n - 2);

println(fib(10));
fib(20)`,
  fizzbuzz: `// do-blocks sequence side effects
let name = fn(n) =>
  if n % 15 == 0 then "FizzBuzz"
  else if n % 3 == 0 then "Fizz"
  else if n % 5 == 0 then "Buzz"
  else str(n);

let loop = fn(i, n) =>
  if i > n then nil
  else do {
    println(name(i));
    loop(i + 1, n);
  };

loop(1, 15)`,
  closures: `// closures capture their environment
let make_adder = fn(n) => fn(x) => x + n;
let compose = fn(f, g) => fn(x) => f(g(x));

let add10 = make_adder(10);
println(add10(5));
println(compose(fn(x) => x + 1, fn(x) => x * 2)(5))`,
  lists: `// polymorphic map + quicksort
let map = fn(xs, f) =>
  if len(xs) == 0 then xs
  else [f(head(xs))] ++ map(tail(xs), f);

let filter = fn(xs, keep) =>
  if len(xs) == 0 then xs
  else if keep(head(xs)) then [head(xs)] ++ filter(tail(xs), keep)
  else filter(tail(xs), keep);

let sort = fn(xs) =>
  if len(xs) <= 1 then xs
  else
    sort(filter(tail(xs), fn(x) => x <= head(xs)))
    ++ [head(xs)]
    ++ sort(filter(tail(xs), fn(x) => x > head(xs)));

println(sort([5, 2, 8, 1, 9, 3]));
println(map([1, 2, 3], fn(x) => x * x))`,
};

code.value = PRESETS.fib;

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function run() {
  out.textContent = '';
  try {
    const r = runSource(code.value);
    for (const line of r.output) {
      const d = document.createElement('div');
      d.className = 'line';
      d.textContent = line;
      out.appendChild(d);
    }
    for (const s of r.statements) {
      const d = document.createElement('div');
      d.className = 'line';
      d.style.color = 'var(--muted)';
      d.textContent = `${s.name} : ${s.type}`;
      out.appendChild(d);
    }
    const res = document.createElement('div');
    res.className = 'result';
    const shown = r.value === null ? '' : `=> ${typeof r.value === 'string' ? JSON.stringify(r.value) : r.value} : ${r.type}`;
    res.textContent = shown || '(nil)';
    out.appendChild(res);
  } catch (err) {
    const d = document.createElement('div');
    d.className = 'err';
    d.textContent = `${err.constructor.name.replace(/Error$/, ' error')}: ${err.message}`;
    out.appendChild(d);
  }
}

runBtn.addEventListener('click', run);
code.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run();
});
document.querySelectorAll('.preset').forEach((b) =>
  b.addEventListener('click', () => {
    code.value = PRESETS[b.dataset.p];
    run();
  })
);

run();
