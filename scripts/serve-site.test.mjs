/**
 * site/api/token.js through the local server, against a fake Robinhood Chain
 * RPC: the public read, every admin action, and the password limits.
 *
 *     node --test scripts/serve-site.test.mjs
 */

import {test, before, after} from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import {startSiteServer} from "./serve-site.mjs";

const PASSWORD = "correct horse";
const TOKEN = "0x7DBF38976F6D3B9C529E7D9484A71898B409EE6A";
const EMPTY = "0x000000000000000000000000000000000000dEaD";
const PONS_V2 = "7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";

let site, rpc, base, dir;

function abiString(s) {
  const hex = Buffer.from(s, "utf8").toString("hex");
  const word = (n) => n.toString(16).padStart(64, "0");
  return "0x" + word(32) + word(s.length) + hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
}

const CALLS = {
  "0x06fdde03": abiString("Test Token"),
  "0x95d89b41": abiString("TT"),
  "0x313ce567": "0x" + (18).toString(16).padStart(64, "0"),
  "0x18160ddd": "0x" + (10n ** 27n).toString(16).padStart(64, "0"),
  "0x536dac9b": "0x" + PONS_V2.padStart(64, "0"),
};

// A launched fund, as the server reads it back from chain.
const FUND = {
  vault: "0x" + "a1".repeat(20),
  governor: "0x" + "a2".repeat(20),
  registry: "0x" + "a3".repeat(20),
  strategy: "0x" + "a4".repeat(20),
  treasury: "0x" + "a5".repeat(20),
  agent: "0x" + "a6".repeat(20),
  deployer: "0x" + "a7".repeat(20),
};
const word = (address) => "0x" + address.slice(2).padStart(64, "0");
const READS = {
  [`${FUND.vault}0x0c340a24`]: word(FUND.governor),
  [`${FUND.registry}0x0c340a24`]: word(FUND.governor),
  [`${FUND.registry}0x51ed6a30`]: word(TOKEN.toLowerCase()),
  [`${FUND.registry}0x8da5cb5b`]: word(FUND.treasury),
  [`${FUND.governor}0xfbfa77cf`]: word(FUND.vault),
  [`${FUND.governor}0x01b4314e`]: word(FUND.registry),
  [`${FUND.governor}0x46904840`]: word(FUND.treasury),
  [`${FUND.governor}0xf911366a`]: word(FUND.treasury),
  [`${FUND.strategy}0xfbfa77cf`]: word(FUND.vault),
  [`${FUND.strategy}0x0c340a24`]: word(FUND.governor),
  [`${FUND.governor}0x1ffbb064${FUND.agent.slice(2).padStart(64, "0")}`]: "0x" + "1".padStart(64, "0"),
};

const DEPLOYMENT = {
  deployer: FUND.deployer,
  RecurveToken: TOKEN,
  treasury: FUND.treasury,
  agent: FUND.agent,
  vaults: [{
    WatcherRegistry: FUND.registry,
    RecurveVault: FUND.vault,
    RecurveGovernor: FUND.governor,
    PortfolioStrategy: FUND.strategy,
    deployBlock: 105000000,
  }],
};

function fakeRpc(req, res) {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const out = JSON.parse(body).map(({id, method, params}) => {
      const read = READS[`${params[0].to}${params[0].data}`];
      if (read) return {jsonrpc: "2.0", id, result: read};
      const known = String(params[0].to || params[0]).toLowerCase() === TOKEN.toLowerCase();
      if (method === "eth_getCode") return {jsonrpc: "2.0", id, result: known ? "0x6080604052" : "0x"};
      if (known && CALLS[params[0].data]) return {jsonrpc: "2.0", id, result: CALLS[params[0].data]};
      return {jsonrpc: "2.0", id, error: {code: -32000, message: "execution reverted"}};
    });
    res.writeHead(200, {"Content-Type": "application/json"});
    res.end(JSON.stringify(out));
  });
}

before(async () => {
  rpc = http.createServer(fakeRpc);
  await new Promise((r) => rpc.listen(0, "127.0.0.1", r));
  process.env.RPC_URL = `http://127.0.0.1:${rpc.address().port}`;

  dir = fs.mkdtempSync(path.join(os.tmpdir(), "recurve-site-"));
  site = await startSiteServer({port: 0, dir: "site", kvFile: path.join(dir, "kv.json"), password: PASSWORD, quiet: true});
  base = `http://127.0.0.1:${site.port}`;
});

after(async () => {
  await site.close();
  await new Promise((r) => rpc.close(r));
  fs.rmSync(dir, {recursive: true, force: true});
});

const read = () => fetch(`${base}/api/token`).then(async (r) => ({status: r.status, headers: r.headers, body: await r.json()}));
const admin = (body) =>
  fetch(`${base}/api/token`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)}).then(
    async (r) => ({status: r.status, body: await r.json()}),
  );

