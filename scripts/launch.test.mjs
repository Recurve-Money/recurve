/**
 * site/launch.js without a browser or a chain: its ABI encoding against viem's,
 * and the run's promises: ten transactions, none of them sent twice, whatever
 * stops it halfway.
 *
 *     node --test scripts/launch.test.mjs
 */

import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const launch = require("../site/launch.js");
const viem = createRequire(new URL("../app/package.json", import.meta.url))("viem");

const contracts = JSON.parse(fs.readFileSync(new URL("../site/contracts.json", import.meta.url), "utf8"));
const A = (n) => "0x" + String(n).repeat(40).slice(0, 40);
const WALLET = A(1);
const TREASURY = A(2);
const AGENT = A(3);
const TOKEN = A(4);

const newDraft = () => ({
  settings: {token: TOKEN, treasury: TREASURY, agent: AGENT, depositCap: "10000", minStake: "1000", assetDecimals: 6},
  deployer: WALLET,
  addresses: {},
  hashes: {},
  pending: null,
  deployBlock: 0,
});

const newAttach = (registry, minStake) => ({
  deployer: WALLET,
  settings: {token: TOKEN, treasury: TREASURY, minStake},
  addresses: {registry},
  hashes: {},
  pending: null,
});

test("the encoding matches viem for every constructor shape", () => {
  const cases = [
    ["address,uint256,uint256,address", ["address", "uint", "uint", "address"], [TOKEN, 1000n * 10n ** 18n, 604800n, WALLET]],
    ["address,string,string,uint256", ["address", "string", "string", "uint"], [TOKEN, "Recurve Fund", "rvFUND", 10000000000n]],
    ["address,address,address,uint256,uint256,uint256,uint256,address", ["address", "address", "address", "uint", "uint", "uint", "uint", "address"], [A(5), A(6), WALLET, 86400n, 2000n, 2n, 500n, TREASURY]],
    ["address,address,address,address,address[],uint24[],uint256", ["address", "address", "address", "address", "address[]", "uint[]", "uint"], [A(5), A(6), A(7), A(8), [A(9)], [500n], 300n]],
  ];
  for (const [signature, types, values] of cases) {
    const want = viem.encodeAbiParameters(viem.parseAbiParameters(signature), values);
    assert.equal("0x" + launch.encode(types, values), want, signature);
  }
  const long = "A name longer than thirty-two bytes, so it takes two words";
  assert.equal("0x" + launch.encode(["string"], [long]), viem.encodeAbiParameters(viem.parseAbiParameters("string"), [long]));
});

test("every selector is the keccak of its signature", () => {
  const signatures = {
    governor: "governor()", isAgent: "isAgent(address)", agentAdmin: "agentAdmin()", owner: "owner()",
    decimals: "decimals()", symbol: "symbol()", balanceOf: "balanceOf(address)", depositCap: "depositCap()",
    setGovernor: "setGovernor(address)", addAgent: "addAgent(address)", removeAgent: "removeAgent(address)",
    setAgentAdmin: "setAgentAdmin(address)", transferOwnership: "transferOwnership(address)",
    stakeToken: "stakeToken()", setStakeToken: "setStakeToken(address)",
    transfer: "transfer(address,uint256)", raiseDepositCap: "raiseDepositCap(uint256)",
    minStake: "minStake()", unstakeDelay: "unstakeDelay()", setParameters: "setParameters(uint256,uint256)",
  };
  for (const [name, signature] of Object.entries(signatures)) {
    assert.equal(launch.SIG[name], viem.toFunctionSelector(`function ${signature}`), name);
  }
});

test("settings that deploy-mainnet would refuse are refused", () => {
  const good = newDraft().settings;
  assert.equal(launch.problem(good, WALLET), null);
  assert.equal(launch.problem({...good, token: ""}, WALLET), null, "the token can come last");
  assert.match(launch.problem({...good, token: "nope"}, WALLET), /RECURVE/);
  assert.match(launch.problem({...good, agent: WALLET}, WALLET), /agent/);
  assert.match(launch.problem({...good, treasury: WALLET}, WALLET), /treasury/);
  assert.match(launch.problem({...good, treasury: AGENT}, WALLET), /treasury/);
  assert.match(launch.problem({...good, depositCap: "0"}, WALLET), /cap/);
  assert.match(launch.problem({...good, minStake: "1.5"}, WALLET), /stake/);
});

