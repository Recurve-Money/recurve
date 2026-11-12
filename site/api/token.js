// The $RECURVE contract address the site shows.
//
// GET is public: token-stats.js asks it on every page which token to show.
// POST is the /admin page: with ADMIN_PASSWORD it can check an address on
// chain, publish it, or take it down. The address lives in a store that speaks
// Upstash Redis's REST protocol (KV_REST_API_URL, KV_REST_API_TOKEN):
// scripts/serve-site.mjs keeps one in a file, on the server and on localhost
// alike, so this file runs the same way in both places.
//
// The same password keeps the fund's launch (site/launch.js): the draft, so a
// launch survives a closed tab, and the published deployment, which the public
// read carries so the app goes live without a rebuild.
//
// Whoever can change these decides which token visitors buy and which vault they
// deposit into, so a wrong password is expensive: five tries per address per
// fifteen minutes and twenty failures in total per hour, counted before the
// password is compared. A deployment is checked on chain and can be published
// once; changing it takes access to the server. A fund launched before its token
// gets that one field filled in later, when the chain shows the token attached.
//
// Everything is in this one file on purpose: helpers imported from elsewhere
// in api/ are easy to lose from a function bundle.

const crypto = require("node:crypto");

const RPC_URL = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const PONS_V2_FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";

// A preview deployment keeps its own address, so testing there never shows
// anything on production.
const ENV = process.env.SITE_ENV || process.env.VERCEL_ENV || "local";
const KEY = `recurve:site:${ENV}`;

const IP_TRIES = {max: 5, ttl: 15 * 60};
const ALL_FAILURES = {max: 20, ttl: 60 * 60};
/** How long an address the right password came from stays exempt from ALL_FAILURES. */
const KNOWN_TTL = 30 * 24 * 60 * 60;
const HISTORY = 20;

const SELECTOR = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
  launchFactory: "0x536dac9b", // Pons tokens: the factory that created them
};

const VIEW = {
  governor: "0x0c340a24",
  vault: "0xfbfa77cf",
  watchers: "0x01b4314e",
  stakeToken: "0x51ed6a30",
  feeRecipient: "0x46904840",
  agentAdmin: "0xf911366a",
  owner: "0x8da5cb5b",
  isAgent: "0x1ffbb064",
};

module.exports = async (req, res) => {
  if (req.method === "GET") return read(req, res);
  if (req.method === "POST") return admin(req, res);
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({error: "Method not allowed."});
};

// ---------------------------------------------------------------- public read

async function read(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!kvConfig()) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({address: null});
  }
  try {
    const [token, deployment] = await Promise.all([current(), published()]);
    // A short cache: a publish reaches every visitor within half a minute.
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=20, stale-while-revalidate=10");
    const view = token ? publicView(token) : {address: null};
    return res.status(200).json(deployment ? {...view, deployment} : view);
  } catch {
    // Storage unreachable: no answer beats a stale one. The page falls back
    // to its not-launched state.
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({error: "Storage unavailable."});
  }
}

function publicView(t) {
  return {address: t.address, test: t.test, name: t.name, symbol: t.symbol, updatedAt: t.updatedAt};
}

// ---------------------------------------------------------------- admin

