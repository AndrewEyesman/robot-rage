// Lingo value(): evaluates a string as a Lingo expression. Servers and ini files send
// literals ([#err: 0, #sid: "..."]), but value() is a real evaluator, so this covers
// what Director does with them (checked against Adobe's player):
//
// - numbers ("1." and ".5" are floats; integers past the maxinteger become floats),
//   "strings" (no escapes), #symbols ("# a" too), lists and property lists (bare words
//   before ":" are symbols: "[a: 1]" is [#a: 1]; an entry without a key in a property
//   list gets its position: "[1: 2, 3]" is [1: 2, 2: 3]), point() rect() rgb() color()
//   vector() paletteIndex(), VOID TRUE FALSE EMPTY RETURN TAB QUOTE SPACE BACKSPACE PI,
//   `the maxinteger`, arithmetic, comparisons, & &&, and/or/not, parentheses;
// - a bare word is an unset variable: VOID ("abc" and "[abc]" give VOID and [<Void>]);
// - after a complete expression the rest is ignored ("12 abc" is 12, "[1,2] junk" is
//   [1, 2]), as is anything after a line break or "--";
// - malformed input is VOID: "[1,2", "[1 2]", "12abc", "1.5.5", an unterminated string.

import {
  add, concat, concatSpace, contains, div, float, integer, lf, lingoCompare, lingoEquals, LList, LPropList, mod,
  neg, num, paletteIndex, point, rect, rgb, sqrt, abs, starts, sym, symbol, vector, type LValue, isNum, LSymbol,
  maxInteger, PI, sub, mul,
} from './values';
import { lingoString } from './format';

type Tok =
  | { t: 'num'; v: LValue }
  | { t: 'str'; v: string }
  | { t: 'sym'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'end' };

class Fail extends Error {}

const ID_START = /[A-Za-z_À-ÿ]/;
const ID_CHAR = /[A-Za-z0-9_À-ÿ]/;

class Lexer {
  pos = 0;
  constructor(private readonly s: string) {}

  next(): Tok {
    const s = this.s;
    while (this.pos < s.length && (s[this.pos] === ' ' || s[this.pos] === '\t')) this.pos++;
    // A line break or comment ends the statement.
    if (this.pos >= s.length || s[this.pos] === '\r' || s[this.pos] === '\n' || s.startsWith('--', this.pos)) {
      this.pos = s.length;
      return { t: 'end' };
    }
    const c = s[this.pos];
    if (/[0-9.]/.test(c) && /[0-9]/.test(s[c === '.' ? this.pos + 1 : this.pos] ?? '')) return this.number();
    if (c === '"') {
      const end = s.indexOf('"', this.pos + 1);
      if (end < 0) throw new Fail();
      const v = s.slice(this.pos + 1, end);
      this.pos = end + 1;
      return { t: 'str', v };
    }
    if (c === '#') {
      this.pos++;
      while (s[this.pos] === ' ' || s[this.pos] === '\t') this.pos++;
      // "#1" reads as 1.
      if (/[0-9]/.test(s[this.pos] ?? '')) return this.number();
      const name = this.ident();
      if (!name) throw new Fail();
      return { t: 'sym', v: name };
    }
    if (ID_START.test(c)) return { t: 'id', v: this.ident() };
    for (const op of ['<>', '<=', '>=', '&&']) {
      if (s.startsWith(op, this.pos)) {
        this.pos += 2;
        return { t: 'op', v: op };
      }
    }
    if ('[]():,+-*/=<>&'.includes(c)) {
      this.pos++;
      return { t: 'op', v: c };
    }
    throw new Fail();
  }

  private ident(): string {
    const start = this.pos;
    while (this.pos < this.s.length && ID_CHAR.test(this.s[this.pos])) this.pos++;
    return this.s.slice(start, this.pos);
  }