test("a dollar target becomes a round number of whole tokens", () => {
  assert.equal(launch.stakeFor(20, 0.000003674492919), "5400000", "5,442,928 to two figures");
  assert.equal(launch.stakeFor(20, 0.0004), "50000");
  assert.equal(launch.stakeFor(20, 3), "7", "under ten tokens it is the nearest whole one");
  assert.equal(launch.stakeFor(20, 50), "1", "never zero");
  assert.equal(launch.stakeFor(20, 1e-12), "20000000000000");
  for (const none of [0, -1, NaN, Infinity, undefined, null]) assert.equal(launch.stakeFor(20, none), "", String(none));
  assert.equal(launch.problem({...newDraft().settings, minStake: launch.stakeFor(20, 0.0000037)}, WALLET), null);
});

test("the price comes from the token's deepest pool against real money", () => {
  const ETH = "0x" + "e".repeat(40);   // native, as the Pons curve lists it
  const ZERO = "0x" + "0".repeat(40);  // native, as Uniswap v4 lists it
  const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
  const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
  const JUNK = A(9);
  const pool = (base, quote, basePrice, quotePrice, reserve) => ({
    attributes: {base_token_price_usd: basePrice, quote_token_price_usd: quotePrice, reserve_in_usd: reserve},
    relationships: {
      base_token: {data: {id: "robinhood_" + base.toLowerCase()}},
      quote_token: {data: {id: "robinhood_" + quote.toLowerCase()}},
    },
  });
  const price = (pools, token = TOKEN) => launch.priceFrom({data: pools}, token);

  // On the curve there is one pool, against ETH.
  assert.deepEqual(price([pool(TOKEN, ETH, "0.0000036", "2249.38", "3956.4")]), {price: 0.0000036, low: 0.0000036, high: 0.0000036});
  assert.equal(price([pool(WETH, TOKEN, "2249.38", "0.0000036", "3956.4")]).price, 0.0000036, "as the quote token");
  const mixedCase = "0x" + "aB".repeat(20);
  assert.equal(price([pool(mixedCase, USDG, "0.5", "1", "10")], mixedCase).price, 0.5, "whatever the case of the address");

  // What a graduated Pons token looks like: real pools that agree, dust pools at any
  // price, and a pool against a worthless token claiming more money than all of them.
  const graduated = [
    pool(TOKEN, ZERO, "0.004541", "2053.61", "178860.5"),
    pool(TOKEN, USDG, "0.004500", "1.0005", "48121.3"),
    pool(TOKEN, WETH, "0.004505", "2051.76", "35839.2"),
    pool(TOKEN, USDG, "0.02823", "0.9999", "5.75"),
    pool(JUNK, TOKEN, "0.04708", "0.04657", "46597513.2"),
  ];
  assert.deepEqual(price(graduated), {price: 0.004541, low: 0.0045, high: 0.004541});
  assert.equal(price(graduated.slice().reverse()).price, 0.004541, "whatever order they come in");

  // Two pools with real weight that disagree: no figure is better than a wrong one.
  assert.deepEqual(price([
    pool(TOKEN, ETH, "0.0000036", "2249.38", "3956.4"),
    pool(TOKEN, WETH, "0.000036", "2249.38", "400"),
  ]), {price: null, low: 0.0000036, high: 0.000036});
  assert.equal(price([
    pool(TOKEN, ETH, "0.0000036", "2249.38", "3956.4"),
    pool(TOKEN, WETH, "0.0000041", "2249.38", "400"),
  ]).price, 0.0000036, "an ordinary gap between pools is fine");

  assert.equal(price([pool(JUNK, TOKEN, "7", "0.0466", "900000")]), null, "only a pool against a worthless token");
  assert.equal(price([pool(JUNK, WETH, "7", "2249.38", "900000")]), null, "another token's pool");
  assert.equal(price([pool(TOKEN, ETH, null, "2249.38", "0")]), null, "listed, not priced yet");
  for (const none of [null, undefined, {}, {data: []}, {errors: [{status: "404"}]}]) assert.equal(launch.priceFrom(none, TOKEN), null);
});

