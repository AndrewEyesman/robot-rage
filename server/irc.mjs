// Minimal IRC server for the game lobby, spoken over WebSocket text frames
// (the client's Multiuser Xtra connects in #text mode, so frames carry raw
// IRC lines). Only what the client parses is implemented:
//
//   001       welcome; the client reads its own address from the last
//             "@host" item
//   265       online count (word 7) and max (word 9), also after LUSERS
//   375/372/376  MOTD; 376 makes the client show the lobby
//   321-323   LIST with masks ("LIST #r*"), 353/366 NAMES, 303 ISON
//   JOIN/PART/QUIT/PRIVMSG relayed between users
//
// Players swap the address their opponent should connect to in private
// messages ("SMUS_GetIP", "Challenge"). The game derives it from the Multiuser
// Xtra's address cookies, which the emulator cannot provide, so the server
// fills in the sender's relay address (see relay.mjs).

const SERVER = "robotrage.local";

export class IrcServer {
  constructor({ log, motd = [], maxUsers = 200 }) {
    this.log = log;
    this.motd = motd;
    this.maxUsers = maxUsers;
    this.clients = new Set();
    this.channels = new Map(); // "#name" -> Set<client>
  }

  // `send(line)` delivers one line to the socket; `address` is the token the
  // client's peers will use to reach it (see relay.mjs).
  connect({ send, close, address }) {
    const client = { send, close, address, nick: null, user: null, registered: false, buffer: "" };
    this.clients.add(client);
    return {
      receive: (text) => this.receive(client, text),
      disconnect: () => this.quit(client, "Connection closed"),
    };
  }

  reply(client, numeric, text) {
    client.send(`:${SERVER} ${numeric} ${client.nick || "*"} ${text}\r\n`);
  }

  prefix(client) {
    return `${client.nick}!${client.user}@${client.address}`;
  }

  receive(client, text) {
    client.buffer += text;
    const lines = client.buffer.split(/\r?\n|\r/);
    client.buffer = lines.pop();
    for (const line of lines) if (line.trim()) this.command(client, line.trim());
  }

  command(client, line) {
    const [head, ...trailingParts] = line.split(" :");
    const trailing = trailingParts.length ? trailingParts.join(" :") : undefined;
    const [cmd, ...args] = head.split(" ").filter(Boolean);
    if (trailing !== undefined) args.push(trailing);

    switch (cmd.toUpperCase()) {
      case "PASS":
        return;
      case "NICK":
        return this.nick(client, args[0]);
      case "USER":
        client.user = (args[0] || "user").replace(/[^\w.-]/g, "") || "user";
        return this.maybeWelcome(client);
      case "PING":
        return client.send(`:${SERVER} PONG ${SERVER} :${args[0] || ""}\r\n`);
      case "PONG":
        return;
      case "JOIN":
        for (const name of (args[0] || "").split(",")) this.join(client, name);
        return;
      case "PART":
        for (const name of (args[0] || "").split(",")) this.part(client, name);
        return;
      case "PRIVMSG":
      case "NOTICE":
        return this.privmsg(client, cmd.toUpperCase(), args[0], args[1] ?? "");
      case "NAMES":
        return this.names(client, args[0]);
      case "LIST":
        return this.list(client, args[0]);
      case "ISON":
        return this.ison(client, args.join(" ").split(" "));
      case "LUSERS":
        return this.lusers(client);
      case "MODE":
      case "WHO":
      case "WATCH":
        return;
      case "QUIT":
        return this.quit(client, args[0] || "Quit");
      default:
        this.log(`irc: ignoring ${cmd} from ${client.nick}`);
    }
  }

  nick(client, nick) {
    if (!nick) return;
    const other = this.findNick(nick);
    if (other && other !== client) {
      // The emulator never closes the socket of a dropped Multiuser instance,
      // so a tab coming back from a match still holds its old nick.
      if (other.address !== client.address) {
        return this.reply(client, "433", `${nick} :Nickname is already in use`);
      }
      this.quit(other, "Reconnected");
      other.close();
    }
    client.nick = nick;
    this.maybeWelcome(client);
  }

  findNick(nick) {
    const lower = nick.toLowerCase();
    return [...this.clients].find((c) => c.nick?.toLowerCase() === lower);
  }

  onlineCount() {
    return [...this.clients].filter((c) => c.registered).length;
  }

  maybeWelcome(client) {
    if (client.registered || !client.nick || !client.user) return;
    client.registered = true;
    this.reply(client, "001", `:Welcome to RobotRage ${this.prefix(client)}`);
    this.reply(client, "002", `:Your host is ${SERVER}`);
    this.reply(client, "265", `:Current local users: ${this.onlineCount()} max: ${this.maxUsers}`);
    this.reply(client, "375", `:- ${SERVER} Message of the day -`);
    for (const line of this.motd) this.reply(client, "372", `:- ${line}`);
    this.reply(client, "376", ":End of MOTD command");
    this.log(`irc: ${client.nick} registered (${client.address})`);
  }

