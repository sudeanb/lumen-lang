// Lumen compiler — translates the AST into bytecode for the stack VM.
//
// Every function (including the top-level program, function 0) becomes a
// Func object { params, nlocals, ncaptures, code }. Closures capture free
// variables BY VALUE at creation time (the language is immutable, so this
// is always sound). Free variables are found in a pre-pass so that capture
// descriptors are known before the parent emits the CLOSURE instruction.

import { CompileError } from './errors.js';

const BINOPS = {
  '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD',
  '==': 'EQ', '!=': 'NEQ', '<': 'LT', '<=': 'LTE', '>': 'GT', '>=': 'GTE',
  // '&&' '||' '++' get dedicated handling (short-circuit / concat)
};

class Scope {
  constructor(parent) {
    this.parent = parent;             // enclosing Scope or null
    this.vars = new Map();            // name -> local slot
    this.captures = new Map();        // name -> capture index (function root only)
  }

  // Lookup within the CURRENT function: nested block scopes share one frame,
  // so walk the parent chain without recording captures.
  lookupLocal(name) {
    let s = this;
    while (s) {
      if (s.vars.has(name)) return { kind: 'local', slot: s.vars.get(name) };
      if (s.captures.has(name)) return { kind: 'captured', idx: s.captures.get(name) };
      s = s.parent;
    }
    return null;
  }

  // Crossing into the ENCLOSING function: record a capture on the way up.
  resolveInParent(name) {
    return this.parent ? this.parent.resolveUpward(name) : null;
  }

  resolveUpward(name) {
    if (this.vars.has(name)) return { kind: 'local', slot: this.vars.get(name) };
    if (this.captures.has(name)) return { kind: 'captured', idx: this.captures.get(name) };
    if (this.parent) return this.parent.resolveUpward(name);
    return null;
  }
}

// Collect names used in `node` that are not bound within it. `bound` is the
// set of names bound by enclosing scopes.
function freeVars(node, bound) {
  switch (node.kind) {
    case 'IntLit': case 'StrLit': case 'BoolLit': case 'NilLit':
      return new Set();
    case 'Var':
      return bound.has(node.name) ? new Set() : new Set([node.name]);
    case 'ListLit': {
      const out = new Set();
      node.items.forEach((it) => freeVars(it, bound).forEach((n) => out.add(n)));
      return out;
    }
    case 'FnLit': {
      const inner = new Set(bound);
      node.params.forEach((p) => inner.add(p));
      return freeVars(node.body, inner);
    }
    case 'Call': {
      const out = freeVars(node.callee, bound);
      node.args.forEach((a) => freeVars(a, bound).forEach((n) => out.add(n)));
      return out;
    }
    case 'If':
      return union(union(freeVars(node.cond, bound), freeVars(node.then, bound)), freeVars(node.els, bound));
    case 'BinOp':
      return union(freeVars(node.left, bound), freeVars(node.right, bound));
    case 'UnOp':
      return freeVars(node.operand, bound);
    case 'ExprStmt':
      return freeVars(node.expr, bound);
    case 'Do': {
      const inner = new Set(bound);
      const out = new Set();
      for (const stmt of node.statements) {
        if (stmt.kind === 'LetStmt') {
          freeVars(stmt.value, inner).forEach((n) => out.add(n));
          inner.add(stmt.name);
        } else {
          freeVars(stmt.expr, inner).forEach((n) => out.add(n));
        }
      }
      return out;
    }
    case 'LetStmt': {
      // the bound name is not visible inside its own initializer
      const out = freeVars(node.value, bound);
      const inner = new Set(bound); inner.add(node.name);
      return out;
    }
    default:
      throw new CompileError(`freeVars: unknown node kind '${node.kind}'`);
  }
}

function union(a, b) {
  b.forEach((n) => a.add(n));
  return a;
}