/** Just enough of a chain to answer what the plan reads and apply what it sends. */
function fakeChain() {
  const c = {chain: 4663, sent: [], receipts: new Map(), governorOf: {}, agents: new Set(), admin: null, owner: null, stake: null, minimum: 1000n * 10n ** 18n, delay: 604800n, next: 0x10, rejectAt: null};
  const word = (v) => "0x" + v.toString(16).padStart(64, "0");
  const addr = (data) => "0x" + data.slice(-40);

  c.rpc = async (method, params) => {
    if (method === "eth_chainId") return "0x" + c.chain.toString(16);
    if (method === "eth_getTransactionReceipt") return c.receipts.get(params[0]) ?? null;
    if (method === "eth_call") {
      const {to, data} = params[0];
      if (data === launch.SIG.governor) return "0x" + (c.governorOf[to] ?? "").replace("0x", "").padStart(64, "0");
      if (data === launch.SIG.agentAdmin) return "0x" + (c.admin ?? "").replace("0x", "").padStart(64, "0");
      if (data === launch.SIG.owner) return "0x" + (c.owner ?? "").replace("0x", "").padStart(64, "0");
      if (data === launch.SIG.stakeToken) return "0x" + (c.stake ?? "").replace("0x", "").padStart(64, "0");
      if (data === launch.SIG.minStake) return word(c.minimum);
      if (data === launch.SIG.unstakeDelay) return word(c.delay);
      if (data.startsWith(launch.SIG.isAgent)) return word(c.agents.has(addr(data)) ? 1 : 0);
      throw new Error("unexpected call " + data);
    }
    if (method === "eth_sendTransaction") {
      if (c.sent.length === c.rejectAt) {
        c.rejectAt = null;
        throw Object.assign(new Error("User rejected"), {code: 4001});
      }
      const tx = params[0];
      c.sent.push(tx);
      const hash = "0x" + c.sent.length.toString(16).padStart(64, "0");
      const receipt = {status: "0x1", blockNumber: "0x64"};
      if (!tx.to) {
        receipt.contractAddress = "0x" + (c.next++).toString(16).padStart(40, "0");
        c.owner ??= WALLET;
        if (tx.data.startsWith(contracts.bytecode.RecurveGovernor)) {
          c.admin = WALLET;
          c.agents.add(WALLET);
        }
      } else if (tx.data.startsWith(launch.SIG.setGovernor)) c.governorOf[tx.to] = addr(tx.data);
      else if (tx.data.startsWith(launch.SIG.addAgent)) c.agents.add(addr(tx.data));
      else if (tx.data.startsWith(launch.SIG.removeAgent)) c.agents.delete(addr(tx.data));
      else if (tx.data.startsWith(launch.SIG.setAgentAdmin)) c.admin = addr(tx.data);
      else if (tx.data.startsWith(launch.SIG.transferOwnership)) c.owner = addr(tx.data);
      else if (tx.data.startsWith(launch.SIG.setStakeToken)) c.stake = addr(tx.data);
      else if (tx.data.startsWith(launch.SIG.setParameters)) {
        c.minimum = BigInt("0x" + tx.data.slice(10, 74));
        c.delay = BigInt("0x" + tx.data.slice(74, 138));
      }
      c.receipts.set(hash, receipt);
      return hash;
    }
    throw new Error("unexpected " + method);
  };
  return c;
}

const context = (c, draft, extra = {}) => ({
  draft, contracts, account: WALLET, rpc: c.rpc, pollMs: 0, tries: 3, save: async () => {}, onStep: () => {}, ...extra,
});

test("a full run: ten transactions in order, ending with the Safe in charge", async () => {
  const c = fakeChain();
  const draft = newDraft();
  await launch.run(context(c, draft));

  assert.equal(c.sent.length, 10);
  assert.equal(c.admin, TREASURY);
  assert.equal(c.owner, TREASURY);
  assert.ok(c.agents.has(AGENT));
  assert.ok(!c.agents.has(WALLET));
  for (const key of ["registry", "vault", "governor", "strategy"]) assert.ok(draft.addresses[key], key);

  const out = launch.deployment(draft, "2026-11-05");
  assert.equal(out.vaults[0].RecurveVault, draft.addresses.vault);
  assert.equal(out.vaults[0].deployBlock, 100);
  assert.equal(out.deployer, WALLET);
});

