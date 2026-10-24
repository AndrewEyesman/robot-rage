// Lingo's message passing on TypeScript objects: handlers are methods, matched
// case-insensitively by name, as Lingo matches them. `pass()` inside a handler lets
// the event continue down the hierarchy; a handler that doesn't pass stops it.

const handlerNames = new WeakMap<object, Map<string, string>>();

/** The method implementing handler `name` on `obj`, if any. */
export function findHandler(obj: object | null | undefined, name: string): ((...args: unknown[]) => unknown) | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const proto = Object.getPrototypeOf(obj);
  let names = handlerNames.get(proto);
  if (!names) {
    names = new Map();
    for (let p = proto; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
      for (const k of Object.getOwnPropertyNames(p)) {
        if (k === 'constructor') continue;
        const d = Object.getOwnPropertyDescriptor(p, k);
        if (d && typeof d.value === 'function' && !names.has(k.toLowerCase())) names.set(k.toLowerCase(), k);
      }
    }
    handlerNames.set(proto, names);
  }
  const key = names.get(name.toLowerCase());
  if (key) return (obj as Record<string, (...a: unknown[]) => unknown>)[key].bind(obj);
  // Handlers assigned as instance properties.
  for (const k of Object.keys(obj)) {
    const v = (obj as Record<string, unknown>)[k];
    if (k.toLowerCase() === name.toLowerCase() && typeof v === 'function') return (v as (...a: unknown[]) => unknown).bind(obj);
  }
  return undefined;
}

/** obj.handler(#name) */
export function hasHandler(obj: unknown, name: string): boolean {
  return !!findHandler(obj as object, name);
}

interface Frame {
  passed: boolean;
  stopped: boolean;
}
const stack: Frame[] = [];

let errorCount = 0;
function reportScriptError(handler: string, e: unknown) {
  if (errorCount++ < 100) console.error(`script error in ${handler}:`, e);
}

/** pass(): let the current event go on to the next handler in the hierarchy. */
export function pass() {
  const f = stack[stack.length - 1];
  if (f) f.passed = true;
}

/** stopEvent() / dontPassEvent(): the event goes no further, not even to the sprite's other behaviors. */
export function stopEvent() {
  const f = stack[stack.length - 1];
  if (f) {
    f.passed = false;
    f.stopped = true;
  }
}

export const dontPassEvent = stopEvent;

/**
 * Call handler `name` on `obj`. Returns whether a handler ran and didn't pass, and
 * its result.
 */
export function invoke(obj: object, name: string, args: unknown[]): { found: boolean; handled: boolean; stopped: boolean; result: unknown } {
  const h = findHandler(obj, name);
  if (!h) return { found: false, handled: false, stopped: false, result: undefined };
  const frame = { passed: false, stopped: false };
  stack.push(frame);
  try {
    let result: unknown;
    try {
      result = h(...args);
    } catch (e) {
      // A script error ends this handler only (Director's alertHook keeps the movie
      // playing); the rest of the event still goes to the other scripts.
      reportScriptError(name, e);
    }
    return { found: true, handled: !frame.passed, stopped: frame.stopped, result };
  } finally {
    stack.pop();
  }
}

/** call(#handler, object or list of objects, args...) */
export function call(name: string, target: unknown, ...args: unknown[]): unknown {
  const targets = Array.isArray(target) ? target : target && typeof (target as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function' && typeof target !== 'string' ? [...(target as Iterable<unknown>)] : [target];
  let result: unknown;
  for (const t of targets) if (t && typeof t === 'object') result = invoke(t, name, args).result;
  return result;
}

/** Set a script property by name (behavior parameters, sprite(n).prop = x), case-insensitively. */
export function setScriptProp(obj: object, name: string, value: unknown): boolean {
  const lower = name.toLowerCase();
  const rec = obj as Record<string, unknown>;
  for (const k of Object.keys(rec)) {
    if (k.toLowerCase() === lower) {
      rec[k] = value;
      return true;
    }
  }
  // Accessors declared on the class.
  for (let p = Object.getPrototypeOf(obj); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const k of Object.getOwnPropertyNames(p)) {
      const d = Object.getOwnPropertyDescriptor(p, k);
      if (k.toLowerCase() === lower && d?.set) {
        rec[k] = value;
        return true;
      }
    }
  }
  return false;
}

export function getScriptProp(obj: object, name: string): { found: boolean; value: unknown } {
  const lower = name.toLowerCase();
  const rec = obj as Record<string, unknown>;
  for (const k of Object.keys(rec)) if (k.toLowerCase() === lower) return { found: true, value: rec[k] };
  for (let p = Object.getPrototypeOf(obj); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const k of Object.getOwnPropertyNames(p)) {
      const d = Object.getOwnPropertyDescriptor(p, k);
      if (k.toLowerCase() === lower && d?.get) return { found: true, value: rec[k] };
    }
  }
  return { found: false, value: undefined };
}
