// Lumen type checker — Hindley-Milner type inference via Algorithm W.
//
// Types: int, bool, string, nil, list<T>, fn(T1, ..., Tn) -> T, plus type
// variables unified with union-find style substitution. `let` bindings are
// generalized (no value restriction needed: the language is immutable).

export class TypeError extends Error {
  constructor(message, line) {
    super(line ? `${message} (line ${line})` : message);
    this.line = line;
  }
}

let nextVarId = 0;
export function resetTypeVars() { nextVarId = 0; }

class TVar {
  constructor() {
    this.id = nextVarId++;
    this.instance = null;
  }
}

const TInt = { tag: 'int' };
const TBool = { tag: 'bool' };
const TString = { tag: 'string' };
const TNil = { tag: 'nil' };

const TList = (elem) => ({ tag: 'list', elem });
const TFn = (params, ret) => ({ tag: 'fn', params, ret });

function prune(t) {
  while (t instanceof TVar && t.instance) t = t.instance;
  return t;
}

function occurs(v, t) {
  t = prune(t);
  if (t === v) return true;
  if (t instanceof TVar) return false;
  if (t.tag === 'list') return occurs(v, t.elem);
  if (t.tag === 'fn') return t.params.some((p) => occurs(v, p)) || occurs(v, t.ret);
  return false;
}

export function unify(a, b, line) {
  a = prune(a);
  b = prune(b);
  if (a === b) return;
  if (a instanceof TVar) {
    if (occurs(a, b)) throw new TypeError('type recursion detected (infinite type)', line);
    a.instance = b;
    return;
  }
  if (b instanceof TVar) return unify(b, a, line);
  if (a.tag !== b.tag) {
    throw new TypeError(`type mismatch: expected '${typeToString(a)}' but got '${typeToString(b)}'`, line);
  }
  if (a.tag === 'list') return unify(a.elem, b.elem, line);
  if (a.tag === 'fn') {
    if (a.params.length !== b.params.length) {
      throw new TypeError(`function arity mismatch: expected ${a.params.length} argument(s) but got ${b.params.length}`, line);
    }
    a.params.forEach((p, i) => unify(p, b.params[i], line));
    return unify(a.ret, b.ret, line);
  }
}

// ---- schemes (polytypes) ----

function freeVars(t, acc = new Set()) {
  t = prune(t);
  if (t instanceof TVar) { acc.add(t); return acc; }
  if (t.tag === 'list') return freeVars(t.elem, acc);
  if (t.tag === 'fn') {
    t.params.forEach((p) => freeVars(p, acc));
    return freeVars(t.ret, acc);
  }
  return acc;
}

function generalize(t, env) {
  const envFree = new Set();
  for (const scheme of env.values()) freeVars(scheme.type, envFree);
  const scoped = freeVars(t);
  const vars = [...scoped].filter((v) => !envFree.has(v));
  return { vars, type: t };
}

function instantiate(scheme) {
  const mapping = new Map(scheme.vars.map((v) => [v, new TVar()]));
  function fresh(t) {
    t = prune(t);
    if (t instanceof TVar) return mapping.get(t) ?? t;
    if (t.tag === 'list') return TList(fresh(t.elem));
    if (t.tag === 'fn') return TFn(t.params.map(fresh), fresh(t.ret));
    return t;
  }
  return fresh(scheme.type);
}

// ---- pretty printing ----

export function typeToString(t, names = new Map(), counter = { n: 0 }) {
  t = prune(t);
  if (t instanceof TVar) {
    if (!names.has(t.id)) names.set(t.id, `'${String.fromCharCode(97 + (counter.n++ % 26))}`);
    return names.get(t.id);
  }
  switch (t.tag) {
    case 'int': return 'int';
    case 'bool': return 'bool';
    case 'string': return 'string';
    case 'nil': return 'nil';
    case 'list': return `[${typeToString(t.elem, names, counter)}]`;
    case 'fn': return `(${t.params.map((p) => typeToString(p, names, counter)).join(', ')}) -> ${typeToString(t.ret, names, counter)}`;
    default: return '?';
  }
}

// ---- builtins ----
// `len` is the one pragmatic overload: it accepts [a] or string (see Call case).

const BUILTIN_SCHEMES = () => {
  const printArg = new TVar();
  const printlnArg = new TVar();
  const strArg = new TVar();
  const headElem = new TVar();
  const tailElem = new TVar();
  return new Map([
    ['print', { vars: [printArg], type: TFn([printArg], TNil) }],
    ['println', { vars: [printlnArg], type: TFn([printlnArg], TNil) }],
    ['len', { vars: [], type: TFn([TList(new TVar())], TInt) }],
    ['head', { vars: [headElem], type: TFn([TList(headElem)], headElem) }],
    ['tail', { vars: [tailElem], type: TFn([TList(tailElem)], TList(tailElem)) }],
    ['range', { vars: [], type: TFn([TInt], TList(TInt)) }],
    ['str', { vars: [strArg], type: TFn([strArg], TString) }],
  ]);
};