test("nothing is published at first, and anyone may read that", async () => {
  const r = await read();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, {address: null});
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
});

test("the right password opens the admin, a missing one does not", async () => {
  assert.equal((await admin({action: "status"})).status, 401);
  const ok = await admin({action: "status", password: PASSWORD});
  assert.equal(ok.status, 200);
  assert.equal(ok.body.env, "local");
  assert.equal(ok.body.token, null);
  assert.deepEqual(ok.body.history, []);
});

test("inspect reads the contract from chain", async () => {
  const bad = await admin({action: "inspect", address: "0x123", password: PASSWORD});
  assert.equal(bad.status, 400);

  const r = await admin({action: "inspect", address: TOKEN, password: PASSWORD});
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.token, {
    address: TOKEN.toLowerCase(),
    contract: true,
    name: "Test Token",
    symbol: "TT",
    decimals: 18,
    totalSupply: "1,000,000,000",
    factory: "0x" + PONS_V2,
    ponsV2: true,
  });
});

test("publish refuses an address with no contract", async () => {
  const r = await admin({action: "publish", address: EMPTY, password: PASSWORD});
  assert.equal(r.status, 400);
  assert.match(r.body.error, /No contract/);
  assert.deepEqual((await read()).body, {address: null});
});

test("publish, then take down: the public read follows, history records both", async () => {
  const pub = await admin({action: "publish", address: TOKEN, test: true, password: PASSWORD});
  assert.equal(pub.status, 200);
  assert.equal(pub.body.token.test, true);

  const shown = (await read()).body;
  assert.equal(shown.address, TOKEN.toLowerCase());
  assert.equal(shown.test, true);
  assert.equal(shown.symbol, "TT");

  const gone = await admin({action: "remove", password: PASSWORD});
  assert.equal(gone.status, 200);
  assert.equal(gone.body.token, null);
  assert.deepEqual((await read()).body, {address: null});
  assert.deepEqual(
    gone.body.history.map((h) => [h.action, h.address, h.test]),
    [
      ["remove", TOKEN.toLowerCase(), true],
      ["publish", TOKEN.toLowerCase(), true],
    ],
  );
});

test("test is only true when asked for", async () => {
  const pub = await admin({action: "publish", address: TOKEN, test: "yes", password: PASSWORD});
  assert.equal(pub.body.token.test, false);
  await admin({action: "remove", password: PASSWORD});
});

test("a launch draft survives between visits, and only the password reads it", async () => {
  assert.equal((await admin({action: "launch-save", draft: {step: 1}})).status, 401);
  assert.equal((await admin({action: "launch-save", password: PASSWORD})).status, 400);

  assert.equal((await admin({action: "launch-save", draft: {addresses: {registry: FUND.registry}}, password: PASSWORD})).status, 200);
  const status = await admin({action: "status", password: PASSWORD});
  assert.deepEqual(status.body.launch, {addresses: {registry: FUND.registry}});
  assert.equal(status.body.deployment, null);
  assert.equal("launch" in (await read()).body, false);

  assert.equal((await admin({action: "launch-reset", password: PASSWORD})).body.launch, null);
  assert.equal((await admin({action: "status", password: PASSWORD})).body.launch, null);
});

test("a deployment goes public only once it checks out on chain, and only once", async () => {
  const publish = (deployment = DEPLOYMENT) => admin({action: "launch-publish", deployment, password: PASSWORD});

  assert.match((await publish()).body.error, /real \$RECURVE/);
  await admin({action: "publish", address: TOKEN, test: true, password: PASSWORD});
  assert.match((await publish()).body.error, /real \$RECURVE/, "a test token does not count");
  await admin({action: "publish", address: TOKEN, password: PASSWORD});

  assert.equal((await publish({...DEPLOYMENT, treasury: "not an address"})).status, 400);
  assert.equal((await publish({...DEPLOYMENT, vaults: []})).status, 400);

  const saved = READS[`${FUND.governor}0xf911366a`];
  READS[`${FUND.governor}0xf911366a`] = word(FUND.deployer);
  const early = await publish();
  assert.equal(early.status, 400);
  assert.match(early.body.error, /the agent admin/);
  READS[`${FUND.governor}0xf911366a`] = saved;

  await admin({action: "launch-save", draft: {left: "over"}, password: PASSWORD});
  const done = await publish({...DEPLOYMENT, extra: "<script>"});
  assert.equal(done.status, 200);
  assert.equal(done.body.deployment.vaults[0].RecurveVault, FUND.vault);
  assert.equal(done.body.deployment.extra, undefined);
  assert.equal(done.body.deployment.chainId, 4663);
  assert.deepEqual(done.body.history[0].action, "launch");

  const shown = (await read()).body;
  assert.equal(shown.deployment.vaults[0].deployBlock, 105000000);
  assert.equal(shown.address, TOKEN.toLowerCase());

  const status = await admin({action: "status", password: PASSWORD});
  assert.equal(status.body.launch, null);

  assert.equal((await publish()).status, 409, "a published fund cannot be swapped");
  assert.equal((await admin({action: "launch-save", draft: {x: 1}, password: PASSWORD})).status, 409);
  assert.equal((await admin({action: "launch-reset", password: PASSWORD})).status, 409);
  await admin({action: "remove", password: PASSWORD});
});

