// Lumen parser — recursive descent with precedence climbing.
//
// Grammar (EBNF):
//   program    := statement*
//   statement  := 'let' IDENT '=' expr ';' | expr ';'? 
//   expr       := 'if' expr 'then' expr 'else' expr
//               | 'fn' '(' params? ')' '=>' expr
//               | binary
//   binary     := unary (OP unary)*        — precedence-climbed, see LEVELS
//   unary      := ('-' | '!') unary | call
//   call       := primary ( '(' args? ')' )*
//   primary    := INT | STRING | 'true' | 'false' | 'nil' | IDENT
//               | '(' expr ')' | '[' args? ']'

import { lex } from './lexer.js';

export class ParseError extends Error {
  constructor(message, line, col) {
    super(`${message} (line ${line}, col ${col})`);
    this.line = line;
    this.col = col;
  }
}

// Binary operator precedence levels, loosest to tightest.
const LEVELS = [
  ['||'],
  ['&&'],
  ['==', '!='],
  ['<', '<=', '>', '>='],
  ['++'],
  ['+', '-'],
  ['*', '/', '%'],
];

export function parse(src) {
  const tokens = lex(src);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const at = (type) => peek().type === type;
  const eat = (type) => {
    if (!at(type)) return null;
    return next();
  };
  const expect = (type, what) => {
    if (!at(type)) {
      const t = peek();
      throw new ParseError(`expected ${what ?? type} but found '${t.value ?? t.type}'`, t.line, t.col);
    }
    return next();
  };

  const node = (kind, props, tok) => ({ kind, line: tok.line, col: tok.col, ...props });

  function parseProgram() {
    const statements = [];
    while (!at('EOF')) {
      statements.push(parseStatement());
    }
    return { kind: 'Program', statements };
  }

  function parseStatement() {
    if (at('LET')) {
      const letTok = next();
      const name = expect('IDENT', 'a name after let').value;
      expect('=', "'=' in let binding");
      const value = parseExpr();
      eat(';');
      return node('LetStmt', { name, value }, letTok);
    }
    const expr = parseExpr();
    eat(';');
    return node('ExprStmt', { expr }, peek());
  }

  function parseExpr() {
    return parseIf();
  }

  function parseIf() {
    if (!at('IF')) return parseFn();
    const tok = next();
    const cond = parseExpr();
    expect('THEN', "'then'");
    const then = parseExpr();
    expect('ELSE', "'else' (if-expressions must always produce a value)");
    const els = parseExpr();
    return node('If', { cond, then, els }, tok);
  }

  function parseFn() {
    if (!at('FN')) return parseBinary(0);
    const tok = next();
    expect('(', "'(' after fn");
    const params = [];
    if (!at(')')) {
      do {
        params.push(expect('IDENT', 'a parameter name').value);
      } while (eat(','));
    }
    expect(')', "')' to close parameters");
    expect('=>', "'=>' before the function body");
    const body = parseExpr();
    return node('FnLit', { params, body }, tok);
  }

  function parseBinary(level) {
    if (level >= LEVELS.length) return parseUnary();
    let left = parseBinary(level + 1);
    while (LEVELS[level].includes(peek().type)) {
      const op = next();
      const right = parseBinary(level + 1);
      left = node('BinOp', { op: op.type, left, right }, op);
    }
    return left;
  }

  function parseUnary() {
    if (at('-') || at('!')) {
      const op = next();
      const operand = parseUnary();
      return node('UnOp', { op: op.type, operand }, op);
    }
    return parseCall();
  }

  function parseCall() {
    let callee = parsePrimary();
    while (at('(')) {
      next();
      const args = [];
      if (!at(')')) {
        do {
          args.push(parseExpr());
        } while (eat(','));
      }
      expect(')', "')' to close arguments");
      callee = node('Call', { callee, args }, callee);
    }
    return callee;
  }

  function parsePrimary() {
    const t = peek();
    switch (t.type) {
      case 'INT': next(); return node('IntLit', { value: t.value }, t);
      case 'STRING': next(); return node('StrLit', { value: t.value }, t);
      case 'TRUE': next(); return node('BoolLit', { value: true }, t);
      case 'FALSE': next(); return node('BoolLit', { value: false }, t);
      case 'NIL': next(); return node('NilLit', {}, t);
      case 'DO': {
        next();
        expect('{', "'{' after do");
        const statements = [];
        while (!at('}')) {
          if (at('EOF')) throw new ParseError("unexpected end of input inside do-block", t.line, t.col);
          statements.push(parseStatement());
        }
        expect('}', "'}' to close do-block");
        return node('Do', { statements }, t);
      }
      case 'IDENT': next(); return node('Var', { name: t.value }, t);
      case '(': {
        next();
        const expr = parseExpr();
        expect(')', "')'");
        return expr;
      }
      case '[': {
        next();
        const items = [];
        if (!at(']')) {
          do {
            items.push(parseExpr());
          } while (eat(','));
        }
        expect(']', "']'");
        return node('ListLit', { items }, t);
      }
      default:
        throw new ParseError(`unexpected '${t.value ?? t.type}'`, t.line, t.col);
    }
  }

  const program = parseProgram();
  return program;
}
