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
