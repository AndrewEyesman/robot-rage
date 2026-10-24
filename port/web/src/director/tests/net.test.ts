// Network Lingo (net.ts): getNetText / postNetText / netTextResult, with fetch
// replaced by a fake server so nothing leaves the page.

import { getNetText, netDone, netError, netTextResult, postNetText, preloadNetThing } from '../net';
import { describe, eq, ok, test, waitFor } from './harness';

interface Seen {
  url: string;
  init?: RequestInit;
}

/** Run `body` with fetch answering `reply` (bytes as a Latin-1 string) and recording requests. */
async function withFetch(reply: (url: string) => { status?: number; body: string }, body: (seen: Seen[]) => Promise<void>) {
  const real = window.fetch;
  const seen: Seen[] = [];
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init });
    const r = reply(url);
    const bytes = Uint8Array.from(r.body, (c) => c.charCodeAt(0));
    return new Response(bytes, { status: r.status ?? 200 });
  }) as typeof fetch;
  try {
    await body(seen);
  } finally {
    window.fetch = real;
  }
}

describe('net', () => {
  test('netTextResult turns LF, CR LF and LF CR into one CR', 'Adobe measurement (docs/port-issues.md "Fixed along the way": main.ini parsed wrong without it)', async () => {
    await withFetch(
      () => ({ body: 'a\nb\r\nc\n\rd\re' }),
      async () => {
        const id = getNetText('/x.txt');
        eq(netDone(id), false, 'not done at once');
        await waitFor(() => netDone(id), 'netDone');
        eq(netTextResult(id), 'a\rb\rc\rd\re');
        eq(netError(id), 'OK');
      },
    );
  });

  test('text is read as Latin-1', 'net.ts (the game sends and reads Latin-1)', async () => {
    await withFetch(
      () => ({ body: 'r\xe5\xe4' }),
      async () => {
        const id = getNetText('/x.txt');
        await waitFor(() => netDone(id), 'netDone');
        eq(netTextResult(id), 'råä');
      },
    );
  });

  test('a missing file is error 4165; netError is empty until done', 'Director docs (netError codes)', async () => {
    await withFetch(
      () => ({ status: 404, body: '' }),
      async () => {
        const id = getNetText('/missing.txt');
        eq(netError(id), '', 'in progress');
        await waitFor(() => netDone(id), 'netDone');
        eq(netError(id), 4165);
      },
    );
  });

  test("the login's hardcoded Shockplay URL goes to the game server; badlanguage.txt to the game folder", 'net.ts resolve (docs/port-issues.md #18)', async () => {
    await withFetch(
      () => ({ body: 'SE' }),
      async (seen) => {
        const a = getNetText('http://miniclip2.shockplay.com/php/ip2country.php?ip=1');
        const b = getNetText('http://somewhere/old/badlanguage.txt');
        await waitFor(() => netDone(a) && netDone(b), 'netDone');
        eq(seen.map((s) => s.url), ['/api/ip2country.php?ip=1', '/game/badlanguage.txt']);
      },
    );
  });

  test('postNetText sends a Latin-1 urlencoded form', 'Director (postNetText sends the property list as a form, in the system encoding)', async () => {
    await withFetch(
      () => ({ body: 'ok' }),
      async (seen) => {
        const id = postNetText('/api/main.asp', [['action', 'login member'], ['name', 'Åsa&co']]);
        await waitFor(() => netDone(id), 'netDone');
        eq(seen[0].init?.method, 'POST');
        eq(seen[0].init?.body, 'action=login+member&name=%C5sa%26co');
      },
    );
  });

  test('preloadNetThing is done at once; ids without an operation read as done', 'net.ts (movies and casts are already part of the port)', () => {
    const id = preloadNetThing('http://x/arena104.dcr');
    ok(netDone(id), 'done');
    eq(netError(id), 'OK');
    ok(netDone(999999), 'unknown id');
  });
});