test("twenty failures an hour hold back strangers, not an address the right password has come from", async () => {
  const from = (address, password) =>
    fetch(`${base}/api/token`, {
      method: "POST",
      headers: {"Content-Type": "application/json", "X-Forwarded-For": address},
      body: JSON.stringify({action: "status", password}),
    }).then((r) => r.status);

  assert.equal(await from("203.0.113.1", PASSWORD), 200, "the owner, once, before anyone starts guessing");
  await Promise.all(Array.from({length: 20}, (_, i) => from(`198.51.100.${i}`, "guess")));
  assert.equal(await from("198.51.100.200", PASSWORD), 429, "an address never seen waits, right password or not");
  assert.equal(await from("203.0.113.1", PASSWORD), 200, "the owner's address does not");
});

// Last: it locks this address out for fifteen minutes.
test("five tries per address, then even the right password waits", async () => {
  for (let i = 0; i < 5; i++) assert.equal((await admin({action: "status", password: "guess" + i})).status, 401);
  const locked = await admin({action: "status", password: PASSWORD});
  assert.equal(locked.status, 429);
});

test("in production a GET marked s-maxage is kept that long, and the store survives a restart", async () => {
  const kvFile = path.join(dir, "production-kv.json");
  const start = () => startSiteServer({port: 0, dir: "site", kvFile, password: PASSWORD, production: true, quiet: true});
  let live = await start();
  const url = () => `http://127.0.0.1:${live.port}/api/token`;
  const post = (body) => fetch(url(), {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  const shown = async () => (await (await fetch(url())).json()).address;

  assert.equal((await post({action: "publish", address: TOKEN, password: PASSWORD})).status, 200);
  assert.equal(await shown(), TOKEN.toLowerCase());

  await post({action: "remove", password: PASSWORD});
  assert.equal(await shown(), TOKEN.toLowerCase(), "the answer stays for its s-maxage");

  await post({action: "publish", address: TOKEN, password: PASSWORD});
  await live.close();
  live = await start();
  assert.equal(await shown(), TOKEN.toLowerCase());
  await live.close();
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".next")), []);
});

test("a fund can go public before its token, and the token attaches once, when the chain shows it", async () => {
  const kvFile = path.join(dir, "late-kv.json");
  const live = await startSiteServer({port: 0, dir: "site", kvFile, password: PASSWORD, quiet: true});
  const url = `http://127.0.0.1:${live.port}/api/token`;
  const post = async (body) => {
    const res = await fetch(url, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({password: PASSWORD, ...body})});
    return {status: res.status, body: await res.json()};
  };
  const shown = async () => (await fetch(url)).json();

  const saved = {...READS};
  READS[`${FUND.registry}0x51ed6a30`] = word("0x" + "0".repeat(40));
  READS[`${FUND.registry}0x8da5cb5b`] = word(FUND.deployer);

  assert.equal((await post({action: "launch-attach"})).status, 400, "nothing to attach to yet");

  const published = await post({action: "launch-publish", deployment: {...DEPLOYMENT, RecurveToken: ""}});
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.equal((await shown()).deployment.RecurveToken, "");
  assert.equal((await shown()).address, null);

  assert.match((await post({action: "launch-attach"})).body.error, /real \$RECURVE/);
  await post({action: "publish", address: TOKEN, test: true});
  assert.match((await post({action: "launch-attach"})).body.error, /real \$RECURVE/, "a test token never attaches");
  await post({action: "publish", address: TOKEN});

  const early = await post({action: "launch-attach"});
  assert.equal(early.status, 400);
  assert.match(early.body.error, /stake token/);

  READS[`${FUND.registry}0x51ed6a30`] = saved[`${FUND.registry}0x51ed6a30`];
  const half = await post({action: "launch-attach"});
  assert.match(half.body.error, /owner/, "the Safe has to hold the registry too");

  READS[`${FUND.registry}0x8da5cb5b`] = saved[`${FUND.registry}0x8da5cb5b`];
  const done = await post({action: "launch-attach"});
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.deployment.RecurveToken, TOKEN.toLowerCase());
  assert.equal(done.body.history[0].action, "attach");
  assert.equal((await shown()).deployment.RecurveToken, TOKEN.toLowerCase());
  assert.equal((await shown()).deployment.vaults[0].RecurveVault, FUND.vault, "the addresses did not move");

  assert.equal((await post({action: "launch-attach"})).status, 409);
  const other = await post({action: "publish", address: EMPTY});
  assert.equal(other.status, 409, "the site cannot show a token the registry does not take");
  assert.equal((await post({action: "publish", address: TOKEN})).status, 200);

  await live.close();
});