  channel(name) {
    const key = name.toLowerCase();
    if (!this.channels.has(key)) this.channels.set(key, { name, members: new Set() });
    return this.channels.get(key);
  }

  broadcast(members, line) {
    for (const member of members) member.send(line);
  }

  join(client, name) {
    if (!client.registered || !name) return;
    const channel = this.channel(name);
    if (channel.members.has(client)) return;
    channel.members.add(client);
    this.broadcast(channel.members, `:${this.prefix(client)} JOIN ${channel.name}\r\n`);
    this.names(client, channel.name);
  }

  part(client, name) {
    const channel = this.channels.get(name?.toLowerCase());
    if (!channel?.members.has(client)) return;
    this.broadcast(channel.members, `:${this.prefix(client)} PART ${channel.name}\r\n`);
    channel.members.delete(client);
    if (channel.members.size === 0) this.channels.delete(name.toLowerCase());
  }

  privmsg(client, cmd, target, text) {
    if (!client.registered || !target) return;
    if (!target.startsWith("#")) text = this.withAddress(client, text);
    const line = `:${this.prefix(client)} ${cmd} ${target} :${text}\r\n`;
    if (target.startsWith("#")) {
      const channel = this.channels.get(target.toLowerCase());
      if (!channel) return;
      for (const member of channel.members) if (member !== client) member.send(line);
      return;
    }
    const recipient = this.findNick(target);
    if (recipient?.registered) recipient.send(line);
    else this.reply(client, "401", `${target} :No such nick/channel`);
  }

  // "SMUS_GetIP 0 <ip>_<hex robot id>" and "Challenge 0 [..., #ip: <ip>, ...]".
  withAddress(client, text) {
    const address = client.address;
    if (!/^[\w.:-]+$/.test(address) || address === "0.0.0.0") return text;
    if (text.startsWith("SMUS_GetIP ")) {
      return text.replace(/^(SMUS_GetIP \S+ ).*_([0-9A-Fa-f]*)\s*$/, (_, head, id) => `${head}${address}_${id}`);
    }
    if (text.startsWith("Challenge ")) {
      return text.replace(/(#ip:\s*)("[^"]*"|[^,\]]*)/, (_, key) => `${key}"${address}"`);
    }
    return text;
  }

  names(client, name) {
    const channel = this.channels.get(name?.toLowerCase());
    const nicks = channel ? [...channel.members].map((c) => c.nick).join(" ") : "";
    this.reply(client, "353", `= ${channel?.name ?? name} :${nicks}`);
    this.reply(client, "366", `${channel?.name ?? name} :End of /NAMES list.`);
  }

  // The lobby polls "LIST #<prefix>*" for the user count of every room.
  list(client, filter) {
    this.reply(client, "321", "Channel :Users  Name");
    const masks = filter ? filter.split(",").filter(Boolean).map(maskPattern) : [/^/];
    for (const channel of this.channels.values()) {
      if (!masks.some((mask) => mask.test(channel.name))) continue;
      this.reply(client, "322", `${channel.name} ${channel.members.size} :`);
    }
    // Rooms the client asked for by name but nobody is in yet still need an entry.
    for (const name of filter ? filter.split(",") : []) {
      if (name && !/[*?]/.test(name) && !this.channels.has(name.toLowerCase())) {
        this.reply(client, "322", `${name} 0 :`);
      }
    }
    this.reply(client, "323", ":End of /LIST");
  }

  // The game sends LUSERS while checking a match opponent is still around
  // and reads the online count from 265.
  lusers(client) {
    const online = this.onlineCount();
    this.reply(client, "251", `:There are ${online} users and 0 invisible on 1 servers`);
    this.reply(client, "255", `:I have ${online} clients and 0 servers`);
    this.reply(client, "265", `:Current local users: ${online} max: ${this.maxUsers}`);
    this.reply(client, "266", `:Current global users: ${online} max: ${this.maxUsers}`);
  }

  ison(client, nicks) {
    const online = nicks.filter((n) => n && this.findNick(n)?.registered);
    this.reply(client, "303", `:${online.join(" ")}`);
  }

  quit(client, reason) {
    if (!this.clients.has(client)) return;
    this.clients.delete(client);
    const line = `:${this.prefix(client)} QUIT :${reason}\r\n`;
    const notified = new Set();
    for (const [key, channel] of this.channels) {
      if (!channel.members.delete(client)) continue;
      for (const member of channel.members) notified.add(member);
      if (channel.members.size === 0) this.channels.delete(key);
    }
    for (const member of notified) member.send(line);
    if (client.registered) this.log(`irc: ${client.nick} quit (${reason})`);
  }
}

function maskPattern(mask) {
  const escaped = mask.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}