test("without the token: nine transactions, the fund opens and the wallet keeps the registry", async () => {
  const c = fakeChain();
  const draft = newDraft();
  draft.settings.token = "";
  await launch.run(context(c, draft));

  assert.equal(c.sent.length, 9);
  assert.equal(c.owner, WALLET, "the wallet names the token later");
  assert.equal(c.admin, TREASURY);
  const registryArgs = c.sent[0].data.slice(contracts.bytecode.WatcherRegistry.length);
  assert.equal(registryArgs.slice(0, 64), "0".repeat(64), "no stake token at deploy");

  const out = launch.deployment(draft, "2026-11-05");
  assert.equal(out.RecurveToken, "");

  const attach = newAttach(draft.addresses.registry, "5400000");
  const ctx = context(c, attach);
  await launch.run(ctx, launch.attachPlan(ctx));
  assert.equal(c.sent.length, 12);
  assert.deepEqual(c.sent.slice(9).map((tx) => tx.data.slice(0, 10)),
    [launch.SIG.setParameters, launch.SIG.setStakeToken, launch.SIG.transferOwnership],
    "the stake is sized before staking can open");
  assert.equal(c.minimum, 5400000n * 10n ** 18n);
  assert.equal(c.delay, 604800n, "the unstake delay is left as the chain had it");
  assert.equal(c.stake, TOKEN);
  assert.equal(c.owner, TREASURY);

  // Pressed again after a crash, it reads the chain and sends nothing.
  await launch.run(ctx, launch.attachPlan(ctx));
  assert.equal(c.sent.length, 12);

  // Nor with another figure: the registry is the Safe's now, and so is the minimum.
  const later = context(c, newAttach(draft.addresses.registry, "999"));
  await launch.run(later, launch.attachPlan(later));
  assert.equal(c.sent.length, 12);
  assert.equal(c.minimum, 5400000n * 10n ** 18n);
});

test("attach stopped halfway takes the figure of the second try", async () => {
  const c = fakeChain();
  const draft = newDraft();
  draft.settings.token = "";
  await launch.run(context(c, draft));

  c.rejectAt = 10; // the minimum is set, naming the token is rejected
  const first = context(c, newAttach(draft.addresses.registry, "5400000"));
  await assert.rejects(launch.run(first, launch.attachPlan(first)), {code: 4001});
  assert.equal(c.minimum, 5400000n * 10n ** 18n);
  assert.equal(c.stake, null, "no token yet, so nobody could stake at any figure");

  const second = context(c, newAttach(draft.addresses.registry, "4900000"));
  await launch.run(second, launch.attachPlan(second));
  assert.equal(c.sent.length, 13, "the minimum again, the token, the Safe");
  assert.equal(c.minimum, 4900000n * 10n ** 18n);
  assert.equal(c.stake, TOKEN);
  assert.equal(c.owner, TREASURY);
});

test("attach needs a whole number of tokens for the minimum", () => {
  const c = fakeChain();
  for (const bad of [undefined, "", "0", "1.5", "1e6", "5,400,000"]) {
    const ctx = context(c, newAttach(A(5), bad));
    assert.throws(() => launch.attachPlan(ctx), /whole number/, String(bad));
  }
});

test("a rejection stops the run, and Continue sends only what is left", async () => {
  const c = fakeChain();
  c.rejectAt = 4;
  const draft = newDraft();
  await assert.rejects(launch.run(context(c, draft)), {code: 4001});
  assert.equal(c.sent.length, 4);

  await launch.run(context(c, draft));
  assert.equal(c.sent.length, 10);
  assert.equal(new Set(c.sent.map((tx) => tx.data)).size >= 9, true);
});

test("a transaction sent just before a crash is not sent again", async () => {
  const c = fakeChain();
  const draft = newDraft();
  let saves = 0;
  const dies = async () => {
    if (++saves === 1) throw new Error("the connection died");
  };
  // The first save happens right after the wallet returned the hash; it fails,
  // but the draft in memory knows the transaction.
  await assert.rejects(launch.run(context(c, draft, {save: dies})), /connection/);
  assert.equal(c.sent.length, 1);
  assert.equal(draft.pending.step, "registry");

  await launch.run(context(c, draft));
  assert.equal(c.sent.length, 10, "the registry went out once");
  assert.ok(draft.addresses.registry);
});

test("the wrong chain or the wrong wallet sends nothing", async () => {
  const c = fakeChain();
  c.chain = 1;
  await assert.rejects(launch.run(context(c, newDraft())), /Switch it to Robinhood Chain/);
  assert.equal(c.sent.length, 0);

  const d = fakeChain();
  await assert.rejects(launch.run(context(d, newDraft(), {account: A(9)})), /Connect that wallet/);
  assert.equal(d.sent.length, 0);
});

test("a transaction that fails on chain stops the run and can be retried", async () => {
  const c = fakeChain();
  const send = c.rpc;
  let failed = false;
  c.rpc = async (method, params) => {
    const out = await send(method, params);
    if (method === "eth_sendTransaction" && !failed && c.sent.length === 2) {
      failed = true;
      c.receipts.get(out).status = "0x0";
    }
    return out;
  };
  const draft = newDraft();
  await assert.rejects(launch.run(context(c, draft)), /failed on chain/);
  assert.equal(draft.pending, null);
  assert.equal(draft.addresses.vault, undefined);

  await launch.run(context(c, draft));
  assert.ok(draft.addresses.vault);
  assert.equal(c.sent.length, 11);
});
