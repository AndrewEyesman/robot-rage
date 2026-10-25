// The player's own settings: switches for the port's improvements that change only what
// this browser shows, plays or remembers, never what the other player sees, what the two
// browsers send each other or what the server counts (one exception, said in the dialog:
// relay-only matches, which add the relay's lag for both players). They're kept in the browser
// (localStorage "rr-settings") and changed in game.html's Settings dialog
// (settings-panel.ts). A flag in the page's address (?layout=original, ?quirks=flame,
// ?touch=0, ...) still decides for that page, so links and the checks work as before.

const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const quirks = (query.get('quirks') ?? '').split(',');

/** A fix that ?quirks=name turns off: on unless the address lists it. */
const quirk = (name: string) => ({ default: true, address: () => (quirks.includes(name) ? false : undefined) });

const DEFS = {
  /** arenaView.wide: the arena's widescreen view (L switches it there). */
  wide: { default: true, address: () => (query.has('layout') ? query.get('layout') !== 'original' : undefined) },
  /** arenaView.smooth: the 3D view drawn at the display's rate. */
  smooth: { default: true, address: () => (query.has('smooth') ? query.get('smooth') !== '0' : undefined) },
  /** gameFixes.doorClose: screen doors slide all the way. */
  doors: quirk('doors'),
  /** arenaFixes.flameForward: the flame thrower's flames go the robot's way (looks only, the hit is the same). */
  flame: quirk('flame'),
  /** arenaFixes.ambient: the wind loop in matches. */
  ambient: { default: false, address: () => (query.has('ambient') ? query.get('ambient') === '1' : undefined) },
  /** arenaFixes.trainingRespawn: Training starts again after a crash. */
  respawn: quirk('pit'),
  /** gameFixes.keepLogin: a login kept in the browser. */
  keepLogin: quirk('keeplogin'),
  /** p2p.ts: matches over a direct WebRTC connection when they can (off: always through the relay, no IP shared). */
  direct: { default: true, address: () => (query.get('p2p') === 'relay' || query.get('p2p') === 'fail' ? false : undefined) },
  /** mobile.ts: touch mode on a touch device (auto), always or never; from the next page load. */
  touch: { default: 'auto' as 'auto' | 'on' | 'off', address: () => ({ '1': 'on' as const, '0': 'off' as const })[query.get('touch') ?? ''] },
};

type Defs = typeof DEFS;
export type SettingKey = keyof Defs;
export type SettingValue<K extends SettingKey> = Defs[K]['default'];

const STORE = 'rr-settings';

/** The player's choices (only those away from the default), read once as the page loads. */
const saved: Record<string, unknown> = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? '{}') as unknown;
    return s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
  } catch {
    return {};
  }
})();

/** Whether the page's address sets this one (the dialog shows it, but can't change it). */
export function setByAddress(k: SettingKey): boolean {
  return DEFS[k].address() !== undefined;
}

/** The player's choice, as saved (the default if none). */
export function savedSetting<K extends SettingKey>(k: K): SettingValue<K> {
  const v = saved[k];
  return (typeof v === typeof DEFS[k].default ? v : DEFS[k].default) as SettingValue<K>;
}

/** What applies on this page: the address's flag, else the player's choice. */
export function setting<K extends SettingKey>(k: K): SettingValue<K> {
  return (DEFS[k].address() ?? savedSetting(k)) as SettingValue<K>;
}

const listeners: { [K in SettingKey]?: ((v: SettingValue<K>) => void)[] } = {};

/** Run `f` with the new value when the player changes the setting (not when the address sets it). */
export function onSettingChange<K extends SettingKey>(k: K, f: (v: SettingValue<K>) => void) {
  ((listeners[k] ??= []) as ((v: SettingValue<K>) => void)[]).push(f);
}

/** Save the player's choice and apply it, unless the address sets this one for the page. */
export function changeSetting<K extends SettingKey>(k: K, v: SettingValue<K>) {
  if (v === DEFS[k].default) delete saved[k];
  else saved[k] = v;
  try {
    if (Object.keys(saved).length) localStorage.setItem(STORE, JSON.stringify(saved));
    else localStorage.removeItem(STORE);
  } catch {
    // Storage refused (a private window): the change holds for this page.
  }
  if (setByAddress(k)) return;
  for (const f of (listeners[k] ?? []) as ((v: SettingValue<K>) => void)[]) f(v);
}

/** Whether the player has changed any setting from its default. */
export function anySettingChanged(): boolean {
  return Object.keys(saved).some((k) => k in DEFS);
}

/** Every setting back to its default (applied as changeSetting does). */
export function resetSettings() {
  for (const k of Object.keys(DEFS) as SettingKey[]) if (k in saved) changeSetting(k, DEFS[k].default as never);
}
