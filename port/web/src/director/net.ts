// Director's network Lingo: getNetText, postNetText and preloadNetThing start an
// operation and return its id; scripts poll netDone(id) and read netTextResult(id)
// and netError(id) ("OK" or an error number). Text is Latin-1, as the game sends it.

interface NetOp {
  url: string;
  done: boolean;
  text: string;
  error: string | number;
  bytes: number;
}

const ops = new Map<number, NetOp>();
let nextId = 1;
let lastId = 0;

function latin1Encode(s: string): string {
  // application/x-www-form-urlencoded with Latin-1 bytes (what Director sends).
  let out = '';
  for (const ch of s) {
    let c = ch.charCodeAt(0);
    if (c > 255) c = 63;
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || '-_.*'.includes(ch)) out += ch;
    else if (c === 32) out += '+';
    else out += '%' + c.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}

async function latin1Text(r: Response): Promise<string> {
  const buf = new Uint8Array(await r.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192));
  return s;
}

/** The login screen's country lookup is a hardcoded Shockplay URL; the game server answers it. */
const SHOCKPLAY_PHP = 'http://miniclip2.shockplay.com/php/';
function resolve(url: string): string {
  if (url.startsWith(SHOCKPLAY_PHP)) return `/api/${url.slice(SHOCKPLAY_PHP.length)}`;
  // The bad-language list sat beside the game's folder on the original site; this
  // server keeps it with the game files.
  if (/[\\/]badlanguage\.txt$/i.test(url)) return '/game/badlanguage.txt';
  return url;
}

function start(url: string, init?: RequestInit): number {
  url = resolve(url);
  const id = nextId++;
  lastId = id;
  const op: NetOp = { url, done: false, text: '', error: '', bytes: 0 };
  ops.set(id, op);
  fetch(url, init)
    .then(async (r) => {
      // Measured in Adobe's player: netTextResult turns LF, CR LF and LF CR into one CR.
      op.text = (await latin1Text(r)).replace(/\r\n|\n\r?/g, '\r');
      op.bytes = op.text.length;
      op.error = r.ok ? 'OK' : r.status === 404 ? 4165 : 4156;
    })
    .catch(() => {
      op.error = 4146;
    })
    .finally(() => {
      op.done = true;
    });
  return id;
}

export function getNetText(url: string): number {
  return start(url, { cache: 'no-store' });
}

/** postNetText(url, [key: value, ...]) with the pairs as a form. */
export function postNetText(url: string, pairs: [string, string][]): number {
  const body = pairs.map(([k, v]) => `${latin1Encode(k)}=${latin1Encode(v)}`).join('&');
  return start(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, cache: 'no-store' });
}

/** Movies and casts are already part of the port: nothing to fetch. */
export function preloadNetThing(url: string): number {
  const id = nextId++;
  lastId = id;
  ops.set(id, { url, done: true, text: '', error: 'OK', bytes: 1 });
  return id;
}

function op(id?: number): NetOp | undefined {
  return ops.get(id ?? lastId);
}

export function netDone(id?: number): boolean {
  return op(id)?.done ?? true;
}

export function netTextResult(id?: number): string {
  return op(id)?.text ?? '';
}

export function netError(id?: number): string | number {
  const o = op(id);
  if (!o) return '';
  return o.done ? o.error : '';
}

export function getStreamStatus(id?: number) {
  const o = op(id);
  return {
    URL: o?.url ?? '',
    state: !o ? 'Error' : o.done ? (o.error === 'OK' ? 'Complete' : 'Error') : 'InProgress',
    bytesSoFar: o?.bytes ?? 0,
    bytesTotal: o?.bytes ?? 0,
    error: o?.done ? (o.error === 'OK' ? 'OK' : String(o.error)) : '',
  };
}

export function netAbort(id?: number) {
  const o = op(id);
  if (o && !o.done) {
    o.done = true;
    o.error = 4242;
  }
}
