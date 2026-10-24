// Lingo semantics, asserted against what Adobe's Director 10.1 player answered
// (tools/reference/refeval.sh). Run: npx tsx port/web/src/lingo/test.ts
import {
  abs, add, atan, bitAnd, bitNot, bitOr, bitXor, charToNum, chars, chunkCount, concat, concatSpace, contains, cos,
  deleteChunk, div, float, floatp, getChunk, ilk, inflate, inside, integer, integerp, intersect, item, itemDelimiter,
  lf, LFloat, lingoCompare, lingoEquals, lingoString, list, listp, LList, LPropList, max, min, mod, mul, neg, num,
  numToChar, objectp, offset, offsetRect, point, power, propList, putAfter, putBefore, putInto, random, randomSeed,
  rect, rgb, setFloatPrecision, setItemDelimiter, setRandomSeed, sin, sqrt, starts, stringp, sub, sym, symbol,
  symbolp, union, value, vector, voidp, word, line, char, collate, paletteIndex, RETURN, TAB, QUOTE, lt, le, ge,
  type LValue,
} from './index';

// Symbols display their first spelling; Adobe's session had already seen these.
for (const name of ['abc', 'c']) sym(name);

let failures = 0, passes = 0;
function eq(actual: unknown, expected: unknown, label: string): void {
  const a = typeof actual === 'string' ? actual : JSON.stringify(actual);
  const e = typeof expected === 'string' ? expected : JSON.stringify(expected);
  if (a === e) passes++;
  else {
    failures++;
    console.log(`FAIL ${label}\n  expected ${JSON.stringify(e)}\n  actual   ${JSON.stringify(a)}`);
  }
}
/** string() of a value, as the REPL prints it. */
const S = (v: LValue) => lingoString(v);
/** value() then string(): round trip through Lingo text. */
const V = (text: string) => S(value(text));
const b = (x: boolean) => (x ? 1 : 0);
const throws = (f: () => unknown, label: string) => {
  try {
    f();
    eq('no error', 'error', label);
  } catch {
    passes++;
  }
};

// ---- string() ----
eq(S(lf(1)), '1.0000', 'string(1.0)');
eq(S(1), '1', 'string(1)');
eq(S(list(1, 2.5, 'a', sym('b'), undefined)), '[1, 2.5000, "a", #b, <Void>]', 'list');
eq(S(new LPropList()), '[:]', 'empty proplist');
eq(S(new LList()), '[]', 'empty list');
eq(S(propList(sym('a'), 1, 'b', 2, 3, 4)), '[#a: 1, "b": 2, 3: 4]', 'proplist keys');
eq(S(point(1, 2.5)), 'point(1, 2.5000)', 'point');
eq(S(rect(1, 2, 3, 4)), 'rect(1, 2, 3, 4)', 'rect');
eq(S(rgb(255, 0, 0)), 'rgb( 255, 0, 0 )', 'rgb');
eq(S(paletteIndex(3)), 'paletteIndex( 3 )', 'color(3)');
eq(S(vector(1, 2, 3)), 'vector( 1.0000, 2.0000, 3.0000 )', 'vector');
eq(S(undefined), '', 'string(VOID)');
eq(S(list(list(1), propList(sym('a'), new LList()))), '[[1], [#a: []]]', 'nested');
eq(S(sym('Foo')), 'Foo', 'string(#Foo)');
eq(S(list('a"b')), '["a"b"]', 'quotes are not escaped');
eq(S(list('')), '[""]', '[EMPTY]');
eq(S(propList(sym('a'), undefined)), '[#a: <Void>]', 'VOID value');
eq(S(propList(1.5, 2)), '[1.5000: 2]', 'float key');
const floats: [number, string][] = [
  [1 / 3, '0.3333'], [1e20, '1.00000000000000e20'], [123456789012.5, '123456789012.5000'], [-0, '-0.0000'],
  [0.00001, '0.0000'], [-1.5, '-1.5000'], [1.23456, '1.2346'], [1.99995, '1.9999'], [2.00005, '2.0000'],
  [0.00005, '0.0001'], [-0.00004, '-0.0000'], [99999999999.9, '99999999999.9000'],
  [999999999999.9, '9.99999999999900e11'], [9999999999999.9, '9.99999999999990e12'], [1e15, '1.00000000000000e15'],
  [123456789012345, '1.23456789012345e14'], [0.03125, '0.0313'], [0.00015, '0.0001'], [-0.03125, '-0.0313'],
  [1.00015, '1.0002'], [-1e15, '-1.00000000000000e15'], [1e100, '1.00000000000000e100'],
  [-99999999999.9, '-99999999999.9000'], [949999999999.99, '949999999999.9900'], [950000000000, '9.50000000000000e11'],
  [900719925474.0993, '900719925474.0992'], [1099511627775, '1.09951162777500e12'], [-549755813889, '-549755813889.0000'],
  [99999999999.99995, '100000000000.0000'], [1e-300, '0.0000'], [Infinity, 'INF'], [-Infinity, '-INF'], [NaN, 'NAN'],
];
for (const [x, s] of floats) eq(S(lf(x)), s, `string(${x})`);
setFloatPrecision(0);
eq(S(list(lf(1.5), lf(2.5), lf(-0.5), lf(3), lf(123.456), lf(1e15), lf(9999999999999999))), '[2, 3, -1, 3, 123, 1000000000000000, 1.00000000000000e16]', 'floatPrecision 0');
setFloatPrecision(8);
eq(S(list(lf(1.5), lf(1 / 3), lf(12345678.123))), '[1.50000000, 0.33333333, 12345678.12300000]', 'floatPrecision 8');
setFloatPrecision(-3);
eq(S(list(lf(1.5), lf(1 / 3), lf(2), lf(1.25))), '[1.5, 0.333, 2., 1.25]', 'floatPrecision -3');
setFloatPrecision(-2);
eq(S(list(lf(0.004), lf(10), lf(-0.001))), '[0., 10., -0.]', 'floatPrecision -2');
setFloatPrecision(1);
eq(S(list(lf(1.25), lf(1.35), lf(99999999999999.9), lf(990000000000000))), '[1.3, 1.4, 99999999999999.9, 9.90000000000000e14]', 'floatPrecision 1');
setFloatPrecision(2);
eq(S(list(lf(-0.004), lf(0.005), lf(0.015), lf(2.675))), '[-0.00, 0.01, 0.01, 2.67]', 'floatPrecision 2');
setFloatPrecision(4);

