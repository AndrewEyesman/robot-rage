// Text layout (text-layout.ts, members.ts) as Director 10.1 lays it out. The box
// heights are Adobe's player's own answers for port/tools/text-compare.mjs's cases
// (its summary.json, 2026-10-24); the character positions pinned here are the port's,
// which matched Adobe's charPosToLoc for every character of those cases (layout exact).

import type { TextDoc } from '../docs';
import { CastLib, FieldMember, TextMember } from '../members';
import { describe, eq, fieldDoc, ok, test, textDoc, type RunSpec } from './harness';

const cast = new CastLib(9, 'text-tests', '/assets', null);
let n = 0;

const para = 'Due to extreme amounts of robots, the database will be cleaned on a regular basis and inactive robots will be deleted.';

function textMember(runs: RunSpec[], width: number, o: Partial<TextDoc> = {}) {
  return new TextMember(cast, ++n, '', textDoc(runs, { size: [width, 0], ...o }));
}

function withTabs(txt: string, width: number, tabs: [number, number][]) {
  return textMember([{ text: txt }], width, {
    paragraphs: [{ lineSpacing: 0, topSpacing: 0, bottomSpacing: 0, leftIndent: 0, firstIndent: 0, justification: 0, tabs }],
    paragraphRuns: [[0, 0]],
  });
}

/** A field as text-compare.mjs makes it: no border or margin, adjust-to-fit. */
function fieldMember(txt: string, width: number, font = 'Verdana', size = 10, style = 0) {
  return new FieldMember(cast, ++n, '', fieldDoc(txt, { font, size, style, boxType: 0, rect: [0, 0, width, 200] }), 'field', {});
}

const height = (m: TextMember | FieldMember) => m.rect.bottom - m.rect.top;
const pos = (m: TextMember | FieldMember, i: number) => {
  const p = m.charPosToLoc(i);
  return [Number(p.locH), Number(p.locV)];
};
const lineStarts = (m: TextMember | FieldMember) => m.lines().map((l) => m.text.slice(l.start, l.end));