async function admin(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(503).json({error: "ADMIN_PASSWORD is not set on the server."});
  if (!kvConfig()) {
    return res.status(503).json({error: "Storage is not connected: add Upstash Redis to the Vercel project (Storage tab)."});
  }

  const body = parseBody(req.body);

  try {
    // Count the try before looking at the password, so parallel guesses
    // cannot slip past the limit.
    const ip = hashHex(clientIp(req)).slice(0, 16);
    const ipKey = `${KEY}:tries:${ip}`;
    const knownKey = `${KEY}:known:${ip}`;
    const failKey = `${KEY}:failures`;
    const [tries, ipTtl, failures, known] = await kv([["INCR", ipKey], ["TTL", ipKey], ["GET", failKey], ["GET", knownKey]]);
    if (ipTtl === -1) await kv([["EXPIRE", ipKey, String(IP_TRIES.ttl)]]);
    // The limit on all failures stops guessing from many addresses at once.
    // Alone it would also let anyone shut the owner out, with twenty wrong
    // guesses an hour, so it does not hold back an address the right password
    // has already come from. That address still has its own five tries.
    if (tries > IP_TRIES.max || (!known && Number(failures || 0) >= ALL_FAILURES.max)) {
      return res.status(429).json({error: "Too many attempts. Try again later."});
    }

    if (!passwordMatches(body.password, expected)) {
      const [, failTtl] = await kv([["INCR", failKey], ["TTL", failKey]]);
      if (failTtl === -1) await kv([["EXPIRE", failKey, String(ALL_FAILURES.ttl)]]);
      await sleep(700);
      return res.status(401).json({error: "Wrong password."});
    }
    await kv([["DEL", ipKey], ["SET", knownKey, "1"], ["EXPIRE", knownKey, String(KNOWN_TTL)]]);

    switch (body.action) {
      case "status":
        return res.status(200).json({
          env: ENV,
          token: await current(),
          history: await history(),
          launch: await draft(),
          deployment: await published(),
        });

      case "inspect": {
        const address = normalize(body.address);
        if (!address) return res.status(400).json({error: "That is not a contract address (0x and 40 hex characters)."});
        return res.status(200).json({token: await inspect(address)});
      }

      case "publish": {
        const address = normalize(body.address);
        if (!address) return res.status(400).json({error: "That is not a contract address (0x and 40 hex characters)."});
        const fund = await published();
        if (fund?.RecurveToken && fund.RecurveToken !== address) {
          return res.status(409).json({error: `The fund's registry takes ${fund.RecurveToken}, for good. The site cannot show another token.`});
        }
        const info = await inspect(address);
        if (!info.contract) return res.status(400).json({error: "No contract at this address on Robinhood Chain mainnet."});
        if (info.decimals === null) return res.status(400).json({error: "This contract does not answer decimals(): not an ERC-20 token."});

        const token = {...info, test: body.test === true, updatedAt: new Date().toISOString()};
        await kv([
          ["SET", `${KEY}:token`, JSON.stringify(token)],
          ["LPUSH", `${KEY}:history`, JSON.stringify(entry("publish", token))],
          ["LTRIM", `${KEY}:history`, "0", String(HISTORY - 1)],
        ]);
        return res.status(200).json({env: ENV, token, history: await history()});
      }

      case "remove": {
        const previous = await current();
        if (previous) {
          await kv([
            ["DEL", `${KEY}:token`],
            ["LPUSH", `${KEY}:history`, JSON.stringify(entry("remove", previous))],
            ["LTRIM", `${KEY}:history`, "0", String(HISTORY - 1)],
          ]);
        }
        return res.status(200).json({env: ENV, token: null, history: await history()});
      }

      case "launch-save": {
        if (await published()) return res.status(409).json({error: "The fund is already published."});
        const text = JSON.stringify(body.draft ?? null);
        if (!body.draft || typeof body.draft !== "object" || text.length > 20_000) {
          return res.status(400).json({error: "That is not a launch draft."});
        }
        await kv([["SET", `${KEY}:launch`, text]]);
        return res.status(200).json({saved: true});
      }

      case "launch-reset":
        if (await published()) return res.status(409).json({error: "The fund is already published."});
        await kv([["DEL", `${KEY}:launch`]]);
        return res.status(200).json({launch: null});

      case "launch-publish": {
        const deployment = cleanDeployment(body.deployment);
        if (!deployment) return res.status(400).json({error: "That is not a complete deployment."});

        const token = await current();
        if (deployment.RecurveToken && (!token || token.test || token.address !== deployment.RecurveToken)) {
          return res.status(400).json({error: "Publish the real $RECURVE first."});
        }
        const wrong = await verifyDeployment(deployment);
        if (wrong.length) return res.status(400).json({error: `Not ready on chain: ${wrong.join(", ")}.`});

        // NX: nobody, password or not, swaps the fund's addresses after this.
        const [stored] = await kv([["SET", `${KEY}:deployment`, JSON.stringify(deployment), "NX"]]);
        if (stored === null) return res.status(409).json({error: "A deployment is already published."});
        const vault = deployment.vaults[0];
        await kv([
          ["DEL", `${KEY}:launch`],
          ["LPUSH", `${KEY}:history`, JSON.stringify(entry("launch", {address: vault.RecurveVault, symbol: "rvFUND", test: false}))],
          ["LTRIM", `${KEY}:history`, "0", String(HISTORY - 1)],
        ]);
        return res.status(200).json({deployment, launch: null, history: await history()});
      }

      case "launch-attach": {
        const fund = await published();
        if (!fund) return res.status(400).json({error: "Launch the fund first."});
        if (fund.RecurveToken) return res.status(409).json({error: "$RECURVE is already attached."});
        const token = await current();
        if (!token || token.test) return res.status(400).json({error: "Publish the real $RECURVE first."});

        const deployment = {...fund, RecurveToken: token.address};
        const wrong = await verifyDeployment(deployment);
        if (wrong.length) return res.status(400).json({error: `Not ready on chain: ${wrong.join(", ")}.`});

        await kv([
          ["SET", `${KEY}:deployment`, JSON.stringify(deployment)],
          ["LPUSH", `${KEY}:history`, JSON.stringify(entry("attach", token))],
          ["LTRIM", `${KEY}:history`, "0", String(HISTORY - 1)],
        ]);
        return res.status(200).json({deployment, history: await history()});
      }

      default:
        return res.status(400).json({error: "Unknown action."});
    }
  } catch (err) {
    return res.status(502).json({error: err.message || "Something upstream failed."});
  }
}