// ---- integers and floats ----
eq(ilk(lf(1)), sym('float'), 'ilk(1.0)');
eq(ilk(1), sym('integer'), 'ilk(1)');
eq(ilk(2.5), sym('float'), 'ilk(2.5)');
eq(S(add(2147483647, 1)), '-2147483648', 'maxinteger + 1 wraps');
eq(S(mul(2147483647, 2)), '-2', 'int multiply wraps');
eq(S(sub(-2147483647, 2)), '2147483647', 'int subtract wraps');
eq(S(div(7, 2)), '3', '7/2');
eq(S(div(-7, 2)), '-3', '-7/2');
eq(S(div(7, -2)), '-3', '7/-2');
eq(S(div(1, 3)), '0', '1/3');
eq(S(div(lf(4), lf(2))), '2.0000', '4.0/2.0');
eq(S(div(1, lf(3))), '0.3333', '1/3.0');
eq(S(add(1, 1.5)), '2.5000', '1 + 1.5');
eq(S(sub(3, lf(1))), '2.0000', '3 - 1.0');
eq(S(mul(2, 2.5)), '5.0000', '2 * 2.5');
eq(S(mul(1.5, 2)), '3.0000', '1.5 * 2');
eq(S(add(0.5, 0.5)), '1.0000', '0.5 + 0.5');
eq(S(list(mod(-7, 3), mod(7, -3), mod(-7, -3), mod(7.5, 2), mod(7.4, 2), mod(6.5, 4), mod(5.5, 2), mod(-7.5, 2), mod(7, 2.6))), '[-1, 1, -1, 0, 1, 3, 0, 0, 1]', 'mod');
eq(S(list(mod(2.5, 1), mod(-2.5, 1))), '[0, 0]', 'mod of floats');
throws(() => div(1, 0), '1/0');
throws(() => div(lf(1), 0), '1.0/0');
throws(() => mod(1, 0), '1 mod 0');
eq(S(add('3', 4)), '7.0000', '"3" + 4');
eq(S(add('3.5', 1)), '4.5000', '"3.5" + 1');
eq(S(mul('3', '2')), '6.0000', '"3" * "2"');
eq(S(add(undefined, 1)), '1', 'VOID + 1');
eq(ilk(add(undefined, 1)), sym('integer'), 'ilk(VOID + 1)');
eq(S(mul(undefined, 2)), '0', 'VOID * 2');
eq(S(add(point(1, 2), point(3, 4))), 'point(4, 6)', 'point + point');
eq(S(mul(point(1, 2), 2)), 'point(2, 4)', 'point * 2');
eq(S(add(point(1, 2), 1)), 'point(2, 3)', 'point + 1');
eq(S(add(rect(0, 0, 10, 10), 1)), 'rect(1, 1, 11, 11)', 'rect + 1');
eq(S(div(point(5, 7), 2)), 'point(2, 3)', 'point / 2');
eq(S(neg(point(1, 2))), 'point(-1, -2)', '-point');
eq(S(add(list(1, 2), 1)), '[2, 3]', 'list + 1');
eq(S(add(list(1, 2), list(10, 20))), '[11, 22]', 'list + list');
eq(S(add(list(1, 2, 3), list(1))), '[2]', 'list + shorter list');
eq(S(mul(list(1, 2), 2.5)), '[2.5000, 5.0000]', 'list * float');
eq(S(add(point(1.5, 2), 1)), 'point(2.5000, 3)', 'float point + 1');
eq(S(mul(point(1, 2), 1.5)), 'point(1.5000, 3.0000)', 'point * 1.5');
eq(S(mul(rect(0, 0, 10, 10), 2)), 'rect(0, 0, 20, 20)', 'rect * 2');
eq(S(div(rect(0, 0, 10, 10), 3)), 'rect(0, 0, 3, 3)', 'rect / 3');
eq(S(sub(point(10, 10), point(1.5, 0))), 'point(8.5000, 10)', 'point - point');
eq(S(add(vector(1, 2, 3), vector(1, 1, 1))), 'vector( 2.0000, 3.0000, 4.0000 )', 'vector + vector');
eq(num(lf(3)), 3, 'num unboxes');
eq(lf(2.5), 2.5, 'lf keeps fractions plain');
eq(lf(2) instanceof LFloat, true, 'lf boxes integral values');

// ---- conversions ----
eq(S(list(integer(2.5), integer(3.5), integer(-2.5), integer(-3.5), integer(2.4999), integer(-0.5), integer(0.5), integer(1.5))), '[3, 4, -3, -4, 2, -1, 1, 2]', 'integer rounds half away');
eq(S(list(integer('12'), integer(' 12 '), integer('-5'), integer('007'), integer(' -5'), integer('- 5'))), '[12, 12, -5, 7, -5, -5]', 'integer(string)');
eq(S(list(integer('12 34'), integer('12 abc'), integer('12,3'), integer('12-3'), integer('12+3'), integer(TAB + '12'))), '[12, 12, 12, 12, 12, 12]', 'integer(string) stops at a token');
eq(S(list(integer('--12'), integer(RETURN + '12'))), '[0, 0]', 'integer(string) of an empty statement');
for (const s of ['12abc', 'abc', '3.7', '+5', '0x10', '1e3', '', '12.', '1.0']) eq(ilk(integer(s)), sym('void'), `integer("${s}")`);
eq(ilk(integer(undefined)), sym('void'), 'integer(VOID)');
eq(ilk(integer(sym('a'))), sym('void'), 'integer(#a)');
eq(S(list(integer('2147483648'), integer('99999999999'), integer(lf(2147483648)), integer(lf(1e12)))), '[-2147483648, 1215752191, -2147483648, -727379968]', 'integer wraps');
eq(ilk(integer(lf(1))), sym('integer'), 'integer(1.0)');
eq(S(float(3)), '3.0000', 'float(3)');
eq(S(list(float('3'), float('  2.5'), float(TAB + '2.5'), float('.5'), float('5.'), float('-.5e-1'), float('+2'), float(' -2'), float('1e3'))), '[3.0000, 2.5000, 2.5000, 0.5000, 5.0000, -0.0500, 2.0000, -2.0000, 1000.0000]', 'float(string)');
for (const s of ['3.5abc', 'abc', ' 2.5 ', '2.5 x', '1,5', 'inf', '2.5e', '- 2', '']) eq(float(s), s, `float("${s}") is the string`);
eq(S(float('1e400')), 'INF', 'float overflow');
eq(float(sym('a')), sym('a'), 'float(#a)');
eq(ilk(float(undefined)), sym('void'), 'float(VOID)');
eq(S(list(symbol('Xyz'), symbol('hello world'), symbol('12'), symbol(sym('a')))), '[#Xyz, #hello, #12, #a]', 'symbol()');
eq(S(symbol('')), '', 'symbol("")');
eq(S(list(symbol(' abc'), symbol('\nfilelist'), symbol('abc '), symbol('\tx y'), symbol('a-b'), symbol('a.b'), symbol('1abc'), symbol('a\nb'), symbol('folder '), symbol('a,b'))),
  '[#abc, #filelist, #abc, #x, #a, #a, #1abc, #a, #folder, #a]', 'symbol() reads one token');
eq(S(symbol('\rq')), '', 'symbol(RETURN & "q")');
eq(sym('Foo') === sym('foo'), true, 'symbols are case-insensitive');
eq(sym('FOO').name, 'Foo', 'first spelling is kept');

