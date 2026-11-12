/**
 * The site's server: the functions in site/api and a small in-process Upstash
 * Redis — the REST pipeline protocol — for the one that keeps state
 * (api/token.js, behind /admin), kept in one JSON file.
 *
 * Locally it is the whole website on one port: it also serves the static files
 * with clean URLs (the docs among them, at /docs), and with --app, /app is the
 * live dApp, Vite running inside this process with hot reload. The store is
 * .dev/site-kv.json at the repository root, and the admin password is
 * ADMIN_PASSWORD from the environment, else the first line of
 * ~/.config/recurve/admin-password.
 *
 * With --production it runs behind Caddy, which serves the static files
 * (deploy/caddy/Caddyfile). It then listens on every interface of its container,
 * keeps the store in SITE_KV_FILE, loads each function once, and holds a GET
 * answer marked s-maxage for that long, as a CDN would.
 *
 * Usage: node scripts/serve-site.mjs <port> <directory> [--app | --production]
 */

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {createRequire} from "node:module";
import {fileURLToPath, pathToFileURL} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

export async function startSiteServer({port, dir, kvFile, password, app = false, production = false, quiet = false}) {
  const site = path.resolve(ROOT, dir);
  const kept = new Map();
  const kvToken = crypto.randomBytes(16).toString("hex");
  const store = new Store(kvFile);
  const log = quiet ? () => {} : (line) => process.stderr.write(line + "\n");

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (vite && url.pathname === "/app") {
      res.writeHead(302, {Location: "/app/" + url.search});
      return res.end();
    }
    if (vite && url.pathname.startsWith("/app/")) return vite.middlewares(req, res);
    try {
      if (url.pathname === "/__kv/pipeline" && req.method === "POST") {
        if (req.headers.authorization !== `Bearer ${kvToken}`) return send(res, 401, {error: "unauthorized"});
        const commands = JSON.parse((await readBody(req)) || "[]");
        return send(res, 200, commands.map((c) => store.run(c)));
      }
      if (url.pathname.startsWith("/api/")) return await runFunction(site, url, req, res, production ? kept : null);
      return serveFile(site, url.pathname, res);
    } catch (err) {
      log(`${req.method} ${url.pathname} failed: ${err.stack || err}`);
      if (!res.headersSent) send(res, 500, {error: "dev server error"});
    } finally {
      log(`${req.method} ${url.pathname} ${res.statusCode}`);
    }
  });

  const vite = app ? await startVite(server) : null;

  return new Promise((resolve) => {
    server.listen(port, production ? "0.0.0.0" : "127.0.0.1", () => {
      const actual = server.address().port;
      // The function reads these per request, like it reads Vercel's.
      process.env.KV_REST_API_URL = `http://127.0.0.1:${actual}/__kv`;
      process.env.KV_REST_API_TOKEN = kvToken;
      if (password) process.env.ADMIN_PASSWORD = password;
      resolve({
        server,
        port: actual,
        close: async () => {
          await vite?.close();
          await new Promise((r) => server.close(r));
        },
      });
    });
  });
}

/** Vite from app/node_modules, as middleware, with hot reload on the site's own server. */
async function startVite(server) {
  const root = path.join(ROOT, "app");
  const {createServer} = await import(pathToFileURL(path.join(root, "node_modules/vite/dist/node/index.js")).href);
  return createServer({root, server: {middlewareMode: true, hmr: {server}}});
}

// ---------------------------------------------------------------- functions

async function runFunction(site, url, req, res, kept) {
  const name = url.pathname.slice("/api/".length);
  const file = path.join(site, "api", `${name}.js`);
  if (!/^[a-z0-9-]+$/.test(name) || !fs.existsSync(file)) return send(res, 404, {error: "no such function"});

  if (kept && req.method === "GET") {
    const hit = kept.get(name);
    if (hit && hit.until > Date.now()) {
      res.writeHead(200, hit.headers);
      return res.end(hit.body);
    }
    keepAnswer(res, name, kept);
  }

  // Locally, fresh on every request, so an edit shows on reload.
  if (!kept) delete require.cache[require.resolve(file)];
  const handler = require(file);

  const raw = await readBody(req);
  req.query = Object.fromEntries(url.searchParams);
  req.body = raw;
  if (raw && String(req.headers["content-type"] || "").includes("application/json")) {
    try {
      req.body = JSON.parse(raw);
    } catch {
      return send(res, 400, {error: "invalid JSON"});
    }
  }
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (obj) => {
    if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (body) => (res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)), res);
  await handler(req, res);
}

