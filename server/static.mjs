// Static files for server/index.mjs: the built frontend, the extracted game assets and
// the old public/ directory. Every reply carries an ETag and Last-Modified (a matching
// conditional request gets a 304); text-like files go out as brotli or gzip,
// compressed once per file and kept in memory until the file changes.

import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, gzip, constants } from "node:zlib";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".map": "application/json",
  ".wasm": "application/wasm",
  ".dcr": "application/x-director",
  ".cct": "application/x-director",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

// Worth compressing: text, and the fonts and W3D meshes (.bin), which shrink to half
// or less. PNG, MP3 and WAV (short 8-bit samples) don't.
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".map", ".txt", ".svg", ".wasm", ".ttf", ".bin"]);
const MIN_COMPRESS = 1024;
// The compressed copies kept in memory, at most (the game's assets need about 4 MB).
const CACHE_LIMIT = 128 * 1024 * 1024;

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
const ENCODERS = {
  // Highest quality: each file is compressed once, off the main thread.
  br: (buf) => brotli(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }),
  gzip: (buf) => gzipAsync(buf, { level: 9 }),
};

/** path -> { tag, br?, gzip? }: compressed copies (promises of a Buffer, or null when not smaller). */
const cache = new Map();
let cached = 0;

function compressed(file, tag, encoding) {
  let entry = cache.get(file);
  if (entry?.tag !== tag) {
    if (entry) for (const e of Object.keys(ENCODERS)) entry[e]?.then((b) => (cached -= b?.length ?? 0));
    entry = { tag };
    cache.set(file, entry);
  }
  entry[encoding] ??= readFile(file)
    .then((raw) => ENCODERS[encoding](raw).then((out) => (out.length < raw.length ? out : null)))
    .then((out) => {
      // Over the limit: still sent, just not kept.
      if (out && cached + out.length > CACHE_LIMIT) delete entry[encoding];
      else cached += out?.length ?? 0;
      return out;
    })
    .catch(() => {
      // Gone since the stat: sent as it is (or not found) this time, tried again next.
      delete entry[encoding];
      return null;
    });
  return entry[encoding];
}

function acceptedEncoding(req) {
  const accepted = new Set();
  for (const part of String(req.headers["accept-encoding"] || "").split(",")) {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    if (!params.some((p) => /^\s*q=0(\.0*)?\s*$/.test(p))) accepted.add(name.trim());
  }
  return accepted.has("br") ? "br" : accepted.has("gzip") ? "gzip" : null;
}

function notModified(req, tag, mtime) {
  const inm = req.headers["if-none-match"];
  if (inm) return inm.split(",").some((t) => t.trim().replace(/^W\//, "") === tag.replace(/^W\//, "") || t.trim() === "*");
  const ims = Date.parse(req.headers["if-modified-since"] || "");
  return Number.isFinite(ims) && Math.floor(mtime.getTime() / 1000) * 1000 <= ims;
}

/** root + the URL path, or null when it isn't a path inside root. */
export function resolveIn(root, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (rel.includes("\0")) return null;
  const path = normalize(join(root, rel));
  return path === root || path.startsWith(root + sep) ? path : null;
}

/**
 * Send a file (for a directory, its index.html when `index` is set) with the given
 * Cache-Control; a 404 when there's none. GET and HEAD only.
 */
export async function sendFile(req, res, path, { cacheControl = "no-cache", index = false } = {}) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    return res.end("method not allowed");
  }
  let file = path;
  let st;
  try {
    st = await stat(file);
    if (st.isDirectory() && index) st = await stat((file = join(file, "index.html")));
    if (!st.isFile()) throw new Error("not a file");
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    return res.end("not found");
  }
  const ext = extname(file).toLowerCase();
  const tag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const canCompress = COMPRESSIBLE.has(ext) && st.size >= MIN_COMPRESS;
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": cacheControl,
    ETag: tag,
    "Last-Modified": st.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff",
  };
  if (canCompress) headers.Vary = "Accept-Encoding";
  if (notModified(req, tag, st.mtime)) {
    res.writeHead(304, headers);
    return res.end();
  }
  const encoding = canCompress ? acceptedEncoding(req) : null;
  const body = encoding ? await compressed(file, tag, encoding) : null;
  if (body) {
    res.writeHead(200, { ...headers, "Content-Encoding": encoding, "Content-Length": body.length });
    return res.end(req.method === "HEAD" ? undefined : body);
  }
  res.writeHead(200, { ...headers, "Content-Length": st.size });
  if (req.method === "HEAD") return res.end();
  createReadStream(file)
    .on("error", () => res.destroy())
    .pipe(res);
}