// ---- types ----
eq(S(list(ilk(1), ilk(lf(1)), ilk('a'), ilk(sym('a')), ilk(new LList()), ilk(new LPropList()), ilk(point(1, 2)), ilk(rect(0, 0, 1, 1)), ilk(rgb(1, 2, 3)), ilk(undefined), ilk(vector(1, 2, 3)), ilk(paletteIndex(1)))),
  '[#integer, #float, #string, #symbol, #list, #propList, #point, #rect, #color, #void, #vector, #color]', 'ilk');
eq([ilk(new LList(), sym('list')), ilk(new LPropList(), sym('list')), ilk(new LPropList(), sym('propList')), ilk(point(1, 2), sym('list')), ilk(1, sym('number')), ilk(lf(1), sym('number')), ilk('a', sym('string')), ilk(1, sym('float')), ilk(lf(1), sym('integer'))].map(b), [1, 1, 1, 1, 1, 1, 1, 0, 0], 'ilk(v, #type)');
eq([voidp(undefined), voidp(0), stringp('a'), stringp(sym('a')), integerp(1), integerp(lf(1)), floatp(lf(1)), floatp(1), listp(new LList()), listp(new LPropList()), listp(point(1, 2)), listp(rect(0, 0, 1, 1)), symbolp(sym('a')), symbolp('a')].map(b),
  [1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0], 'predicates');
eq([objectp(new LList()), objectp(1), objectp(undefined), objectp('a'), objectp(sym('a')), objectp(point(1, 2)), objectp(rgb(1, 2, 3)), objectp(rect(0, 0, 1, 1)), objectp(new LPropList()), objectp(1.5)].map(b),
  [1, 0, 0, 0, 0, 1, 1, 1, 1, 0], 'objectp');

// ---- = and < ----
const E = (a: LValue, c: LValue) => b(lingoEquals(a, c));
const L = (a: LValue, c: LValue) => b(lt(a, c));
eq([E('a', 'A'), L('a', 'B'), L('B', 'a'), L('a', 'A'), L('A', 'a'), L('abc', 'abd'), L('ab', 'abc'), L('', 'a')], [1, 1, 0, 1, 0, 1, 1, 1], 'string = <');
eq([L('ab', 'Aa'), L('Ab', 'aa'), L('aB', 'Ab'), L('Ab', 'aB'), L('a', 'a'), b(le('a', 'A')), b(le('A', 'a')), b(ge('A', 'a'))], [0, 0, 1, 0, 0, 1, 0, 1], 'collation levels');
eq([L('_', 'a'), L('[', 'a'), L('Z', '_'), L('0', 'a'), L(' ', '!'), L('a', '~'), L('z', '~')], [1, 1, 0, 1, 1, 0, 0], 'punctuation before letters');
eq([E('1', 1), E(1, '1'), E('1.0', 1), E('1', lf(1)), E(' 1', 1), E('1 ', 1), E('abc', 0), E('', 0), E('x', 1)], [1, 1, 1, 1, 1, 0, 0, 0, 0], 'string = number');
eq([L('10', 9), L(9, '10'), L('10', '9'), b(lingoCompare('2', 1) > 0), b(lingoCompare('abc', 5) > 0), L('abc', 5)], [0, 1, 1, 1, 1, 0], 'string < number');
eq([E(sym('a'), 'a'), E('a', sym('a')), E(sym('a'), sym('A')), L(sym('a'), sym('b')), L(sym('b'), sym('a'))], [0, 0, 1, 1, 0], 'symbols');
eq([E(undefined, 0), E(undefined, ''), E(undefined, undefined), E(0, undefined), E(undefined, sym('void')), L(undefined, 1)], [1, 0, 1, 1, 0, 1], 'VOID');
eq([E(1, lf(1)), E(0.1 + 0.2, 0.3), L(1, 1.5), E(lf(1), 1 + 1e-13), E(lf(1), 1 + 1.1e-13), E(lf(0), 1e-13), E(100, 100 + 5e-14), L(lf(1), 1 + 1e-15), b(ge(lf(1), 1 + 1e-13))], [1, 1, 1, 1, 0, 0, 1, 1, 0], 'float tolerance');
eq([E(list(1), list(1)), E(list(1), list(lf(1))), E(list('a'), list('A')), E(list(sym('a')), list('a')), E(list(1, 2), list(1)), E(new LList(), new LList()), E(new LPropList(), new LList()), E(propList(sym('a'), 1), propList('a', 1)), E(propList(sym('a'), 1), propList(sym('b'), 1))],
  [1, 1, 0, 1, 0, 1, 0, 1, 1], 'list =');