  private number(): Tok {
    const m = /^(\d*)(\.\d*)?([eE][+-]?\d+)?/.exec(this.s.slice(this.pos))!;
    this.pos += m[0].length;
    // A number running into a letter, digit or point is not a token ("12abc", "1.5.5", "1.5e").
    if (this.pos < this.s.length && /[A-Za-z0-9_.]/.test(this.s[this.pos])) throw new Fail();
    const x = Number(m[0]);
    const isFloatLit = m[2] !== undefined || m[3] !== undefined || x > maxInteger;
    return { t: 'num', v: isFloatLit ? lf(x) : x };
  }
}

const CONSTANTS: Record<string, () => LValue> = {
  void: () => undefined,
  true: () => 1,
  false: () => 0,
  empty: () => '',
  return: () => '\r',
  tab: () => '\t',
  quote: () => '"',
  space: () => ' ',
  backspace: () => '\b',
  enter: () => '\x03',
  pi: () => PI,
};

const FUNCTIONS: Record<string, (a: LValue[]) => LValue> = {
  point: (a) => point(numArg(a[0]), numArg(a[1])),
  rect: (a) => rect(numArg(a[0]), numArg(a[1]), numArg(a[2]), numArg(a[3])),
  rgb: (a) => rgb(a[0], a[1], a[2]),
  color: (a) => (a.length === 1 && isNum(a[0]) ? paletteIndex(num(a[0])) : rgb(a[0], a[1], a[2])),
  paletteindex: (a) => paletteIndex(num(a[0])),
  vector: (a) => vector(a[0], a[1], a[2]),
  sqrt: (a) => sqrt(a[0]),
  abs: (a) => abs(a[0]),
  float: (a) => float(a[0]),
  integer: (a) => integer(a[0]),
  string: (a) => lingoString(a[0]),
  symbol: (a) => symbol(a[0]),
};

const numArg = (v: LValue) => (isNum(v) ? v : num(v));

class Parser {
  private tok: Tok;
  constructor(private readonly lex: Lexer) {
    this.tok = lex.next();
  }

  private advance(): Tok {
    const t = this.tok;
    this.tok = this.lex.next();
    return t;
  }
  private isOp(v: string): boolean {
    return this.tok.t === 'op' && this.tok.v === v;
  }
  private isWord(v: string): boolean {
    return this.tok.t === 'id' && this.tok.v.toLowerCase() === v;
  }
  private expect(v: string): void {
    if (!this.isOp(v)) throw new Fail();
    this.advance();
  }

  // Lowest to highest: and/or, comparisons, & &&, + -, * / mod, unary.
  expr(): LValue {
    let a = this.comparison();
    while (this.isWord('and') || this.isWord('or')) {
      const op = (this.advance() as { v: string }).v.toLowerCase();
      const b = this.comparison();
      a = op === 'and' ? (truthy(a) && truthy(b) ? 1 : 0) : truthy(a) || truthy(b) ? 1 : 0;
    }
    return a;
  }