export function compile(program) {
  const funcs = [];

  function compileFunction(statements, params) {
    const func = { params, nlocals: params.length, ncaptures: 0, code: [] };
    const scope = new Scope(null);
    params.forEach((p, i) => scope.vars.set(p, i));
    funcs.push(func);
    const fidx = funcs.length - 1;
    const ctx = { scope, func, selfSlot: null };

    compileStatements(statements, ctx);
    // empty program or trailing let: produce nil
    if (statements.length === 0 || statements[statements.length - 1].kind === 'LetStmt') {
      emit(ctx, { op: 'CONST', value: null });
    }
    emit(ctx, { op: 'RET' });
    return fidx;
  }

  function compileStatements(statements, ctx) {
    for (let i = 0; i < statements.length; i++) {
      const isLast = i === statements.length - 1;
      const stmt = statements[i];
      if (stmt.kind === 'LetStmt') {
        const isFn = stmt.value.kind === 'FnLit';
        let slot;
        if (isFn) {
          // bind first so the function can reference itself (recursion);
          // the in-progress binding is patched by the VM via CLOSURE.selfIdx
          slot = ctx.func.nlocals++;
          ctx.scope.vars.set(stmt.name, slot);
          ctx.selfSlot = slot;
          compileExpr(stmt.value, ctx);
          ctx.selfSlot = null;
        } else {
          compileExpr(stmt.value, ctx);
          slot = ctx.func.nlocals++;
          ctx.scope.vars.set(stmt.name, slot);
        }
        emit(ctx, { op: 'STORE_LOCAL', slot });
        if (isLast) emit(ctx, { op: 'LOAD_LOCAL', slot });
      } else {
        compileExpr(stmt.expr, ctx);
      }
      if (!isLast) emit(ctx, { op: 'POP' });
    }
  }

  function compileExpr(node, ctx) {
    switch (node.kind) {
      case 'IntLit': return emit(ctx, { op: 'CONST', value: node.value });
      case 'StrLit': return emit(ctx, { op: 'CONST', value: node.value });
      case 'BoolLit': return emit(ctx, { op: 'CONST', value: node.value });
      case 'NilLit': return emit(ctx, { op: 'CONST', value: null });
      case 'ListLit': {
        node.items.forEach((item) => compileExpr(item, ctx));
        return emit(ctx, { op: 'LIST', count: node.items.length });
      }
      case 'Var': return compileVar(node, ctx);
      case 'FnLit': return compileClosure(node, ctx);
      case 'Call': {
        compileExpr(node.callee, ctx);
        node.args.forEach((a) => compileExpr(a, ctx));
        return emit(ctx, { op: 'CALL', argc: node.args.length });
      }
      case 'If': {
        compileExpr(node.cond, ctx);
        const jmpf = emit(ctx, { op: 'JMPF', addr: null });
        compileExpr(node.then, ctx);
        const jmp = emit(ctx, { op: 'JMP', addr: null });
        jmpf.addr = ctx.func.code.length;
        compileExpr(node.els, ctx);
        jmp.addr = ctx.func.code.length;
        return;
      }
      case 'BinOp': return compileBinOp(node, ctx);
      case 'UnOp': {
        compileExpr(node.operand, ctx);
        return emit(ctx, { op: node.op === '-' ? 'NEG' : 'NOT' });
      }
      case 'Do': {
        const prevScope = ctx.scope;
        ctx.scope = new Scope(prevScope);
        compileStatements(node.statements, ctx);
        ctx.scope = prevScope;
        return;
      }
      case 'ExprStmt':
        return compileExpr(node.expr, ctx);
      default:
        throw new CompileError(`cannot compile node kind '${node.kind}'`);
    }
  }

  function compileVar(node, ctx) {
    const local = ctx.scope.lookupLocal(node.name);
    if (local) {
      return emit(ctx, local.kind === 'local'
        ? { op: 'LOAD_LOCAL', slot: local.slot }
        : { op: 'LOAD_CAPTURED', idx: local.idx });
    }
    if (BUILTINS.has(node.name)) return emit(ctx, { op: 'BUILTIN', name: node.name });
    throw new CompileError(`undefined variable '${node.name}'`, node.line);
  }

  function compileClosure(node, ctx) {
    // builtin names resolve at runtime, they are never captured
    const frees = [...freeVars(node, new Set())].filter((n) => !BUILTINS.has(n));
    const innerScope = new Scope(ctx.scope);
    frees.forEach((name, idx) => innerScope.captures.set(name, idx));
    node.params.forEach((p) => innerScope.vars.set(p, innerScope.vars.size));

    const func = { params: node.params, nlocals: node.params.length, ncaptures: frees.length, code: [] };
    funcs.push(func);
    const fidx = funcs.length - 1;
    const innerCtx = { scope: innerScope, func, selfSlot: null };

    compileExpr(node.body, innerCtx);
    emit(innerCtx, { op: 'RET' });

    // capture descriptors, resolved against the enclosing frame
    const captures = frees.map((name) => {
      const up = innerScope.resolveInParent(name);
      if (!up) throw new CompileError(`internal: unresolved capture '${name}'`, node.line);
      return up;
    });
    // captures that point at the binding currently being defined are patched
    // to the closure itself after creation (recursion fix-up)
    const selfIdx = captures
      .map((d, i) => (ctx.selfSlot !== null && d.kind === 'local' && d.slot === ctx.selfSlot ? i : -1))
      .filter((i) => i >= 0);
    return emit(ctx, { op: 'CLOSURE', fidx, captures, selfIdx });
  }

  function compileBinOp(node, ctx) {
    if (node.op === '&&' || node.op === '||') {
      compileExpr(node.left, ctx);
      emit(ctx, { op: 'DUP' });
      const jmp = emit(ctx, { op: node.op === '&&' ? 'JMPF' : 'JMPT', addr: null });
      emit(ctx, { op: 'POP' });
      compileExpr(node.right, ctx);
      jmp.addr = ctx.func.code.length;
      return;
    }
    if (node.op === '++') {
      compileExpr(node.left, ctx);
      compileExpr(node.right, ctx);
      return emit(ctx, { op: 'CONCAT' });
    }
    compileExpr(node.left, ctx);
    compileExpr(node.right, ctx);
    return emit(ctx, { op: BINOPS[node.op] });
  }

  function emit(ctx, instr) {
    ctx.func.code.push(instr);
    return instr;
  }

  const mainIdx = compileFunction(program.statements, []);
  return { funcs, main: mainIdx };
}

const BUILTINS = new Set(['print', 'println', 'len', 'head', 'tail', 'range', 'str']);
