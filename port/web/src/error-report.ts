// Sends the game's errors to the server's log (POST /api/clienterror,
// server/clienterrors.mjs), so bugs players meet show up without a bug report: script
// errors, which the runtime survives as Director's alertHook did, and anything else the
// page throws. Each distinct error goes once per page load, at most MAX of them, in
// batches. A report holds the error, its stack and where in the game it happened (movie,
// frame), nothing else. `?reporterrors=0` turns it off.

import { scriptErrorListeners, type Player } from './director';

const MAX = 20;
const BATCH_MS = 2000;

interface ErrorReport {
  where: string;
  message: string;
  stack: string;
  movie: string;
  frame: number;
  label: string;
}

export function reportErrors(player: Player, url = '/api/clienterror') {
  const seen = new Set<string>();
  let queue: ErrorReport[] = [];
  let timer = 0;

  const flush = () => {
    clearTimeout(timer);
    timer = 0;
    if (!queue.length) return;
    const body = JSON.stringify({ errors: queue });
    queue = [];
    if (!navigator.sendBeacon?.(url, body)) void fetch(url, { method: 'POST', body, keepalive: true }).catch(() => {});
  };

  const add = (where: string, error: unknown) => {
    const message = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 300);
    const movie = player.movie?.name ?? '';
    const key = `${movie}|${where}|${message}`;
    if (seen.has(key) || seen.size >= MAX) return;
    seen.add(key);
    const stack = error instanceof Error && error.stack ? error.stack.split('\n').filter((l) => /^\s*at |^\S*@\S+:\d+:\d+$/.test(l)).slice(0, 4).map((l) => l.trim()).join(' | ') : '';
    queue.push({ where, message, stack: stack.slice(0, 600), movie, frame: player.frame, label: player.frameLabel });
    timer ||= window.setTimeout(flush, BATCH_MS);
  };

  scriptErrorListeners.push(add);
  addEventListener('error', (e) => add('page', e.error ?? e.message));
  addEventListener('unhandledrejection', (e) => add('promise', e.reason));
  addEventListener('pagehide', flush);
}