test("the docs live at /docs and every link inside them lands", async () => {
  assert.equal((await fetch(`${base}/docs`)).status, 200);

  const dir = new URL("../site/docs/", import.meta.url);
  const pages = fs.readdirSync(dir).filter((f) => f.endsWith(".html"));
  assert.ok(pages.length >= 18);

  const links = new Set();
  for (const page of pages) {
    const html = fs.readFileSync(new URL(page, dir), "utf8");
    for (const [, href] of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) links.add(href);
  }
  links.delete("/app"); // exists after `npm run build:app`
  for (const link of links) assert.equal((await fetch(`${base}${link}`)).status, 200, link);
});

test("the static site is served with clean URLs and nothing outside it", async () => {
  assert.equal((await fetch(`${base}/admin`)).status, 200);
  assert.equal((await fetch(`${base}/zh/`)).status, 200);
  assert.equal((await fetch(`${base}/zh`)).status, 200);
  assert.equal((await fetch(`${base}/%2e%2e/package.json`)).status, 404);
});

// What the pages claim follows the server: nothing is said about the token until it has answered.

const page = (name) => fs.readFileSync(new URL(`../site/${name}.html`, import.meta.url), "utf8");
const STATS = fs.readFileSync(new URL("../site/token-stats.js", import.meta.url), "utf8");

/** Runs token-stats.js over a page's real tags and returns the data-when values left showing. */
async function showing(name, answer) {
  const tags = [...page(name).matchAll(/<\w+\b[^>]*\sdata-when="([\w-]+)"[^>]*>/g)];
  const els = tags.map(([tag, when]) => ({hidden: /\shidden[\s>]/.test(tag), getAttribute: () => when}));

  vm.runInNewContext(STATS, {
    document: {
      documentElement: {lang: "en"},
      getElementById: () => null,
      addEventListener() {},
      querySelectorAll: (selector) => (selector === "[data-when]" ? els : []),
    },
    window: {addEventListener() {}},
    setInterval() {},
    fetch: async (url) => {
      if (url !== "/api/token") return {ok: true, json: async () => ({pairs: []})};
      if (answer === null) throw new Error("no server");
      return {ok: answer !== 500, json: async () => answer};
    },
  });
  await new Promise((done) => setTimeout(done, 20));

  return [...new Set(els.filter((el) => !el.hidden).map((el) => el.getAttribute()))].sort();
}

test("the pages say what has happened, and nothing while the server is silent", async () => {
  const attached = {RecurveToken: TOKEN};
  const stages = [
    ["nothing yet", {address: null}, ["no-staking", "no-token"]],
    ["the fund, no token", {address: null, deployment: {RecurveToken: ""}}, ["no-staking", "no-token"]],
    ["a test address", {address: TOKEN, test: true}, ["no-staking", "token"]],
    ["the token, not attached", {address: TOKEN, deployment: {RecurveToken: ""}}, ["no-staking", "token"]],
    ["the token, attached", {address: TOKEN, deployment: attached}, ["staking", "token"]],
    ["a failing server", 500, []],
    ["no server", null, []],
  ];
  for (const [stage, answer, expected] of stages) {
    assert.deepEqual(await showing("token", answer), expected, stage);
  }

  // The other two pages only carry part of the set.
  assert.deepEqual(await showing("buy", {address: null}), ["no-token"]);
  assert.deepEqual(await showing("buy", {address: TOKEN}), ["token"]);
  assert.deepEqual(await showing("watchers", {address: TOKEN}), ["no-staking"]);
  assert.deepEqual(await showing("watchers", {address: TOKEN, deployment: attached}), []);
});

test("no page claims the token is out unless the server said so", () => {
  const claims = /is live on|It trades on|Launched on Pons|Staking is open|Buy on Pons|Price and chart|Dexscreener<|Live · /;
  let seen = 0;

  for (const name of ["index", "product", "token", "buy", "watchers"]) {
    const html = page(name);
    for (const [tag] of html.matchAll(/<\w+\b[^>]*\sdata-when=[^>]*>/g)) {
      assert.match(tag, /\shidden[\s>]/, `starts visible on ${name}: ${tag}`);
    }
    for (const line of html.split("\n").filter((l) => claims.test(l))) {
      assert.match(line, /data-when="(token|staking)" hidden/, `${name}: ${line.trim()}`);
      seen += 1;
    }
  }
  assert.ok(seen >= 7);
});
