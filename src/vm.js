// Lumen virtual machine — a compact stack machine with flat closures.
//
// Values: numbers (integers), booleans, strings, null (nil), arrays (lists)
// and closures { func, env }. Frames are explicit so deep Lumen recursion
// does not consume JavaScript stack.

import { RuntimeError } from './errors.js';

const MAX_STEPS = 200_000_000;

export function run(program, { output = [], maxSteps = MAX_STEPS } = {}) {
  const { funcs, main } = program;
  const stack = [];
  const frames = [];

  let func = funcs[main];
  let ip = 0;
  let locals = new Array(func.nlocals).fill(null);
  let env = [];
  let steps = 0;
  let code = func.code; // cache of current function's code

  function enter(clos, args) {
    frames.push({ func, ip, locals, env, base: stack.length });
    func = funcs[clos.func];
    code = funcs[clos.func].code; // eslint-disable-line no-use-before-define
    locals = new Array(funcs[clos.func].nlocals).fill(null);
    for (let i = 0; i < args.length; i++) locals[i] = args[i];
    env = clos.env;
    ip = 0;
  }

  function leave(returnValue) {
    const f = frames.pop();
    stack.length = f.base;
    stack.push(returnValue);
    func = f.func;
    code = f.func.code;
    ip = f.ip;
    locals = f.locals;
    env = f.env;
  }

  while (true) {
    if (++steps > maxSteps) {
      throw new RuntimeError(`execution limit exceeded (${maxSteps} steps) — infinite loop?`);
    }
    const instr = code[ip++];

    switch (instr.op) {
      case 'CONST': stack.push(instr.value); break;
      case 'LIST': stack.push(stack.splice(stack.length - instr.count, instr.count)); break;
      case 'LOAD_LOCAL': stack.push(locals[instr.slot]); break;
      case 'STORE_LOCAL': locals[instr.slot] = stack.pop(); break;
      case 'LOAD_CAPTURED': stack.push(env[instr.idx]); break;
      case 'CLOSURE': {
        const captures = instr.captures.map((d) =>
          d.kind === 'local' ? locals[d.slot] : env[d.idx]
        );
        const clos = { func: instr.fidx, env: captures };
        if (instr.selfIdx) for (const i of instr.selfIdx) captures[i] = clos;
        stack.push(clos);
        break;
      }
      case 'BUILTIN': stack.push({ builtin: instr.name }); break;
      case 'CALL': {
        const argc = instr.argc;
        const args = stack.splice(stack.length - argc, argc);
        const callee = stack.pop();
        if (callee.func !== undefined) {
          enter(callee, args);
        } else if (callee.builtin) {
          stack.push(callBuiltin(callee.builtin, args, output));
        } else {
          throw new RuntimeError('value is not callable');
        }
        break;
      }
      case 'RET': {
        const value = stack.pop();
        if (frames.length === 0) return { value, output };
        leave(value);
        break;
      }
      case 'POP': stack.pop(); break;
      case 'DUP': stack.push(stack[stack.length - 1]); break;
      case 'JMP': ip = instr.addr; break;
      case 'JMPF': if (!stack.pop()) ip = instr.addr; break;
      case 'JMPT': if (stack.pop()) ip = instr.addr; break;
      case 'ADD': { const b = stack.pop(), a = stack.pop(); stack.push(a + b); break; }
      case 'SUB': { const b = stack.pop(), a = stack.pop(); stack.push(a - b); break; }
      case 'MUL': { const b = stack.pop(), a = stack.pop(); stack.push(a * b); break; }
      case 'DIV': {
        const b = stack.pop(), a = stack.pop();
        if (b === 0) throw new RuntimeError('division by zero');
        stack.push(Math.trunc(a / b));
        break;
      }
      case 'MOD': {
        const b = stack.pop(), a = stack.pop();
        if (b === 0) throw new RuntimeError('modulo by zero');
        stack.push(a % b);
        break;
      }
      case 'EQ': { const b = stack.pop(), a = stack.pop(); stack.push(deepEq(a, b)); break; }
      case 'NEQ': { const b = stack.pop(), a = stack.pop(); stack.push(!deepEq(a, b)); break; }
      case 'LT': { const b = stack.pop(), a = stack.pop(); stack.push(a < b); break; }
      case 'LTE': { const b = stack.pop(), a = stack.pop(); stack.push(a <= b); break; }
      case 'GT': { const b = stack.pop(), a = stack.pop(); stack.push(a > b); break; }
      case 'GTE': { const b = stack.pop(), a = stack.pop(); stack.push(a >= b); break; }
      case 'AND': { const b = stack.pop(), a = stack.pop(); stack.push(a && b); break; }
      case 'OR': { const b = stack.pop(), a = stack.pop(); stack.push(a || b); break; }
      case 'NOT': stack.push(!stack.pop()); break;
      case 'NEG': stack.push(-stack.pop()); break;
      case 'CONCAT': {
        const b = stack.pop(), a = stack.pop();
        if (typeof a === 'string' && typeof b === 'string') stack.push(a + b);
        else if (Array.isArray(a) && Array.isArray(b)) stack.push([...a, ...b]);
        else throw new RuntimeError("'++' needs two strings or two lists");
        break;
      }
      default:
        throw new RuntimeError(`unknown opcode '${instr.op}'`);
    }
  }
}

function callBuiltin(name, args, output) {
  switch (name) {
    case 'print': output.push(display(args[0])); return null;
    case 'println': output.push(display(args[0])); return null;
    case 'len': {
      const v = args[0];
      if (typeof v === 'string' || Array.isArray(v)) return v.length;
      throw new RuntimeError('len expects a list or string');
    }
    case 'head': {
      const v = args[0];
      if (!Array.isArray(v) || v.length === 0) throw new RuntimeError('head of empty list');
      return v[0];
    }
    case 'tail': {
      const v = args[0];
      if (!Array.isArray(v)) throw new RuntimeError('tail expects a list');
      return v.slice(1);
    }
    case 'range': {
      const n = args[0];
      if (!Number.isInteger(n) || n < 0) throw new RuntimeError('range expects a non-negative integer');
      return Array.from({ length: n }, (_, i) => i);
    }
    case 'str': return display(args[0]);
    default:
      throw new RuntimeError(`unknown builtin '${name}'`);
  }
}

export function display(v) {
  if (v === null) return 'nil';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return `[${v.map(display).join(', ')}]`;
  if (typeof v === 'object' && 'func' in v) return '<fn>';
  return String(v);
}

function deepEq(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEq(x, b[i]));
  }
  return a === b;
}