/** Remembers this answer if it says a shared cache may. */
function keepAnswer(res, name, kept) {
  const end = res.end;
  res.end = function (body, ...rest) {
    const age = /s-maxage=(\d+)/.exec(String(res.getHeader("Cache-Control") ?? ""));
    if (age && res.statusCode === 200) {
      kept.set(name, {until: Date.now() + Number(age[1]) * 1000, headers: res.getHeaders(), body});
    }
    return end.call(res, body, ...rest);
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 1_000_000) reject(new Error("body too large"));
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------- static

function serveFile(site, pathname, res) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, "bad path");
  }
  let full = path.join(site, rel);
  if (full !== site && !full.startsWith(site + path.sep)) return send(res, 404, "not found");
  if (rel.endsWith("/") || isFile(path.join(full, "index.html"))) full = path.join(full, "index.html");
  else if (!isFile(full) && isFile(full + ".html")) full += ".html";
  if (!isFile(full)) return send(res, 404, "not found");

  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(full).toLowerCase()] || "application/octet-stream",
    // Dev server: an edit should show on reload, not after a cache purge.
    "Cache-Control": "no-store",
  });
  fs.createReadStream(full).pipe(res);
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function send(res, code, body) {
  const json = typeof body !== "string";
  res.writeHead(code, {"Content-Type": json ? "application/json; charset=utf-8" : "text/plain; charset=utf-8", "Cache-Control": "no-store"});
  res.end(json ? JSON.stringify(body) : body);
}

// ---------------------------------------------------------------- store

/** The handful of Redis commands api/token.js uses, with Upstash's answers. */
class Store {
  constructor(file) {
    this.file = file;
    this.data = {};
    if (file && fs.existsSync(file)) this.data = JSON.parse(fs.readFileSync(file, "utf8"));
  }

  live(key) {
    const e = this.data[key];
    if (e && e.exp !== null && e.exp <= Date.now()) delete this.data[key];
    return this.data[key];
  }

  save() {
    if (!this.file) return;
    // Limits expire, so the file does not grow with every address that ever tried.
    for (const key of Object.keys(this.data)) this.live(key);
    fs.mkdirSync(path.dirname(this.file), {recursive: true});
    // A crash mid-write must not cost the published address.
    const next = `${this.file}.next`;
    fs.writeFileSync(next, JSON.stringify(this.data, null, 2) + "\n");
    fs.renameSync(next, this.file);
  }

  run([cmd, key, ...args]) {
    try {
      const result = this.command(String(cmd).toUpperCase(), key, args.map(String));
      return {result};
    } catch (err) {
      return {error: err.message};
    }
  }

  command(cmd, key, args) {
    const e = this.live(key);
    switch (cmd) {
      case "GET":
        if (e && Array.isArray(e.v)) throw new Error("WRONGTYPE");
        return e ? e.v : null;
      case "SET": {
        let exp = null;
        const ex = args.findIndex((a) => a.toUpperCase() === "EX");
        if (ex !== -1) exp = Date.now() + Number(args[ex + 1]) * 1000;
        if (args.some((a) => a.toUpperCase() === "NX") && e) return null;
        this.data[key] = {v: args[0], exp};
        this.save();
        return "OK";
      }
      case "DEL":
        if (!e) return 0;
        delete this.data[key];
        this.save();
        return 1;
      case "INCR":
      case "DECR": {
        const n = e ? Number(e.v) : 0;
        if (!Number.isInteger(n)) throw new Error("ERR value is not an integer or out of range");
        const next = n + (cmd === "INCR" ? 1 : -1);
        this.data[key] = {v: String(next), exp: e ? e.exp : null};
        this.save();
        return next;
      }
      case "EXPIRE":
        if (!e) return 0;
        e.exp = Date.now() + Number(args[0]) * 1000;
        this.save();
        return 1;
      case "TTL":
        if (!e) return -2;
        return e.exp === null ? -1 : Math.ceil((e.exp - Date.now()) / 1000);
      case "LPUSH": {
        const list = e ? e.v : [];
        if (!Array.isArray(list)) throw new Error("WRONGTYPE");
        list.unshift(...args.reverse());
        this.data[key] = {v: list, exp: e ? e.exp : null};
        this.save();
        return list.length;
      }
      case "LTRIM":
      case "LRANGE": {
        const list = e ? e.v : [];
        if (!Array.isArray(list)) throw new Error("WRONGTYPE");
        const at = (i) => (i < 0 ? list.length + i : i);
        const slice = list.slice(Math.max(0, at(Number(args[0]))), at(Number(args[1])) + 1);
        if (cmd === "LRANGE") return slice;
        this.data[key] = {v: slice, exp: e ? e.exp : null};
        this.save();
        return "OK";
      }
      default:
        throw new Error(`ERR unknown command '${cmd}'`);
    }
  }
}

// ---------------------------------------------------------------- cli

function adminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  try {
    return fs.readFileSync(path.join(os.homedir(), ".config/recurve/admin-password"), "utf8").split("\n")[0].trim() || null;
  } catch {
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [portArg, dir, flag] = process.argv.slice(2);
  if (!portArg || !dir || (flag && flag !== "--app" && flag !== "--production")) {
    console.error("Usage: node scripts/serve-site.mjs <port> <directory> [--app | --production]");
    process.exit(2);
  }
  const port = Number(portArg);
  const password = adminPassword();
  const production = flag === "--production";
  const kvFile = production ? process.env.SITE_KV_FILE : path.join(ROOT, ".dev/site-kv.json");
  await startSiteServer({port, dir, kvFile, password, app: flag === "--app", production, quiet: production});
  console.log(`${dir} on http://localhost:${port}` + (password ? "" : "  (no admin password: /admin will refuse)"));
}