eq([E(propList(sym('b'), 2, sym('a'), 1), propList(sym('a'), 1, sym('b'), 2)), E(point(1, 2), point(1, 2)), E(point(1, 2), point(lf(1), 2)), E(rect(0, 0, 1, 1), rect(0, 0, 1, 1)), E(rgb(1, 2, 3), rgb(1, 2, 3)), E(point(1, 2), list(1, 2)), E(list(1, 2), point(1, 2))], [0, 1, 1, 1, 1, 1, 1], 'value types =');
// Windows-1252 text: case fold for =, collation for <.
const c = (...bytes: number[]) => bytes.map(numToChar).join('');
eq([E(c(224), c(192)), b(contains(c(228), c(196))), L(c(233), 'f'), L('Z', c(224)), L(c(224), c(192)), L(c(192), c(224))], [1, 1, 1, 0, 1, 0], 'accents');
eq([E(c(241), c(209)), E(c(241), c(152)), E(c(242), c(156)), E(c(140), c(156)), E(c(159), c(255)), b(contains(c(241), c(152))), offset(c(209), 'x' + c(241)), offset(c(152), 'x' + c(241)), b(starts(c(241), c(152)))], [0, 1, 1, 1, 1, 1, 0, 2, 1], 'Director case fold');
eq([E('co-op', 'coop'), E('a' + c(1), 'a')], [0, 0], '= compares every character');
// Random pairs: a, b as Windows-1252 hex, then Adobe's [a < b, b < a, a = b, b contains a].
const PAIRS =
  '88272d.d1272d.1000 27656d.68656d.1000 6d.5e20.0100 41.e6d1.1000 537a45e109.dff22d.0100 ' +
  '99.0df1208c31.0100 41.09.0100 88455e.6873b988.1000 302088.016298315e.1000 96997e425f.96997e685f.1000 ' +
  '54007e0d42.99a073c1f2.1000 31306220bc.535fc6.1000 4242.e1.0100 99f2c1d1c9.99f2c17ac9.1000 ' +
  'f15f20a0.2de1.0100 65.73.1000 6241c62041.62f2c62041.1000 610df2.61530df2.1000 8c965368.53bc6de1.1000 ' +
  '7af199.7af16d99.0100 f16f88e9df.df7498.1000 8841882d5e.0196.0100 4274.4268.0100 0198f2.0198.0100 ' +
  '20bc.98.1000 306588e1b9.3088e1b9.0100 d1.e64553.0100 31.e66130.1000 e96573.e9986573.0100 ' +
  '62.98b96fa0e6.0100 5e5fe9.5fe9.1000 7e.b9.1000 c9c12088.42.0100 fe0931.45f253.0100 54b9d1f2.42.0100 ' +
  'c92d0d00.e1dfdf.0100 2727e698.27e698.0100 30680968de.e1c196.1000 96a088de.e661.1000 f1.30f1.0101 ' +
  'dfa0.a0.0100 61f14553.61f1bc4553.0100 5fe10d.68c698e1.1000 6500.209cc66d88.0100 09bc.bc6f617e.1000 ' +
  'dfbc27fe.dfbc27fe5f.1001 8845208854.20f2.0100 316f7e0d.316f530d.1000 fe423161.423161.0100 ' +
  'f1bc74.f1bc7462.1001 e9203131f1.010d308830.0100 685f7ee661.a06dded1.0100 6d5342.6d536f.1000 ' +
  'e9df5f54e9.62e6f16f09.0100 536f4527.536f456827.1000 53c900.c900.0100 df005f.df61.1000 ' +
  'e900c6.e90042c6.0000 30.275442.1000 7a53.99c6b931.0100 5e45.3145.1000 74999cd1e6.7e7a455f.0100 ' +
  '54.7a54.1001 c6.c6bc.1001 7a207a20f1.42.0100 98e1f20909.7e3161.0100 42.c9c1e17330.1000 ' +
  'c9de99.6dc1a0de61.1000 c127c909.c127c90909.1001 c9d1.df7ec6.1000 546d.c9f29c.0100 ' +
  'de6298c654.455e65.0100 bcbc546da0.bc546da0.1000 6dc1c9e9f2.fe.1000 e130096f62.d1c6428c41.1000 ' +
  '68e6209ce1.68e6209c09.0100 456dfe.4500fe.0100 883161f2.8861f2.1000 452d.e9f1.1000 6d01.6d5f.1000 ' +
  '6d9954.6d54.0100 de7a2d54.73733130.0100 010d0065.8cfe45c6.1000 0d426db954.0d426db95498.1001 ' +
  '8896.f28896.1001 5f017a98.fe997327c1.1000 62bc73e196.c92d.1000 bc.dfbc.1001 99b9.00.0100 f1.09.0100 ' +
  '0df1d1.0d5fd1.0100 2d.de20c1.1000 547e6dc9c9.de62.1000 2d0d5e.2d0d5e30.1001 de.d1.0100 ' +
  '31.de5ee6.1000 5e.20f1886dc9.0100 5373.7e73.0100 0196f1c9.df685362.1000 457ee1d100.65fec6.1000 ' +
  '3131.316f.1000 7a61a0.6861a0.0100 62314230c1.624230c1.1000 f288.e188.0100 5f41.68.1000 ' +
  '20f2.7e5ee6e1e9.1000 65987e426f.657e426f.0100 5401.54e601.1000 d1a0c1.01.0100 c1.65.1000 ' +
  '88fe.e9f2.1000 def253a0.99.1000 8c62882d.8c6288.0100 c1fefe7ea0.c1fefea0.0100 423030.3030.0100 ' +
  '6f6ddfb974.e6.0100 6d6d0d.6dbc6d0d.0100 627a4574.09.0100 e6968853.e9e6968853.1001 ' +
  '009c68df.009c6d68df.0000 f2.54e941.1000 5f.c95f.1001 6f5499c68c.8c99.0100 658898272d.20f120.0100 ' +
  '5ff1.c96d.1000 73099c45fe.739c45fe.1000 626f0d.74e100f230.1000 bc88f29600.9c8c.1000 ' +
  '0909e1.01a0627e27.0100 8896.d1316d.1000 de6f6853.b9de6f6853.0101 99.5399.0101 c6c6.6f.1000 ' +
  '547331f1.9c54.0100 45f1bc6841.a0.0100 096fbc8c54.f1e1682741.1000 09..0100 c9fe41f120.c941f120.0100 ' +
  '61.74.1000 c699.99.1000 426188.6f98.1000 7a..0100 7edf2de9d1.7edf2ddfd1.1000 6299f1.6fbc8cf1c9.1000 ' +
  'bc..0100 e141.e6de.1000 0074.4541f1c1de.1000 73420d53c1.73420da053c1.0100 0130.01.0100 ' +
  '20542df261.e1306dfe.1000 626dd1.416dd1.0100 300de6.5ec10145de.0100 c6276de1c6.9c7a.1000 ' +
  '9c747e74.888c6f.0100 30..0100 debc.655330.0100 c6f19c7e.c6f19c0d.0100 6d748cbc7a.6d748cbcc1.0100 ' +
  '998c65bc.9965bc.0100 e1f2454542.e1f24542.0100 00df30.c6f1735f.1000 549c.8c549c.0101 54..0100 ' +
  '6841e154.09f20d615f.0100 542d5e20.735f.0100 619630.42457ee6.1000 42f13154.a042f13154.0101 ' +
  '455e62.73455e62.1001 014545a030.27.0100 2d0161.20.0100 98.a098.0101 88.e6.1000 ' +
  '5e54e9f2.5e61e9f2.0100 09de.f1c100.1000 3142d1fe.3142d1.0100 09e66de1.2d09.0100 df20.df.0100 ' +
  '42095e.658c.1000 a061.e1412074.1000 8c0953de.65419988.0100 6f..0100 627e7e.627e.0100 ' +
  'c63073c6.c63073.0100 8c45bcde.4509e9.0100 459c.7aa0.1000 30c6.c6fe.1000 8c7ac6e641.8c7ac6e64541.1000 ' +
  '65420d.65410d.0100 31.962d.0100 738c685fde.738c68de.1000 e645.42995e.1000 ' +
  '42e6de09b9.42e6de9c09b9.1000 5f.6fdeb9.1000 418c687a96.01.0100 b962c1545f.7362c1545f.1000 ' +
  '5f9c.f242.1000 272d5f.5f61.1000 f22d2001.e10030dffe.0100 00f100e1.00f120e1.0000 ' +
  '620142c665.620142c6e6.0100 e6.6165.0000 c6.4145.0000 df.7373.0000 99.544d.0100 99.746d.0100 ' +
  'fe.7468.0000 2d61.612d.0100 612d62.61622d.0100 27.2d.1000 2d.27.0100 612d62.612762.0100 ' +
  '0161.6101.0100 6162.612d62.1000 e662.616561.0100 9c.6f65.0000 6196.6197.1000 2d2d.2d.0100 ad.01.1000 ' +
  '6120.61.0100 61a0.6120.0100 ';