  private comparison(): LValue {
    let a = this.concatenation();
    for (;;) {
      if (this.isWord('contains') || this.isWord('starts')) {
        const op = (this.advance() as { v: string }).v.toLowerCase();
        const b = this.concatenation();
        a = (op === 'contains' ? contains(a, b) : starts(a, b)) ? 1 : 0;
        continue;
      }
      if (this.tok.t !== 'op' || !['=', '<>', '<', '>', '<=', '>='].includes(this.tok.v)) return a;
      const op = this.advance() as { v: string };
      const b = this.concatenation();
      const c = lingoCompare(a, b);
      const r = { '=': lingoEquals(a, b), '<>': !lingoEquals(a, b), '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0 }[op.v];
      a = r ? 1 : 0;
    }
  }

  private concatenation(): LValue {
    let a = this.sum();
    while (this.isOp('&') || this.isOp('&&')) {
      const space = (this.advance() as { v: string }).v === '&&';
      const b = this.sum();
      a = space ? concatSpace(a, b) : concat(a, b);
    }
    return a;
  }

  private sum(): LValue {
    let a = this.product();
    while (this.isOp('+') || this.isOp('-')) {
      const plus = (this.advance() as { v: string }).v === '+';
      const b = this.product();
      a = plus ? add(a, b) : sub(a, b);
    }
    return a;
  }

  private product(): LValue {
    let a = this.unary();
    while (this.isOp('*') || this.isOp('/') || this.isWord('mod')) {
      const op = (this.advance() as { v: string }).v.toLowerCase();
      const b = this.unary();
      a = op === '*' ? mul(a, b) : op === '/' ? div(a, b) : mod(a, b);
    }
    return a;
  }

  private unary(): LValue {
    if (this.isOp('-')) {
      this.advance();
      return neg(this.unary());
    }
    if (this.isWord('not')) {
      this.advance();
      return truthy(this.unary()) ? 0 : 1;
    }
    return this.primary();
  }

  private primary(): LValue {
    const t = this.advance();
    switch (t.t) {
      case 'num':
        return t.v;
      case 'str':
        return t.v;
      case 'sym':
        return sym(t.v);
      case 'op':
        if (t.v === '(') {
          const v = this.expr();
          this.expect(')');
          return v;
        }
        if (t.v === '[') return this.list();
        throw new Fail();
      case 'id': {
        const name = t.v.toLowerCase();
        if (name === 'the') {
          const prop = this.advance();
          if (prop.t === 'id' && prop.v.toLowerCase() === 'maxinteger') return maxInteger;
          return undefined;
        }
        if (this.isOp('(')) {
          this.advance();
          const args: LValue[] = [];
          if (!this.isOp(')')) {
            args.push(this.expr());
            while (this.isOp(',')) {
              this.advance();
              args.push(this.expr());
            }
          }
          this.expect(')');
          return FUNCTIONS[name]?.(args);
        }
        if (name in CONSTANTS) return CONSTANTS[name]();
        // An unset variable.
        return undefined;
      }
      case 'end':
        throw new Fail();
    }
  }

  private list(): LValue {
    if (this.isOp(']')) {
      this.advance();
      return new LList();
    }
    if (this.isOp(':')) {
      this.advance();
      this.expect(']');
      return new LPropList();
    }
    const entries: [LValue | typeof NO_KEY, LValue][] = [];
    let keyed = false;
    for (;;) {
      let key: LValue | typeof NO_KEY = NO_KEY;
      let v: LValue;
      // A bare word before ":" is a symbol key, whatever the word.
      if (this.tok.t === 'id' && this.peekColon()) {
        key = sym(this.tok.v);
        this.advance();
        this.advance();
        v = this.expr();
      } else {
        v = this.expr();
        if (this.isOp(':')) {
          this.advance();
          key = v;
          v = this.expr();
        }
      }
      if (key !== NO_KEY) keyed = true;
      entries.push([key, v]);
      if (this.isOp(']')) {
        this.advance();
        break;
      }
      this.expect(',');
    }
    if (!keyed) return new LList(entries.map((e) => e[1]));
    return new LPropList(entries.map(([k, v], i) => [k === NO_KEY ? i + 1 : k, v]));
  }

  private peekColon(): boolean {
    const save = this.lex.pos;
    const next = this.lex.next();
    this.lex.pos = save;
    return next.t === 'op' && next.v === ':';
  }
}

const NO_KEY = Symbol('no key');

const truthy = (v: LValue): boolean => (isNum(v) ? num(v) !== 0 : v instanceof LSymbol || typeof v === 'object');

/** Lingo value(). Non-strings come back as they are; anything Director can't evaluate is VOID. */
export function value(v: LValue): LValue {
  if (typeof v !== 'string') return v;
  try {
    return new Parser(new Lexer(v)).expr();
  } catch (e) {
    if (e instanceof Fail) return undefined;
    // Script errors inside the expression (division by zero...) also give VOID.
    return undefined;
  }
}
