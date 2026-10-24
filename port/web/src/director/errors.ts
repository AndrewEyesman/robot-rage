// Script errors the runtime survives (Director's alertHook keeps the movie playing),
// passed on to whoever listens: the game page sends them to the server's log
// (src/error-report.ts). `where` is the handler that failed, or the part of the frame
// cycle when no handler is known.

export const scriptErrorListeners: ((where: string, error: unknown) => void)[] = [];

export function scriptError(where: string, error: unknown) {
  for (const listener of scriptErrorListeners) {
    try {
      listener(where, error);
    } catch {
      // A listener's own failure mustn't become another script error.
    }
  }
}