const hex = (h: string) => (h.match(/../g) ?? []).map((x) => numToChar(parseInt(x, 16))).join('');
for (const p of PAIRS.trim().split(' ')) {
  const [ha, hb, flags] = p.split('.');
  const x = hex(ha), y = hex(hb), k = collate(x, y);
  eq(`${b(k < 0)}${b(k > 0)}${E(x, y)}${b(contains(y, x))}`, flags, `collate ${ha} ${hb}`);
}

// ---- & && contains starts offset ----
eq(concat(concat(concat(concat(concat(concat(concat('a', 1), 1.5), sym('b')), undefined), list(1, 'x')), point(1, 2)), rgb(1, 2, 3)), 'a11.5000b[1, "x"]point(1, 2)rgb( 1, 2, 3 )', '&');
eq([concatSpace('a', 'b'), concatSpace('', 'b'), concatSpace(1, 2)], ['a b', ' b', '1 2'], '&&');
eq(concat(1, 2), '12', '1 & 2');
eq([contains('abc', 'B'), contains('abc', ''), contains('abc', 'bd'), starts('abc', 'AB'), starts('abc', ''), starts('Hello', 'hello')].map(b), [1, 1, 0, 1, 1, 1], 'contains starts');
eq([offset('B', 'abc'), offset('x', 'abc'), offset('', 'abc'), offset('bc', 'abcbc')], [2, 0, 1, 2], 'offset');

// ---- lists ----
let l = list(1);
l.setAt(3, 'x');
eq(S(l), '[1, 0, "x"]', 'setAt pads with 0');
throws(() => list(1).getAt(2), 'getAt out of range');
throws(() => list(5, 6).deleteAt(5), 'deleteAt out of range');
l = list(3, 1, 2); l.sort(); eq(S(l), '[1, 2, 3]', 'sort numbers');
l = list('b', 'A', 'a', 'B', 'c'); l.sort(); eq(S(l), '["a", "A", "b", "B", "c"]', 'sort strings');
l = list(sym('b'), sym('a'), sym('C')); l.sort(); eq(S(l), '[#a, #b, #c]', 'sort symbols');
l = list('10', '9', 'a10', 'a9'); l.sort(); eq(S(l), '["10", "9", "a10", "a9"]', 'sort numeric strings');
l = list(); l.sort(); l.add(3); l.add(1); l.add(2); eq(S(l), '[1, 2, 3]', 'add to a sorted list');
l = list(); l.sort(); l.append(3); l.add(1); eq(S(l), '[3, 1]', 'append unsorts');
l = list(5); l.sort(); l.setAt(2, 1); l.add(3); eq(S(l), '[5, 1, 3]', 'setAt unsorts');
l = list(3, 1); l.sort(); l.deleteAt(1); l.add(0); eq(S(l), '[0, 3]', 'deleteAt keeps sorting');
{
  const pp = propList(sym('b'), 1); pp.sort(); pp.setAt(1, 5); pp.addProp(sym('a'), 2); eq(S(pp), '[#a: 2, #b: 5]', 'proplist setAt keeps sorting');
}
l = list(3, 1); l.sort(); l.addAt(1, 9); l.add(2); eq(S(l), '[9, 1, 3, 2]', 'addAt then add');
l = list(1, 2, 3); l.addAt(6, 9); eq(S(l), '[1, 2, 3, 0, 0, 9]', 'addAt pads with 0');
l = list(1, 2, 2, 3); l.deleteOne(2); eq(S(l), '[1, 2, 3]', 'deleteOne');
l = list('a', 'B'); eq([l.getPos('b'), l.getOne('A'), l.getPos(5), l.getPos('a')], [0, 0, 0, 1], 'getPos is case-sensitive');
l = list(1, lf(2), '2'); eq([l.getPos(2), l.getPos('2'), l.getPos(lf(1)), l.getPos('1')], [2, 3, 1, 1], 'getPos across types');
l = list(sym('a'), 'a'); eq([l.getPos('a'), l.getPos(sym('a')), l.getPos('A')], [1, 1, 0], 'getPos symbol and string');
l = list(list(1), list(1)); eq([l.getPos(list(1)), E(l.getAt(1), l.getAt(2))], [1, 1], 'getPos of a list');
l = list(1, 2); const m = l; m.add(3); const n = l.duplicate(); n.add(4);
eq(S(list(l, m, n)), '[[1, 2, 3], [1, 2, 3], [1, 2, 3, 4]]', 'lists are references; duplicate copies');
const shared = list(1); const w = list(shared, shared).duplicate(); (w.getAt(1) as LList).add(2);
eq(S(w), '[[1, 2], [1]]', 'duplicate copies shared items separately');
l = list(1, 2, 3); l.deleteAt(2); eq(S(list(l, l.getLast(), l.count)), '[[1, 3], 3, 2]', 'deleteAt getLast count');
eq(ilk(new LList().getLast()), sym('void'), 'getLast([])');
eq(S(list(max(list(3, 1.5, 7)), max(3, 9.5, 7), min(list(3, 1.5, 7)), max('a', 'B'), min(3, 1.5), min('b', 'A'), max(1, '2'), max(1.5, 1))), '[7, 9.5000, 1.5000, "B", 1.5000, "A", "2", 1.5000]', 'max min');
eq(S(list(max(2, lf(2)), ilk(max(2, lf(2))), ilk(max(lf(2), 2)))), '[2.0000, #float, #integer]', 'max ties go to the later value');
eq(max(propList(sym('a'), 3, sym('b'), 7)), 7, 'max of a proplist');
eq([...list(1, 2)], [1, 2], 'iteration');

