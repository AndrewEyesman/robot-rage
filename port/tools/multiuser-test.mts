// Checks the port's Multiuser Xtra (port/web/src/director/multiuser.ts) against a
// running game server: registers on the IRC lobby the way IRC_OBJECT does (#text mode)
// until the 376 welcome, then passes SMUS messages with every Lingo value type between
// a waitForNetConnection listener and a connectToNetServer peer through the relay
// (direct WebRTC connections need a browser: p2p-test.mjs).
//
//   cd port/web && npx tsx ../tools/multiuser-test.mts [port]     (default 8091; never 8090)

import assert from 'node:assert/strict';

const port = process.argv[2] ?? '8091';
if (port === '8090') throw new Error('8090 is the shared server');
// The Xtra builds its URLs from the page's location and keeps the tab address in sessionStorage.
Object.assign(globalThis, { location: { protocol: 'http:', host: `127.0.0.1:${port}`, search: '' }, sessionStorage: {} });
// The runtime's text measuring makes a canvas when it loads; nothing here draws.
Object.assign(globalThis, { document: { createElement: () => ({ getContext: () => ({}) }), fonts: { add() {} } } });

const { MultiuserXtra, ERR_NO_CONNECTION } = await import('../web/src/director/multiuser.ts');
const L = await import('../web/src/lingo/index.ts');
const { sym, propList, list, lf, point, rect, lingoString } = L;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(check: () => T | undefined | false, what: string, timeout = 5000): Promise<T> {
  const end = Date.now() + timeout;
  for (;;) {
    const v = check();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
}
type Msg = InstanceType<typeof L.LPropList>;
const field = (m: Msg, k: string) => m.getaProp(sym(k));

// ---- IRC (#text) ----
{
  const got: Msg[] = [];
  const irc = new MultiuserXtra();
  const owner = { defaultMessageHandler: (m: Msg) => got.push(m) };
  assert.equal(irc.setNetMessageHandler(sym('defaultMessageHandler'), owner, '', '', 1), 0);
  const err = irc.connectToNetServer('irc.robotrage.local', 8777, propList(sym('userID'), 'Bb', sym('password'), 'MySecret', sym('movieID'), 'Tech Chat'), sym('text'));
  assert.equal(err, 0);
  await waitFor(() => got.find((m) => field(m, 'subject') === 'ConnectToNetServer'), 'ConnectToNetServer');
  const nick = `_R0MuTest${Date.now() % 1000}0000`;
  for (const line of ['PASS ', `NICK ${nick}`, 'USER Shockplay 0 * MuTest']) assert.equal(irc.sendNetMessage('system', 'IRC', line + '\n\r'), 0);
  const text = () => got.map((m) => lingoString(field(m, 'content'))).join('');
  await waitFor(() => / 376 /.test(text()), '376 welcome');
  const first = got.find((m) => field(m, 'subject') === 'String')!;
  assert.equal(field(first, 'errorCode'), 0);
  assert.equal(field(first, 'senderID'), 'System');
  assert.ok(/ 001 /.test(text()), '001 seen');
  console.log(`IRC: registered as ${nick}, saw 001 and 376 (${got.length} messages)`);
  irc.dispose();
}

// ---- SMUS through the relay ----
{
  const hostGot: Msg[] = [];
  const peerGot: Msg[] = [];
  const host = new MultiuserXtra();
  const peer = new MultiuserXtra();
  host.setNetMessageHandler(sym('P2PMessageHandler'), { P2PMessageHandler: (m: Msg) => hostGot.push(m) }, '', '', 1);
  peer.setNetMessageHandler(sym('P2PMessageHandler'), { P2PMessageHandler: (m: Msg) => peerGot.push(m) }, '', '', 1);
  assert.equal(host.waitForNetConnection(propList(sym('userID'), 'HostBot', sym('maxConnections'), 16, sym('localTCPPort'), 1626)), 0);
  await sleep(300);
  const addr = (globalThis as unknown as { sessionStorage: { rrAddress: string } }).sessionStorage.rrAddress;
  assert.equal(peer.connectToNetServer('PeerBot', 'NoPassWord', addr, 1626, 'robotwars_lobby'), 0);
  await waitFor(() => peerGot.find((m) => field(m, 'subject') === 'ConnectToNetServer' && field(m, 'errorCode') === 0), 'peer ConnectToNetServer');
  await waitFor(() => hostGot.find((m) => field(m, 'subject') === 'WaitForNetConnection'), 'host WaitForNetConnection');
  assert.deepEqual(host.getPeerConnectionList().items, ['PeerBot']);
  // Both asked the relay for direct-connection signalling; Node has no WebRTC, so they stay on the relay.
  await waitFor(() => peer.transportInfo().reason === 'no WebRTC' && host.transportInfo().clockOffset !== undefined, 'relay hello');
  assert.equal(peer.transport, 'relay');
  assert.equal(host.transport, 'relay');

  const content = propList(
    sym('x'), 12, sym('neg'), -2147483648, sym('f'), 2.5, sym('whole'), lf(3), sym('s'), 'Grüß "x" — ok',
    sym('sym'), sym('ready'), sym('void'), undefined, sym('pos'), point(1.5, -2), sym('box'), rect(0, 1, lf(2), 3.25),
    'key', list(1, list(), propList(), list('a', sym('b'))),
  );
  assert.equal(peer.sendNetMessage('HostBot', 'P2P_Ping', content), 0);
  const ping = await waitFor(() => hostGot.find((m) => field(m, 'subject') === 'P2P_Ping'), 'P2P_Ping');
  assert.equal(field(ping, 'senderID'), 'PeerBot');
  assert.equal(lingoString(field(ping, 'content')), lingoString(content));
  assert.ok((field(ping, 'timeStamp') as number) > 0, 'relay stamps the time');
  console.log(`SMUS: ${lingoString(field(ping, 'content'))}`);

  // The arena's form, addressed to getPeerConnectionList(); and a message with no content.
  assert.equal(host.sendNetMessage(propList(sym('recipients'), host.getPeerConnectionList(), sym('subject'), 'chat2', sym('content'), propList(sym('text'), 'hi'), sym('upd'), 0)), 0);
  assert.equal(host.sendNetMessage(propList(sym('recipients'), 'PeerBot', sym('subject'), 'norevenge', sym('upd'), 0)), 0);
  const chat = await waitFor(() => peerGot.find((m) => field(m, 'subject') === 'chat2'), 'chat2');
  assert.equal(lingoString(field(chat, 'content')), '[#text: "hi"]');
  const none = await waitFor(() => peerGot.find((m) => field(m, 'subject') === 'norevenge'), 'norevenge');
  assert.equal(field(none, 'content'), undefined);

  // getNetMessage for a handler registered without passMessage.
  const queued: unknown[] = [];
  host.setNetMessageHandler(sym('P2PMessageHandler'), { P2PMessageHandler: (...a: unknown[]) => queued.push(a.length, host.getNetMessage()) }, '', '', 0);
  peer.sendNetMessage('HostBot', 'P2P_Ping_Exit', 42);
  await waitFor(() => queued.length, 'getNetMessage');
  assert.equal(queued[0], 0);
  assert.equal(field(queued[1] as Msg, 'content'), 42);

  // The host drops the peer: the peer's connection is gone.
  host.breakConnection('PeerBot');
  const lost = await waitFor(() => peerGot.find((m) => field(m, 'errorCode') === ERR_NO_CONNECTION), 'peer connection lost');
  assert.equal(field(lost, 'subject'), 'ConnectionProblem');
  assert.deepEqual(host.getPeerConnectionList().items, []);
  assert.equal(peer.sendNetMessage('HostBot', 'x', 1), ERR_NO_CONNECTION);

  // Connecting to nobody fails with "no current connection".
  const nobody: Msg[] = [];
  const lone = new MultiuserXtra();
  lone.setNetMessageHandler(sym('h'), { h: (m: Msg) => nobody.push(m) }, '', '', 1);
  lone.connectToNetServer('Lone', 'x', '10.255.255.254', 1626, 'robotwars_lobby');
  const fail = await waitFor(() => nobody[0], 'connect failure');
  assert.equal(field(fail, 'subject'), 'ConnectToNetServer');
  assert.equal(field(fail, 'errorCode'), ERR_NO_CONNECTION);
  host.dispose();
  console.log('SMUS: listen/connect, peer list, breakConnection and failures OK');
}
process.exit(0);
