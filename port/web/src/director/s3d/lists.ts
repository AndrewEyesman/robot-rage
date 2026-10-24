// Lingo's ways into a 3D member's collections, kept as written:
//   world.model("name")   world.model(3)   world.model[3]   world.model.count
// A NodeList is a function (lookup by name or 1-based index) that also answers
// numeric indexing and `count`. Lookups that find nothing return undefined (VOID),
// as Director does; the types say T so translated lines stay as short as the Lingo.

export interface NodeList<T> {
  (key: string | number): T;
  readonly count: number;
  readonly [index: number]: T;
}

import { byteToChar, foldCase } from '../../lingo/charset';

/** Names compare as Lingo's `=` does (case-insensitive through Director's fold). */
export const nameKey = (s: string) => foldCase(s);

/**
 * Names from the extracted files carry Director's bytes as Latin-1 code points; Lingo
 * strings carry them as Windows-1252 characters (byte 0x8C is "Œ"), so a part table's
 * "s\u0152gblad" finds the file's "s\x8cgblad".
 */
export const fileName = (s: string) => s.replace(/[\x80-\x9f]/g, (c) => byteToChar(c.charCodeAt(0)));

const isIndex = (p: string | symbol): p is string => typeof p === 'string' && /^\d+$/.test(p);

export function nodeList<T extends { name: string }>(items: () => readonly T[]): NodeList<T> {
  const lookup = (key: string | number): T => {
    const list = items();
    if (typeof key === 'number') return list[Math.trunc(key) - 1] as T;
    const k = nameKey(String(key));
    return list.find((x) => nameKey(x.name) === k) as T;
  };
  return new Proxy(lookup, {
    get(t, p) {
      if (p === 'count') return items().length;
      if (isIndex(p)) return items()[Number(p) - 1];
      return Reflect.get(t, p);
    },
  }) as unknown as NodeList<T>;
}

/** Lingo symbols reach the API as LSymbol-like objects or strings ("#none" or "none"). */
export function symName(v: unknown): string {
  if (v && typeof v === 'object' && 'name' in v) return String((v as { name: unknown }).name).toLowerCase();
  return String(v ?? '').replace(/^#/, '').toLowerCase();
}