// ---- property lists ----
let p = propList(sym('b'), 1, sym('a'), 2); p.sort(); p.setaProp(sym('c'), 3); p.addProp(sym('aa'), 4);
eq(S(p), '[#a: 2, #aa: 4, #b: 1, #c: 3]', 'sorted proplist inserts in order');
p = propList(sym('a'), 1); p.setaProp(sym('A'), 2); eq(S(p), '[#a: 2]', 'setaProp symbol case');
p = propList(sym('a'), 1, sym('a'), 2); p.setaProp(sym('a'), 3); eq(S(list(p, p.getaProp(sym('a')), p.getProp(sym('a')))), '[[#a: 3, #a: 2], 3, 3]', 'duplicate keys');
p = propList('a', 1); eq(S(list(p.getaProp('a'), p.getaProp('A'), p.getaProp(sym('a')))), '[1, <Void>, 1]', 'string keys are case-sensitive; symbols find them');
p = propList(sym('a'), 1); eq(S(list(p.getaProp('a'), p.getaProp(sym('A')))), '[1, 1]', 'strings find symbol keys');
p = propList(1, 'x', lf(2), 'y'); eq(S(list(p.getaProp(1), p.getaProp(2), p.getaProp(lf(1)), p.getaProp('1'))), '["x", "y", "x", "x"]', 'number keys');
eq(ilk(propList(sym('a'), 1).getaProp(sym('zz'))), sym('void'), 'missing getaProp');
throws(() => propList(sym('a'), 1).getProp(sym('zz')), 'missing getProp');
throws(() => propList(sym('a'), 1).setProp(sym('zz'), 1), 'missing setProp');
p = propList(sym('a'), 1, sym('b'), 2); p.deleteProp(sym('a')); p.deleteProp(sym('zz')); eq(S(p), '[#b: 2]', 'deleteProp');
p = propList(sym('a'), 1, sym('b'), 2);
eq(S(list(p.getPropAt(2), p.getAt(2), p.getAt(1), p.findPos(sym('b')), ilk(p.findPos(sym('zz'))), p.getPos(2), p.getOne(2), p.count, p.getOne(9))), '[#b, 2, 1, 2, #void, 2, #b, 2, 0]', 'proplist positions');
p.setAt(1, 9); eq(S(p), '[#a: 9, #b: 2]', 'proplist setAt');
p = propList('x', 1); p.setaProp('X', 2); eq(S(p), '["x": 1, "X": 2]', 'setaProp string case');
p = propList(sym('x'), 1); p.setaProp('x', 2); eq(S(p), '["x": 2]', 'setaProp replaces the key');
p = propList('b', 1, 'A', 2, sym('c'), 3, 1, 4); p.sort(); eq(S(p), '[1: 4, "A": 2, "b": 1, #c: 3]', 'sort by key');
p = propList(sym('b'), 1); p.sort(); p.addProp(sym('a'), 2); p.setaProp(sym('c'), 0); eq(S(p), '[#a: 2, #b: 1, #c: 0]', 'sorted addProp setaProp');
p = propList(sym('a'), list(1)); const q = p.duplicate(); (q.getaProp(sym('a')) as LList).add(2); eq(S(list(p, q)), '[[#a: [1]], [#a: [1, 2]]]', 'proplist duplicate');
p = propList(sym('a'), 1); p.deleteAt(1); eq(S(p), '[:]', 'proplist deleteAt');
p = propList(sym('a'), 1, sym('b'), 2); p.deleteOne(2); eq(S(p), '[#a: 1]', 'proplist deleteOne');
p = propList(sym('a'), 1); p.prop('d', 4); eq(S(list(p.prop('a'), p.prop('d'))), '[1, 4]', 'prop sugar');

// ---- geometry, colour ----
eq(S(list(rect(0, 0, 10, 10).width, rect(1, 2, 5, 9).height, rect(10, 10, 0, 0).width, rect(1.5, 0, 4, 2).width)), '[10, 7, -10, 2]', 'width height');
eq(S(list(offsetRect(rect(0, 0, 10, 10), 2, 3), inflate(rect(0, 0, 10, 10), 2, 3), intersect(rect(0, 0, 10, 10), rect(5, 5, 20, 20)), union(rect(0, 0, 10, 10), rect(5, 5, 20, 20)), intersect(rect(0, 0, 1, 1), rect(5, 5, 6, 6)))),
  '[rect(2, 3, 12, 13), rect(-2, -3, 12, 13), rect(5, 5, 10, 10), rect(0, 0, 20, 20), rect(0, 0, 0, 0)]', 'rect functions');
eq(S(list(union(rect(0, 0, 0, 0), rect(5, 5, 6, 6)), intersect(rect(0, 0, 10, 10), rect(10, 0, 20, 10)), inflate(rect(0, 0, 10, 10), -6, 0))), '[rect(5, 5, 6, 6), rect(0, 0, 0, 0), rect(6, 0, 4, 10)]', 'rect edges');
eq([inside(point(5, 5), rect(0, 0, 10, 10)), inside(point(10, 5), rect(0, 0, 10, 10)), inside(point(0, 0), rect(0, 0, 10, 10))].map(b), [1, 0, 1], 'inside');
eq(S(list(rgb(1, 2, 3).green, rgb(1, 2, 3).hexString(), rgb('#0A0B0C'), rgb(300, -5, 1.7))), '[2, "#010203", rgb( 10, 11, 12 ), rgb( 255, 0, 2 )]', 'rgb');
const pt = point(1, 2); const pt2 = pt; pt2.locH = 9; eq(S(pt), 'point(9, 2)', 'points are references');

// ---- maths ----
eq(S(list(abs(-3), abs(-3.5), abs(3), ilk(abs(lf(-3))), abs('-3'), abs(undefined))), '[3, 3.5000, 3, #float, 0, 0]', 'abs');
eq(S(list(sqrt(4), ilk(sqrt(4)), sqrt(2), sqrt(lf(4)), sqrt(10), sqrt(15), sqrt(0), sqrt(-4), sqrt(2.25), sqrt('16'), sqrt(2147483647))), '[2, #integer, 1, 2.0000, 3, 4, 0, NAN, 1.5000, 4.0000, 46341]', 'sqrt');
eq(S(list(power(2, 3), ilk(power(2, 3)), power(2, 0.5), power(2, 31), power(0, 0), power(-8, 0.333))), '[8.0000, #float, 1.4142, 2147483648.0000, 1.0000, NAN]', 'power');
eq(S(list(atan(1), sin(0), cos(0), sin(1), cos(Math.PI), atan(1, 1))), '[0.7854, 0.0000, 1.0000, 0.8415, -1.0000, 0.7854]', 'trig');
eq([bitAnd(12, 10), bitOr(12, 10), bitXor(12, 10), bitNot(0), bitAnd(-1, 255), bitAnd(12.7, 10), bitNot(5.5), bitNot(5.7), bitNot(-5.5), bitAnd(13.6, 1), bitOr(2.5, 0), bitXor(-1, 0)], [8, 14, 6, -1, 255, 8, -6, -6, 4, 1, 2, -1], 'bit operations');
throws(() => bitOr('12', 1), 'bitOr of a string');
eq([numToChar(65), numToChar(151), numToChar(321), charToNum('A'), charToNum(numToChar(151)), charToNum(numToChar(128)), charToNum(numToChar(200)), charToNum(''), charToNum('ab'), numToChar(0).length, numToChar(256).length], ['A', '—', 'A', 65, 151, 128, 200, 0, 97, 1, 1], 'numToChar charToNum');
eq([charToNum(RETURN), charToNum(TAB), charToNum(QUOTE)], [13, 9, 34], 'constants');

// ---- random ----
setRandomSeed(14204);
eq([random(256), random(256), random(256), random(256), random(256), randomSeed()], [212, 215, 208, 159, 203, -633339461], 'randomSeed 14204');
setRandomSeed(1);
eq([random(100), randomSeed(), random(1000000), randomSeed(), random(7), randomSeed()], [55, -1560281088, 100181, 1367343104, 3, 683671552], 'randomSeed 1');
setRandomSeed(0);
eq([randomSeed(), random(100), randomSeed()], [1, 55, -1560281088], 'randomSeed 0 is 1');
for (const [range, seq] of [[2147483647, [1747680955, 1530100181, 1248357890, 1457203834, 794320639, 1824901135]], [65536, [32443, 31189, 28162, 10874, 24319, 51215]], [1000, [955, 181, 890, 834, 639, 135]], [3, [1, 2, 2, 1, 1, 1]]] as const) {
  setRandomSeed(1);
  eq(seq.map(() => random(range)), seq, `random(${range})`);
}
setRandomSeed(1);
eq([random(5, 10), random(5, 10), random(5, 10), random(5, 10)], [5, 9, 6, 8], 'random(lo, hi)');
for (const [s, x] of [[2, 1161103242], [4, 411927267], [12345, 1342973807], [-1, 926958676], [2147483647, 1049559902]]) {
  setRandomSeed(s);
  eq(random(2147483647), x, `seed ${s}`);
}

