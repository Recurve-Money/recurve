/**
 * Everything on one command and one address: http://localhost:8091 serves the
 * site, the dApp at /app and the docs at /docs (scripts/serve-site.mjs), and the
 * indexer comes up beside it with its Postgres.
 *
 * No process runner dependency: child processes, one prefixed stream, and one
 * Ctrl-C that takes all of them down. The indexer is optional. Without Docker
 * or api/.env the site still runs and the dApp only loses its equity chart and
 * risk panel. The runner is not here on purpose: it signs with the fund's agent
 * key, so it only ever runs when asked (`npm run dev:runner`).
 */

import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, resolve} from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8091;
const POSTGRES = "recurve-pg";

const WEB = {name: "web", color: 36, cmd: "node", args: ["scripts/serve-site.mjs", String(PORT), "site", "--app"], required: true};
const API = {name: "api", color: 33, cmd: "npm", args: ["run", "dev"], cwd: "api"};

const children = [];
let shuttingDown = false;

function paint(color, text) {
  return process.stdout.isTTY ? `\x1b[${color}m${text}\x1b[0m` : text;
}

function say(service, line) {
  console.log(`${paint(service.color, service.name)} │ ${line}`);
}

function pipe(service, stream) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) say(service, line);
    }
  });
}

function start(service) {
  // PORT is this server's, when a launcher sets it; the api keeps its own from api/.env.
  const {PORT: _, ...env} = process.env;
  const child = spawn(service.cmd, service.args, {cwd: resolve(ROOT, service.cwd ?? "."), env});
  children.push(child);
  pipe(service, child.stdout);
  pipe(service, child.stderr);
  child.on("exit", (code) => {
    if (shuttingDown) return;
    say(service, `exited (${code})`);
    if (service.required) shutdown(code ?? 1);
  });
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function docker(...args) {
  return new Promise((done) => {
    const child = spawn("docker", args, {stdio: "ignore"});
    child.on("error", () => done(false));
    child.on("exit", (code) => done(code === 0));
  });
}

async function until(check, seconds) {
  for (let i = 0; i < seconds && !shuttingDown; i++) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** The indexer's database: the recurve-pg container, started or created, ready for queries. */
async function postgres() {
  if (!(await docker("info"))) {
    if (process.platform === "darwin") spawn("open", ["-a", "Docker"], {stdio: "ignore"}).on("error", () => {});
    if (!(await until(() => docker("info"), 90))) return false;
  }
  const up =
    (await docker("start", POSTGRES)) ||
    (await docker("run", "-d", "--name", POSTGRES, "-e", "POSTGRES_PASSWORD=pw", "-e", "POSTGRES_DB=recurve", "-p", "55432:5432", "postgres:16-alpine"));
  return up && until(() => docker("exec", POSTGRES, "pg_isready", "-U", "postgres"), 30);
}

console.log(`
  site  http://localhost:${PORT}
  app   http://localhost:${PORT}/app
  docs  http://localhost:${PORT}/docs

  Ctrl-C stops everything.
`);

start(WEB);

if (!existsSync(resolve(ROOT, "api/.env"))) {
  say(API, "skipped: no api/.env (cp api/.env.example api/.env)");
} else if (await postgres()) {
  if (!shuttingDown) start(API);
} else if (!shuttingDown) {
  say(API, "skipped: Docker did not come up, so there is no Postgres. Everything else runs without it.");
}
