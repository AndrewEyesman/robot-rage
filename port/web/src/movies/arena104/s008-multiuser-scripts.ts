// arena104 movie script 8 "multiuser scripts": the match connection. The lobby leaves
// the P2P connection in muInstance (the host listening, the client connected);
// InitMultiUser routes its messages to ArenaMessageHandler, which answers pings, hands
// every message to the frame script (#Received) and handles chat, revenge and draw
// offers.

import { G, alert, pass, put, sendSprite, the, newMultiuser, type MultiuserXtra } from '../../director';
import { LList, LPropList, lingoString, objectp, propList, sym, voidp, type LValue } from '../../lingo';
import { debug } from '../robotwars/s007-jump-movie';
import { arenaFixes } from './enhancements';
import { getPlayerVariable } from './s144-debug-stuff';
import { eq, n, pget, sp } from './util';

// global muInstance, idcounter, netId, gMaxBall, gOpponent, gTimeDiff, gopponentdata,
// gRev, gdraw, gUseUDP, gPlayerNumber, gCHat, gPlayer, gAbuse, gOpponentReady,
// gMatchResult, gArenaStartTime, gFrame

const s = (name: string) => sym(name);
const mu = (): MultiuserXtra => G.muInstance;

export function InitMultiUser() {
  const userstring = pget(G.gopponentdata, 'robotname');
  void userstring;
  G.gOpponent = pget(G.gopponentdata, 'robotname');
  if (voidp(G.muInstance) && eq(the.runMode, 'Author')) {
    G.muInstance = newMultiuser();
    G.gPlayerNumber = 2;
  }
  if (voidp(G.gPlayerNumber)) {
    G.gPlayerNumber = 2;
  }
  G.gOpponentReady = 0;
  G.gUseUDP = 0;
  const errCode = mu().setNetMessageHandler(s('ArenaMessageHandler'), 0, '', '', 1);
  if (errCode !== 0) {
    alert('Problem with setNetMessageHandler');
  }
}

export function ArenaMessageHandler(me: LValue, Msg: LPropList) {
  void me;
  const errorCode = n(pget(Msg, 'errorCode'));
  const subject = pget(Msg, 'subject');
  const content = pget(Msg, 'content');
  let fel: number | undefined;
  if (errorCode !== 0) {
    if (errorCode === -2147216214) {
      fel = 1;
    }
    if (objectp(G.muInstance)) {
      put('Error: ' + errorCode + ' ' + mu().getNetErrorString(errorCode));
      fel = 1;
    }
    if (fel === 1) {
      // The port's fix (arenaFixes.awayLoss): the main frame script tells its own
      // connection's loss (from the Xtra, "System") from the relay's word that the
      // opponent left, and decides (s002 connectionLost).
      const frame = G.gFrame as { state?: LValue; connectionLost?(own: boolean): void } | undefined;
      if (arenaFixes.awayLoss) {
        frame?.connectionLost?.(eq(pget(Msg, 'senderID'), 'System'));
        return undefined;
      }
      const st = frame?.state;
      if (st === s('idle') || st === s('waitOpponent')) {
        sendSprite(0, s('noConnection'));
      }
      return undefined;
    }
  }
  if (eq(subject, 'p2p_ping')) {
    mu().sendNetMessage(propList(s('recipients'), G.gOpponent, s('subject'), 'p2p_pong', s('udp'), G.gUseUDP));
  }
  sendSprite(0, s('Received'), subject, content, pget(Msg, 'timeStamp'));
  if (eq(subject, 'WaitForNetConnection')) {
    return 1;
  } else if (eq(subject, 'ConnectToNetServer')) {
    debug('user connected');
    return 0;
  } else if (eq(subject, 'ConnectionProblem')) {
    debug('User disconnected\r');
    return 0;
  } else if (eq(subject, 'getvar')) {
    mu().sendNetMessage(propList(s('recipients'), G.gOpponent, s('subject'), 'var', s('content'), propList(s('var'), getPlayerVariable(pget(content, 'name'))), s('upd'), 0));
  } else if (eq(subject, 'var')) {
    put('my frametempo :  ' + lingoString(pget(content, 'var')));
  } else if (eq(subject, 'GetGameStatus')) {
    // getGameInfo() is defined nowhere: a script error in Director, so nothing is sent.
    put('getGameInfo is not defined');
  } else if (eq(subject, 'chat1') || eq(subject, 'chat2')) {
    if (eq(G.gCHat, 1) && eq(G.gAbuse, 0)) {
      sendSprite(211, s('addChatLine'), pget(content, 'text'));
    } else {
      const mess = lingoString(G.gPlayer) + ' ' + 'has disabled the chat';
      mu().sendNetMessage(propList(s('recipients'), G.gOpponent, s('subject'), 'chat1', s('content'), propList(s('text'), mess), s('upd'), 0));
    }
  } else if (eq(subject, 'revenge1')) {
    sendSprite(211, s('addChatLine'), pget(content, 'text'), 1);
    G.gRev = G.gOpponent;
  } else if (eq(subject, 'revenge2')) {
    sendSprite(211, s('addChatLine'), pget(content, 'text'), 1);
    sendSprite(0, s('godraw'));
  } else if (eq(subject, 'draw1')) {
    sendSprite(211, s('addChatLine'), pget(content, 'text'), 1);
    G.gdraw = G.gOpponent;
  } else if (eq(subject, 'draw2')) {
    sendSprite(211, s('addChatLine'), pget(content, 'text'), 1);
    sendSprite(0, s('godraw'));
  } else if (eq(subject, 'myuserdata')) {
    G.gopponentdata = (content as LList).getAt(1);
  }
  return undefined;
}

export function getArenaInfo() {
  const L = (k: number) =>
    new LList([sp(k, 'x'), sp(k, 'y'), sp(k, 'angle'), sp(k, 'speed'), sp(k, 'dx'), sp(k, 'dy'), sp(k, 'torque')]);
  return propList(s('sp10'), L(10), s('sp20'), L(20));
}

export function GetGameStatus() {
  return propList(s('opponentReady'), G.gOpponentReady, s('gameTime'), the.milliSeconds - n(G.gArenaStartTime));
}

export function stopMovie() {
  if (eq(the.frameLabel, 'game')) {
    // nothing
  }
  G.gTimeDiff = undefined;
  if (!eq(the.runMode, 'author')) {
    // Director closes the connection with its last reference; JavaScript needs telling.
    (G.muInstance as MultiuserXtra | undefined)?.dispose?.();
    G.muInstance = undefined;
  }
  the.actorList = [];
  return pass();
}

