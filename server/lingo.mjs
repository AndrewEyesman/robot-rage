// Serialize JS values as Lingo literals, the format the game's backend
// replies are parsed with (`value(netTextResult(id))`).
//
//   { err: 0, sid: "abc" }   -> [#err: 0, #sid: "abc"]
//   [1, "a"]                 -> [1, "a"]
//   {}                       -> [:]
//   new LingoSymbol("x")     -> #x

export class LingoSymbol {
  constructor(name) {
    this.name = name;
  }
}

export const sym = (name) => new LingoSymbol(name);

// A Lingo literal stored exactly as the client sent it (robot data).
export class LingoRaw {
  constructor(text) {
    this.text = text;
  }
}

export const raw = (text) => new LingoRaw(text);

export function toLingo(value) {
  if (value === null || value === undefined) return "VOID";
  if (value instanceof LingoSymbol) return `#${value.name}`;
  if (value instanceof LingoRaw) return value.text;
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(4);
  }
  if (typeof value === "string") {
    // Lingo string literals cannot escape quotes or line breaks.
    return `"${value.replace(/["\r\n]/g, "")}"`;
  }
  if (Array.isArray(value)) return `[${value.map(toLingo).join(", ")}]`;
  const entries = Object.entries(value);
  if (entries.length === 0) return "[:]";
  return `[${entries.map(([k, v]) => `#${k}: ${toLingo(v)}`).join(", ")}]`;
}

// A property list parsed from a Lingo literal, keeping where each value sits in
// the text (so a value can be replaced without re-serialising the rest, which
// the client checksums byte for byte).
export class LingoPropList {
  constructor() {
    this.entries = []; // [key, value, start, end]
  }

  /** The value for a symbol or string key, case-insensitively like Lingo. */
  get(name) {
    const entry = this.entry(name);
    return entry ? entry[1] : undefined;
  }

  entry(name) {
    const lower = String(name).toLowerCase();
    return this.entries.find(([key]) => (key instanceof LingoSymbol ? key.name : String(key)).toLowerCase() === lower);
  }
}

/**
 * Parse a Lingo literal as the game writes them with string(): lists,
 * property lists, #symbols, integers, floats, "strings" and VOID. Throws on
 * anything else.
 */
export function parseLingo(text) {
  let i = 0;
  const fail = (what) => {
    throw new Error(`lingo: ${what} at ${i}`);
  };
  const space = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  function value() {
    space();
    const c = text[i];
    if (c === "[") return list();
    if (c === "#") {
      const m = /^#([A-Za-z_][A-Za-z0-9_]*)/.exec(text.slice(i));
      if (!m) fail("bad symbol");
      i += m[0].length;
      return sym(m[1]);
    }
    if (c === '"') {
      const end = text.indexOf('"', i + 1);
      if (end < 0) fail("unterminated string");
      const s = text.slice(i + 1, end);
      i = end + 1;
      return s;
    }
    const m = /^-?\d+(\.\d+)?(e[+-]?\d+)?/i.exec(text.slice(i));
    if (m) {
      i += m[0].length;
      return Number(m[0]);
    }
    if (/^VOID\b/i.test(text.slice(i))) {
      i += 4;
      return undefined;
    }
    return fail("unexpected character");
  }
  function list() {
    i++; // [
    space();
    if (text[i] === ":") {
      i++;
      space();
      if (text[i] !== "]") fail("expected ]");
      i++;
      return new LingoPropList();
    }
    if (text[i] === "]") {
      i++;
      return [];
    }
    let items = null;
    let props = null;
    for (;;) {
      const first = value();
      space();
      if (text[i] === ":") {
        if (items) fail("mixed list");
        props ??= new LingoPropList();
        i++;
        space();
        const start = i;
        const v = value();
        props.entries.push([first, v, start, i]);
      } else {
        if (props) fail("mixed list");
        (items ??= []).push(first);
      }
      space();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "]") {
        i++;
        return props ?? items;
      }
      fail("expected , or ]");
    }
  }
  const result = value();
  space();
  if (i !== text.length) fail("trailing text");
  return result;
}