// ---- inference (Algorithm W) ----

function infer(node, env) {
  switch (node.kind) {
    case 'IntLit': return TInt;
    case 'StrLit': return TString;
    case 'BoolLit': return TBool;
    case 'NilLit': return TNil;
    case 'ListLit': {
      const elem = new TVar();
      for (const item of node.items) unify(elem, infer(item, env), node.line);
      return TList(elem);
    }
    case 'Var': {
      const scheme = env.get(node.name);
      if (!scheme) throw new TypeError(`undefined variable '${node.name}'`, node.line);
      return instantiate(scheme);
    }
    case 'FnLit': {
      const paramTypes = node.params.map(() => new TVar());
      const fnEnv = new Map(env);
      node.params.forEach((p, i) => fnEnv.set(p, { vars: [], type: paramTypes[i] }));
      const ret = infer(node.body, fnEnv);
      return TFn(paramTypes, ret);
    }
    case 'Call': {
      // pragmatic overload: len accepts [a] or string
      if (node.callee.kind === 'Var' && node.callee.name === 'len' && node.args.length === 1) {
        const argType = infer(node.args[0], env);
        try {
          unify(TList(new TVar()), argType, node.line);
        } catch {
          unify(TString, argType, node.line);
        }
        return TInt;
      }
      const calleeType = infer(node.callee, env);
      const argTypes = node.args.map((a) => infer(a, env));
      const ret = new TVar();
      unify(calleeType, TFn(argTypes, ret), node.line);
      return ret;
    }
    case 'If': {
      unify(TBool, infer(node.cond, env), node.cond.line);
      const thenType = infer(node.then, env);
      const elseType = infer(node.els, env);
      unify(thenType, elseType, node.line);
      return thenType;
    }
    case 'BinOp': return inferBinOp(node, env);
    case 'UnOp': {
      const t = infer(node.operand, env);
      if (node.op === '!') { unify(TBool, t, node.operand.line); return TBool; }
      unify(TInt, t, node.operand.line); // unary '-'
      return TInt;
    }
    case 'ExprStmt':
      return infer(node.expr, env);
    case 'Do': {
      // block expression: statements share a scoped env, value = last expression
      const inner = new Map(env);
      let t = TNil;
      for (const stmt of node.statements) {
        if (stmt.kind === 'LetStmt') {
          const placeholder = new TVar();
          inner.set(stmt.name, { vars: [], type: placeholder });
          const valueType = infer(stmt.value, inner);
          unify(placeholder, valueType, stmt.value.line);
          inner.set(stmt.name, generalize(placeholder, inner));
          t = placeholder;
        } else {
          t = infer(stmt.expr, inner);
        }
      }
      return t;
    }
    default:
      throw new TypeError(`cannot infer node kind '${node.kind}'`);
  }
}

function inferBinOp(node, env) {
  const l = infer(node.left, env);
  const r = infer(node.right, env);
  switch (node.op) {
    case '+': case '-': case '*': case '/': case '%':
      unify(TInt, l, node.left.line);
      unify(TInt, r, node.right.line);
      return TInt;
    case '++': // concatenation: strings with strings, lists with lists
      unify(l, r, node.line);
      return l;
    case '<': case '<=': case '>': case '>=':
      unify(TInt, l, node.left.line);
      unify(TInt, r, node.right.line);
      return TBool;
    case '==': case '!=':
      unify(l, r, node.line);
      return TBool;
    case '&&': case '||':
      unify(TBool, l, node.left.line);
      unify(TBool, r, node.right.line);
      return TBool;
    default:
      throw new TypeError(`unknown operator '${node.op}'`, node.line);
  }
}

export function typecheck(program) {
  resetTypeVars();
  const env = new Map();
  for (const [name, scheme] of BUILTIN_SCHEMES()) env.set(name, scheme);

  const statementTypes = [];
  let resultType = TNil;

  for (const stmt of program.statements) {
    if (stmt.kind === 'LetStmt') {
      const placeholder = new TVar();
      env.set(stmt.name, { vars: [], type: placeholder });
      const valueType = infer(stmt.value, env);
      unify(placeholder, valueType, stmt.value.line);
      env.set(stmt.name, generalize(placeholder, env));
      statementTypes.push({ name: stmt.name, type: placeholder });
    } else {
      resultType = infer(stmt.expr, env);
      statementTypes.push(null);
    }
  }

  return {
    statements: statementTypes,
    result: resultType,
    env,
  };
}