describe('text layout', () => {
  test('box heights match Adobe for the text-compare cases', 'Adobe measurement (port/tools/text-compare.mjs, reference box sizes)', () => {
    const V = (size: number, bold = false) => ({ font: 'Verdana', size, bold });
    const cases: [string, TextMember | FieldMember, number][] = [
      ['verdana10', textMember([{ text: para, ...V(10) }], 205), 48],
      ['verdana10-bold', textMember([{ text: 'A robot is inactive if not used in the last 21 days.', ...V(10, true) }], 205), 24],
      ['verdana9', textMember([{ text: 'Choose a robot: CRUSHER 0123456789 Won/Lost/Ties', ...V(9) }], 300), 12],
      ['arial12', textMember([{ text: 'Forgot your password? The quick brown fox jumps over the lazy dog.', font: 'Arial', size: 12 }], 260), 30],
      ['tabs-default', textMember([{ text: 'a\tb\tc\rabcdefghijklmnop\tx\rCHAT\tON' }], 300), 36],
      ['fixed15', textMember([{ text: 'Weapons\rArmour\rBatteries' }], 150, { fixedLineSpace: 15 }), 45],
      ['center', textMember([{ text: 'Choose a robot:\rUSE ROBOT\rab', ...V(10, true) }], 151, { alignment: 'center' }), 36],
      ['right', textMember([{ text: 'Won 12\rLost 3\rTies 100', font: 'Arial', size: 12 }], 121, { alignment: 'right' }), 45],
      ['aa-verdana16', textMember([{ text: 'Robot Garage AVATAR Wave To', ...V(16) }], 400), 18],
      ['aa-arial20-bold', textMember([{ text: 'LOG IN Today', font: 'Arial', size: 20, bold: true }], 400), 25],
      ['field-verdana10', fieldMember('Hello world, this field wraps onto a second line.\rCHAT\tON', 180), 39],
      ['field-arial12', fieldMember('player@example.com\rpassword', 183, 'Arial', 12), 32],
      ['field-verdana10-bold', fieldMember('Connecting to server...', 183, 'Verdana', 10, 1), 13],
    ];
    const wrong = cases.filter(([, m, h]) => height(m) !== h).map(([name, m, h]) => `${name}: ${height(m)} (Adobe ${h})`);
    eq(wrong, [], 'cases whose height differs');
  });

  test('lines wrap at spaces; the spaces stay on the line above', 'Adobe measurement (text-layout.ts; text-compare verdana10)', () => {
    const m = textMember([{ text: para }], 205);
    const lines = lineStarts(m);
    eq(lines.length, 4, 'four lines');
    ok(lines.slice(0, -1).every((l) => l.endsWith(' ')), `each wrapped line keeps its trailing space (${JSON.stringify(lines)})`);
    ok(m.lines().every((l) => l.width <= 205 || m.text.slice(l.start, l.end).trimEnd() !== m.text.slice(l.start, l.end)), 'trailing spaces may overhang, ink fits');
  });

  test('a word longer than the line breaks mid-word', 'Adobe measurement (text-layout.ts)', () => {
    const m = textMember([{ text: 'abcdefghijklmnopqrstuvwxyzabcdefghij' }], 60);
    ok(m.lines().length > 1, 'broken');
    ok(m.lines().every((l) => l.width <= 60), 'every piece fits');
    eq(lineStarts(m).join(''), m.text, 'no characters lost');
  });

  test('a line is as tall as its tallest style, counting the RETURN that ends it', 'Adobe measurement (text-layout.ts: a 12 px RETURN after 10 px text makes the line 2 px taller; text-compare mixed-cr is 42 px)', () => {
    const plain10 = textMember([{ text: 'one two three' }], 300).lines()[0].height;
    const plain12 = textMember([{ text: 'one two three', size: 12 }], 300).lines()[0].height;
    const mixed = textMember(
      [
        { text: 'one two three' },
        { text: '\r', size: 12 },
        { text: 'four five\r', font: 'Arial', size: 10, bold: true },
        { text: 's', font: 'Arial', size: 14 },
        { text: 'ix', italic: true },
      ],
      300,
    );
    eq([plain10, plain12], [12, 14], 'Verdana 10 and 12 line heights');
    eq(mixed.lines()[0].height, plain12, "line 1 takes its 12 px RETURN's height");
    eq(height(mixed), 42, 'whole box (Adobe: 42)');
  });

  test('an empty line is as tall as its RETURN', 'Adobe measurement (text-layout.ts)', () => {
    const m = textMember([{ text: 'a\r' }, { text: '\r', size: 12 }, { text: 'b' }], 300);
    eq(m.lines().map((l) => l.height), [12, 14, 12]);
  });

  test('fields add 1 px below every line', 'Adobe measurement (text-layout.ts; text-compare field cases)', () => {
    const t = textMember([{ text: 'Connecting' }], 183).lines()[0].height;
    const f = fieldMember('Connecting', 183).lines()[0].height;
    eq(f, t + 1);
  });

  test('a fixed line space puts the extra space above the text', 'Adobe measurement (text-layout.ts; text-compare fixed15)', () => {
    const m = textMember([{ text: 'Weapons\rArmour' }], 150, { fixedLineSpace: 15 });
    const plain = textMember([{ text: 'Weapons' }], 150).lines()[0];
    eq(m.lines().map((l) => [l.top, l.height]), [[0, 15], [15, 15]]);
    eq(m.lines()[0].ascent, plain.ascent + 3, 'baseline 3 px lower');
  });

  test("paragraph space before and after go around the paragraph's lines", 'Adobe measurement (docs/port-issues.md "Fixed along the way": paragraph spacing, dirplayer\'s parser read the wrong fields)', () => {
    const P = (top: number, bottom: number) => ({ lineSpacing: 0, topSpacing: top, bottomSpacing: bottom, leftIndent: 0, firstIndent: 0, justification: 0, tabs: [] });
    const m = textMember([{ text: 'first\rsecond' }], 200, { paragraphs: [P(0, 6), P(4, 0)], paragraphRuns: [[0, 0], [6, 1]] });
    eq(m.lines().map((l) => l.top), [0, 22], 'second paragraph at 12 + 6 after + 4 before');
    eq(height(m), 34);
    eq(pos(m, 1)[1], 17, "charPosToLoc v: the line's bottom with its space after, less one");
  });

  test('tabs in text members: every 24 px by default', 'Adobe measurement (text-layout.ts; text-compare tabs-default)', () => {
    const m = textMember([{ text: 'a\tb\tc' }], 300);
    eq([pos(m, 3)[0], pos(m, 5)[0]], [24, 48], 'b at 24, c at 48');
  });

  test('tabs in text members: right and center stops', 'Adobe measurement (text-layout.ts; text-compare tabs-right, tabs-center-left)', () => {
    const r = withTabs('Room\t12\rLobby two\t3', 200, [[160, 3]]);
    const lines = r.lines();
    for (const l of lines) {
      const last = l.pieces[l.pieces.length - 1];
      eq(l.x + last.x + last.width, 160, `text after a right tab ends at the stop (line ${l.start})`);
    }
    const c = withTabs('ab\tcdef\tgh', 300, [[100, 2], [130, 1]]);
    const piece = c.lines()[0].pieces.find((p) => p.text === 'cdef')!;
    ok(Math.abs(piece.x + piece.width / 2 - 100) <= 1, `centred on 100 (${piece.x}..${piece.x + piece.width})`);
    eq(pos(c, 9)[0], 130, 'then the left stop at 130');
  });

  test('a TAB in a field is a box glyph, not a tab stop', 'Adobe measurement (text-layout.ts: GDI draws .notdef; Verdana 10: 10 px)', () => {
    const f = fieldMember('a\tb', 180);
    const t = textMember([{ text: 'a\tb' }], 180);
    eq(pos(f, 3)[0] - pos(f, 2)[0], 10, 'field TAB 10 px wide');
    eq(pos(t, 3)[0], 24, 'text member TAB to 24');
  });

  test('alignment: centred lines start at floor((width - line) / 2), right-aligned at width - line', 'Adobe measurement (text-layout.ts; text-compare center, right)', () => {
    const c = textMember([{ text: 'ab', bold: true }], 151, { alignment: 'center' });
    const l = c.lines()[0];
    eq(l.x, Math.floor((151 - l.width) / 2));
    const r = textMember([{ text: 'Won 12', font: 'Arial', size: 12 }], 121, { alignment: 'right' });
    const lr = r.lines()[0];
    eq(lr.x + lr.width, 121);
  });

  test("charPosToLoc: a text member reports the line's bottom less one, a field its ascent plus two", 'Adobe measurement (text-layout.ts lineLocV, Director 10.1)', () => {
    const t = textMember([{ text: 'ab\rcd' }], 200);
    eq([pos(t, 1), pos(t, 2), pos(t, 4)], [[0, 11], [pos(t, 2)[0], 11], [0, 23]]);
    const f = fieldMember('ab\rcd', 200);
    eq([pos(f, 1)[1], pos(f, 4)[1]], [12, 25], 'Verdana 10 ascent 10 + 2; second line 13 lower');
  });

  test('glyph advances are whole pixels per glyph', 'Adobe measurement (fonts.ts: outline advances scaled and rounded per glyph)', () => {
    const t = textMember([{ text: 'iiiiWWWW' }], 400);
    const xs = Array.from({ length: 9 }, (_, i) => pos(t, i + 1)[0]);
    ok(xs.every((x) => Number.isInteger(x)), `integer positions ${xs}`);
    eq(xs[4] - xs[0], 4 * (xs[1] - xs[0]), 'equal advances for equal glyphs');
  });

  test('setting text keeps the first character\'s style', 'Director docs (member.text = ... takes the style of the first character)', () => {
    const m = textMember([{ text: 'A', size: 14, bold: true }, { text: 'bc' }], 200);
    m.text = 'new text';
    eq(m.styled.runs.length, 1);
    eq([m.fontSize, m.fontStyle], [14, ['bold']]);
  });

  test('an empty text member keeps its own default style', 'docs/port-issues.md "Fixed along the way" (the robot list\'s names in yellow Impact)', () => {
    const m = new TextMember(cast, ++n, '', { ...textDoc([{ text: '' }]), spans: [], defaultFont: 'Arial', defaultSize: 18, defaultColor: '#ffcc00', size: [100, 0] });
    eq([m.font, m.fontSize, m.styled.runs[0].color], ['Arial', 18, '#ffcc00']);
    m.text = 'Crusher';
    eq([m.font, m.fontSize], ['Arial', 18], 'after setting text');
  });

  test('an empty text member keeps its default bold', 'Adobe measurement (member("weapon1 num").fontStyle is [#bold], authored empty)', () => {
    const m = new TextMember(cast, ++n, '', { ...textDoc([{ text: '' }]), spans: [], defaultFont: 'Verdana', defaultSize: 9, defaultStyle: { bold: true, italic: false, underline: false }, size: [22, 0] });
    m.text = '5';
    eq([m.font, m.fontSize, m.fontStyle], ['Verdana', 9, ['bold']]);
  });
});
