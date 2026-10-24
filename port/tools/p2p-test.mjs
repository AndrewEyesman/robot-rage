// Checks the Multiuser Xtra's direct connections (port/web/src/director/p2p.ts) in two
// tabs of headless Chrome on the dev server: a host listening and a joiner connecting
// through the relay, then switching to a WebRTC DataChannel. Both send a numbered
// stream all through the switch, and through a forced fall back to the relay with the
// channel dying mid-stream; every message must arrive once and in order. Then the
// same with ?p2p=relay (never direct) and ?p2p=fail (ICE broken: falls back after the
// timeout). Prints the message round trip on each transport.
//
//   node port/tools/p2p-test.mjs [app=http://127.0.0.1:8092]    (dev server; never 8090)
//
// The tabs find each other by their host candidates alone (the suite's server has no
// STUN), which Chrome names by mDNS. Where mDNS doesn't resolve (GitHub's runners),
// P2P_PLAIN_IPS=1 has Chrome give its plain local addresses instead.
import { chromium } from 'playwright-core';

const [APP = 'http://127.0.0.1:8092'] = process.argv.slice(2);
if (APP.includes(':8090')) throw new Error('8090 is the shared server');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: true,
  args: ['--headless=new', '--mute-audio', ...(process.env.P2P_PLAIN_IPS === '1' ? ['--disable-features=WebRtcHideLocalIpsWithMdns'] : [])],
});
let failed = 0;
const check = (ok, what) => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
};

/** A tab with a Multiuser instance in window.mu, its received messages in window.got. */
async function tab(ctx, query) {
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  // Any page of the dev server: the Xtra builds its socket URLs from the location.
  await page.goto(`${APP}/game/main.ini?${query}`);
  await page.evaluate(async () => {
    const { MultiuserXtra } = await import('/src/director/multiuser.ts');
    const { sym } = await import('/src/lingo/index.ts');
    window.sym = sym;
    window.mu = new MultiuserXtra();
    window.got = [];
    window.mu.setNetMessageHandler(sym('h'), { h: (m) => window.got.push(m) }, '', '', 1);
    window.field = (m, k) => m.getaProp(sym(k));
    // Count the stream "n" messages: in order, once each.
    window.stream = { next: 0, bad: [] };
    window.mu.setNetMessageHandler(sym('n'), { n: (m) => {
      const n = window.field(m, 'content');
      if (n !== window.stream.next) window.stream.bad.push(`${n} after ${window.stream.next - 1}`);
      window.stream.next = n + 1;
    } }, 'n', '', 1);
    window.mu.setNetMessageHandler(sym('ping'), { ping: (m) => window.mu.sendNetMessage(window.field(m, 'senderID'), 'pong', window.field(m, 'content')) }, 'ping', '', 1);
  });
  return { page, logs };
}

/** Start sending "n" 0, 1, 2... to `to` every `ms` (one setInterval, several per tick). */
const startStream = (t, to, ms = 4) => t.page.evaluate(([to, ms]) => {
  window.sent = 0;
  window.timer = setInterval(() => { for (let i = 0; i < 3; i++) window.mu.sendNetMessage(to, 'n', window.sent++); }, ms);
}, [to, ms]);
const stopStream = (t) => t.page.evaluate(() => (clearInterval(window.timer), window.sent));
const streamState = (t) => t.page.evaluate(() => ({ next: window.stream.next, bad: window.stream.bad.slice(0, 5) }));
const transport = (t) => t.page.evaluate(() => window.mu.transportInfo());

/** Median round trip of `n` pings, one at a time (resolved by the pong's handler, no polling). */
const roundTrip = (t, to, n = 40) => t.page.evaluate(async ([to, n]) => {
  const times = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const ok = await new Promise((done) => {
      const timer = setTimeout(() => done(false), 2000);
      window.mu.setNetMessageHandler(window.sym('pong'), { pong: (m) => window.field(m, 'content') === i && (clearTimeout(timer), done(true)) }, 'pong', '', 1);
      window.mu.sendNetMessage(to, 'ping', i);
    });
    if (!ok) return -1;
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return Math.round(times[times.length >> 1] * 100) / 100;
}, [to, n]);

async function pair(query, label, joinQuery = query) {
  const ctx = await browser.newContext();
  const host = await tab(ctx, query);
  const join = await tab(ctx, joinQuery);
  await host.page.evaluate(() => window.mu.waitForNetConnection('HostBot'));
  await sleep(300);
  const hostAddr = await host.page.evaluate(() => sessionStorage.rrAddress);
  // Both streams start as soon as the joiner is connected, before the switch.
  await join.page.evaluate((a) => window.mu.connectToNetServer('JoinBot', 'NoPassWord', a, 1626, 'robotwars_lobby'), hostAddr);
  const until = Date.now() + 3000;
  while (Date.now() < until && !(await host.page.evaluate(() => window.mu.getPeerConnectionList().count))) await sleep(20);
  await startStream(join, 'HostBot');
  await startStream(host, 'JoinBot');
  return { ctx, host, join, label };
}