function entry(action, token) {
  return {at: new Date().toISOString(), action, address: token.address, symbol: token.symbol, test: token.test};
}

async function current() {
  const [raw] = await kv([["GET", `${KEY}:token`]]);
  return raw ? JSON.parse(raw) : null;
}

async function published() {
  const [raw] = await kv([["GET", `${KEY}:deployment`]]);
  return raw ? JSON.parse(raw) : null;
}

async function draft() {
  const [raw] = await kv([["GET", `${KEY}:launch`]]);
  return raw ? JSON.parse(raw) : null;
}

async function history() {
  const [rows] = await kv([["LRANGE", `${KEY}:history`, "0", String(HISTORY - 1)]]);
  return (rows || []).map((r) => JSON.parse(r));
}

// ---------------------------------------------------------------- storage

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? {url: url.replace(/\/+$/, ""), token} : null;
}

/** Upstash's REST pipeline: one request, one result per command. */
async function kv(commands) {
  const {url, token} = kvConfig();
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Storage answered ${res.status}.`);
  const out = await res.json();
  return out.map((r) => {
    if (r.error) throw new Error(`Storage: ${r.error}`);
    return r.result;
  });
}

// ---------------------------------------------------------------- chain

/** One batched RPC call. Gives back a reader: an answer by position, or null. */
async function batch(calls) {
  let out;
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(calls.map((c, id) => ({jsonrpc: "2.0", id, ...c}))),
    });
    out = res.ok ? await res.json() : null;
  } catch {
    out = null;
  }
  if (!Array.isArray(out)) throw new Error("Robinhood Chain RPC did not answer. Try again in a minute.");

  const byId = new Map(out.map((r) => [r.id, r]));
  return (id) => {
    const r = byId.get(id);
    return r && !r.error && typeof r.result === "string" && r.result !== "0x" ? r.result : null;
  };
}

/** Reads the contract the way a buyer's wallet would, in one batched RPC call. */
async function inspect(address) {
  const calls = [{method: "eth_getCode", params: [address, "latest"]}];
  for (const data of Object.values(SELECTOR)) calls.push({method: "eth_call", params: [{to: address, data}, "latest"]});

  const result = await batch(calls);

  const code = result(0);
  const decimals = word(result(3));
  const supply = word(result(4));
  const factory = address20(result(5));

  return {
    address,
    contract: code !== null,
    name: decodeString(result(1)),
    symbol: decodeString(result(2)),
    decimals: decimals !== null && decimals <= 255n ? Number(decimals) : null,
    totalSupply: supply !== null && decimals !== null && decimals <= 255n ? units(supply, Number(decimals)) : null,
    factory,
    ponsV2: factory === PONS_V2_FACTORY,
  };
}

/** Only the fields the site needs, each one checked. Null if any is missing. */
function cleanDeployment(d) {
  const v = d && Array.isArray(d.vaults) && d.vaults[0];
  if (!v) return null;
  const token = d.RecurveToken ? normalize(d.RecurveToken) : "";
  if (token === null) return null;
  const fields = {
    deployer: normalize(d.deployer),
    treasury: normalize(d.treasury),
    agent: normalize(d.agent),
    WatcherRegistry: normalize(v.WatcherRegistry),
    RecurveVault: normalize(v.RecurveVault),
    RecurveGovernor: normalize(v.RecurveGovernor),
    PortfolioStrategy: normalize(v.PortfolioStrategy),
  };
  if (Object.values(fields).includes(null)) return null;
  if (!Number.isSafeInteger(v.deployBlock) || v.deployBlock <= 0) return null;
  return {
    chainId: 4663,
    name: "Robinhood Chain",
    deployedAt: new Date().toISOString().slice(0, 10),
    deployer: fields.deployer,
    RecurveToken: token,
    treasury: fields.treasury,
    agent: fields.agent,
    vaults: [{
      slug: "main",
      name: "Recurve Fund",
      symbol: "rvFUND",
      WatcherRegistry: fields.WatcherRegistry,
      RecurveVault: fields.RecurveVault,
      RecurveGovernor: fields.RecurveGovernor,
      deployBlock: v.deployBlock,
      PortfolioStrategy: fields.PortfolioStrategy,
    }],
  };
}

/**
 * What is not as it should be, read from chain. Empty means it may go live.
 * Without a token the registry has none yet and stays with the deployer, who
 * attaches it; with one, the Safe has taken over.
 */
async function verifyDeployment(d) {
  const v = d.vaults[0];
  const expected = [
    [v.RecurveVault, VIEW.governor, v.RecurveGovernor, "the vault's governor"],
    [v.WatcherRegistry, VIEW.governor, v.RecurveGovernor, "the registry's governor"],
    [v.WatcherRegistry, VIEW.stakeToken, d.RecurveToken || null, "the registry's stake token"],
    [v.WatcherRegistry, VIEW.owner, d.RecurveToken ? d.treasury : d.deployer, "the registry's owner"],
    [v.RecurveGovernor, VIEW.vault, v.RecurveVault, "the governor's vault"],
    [v.RecurveGovernor, VIEW.watchers, v.WatcherRegistry, "the governor's registry"],
    [v.RecurveGovernor, VIEW.feeRecipient, d.treasury, "the fee recipient"],
    [v.RecurveGovernor, VIEW.agentAdmin, d.treasury, "the agent admin"],
    [v.PortfolioStrategy, VIEW.vault, v.RecurveVault, "the strategy's vault"],
    [v.PortfolioStrategy, VIEW.governor, v.RecurveGovernor, "the strategy's governor"],
  ];
  const calls = expected.map(([to, data]) => ({method: "eth_call", params: [{to, data}, "latest"]}));
  const isAgent = VIEW.isAgent + d.agent.slice(2).padStart(64, "0");
  calls.push({method: "eth_call", params: [{to: v.RecurveGovernor, data: isAgent}, "latest"]});

  const result = await batch(calls);
  const wrong = expected.filter(([, , want], i) => address20(result(i)) !== want).map((row) => row[3]);
  if (word(result(expected.length)) !== 1n) wrong.push("the agent");
  return wrong;
}

function word(hex) {
  return hex && /^0x[0-9a-fA-F]{64}$/.test(hex) ? BigInt(hex) : null;
}

function address20(hex) {
  const w = word(hex);
  if (w === null || w === 0n || w >> 160n !== 0n) return null;
  return "0x" + w.toString(16).padStart(40, "0");
}

/** An ABI string, or the bytes32 some older tokens return instead. */
function decodeString(hex) {
  if (!hex) return null;
  const b = Buffer.from(hex.slice(2), "hex");
  let s = null;
  if (b.length >= 64) {
    const offset = BigInt("0x" + b.subarray(0, 32).toString("hex"));
    if (offset + 32n <= BigInt(b.length)) {
      const start = Number(offset) + 32;
      const len = BigInt("0x" + b.subarray(start - 32, start).toString("hex"));
      if (BigInt(start) + len <= BigInt(b.length)) s = b.subarray(start, start + Number(len)).toString("utf8");
    }
  } else if (b.length === 32) {
    s = b.toString("utf8").replace(/\0+$/, "");
  }
  // Token names are whatever the deployer typed: printable text only, short.
  return s === null ? null : s.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 64) || null;
}

function units(value, decimals) {
  const whole = value / 10n ** BigInt(decimals);
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ---------------------------------------------------------------- helpers

function normalize(input) {
  const s = typeof input === "string" ? input.trim() : "";
  return /^0x[0-9a-fA-F]{40}$/.test(s) ? s.toLowerCase() : null;
}

function parseBody(body) {
  if (body && typeof body === "object") return body;
  try {
    return JSON.parse(body || "{}") || {};
  } catch {
    return {};
  }
}

function clientIp(req) {
  // Caddy overwrites X-Forwarded-For with the connecting address, so a client
  // cannot pick its own (deploy/caddy/Caddyfile).
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || String(req.headers["x-real-ip"] || "") || (req.socket && req.socket.remoteAddress) || "unknown";
}

function hashHex(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function passwordMatches(given, expected) {
  if (typeof given !== "string" || !given) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