// ---- value() ----
const values: [string, string][] = [
  ['12', '12'], ['-12', '-12'], ['- 12', '-12'], ['1.5', '1.5000'], ['.5', '0.5000'], ['1e3', '1000.0000'],
  ['#abc', 'abc'], ['[1, 2, 3]', '[1, 2, 3]'], ['[#err: 0, #sid: "x y"]', '[#err: 0, #sid: "x y"]'],
  ['["b": 2, 3: 4, #c: [1, [#d: 5]]]', '["b": 2, 3: 4, #c: [1, [#d: 5]]]'], ['[]', '[]'], ['[:]', '[:]'], ['[ : ]', '[:]'],
  ['  [1,2]  ', '[1, 2]'], ['[1,2] junk', '[1, 2]'], ['point(1, 2)', 'point(1, 2)'], ['rect(1, 2, 3, 4)', 'rect(1, 2, 3, 4)'],
  ['rgb(1, 2, 3)', 'rgb( 1, 2, 3 )'], ['rgb( 255, 0, 0 )', 'rgb( 255, 0, 0 )'], ['color(1,2,3)', 'rgb( 1, 2, 3 )'],
  ['vector(1, 2, 3)', 'vector( 1.0000, 2.0000, 3.0000 )'], ['TRUE', '1'], ['FALSE', '0'], ['1 + 2', '3'], ['2 * 3 + 1', '7'],
  ['7 / 2', '3'], ['"abc"', 'abc'], ['12 abc', '12'], ['[abc]', '[<Void>]'], ['[#a: abc]', '[#a: <Void>]'], ['[a: 1]', '[#a: 1]'],
  ['[1: 2, 3]', '[1: 2, 2: 3]'], ['PI', '3.1416'], ['the maxinteger', '2147483647'], ['1\r2', '1'], ['12 -- comment', '12'],
  ['#1', '1'], ['#a b', 'a'], ['007', '7'], ['1.', '1.0000'], ['2147483648', '2147483648.0000'], ['-2147483648', '-2147483648.0000'],
  ['99999999999', '99999999999.0000'], ['1e400', 'INF'], ['[1.0, 2.50]', '[1.0000, 2.5000]'],
  ['[point(1.5, 2), rect(0,0,1,1)]', '[point(1.5000, 2), rect(0, 0, 1, 1)]'], ['[-1, - 2]', '[-1, -2]'], ['(5)', '5'],
  ['[(1), (2+3)]', '[1, 5]'], ['[#a:1,#b:2]', '[#a: 1, #b: 2]'], ['[""]', '[""]'], ['["a,b"]', '["a,b"]'], ['NOT 1', '0'],
  ['1 = 1', '1'], ['1 and 0', '0'], ['sqrt(4)', '2'], ['abs(-3)', '3'], ['float(3)', '3.0000'], ['[VOID]', '[<Void>]'],
  ['[void]', '[<Void>]'], ['true', '1'], ['#void', 'void'], ['[#a: TRUE]', '[#a: 1]'], ['[1.0000]', '[1.0000]'],
  ['#a\nb', 'a'], ['-0.0', '-0.0000'], ['[#a: -1.5, #b: -3, #c: "-"]', '[#a: -1.5000, #b: -3, #c: "-"]'], ['point(-1, 2.5)', 'point(-1, 2.5000)'],
  ['[1, [2, [3]]]', '[1, [2, [3]]]'], ['[1 , 2 ]', '[1, 2]'], ['[#a : 1]', '[#a: 1]'], ['[ # a: 1]', '[#a: 1]'],
  ['rgb("#FF0000")', 'rgb( 255, 0, 0 )'], ['3 4', '3'], ['[1,2]]', '[1, 2]'], ['PI * 2', '6.2832'], ['2 - - 3', '5'],
  ['2 -- 3', '2'], ['[2 - 3, 2-3]', '[-1, -1]'], ['"x": 1', 'x'],
];
for (const [text, out] of values) eq(V(text), out, `value(${JSON.stringify(text)})`);
for (const text of ['abc', '[1,2', 'VOID', '"abc', '', '12abc', 'abc def', '[1 2]', '[1,,2]', '[#a 1]', '[,]', '[1,]', '--x', '#', '0x10', '1.5.5', '1.5e', 'e5', '-', '[-]', '[[1,2]', ' ', '[1,\r2]'])
  eq(ilk(value(text)), sym('void'), `value(${JSON.stringify(text)}) is VOID`);
eq(ilk(value('EMPTY')), sym('string'), 'value("EMPTY")');
eq(ilk(value('#1')), sym('integer'), 'value("#1")');
eq(ilk(value('[1,2] junk')), sym('list'), 'value with junk after');
eq(value(1), 1, 'value(1)');
eq(value(undefined), undefined, 'value(VOID)');
// The checksum path: server text -> value() -> string() must give the text back.
const robot = '[#name: "Crusher", #pansar: 50, #speed: 1.0000, #parts: [#r1, #h2], #pos: point(3, 4.5000), #map: "", #x: -0.0000]';
eq(V(robot), robot, 'robot round trip');

