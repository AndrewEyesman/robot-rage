// Where translated scripts are registered. Each cast (a movie's internal cast, or an
// external cast like robotwars) registers its behaviors and parent scripts by member
// number, and its movie-script handlers by name. Score spans and `script("name")`
// find scripts here.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ScriptClass = new (...args: any[]) => object;

export interface CastScripts {
  /** Behaviors and parent scripts by member number. */
  scripts?: Record<number, ScriptClass>;
  /** Script member names, for script("name") (defaults to the class's scriptName or class name). */
  names?: Record<string, ScriptClass>;
  /** Movie-script handlers (global functions), by handler name. */
  handlers?: Record<string, (...args: never[]) => unknown>;
}

const casts = new Map<string, CastScripts>();

/** Register a cast's scripts; `cast` is the movie name for internal casts ("login013_") or the external cast's name. */
export function registerCast(cast: string, s: CastScripts) {
  const key = cast.toLowerCase();
  const prev = casts.get(key) ?? {};
  casts.set(key, {
    scripts: { ...prev.scripts, ...s.scripts },
    names: { ...prev.names, ...s.names },
    handlers: { ...prev.handlers, ...s.handlers },
  });
}

export function castScripts(cast: string): CastScripts | undefined {
  return casts.get(cast.toLowerCase());
}