async function finish({ host, join }, what) {
  const sentJ = await stopStream(join);
  const sentH = await stopStream(host);
  await sleep(500);
  const atHost = await streamState(host);
  const atJoin = await streamState(join);
  check(atHost.next === sentJ && !atHost.bad.length, `${what}: host got joiner's ${atHost.next}/${sentJ} messages in order ${atHost.bad.join(' ')}`);
  check(atJoin.next === sentH && !atJoin.bad.length, `${what}: joiner got host's ${atJoin.next}/${sentH} messages in order ${atJoin.bad.join(' ')}`);
}

const rtt = {};
// ---- auto: switches to the DataChannel mid-stream, then falls back mid-stream.
{
  const p = await pair('', 'direct');
  await sleep(2500);
  const [th, tj] = [await transport(p.host), await transport(p.join)];
  check(th.transport === 'direct' && tj.transport === 'direct', `auto: both on the direct channel (host ${th.transport}, joiner ${tj.transport}: ${tj.links[0]?.reason})`);
  check(tj.links[0]?.sentDirect > 0 && tj.links[0]?.gotDirect > 0, `auto: messages went over the channel (joiner sent ${tj.links[0]?.sentDirect}, got ${tj.links[0]?.gotDirect})`);
  await finish(p, 'switch to direct');
  rtt.direct = await roundTrip(p.join, 'HostBot');
  // The channel dies under a running stream: everything still arrives, once, in order.
  await p.host.page.evaluate(() => (window.stream.next = 0, window.stream.bad = []));
  await p.join.page.evaluate(() => (window.stream.next = 0, window.stream.bad = []));
  await startStream(p.join, 'HostBot');
  await startStream(p.host, 'JoinBot');
  await sleep(300);
  // Abruptly: the joiner's peer connection goes away without a word on the relay.
  await p.join.page.evaluate(() => { const l = window.mu.links.get(''); l.pc?.close(); l.dc?.onclose?.(); });
  await sleep(1500);
  const [bh, bj] = [await transport(p.host), await transport(p.join)];
  check(bh.transport === 'relay' && bj.transport === 'relay', `channel lost: both back on the relay (host: ${bh.links[0]?.reason}; joiner: ${bj.links[0]?.reason})`);
  await finish(p, 'fall back mid-stream');
  await p.ctx.close();
}
// ---- ?p2p=relay: never tries.
{
  const p = await pair('p2p=relay', 'relay');
  await sleep(1500);
  const [th, tj] = [await transport(p.host), await transport(p.join)];
  check(th.transport === 'relay' && tj.transport === 'relay' && !tj.links.length, `?p2p=relay: relay only (${tj.reason})`);
  await finish(p, '?p2p=relay');
  rtt.relay = await roundTrip(p.join, 'HostBot');
  await p.ctx.close();
}
// ---- ?p2p=fail: ICE can't connect; the stream carries on over the relay meanwhile.
{
  const t0 = Date.now();
  const p = await pair('p2p=fail', 'fail');
  let tj, th;
  while (Date.now() - t0 < 9000) {
    [tj, th] = [await transport(p.join), await transport(p.host)];
    if (tj.links.length && th.links.length && tj.transport !== 'connecting' && th.transport !== 'connecting') break;
    await sleep(100);
  }
  check(tj.transport === 'relay' && th.transport === 'relay', `?p2p=fail: fell back to the relay after ${((Date.now() - t0) / 1000).toFixed(1)} s (joiner: ${tj.links[0]?.reason}; host: ${th.links[0]?.reason})`);
  await finish(p, '?p2p=fail');
  await p.ctx.close();
}
// ---- A relay-only host declines a joiner's offer: the joiner settles on the relay at once.
{
  const t0 = Date.now();
  const p = await pair('p2p=relay', 'mixed', '');
  let tj;
  while (Date.now() - t0 < 9000) {
    tj = await transport(p.join);
    if (tj.links.length && tj.transport !== 'connecting') break;
    await sleep(50);
  }
  const th = await transport(p.host);
  check(tj.transport === 'relay' && /declined/.test(tj.reason) && !th.links.length, `relay-only host, auto joiner: declined, on the relay (${tj.reason}, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  await finish(p, 'relay-only host');
  await p.ctx.close();
}
console.log(`round trip (median of 40, joiner -> host -> joiner): direct ${rtt.direct} ms, relay ${rtt.relay} ms`);
await browser.close();
process.exit(failed ? 1 : 0);