// ---- chunks ----
let s = 'a,b,,c,';
eq(S(list(chunkCount(s, 'item'), item(s, 3), item(s, 5), item(s, 9), item(s, 2, 3), item(s, 4, 9), itemDelimiter())), '[5, "", "", "", "b,", "c,", ","]', 'items');
eq([chunkCount('', 'item'), chunkCount('', 'word'), chunkCount('', 'line'), chunkCount('', 'char')], [1, 0, 1, 0], 'counts of ""');
s = '  hello   big\tworld\rx  ';
eq(S(list(chunkCount(s, 'word'), word(s, 1), word(s, 2), word(s, 3), word(s, 4), word(s, 2, 3), word(s, 9))), '[4, "hello", "big", "world", "x", "big\tworld", ""]', 'words');
s = 'a\nb\n';
eq([chunkCount(s, 'line'), line(s, 1), line(s, 2), chunkCount(s, 'word')], [1, 'a\nb\n', '', 2], 'LF is not a line break');
s = 'a\r\nb\r';
eq([chunkCount(s, 'line'), line(s, 1), line(s, 2), line(s, 3)], [3, 'a', '\nb', ''], 'CRLF');
s = 'a\rb\r';
eq([chunkCount(s, 'line'), line(s, 2), line(s, 3), line(s, 2, 5)], [3, 'b', '', 'b\r'], 'trailing RETURN');
eq([chunkCount('\r', 'line'), chunkCount('\r', 'word'), chunkCount('\r', 'item')], [2, 0, 1], 'RETURN alone');
s = 'abcdef';
eq([char(s, 2), char(s, 2, 4), char(s, 5, 10), char(s, 0), char(s, 9), char(s, 4, 2), char(s, 0, 2), char(s, -1, 2)], ['b', 'bcd', 'ef', 'abcdef', '', '', 'abcdef', 'abcdef'], 'chars');
eq([word('a b c', 0), item('a b c', 0), line('a b c', 0)], ['a b c', 'a b c', 'a b c'], 'chunk 0 is everything');
eq([word('a b c', 2, 1), item('a,b,c', 2, 1), line('x\ry\rz', 2, 1), word('a b c', 0, 2), word('a b', 2, 5), word('a b', 3, 5)], ['b', 'b', 'y', 'a b c', 'b', ''], 'reversed and long ranges');
eq([item('a,b,c,d', 2, 2), item('a,b,c,d', 3, 1), item('a,b,c,d', 0, 2), item('a,b,c', 2, 9), item('a,b,c', 5, 9), char('a,b,c', 2, 2)], ['b', 'c', 'a,b,c,d', 'b,c', '', ','], 'item ranges');
eq([getChunk('one two', ['word', 2], ['char', 1]), getChunk('one two', ['item', 1], ['word', 2]), word('w1,w2 x', 1), item('w1,w2 x', 2)], ['t', 'two', 'w1,w2', 'w2 x'], 'nested');
eq([chunkCount('a\xa0b', 'word'), chunkCount('a\x0bb\x0cc\0d', 'word')], [1, 4], 'word separators');
eq([chars('a,b', 2, 3), chars('a,b', 0, 9), chars('a,b', 3, 1)], [',b', 'a,b', ''], 'chars()');
setItemDelimiter(';'); eq([chunkCount('a;b', 'item'), item('a;b', 2), itemDelimiter()], [2, 'b', ';'], 'itemDelimiter');
setItemDelimiter('ab'); eq([itemDelimiter(), chunkCount('xaybz', 'item')], ['a', 2], 'itemDelimiter takes one character');
setItemDelimiter(TAB); eq([chunkCount('a\tb', 'item'), item('a\tb', 2)], [2, 'b'], 'TAB items');
setItemDelimiter(',');
const puts: [string, string][] = [
  [putInto('a,b,c', 'X', ['item', 2]), 'a,X,c'], [putInto('a,b,c', 'X', ['item', 5]), 'a,b,c,,X'],
  [putAfter('a,b,c', 'X', ['item', 2]), 'a,bX,c'], [putBefore('a,b,c', 'X', ['item', 2]), 'a,Xb,c'],
  [putAfter('a,b,c', 'X', ['item', 5]), 'a,b,c,,X'], [putInto('a', 'X', ['line', 3]), 'a\r\rX'],
  [putInto('a b  c', 'X', ['word', 2]), 'a X  c'], [putInto('a b  c', 'X', ['word', 5]), 'a b  cX'],
  [putInto('abc', 'X', ['char', 5]), 'abc X'], [putInto('abc', 'X', ['char', 2, 3]), 'aX'], [putAfter('abc', 'X', ['char', 9]), 'abc     X'],
  [putInto('a,b,c,d', 'X', ['item', 2, 3]), 'a,X,d'], [putInto('hello', 'X', ['char', 2]), 'hXllo'],
  [putAfter('l1\rl2', 'X', ['line', 1]), 'l1X\rl2'], [putBefore('a,b', 'X', ['item', 1]), 'Xa,b'], [putInto('a,b', 'X', ['item', 0]), 'X'],
  [putBefore('a,b', 'X', ['item', 4]), 'a,b,,X'], [putInto('a b', 'X', ['word', 0]), 'X'], [putBefore('a  b', 'X', ['word', 2]), 'a  Xb'],
  [putAfter('a  b', 'X', ['word', 1]), 'aX  b'], [putBefore('ab', 'X', ['char', 0]), 'Xab'], [putAfter('ab', 'X', ['char', 0]), 'abX'],
  [putBefore('ab', 'X', ['char', 5]), 'ab  X'], [putBefore('a b', 'X', ['word', 4]), 'a bX'], [putInto('a b ', 'X', ['word', 3]), 'a b X'],
  [putInto('', 'X', ['item', 3]), ',,X'], [putInto('', 'X', ['word', 2]), 'X'], [putInto('a,b c,d', 'X', ['item', 2], ['word', 2]), 'a,b X,d'],
  [putInto('a,b', 'X', ['item', 4], ['word', 3]), 'a,b,,X'], [putInto('abc', 'X', ['char', 2, 1]), 'aXbc'], [putInto('a,b,c', 'X', ['item', 3, 2]), 'a,b,X'],
  [putInto('a,b', 5, ['item', 1]), '5,b'],
];
puts.forEach(([actual, expected], i) => eq(actual, expected, `put #${i + 1}`));
const deletes: [string, string][] = [
  [deleteChunk('a,b,c', ['item', 2]), 'a,c'], [deleteChunk('a,b,c', ['item', 3]), 'a,b'], [deleteChunk('a,b,c', ['item', 1]), 'b,c'],
  [deleteChunk('a,b,c', ['item', 7]), 'a,b,c'], [deleteChunk('a b  c d', ['word', 2]), 'a c d'], [deleteChunk('a b  c d', ['word', 4]), 'a b  c '],
  [deleteChunk('a b  c d', ['word', 1]), 'b  c d'], [deleteChunk('l1\rl2\rl3', ['line', 2]), 'l1\rl3'], [deleteChunk('l1\rl2\rl3', ['line', 3]), 'l1\rl2'],
  [deleteChunk('abcdef', ['char', 2, 4]), 'aef'], [deleteChunk('a,b,c,d', ['item', 2, 3]), 'a,d'], [deleteChunk('a', ['item', 1]), ''],
  [deleteChunk(' a b', ['word', 1]), ' b'], [deleteChunk(' a b ', ['word', 2]), ' a '], [deleteChunk('a,b,', ['item', 3]), 'a,b'],
  [deleteChunk('a,b,', ['item', 2]), 'a,'], [deleteChunk('a,b,c,d', ['item', 3, 9]), 'a,b'], [deleteChunk('a,b,c,d', ['item', 0]), ''],
  [deleteChunk('a b c', ['word', 2, 3]), 'a '], [deleteChunk('abc', ['char', 5]), 'abc'], [deleteChunk('abc', ['char', 0]), ''],
  [deleteChunk('a,b c,d', ['item', 2], ['word', 1]), 'a,c,d'],
];
deletes.forEach(([actual, expected], i) => eq(actual, expected, `delete #${i + 1}`));

console.log(`${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
