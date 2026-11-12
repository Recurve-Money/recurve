/**
 * The launch from /admin, rehearsed for real: site/launch.js against an anvil fork
 * of Robinhood Chain mainnet, with the bytecode in site/contracts.json, then the
 * site's own check before it publishes. Nothing reaches mainnet: anvil holds every
 * transaction, and anvil's public dev accounts play the wallet, the agent and the
 * Safe. Run it after any change to the contracts or to the launch.
 *
 * Usage: npm run rehearse:launch
 */

import {spawn} from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {startSiteServer} from "./serve-site.mjs";

const require = createRequire(import.meta.url);
const launch = require("../site/launch.js");
const viem = createRequire(new URL("../app/package.json", import.meta.url))("viem");
const contracts = JSON.parse(fs.readFileSync(new URL("../site/contracts.json", import.meta.url), "utf8"));

const FORK = "https://rpc.mainnet.chain.robinhood.com";
const PORT = 8599;
const URL_ = `http://127.0.0.1:${PORT}`;
const RECURVE = "0x7dbf38976f6d3b9c529e7d9484a71898b409ee6a"; // a live Pons v2 token stands in for $RECURVE
const USDG_POOL = "0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3"; // holds USDG, so it can hand some over

let id = 0;
async function rpc(method, params = []) {
  const res = await fetch(URL_, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({jsonrpc: "2.0", id: ++id, method, params}),
  });
  const out = await res.json();
  if (out.error) throw Object.assign(new Error(out.error.message), out.error);
  return out.result;
}

const read = (to, data) => rpc("eth_call", [{to, data}, "latest"]);
const word = (hex) => BigInt(hex);
const address = (hex) => "0x" + hex.slice(-40).toLowerCase();

async function sent(tx) {
  const hash = await rpc("eth_sendTransaction", [tx]);
  for (;;) {
    const receipt = await rpc("eth_getTransactionReceipt", [hash]);
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, 100));
  }
}

const anvil = spawn("anvil", ["--fork-url", FORK, "--port", String(PORT), "--chain-id", "4663", "--silent"], {stdio: "ignore"});
const stop = () => anvil.kill("SIGTERM");

let server;
let dir;
try {
  for (let i = 0; ; i++) {
    try {
      await rpc("eth_chainId");
      break;
    } catch (err) {
      if (i > 360) throw new Error("anvil did not come up: the Robinhood Chain RPC may be down", {cause: err});
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const [wallet, agent, safe] = await rpc("eth_accounts");
  console.log(`fork of mainnet at block ${word(await rpc("eth_blockNumber"))}`);

  const decimals = Number(word(await read(contracts.fund.asset, launch.SIG.decimals)));
  const draft = {
    settings: {token: "", treasury: safe, agent, depositCap: contracts.fund.depositCap, minStake: contracts.governance.minStake, assetDecimals: decimals},
    deployer: wallet,
    addresses: {},
    hashes: {},
    pending: null,
    deployBlock: 0,
  };
  assert.equal(launch.problem(draft.settings, wallet), null);

  console.log("\nThe fund, with no $RECURVE yet");
  await launch.run({
    draft, contracts, account: wallet, rpc, pollMs: 100, save: async () => {},
    onStep: (step, state) => state === "done" && console.log(`  done  ${step}`),
  });

  let gas = 0n;
  for (const hash of Object.values(draft.hashes)) gas += word((await rpc("eth_getTransactionReceipt", [hash])).gasUsed);
  console.log(`${Object.keys(draft.hashes).length} transactions, ${Number(gas / 1000n) / 1000}M gas`);

  const a = draft.addresses;
  const {SIG, addressWord} = launch;
  assert.equal(address(await read(a.vault, SIG.governor)), a.governor.toLowerCase());
  assert.equal(address(await read(a.registry, SIG.governor)), a.governor.toLowerCase());
  assert.equal(word(await read(a.registry, SIG.stakeToken)), 0n, "no stake token yet");
  assert.equal(address(await read(a.registry, SIG.owner)), wallet.toLowerCase(), "the wallet keeps the registry");
  assert.equal(address(await read(a.governor, SIG.agentAdmin)), safe.toLowerCase());
  assert.equal(word(await read(a.governor, SIG.isAgent + addressWord(agent))), 1n);
  assert.equal(word(await read(a.governor, SIG.isAgent + addressWord(wallet))), 0n);
  assert.equal(word(await read(a.vault, SIG.depositCap)), 10000n * 10n ** BigInt(decimals));
  assert.equal(word(await read(a.registry, SIG.minStake)), 1000n * 10n ** 18n, "the stand-in minimum, until the token has a price");
  assert.equal(word(await read(a.strategy, "0x335078d9" + addressWord(contracts.fund.leg))), BigInt(contracts.fund.feeTier), "feeTier");
  console.log("wiring read back from chain");

  // The fund really runs: a deposit through the cap, then a proposal all the way.
  await rpc("anvil_impersonateAccount", [USDG_POOL]);
  await rpc("anvil_setBalance", [USDG_POOL, "0xde0b6b3a7640000"]);
  const amount = 1000n * 10n ** BigInt(decimals);
  await sent({from: USDG_POOL, to: contracts.fund.asset, data: SIG.transfer + addressWord(wallet) + launch.uintWord(amount)});
  await sent({from: wallet, to: contracts.fund.asset, data: "0x095ea7b3" + addressWord(a.vault) + launch.uintWord(amount)});
  await sent({from: wallet, to: a.vault, data: "0x6e553f65" + launch.uintWord(amount) + addressWord(wallet)});
  assert.equal(word(await read(a.vault, SIG.balanceOf + addressWord(wallet))), amount);
  console.log("1,000 USDG deposited");

  const governorAbi = viem.parseAbi([
    "function propose(address, uint256, bytes) returns (bytes32)",
    "function execute(bytes32)",
    "event ProposalPosted(bytes32 indexed id, address indexed target, uint256 assets, uint256 executableAt)",
  ]);
  const returnToVault = viem.encodeFunctionData({abi: viem.parseAbi(["function returnToVault()"])});
  const propose = viem.encodeFunctionData({abi: governorAbi, functionName: "propose", args: [a.strategy, 0n, returnToVault]});
  await assert.rejects(rpc("eth_estimateGas", [{from: wallet, to: a.governor, data: propose}]), "the wallet no longer can");
  const posted = await sent({from: agent, to: a.governor, data: propose});
  assert.equal(word(posted.status), 1n, "the agent proposes");
  const id = posted.logs.find((log) => log.address.toLowerCase() === a.governor.toLowerCase()).topics[1];
  await rpc("evm_increaseTime", [24 * 60 * 60 + 1]);
  await rpc("evm_mine");
  const executed = await sent({from: agent, to: a.governor, data: viem.encodeFunctionData({abi: governorAbi, functionName: "execute", args: [id]})});
  assert.equal(word(executed.status), 1n, "it executes with no watchers");
  console.log("a proposal went from post to execute, on the depositors' veto alone");

  // The site's own check, against the fork.
  process.env.RPC_URL = URL_;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "recurve-launch-"));
  server = await startSiteServer({port: 0, dir: "site", kvFile: path.join(dir, "kv.json"), password: "rehearsal", quiet: true});
  const api = `http://127.0.0.1:${server.port}/api/token`;
  const post = async (body) => {
    const res = await fetch(api, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({password: "rehearsal", ...body}),
    });
    return {status: res.status, body: await res.json()};
  };
  const published = await post({action: "launch-publish", deployment: launch.deployment(draft, "2026-11-05")});
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.equal((await (await fetch(api)).json()).deployment.vaults[0].RecurveVault, a.vault.toLowerCase());
  console.log("the site checked it on chain and published it, with no token");

  console.log("\n$RECURVE, last");
  assert.equal((await post({action: "publish", address: RECURVE})).status, 200);
  // The minimum stake, as /admin sizes it: the dollar aim at a price like a Pons curve's first.
  const minStake = launch.stakeFor(contracts.governance.minStakeUsd, 0.0000037);
  assert.equal(minStake, "5400000");
  const attach = {
    deployer: wallet,
    settings: {token: RECURVE, treasury: safe, minStake},
    addresses: {registry: a.registry},
    hashes: {},
    pending: null,
  };
  const ctx = {draft: attach, account: wallet, rpc, pollMs: 100, save: async () => {}, onStep: (step, state) => state === "done" && console.log(`  done  ${step}`)};
  await launch.run(ctx, launch.attachPlan(ctx));
  assert.deepEqual(Object.keys(attach.hashes), ["minStake", "stakeToken", "registryOwner"], "sized before staking opens");
  assert.equal(word(await read(a.registry, SIG.minStake)), BigInt(minStake) * 10n ** 18n, "minStake");
  assert.equal(word(await read(a.registry, SIG.unstakeDelay)), BigInt(contracts.governance.unstakeDelay), "the delay is untouched");
  assert.equal(address(await read(a.registry, SIG.stakeToken)), RECURVE);
  assert.equal(address(await read(a.registry, SIG.owner)), safe.toLowerCase());
  const attached = await post({action: "launch-attach"});
  assert.equal(attached.status, 200, JSON.stringify(attached.body));
  assert.equal((await (await fetch(api)).json()).deployment.RecurveToken, RECURVE);
  console.log("the registry takes $RECURVE for good, the Safe holds it, the site says so");

  // Staking opened: give a watcher tokens through storage (OpenZeppelin balances, slot 0).
  const stake = BigInt(minStake) * 10n ** 18n;
  const one = 10n ** 18n;
  const slot = viem.keccak256(viem.encodeAbiParameters(viem.parseAbiParameters("address, uint256"), [wallet, 0n]));
  await rpc("anvil_setStorageAt", [RECURVE, slot, viem.toHex(stake * 2n, {size: 32})]);
  assert.equal(word(await read(RECURVE, SIG.balanceOf + addressWord(wallet))), stake * 2n, "balance slot");
  await sent({from: wallet, to: RECURVE, data: "0x095ea7b3" + addressWord(a.registry) + launch.uintWord(stake)});
  const stakeCall = (amount) => viem.encodeFunctionData({abi: viem.parseAbi(["function stake(uint256)"]), args: [amount]});
  const verdict = viem.encodeFunctionData({abi: viem.parseAbi(["function castVerdict(bytes32, uint8)"]), args: [id, 2]});
  assert.equal(word((await sent({from: wallet, to: a.registry, data: stakeCall(stake - one)})).status), 1n, "a watcher stakes");
  await assert.rejects(rpc("eth_estimateGas", [{from: wallet, to: a.registry, data: verdict}]), "one token short of the minimum cannot rule");
  assert.equal(word((await sent({from: wallet, to: a.registry, data: stakeCall(one)})).status), 1n, "tops up");
  assert.equal(word((await sent({from: wallet, to: a.registry, data: verdict})).status), 1n, "a watcher rules");
  console.log("the minimum is 5,400,000: one token short cannot rule, at it a watcher cast a verdict");

  console.log("\nRehearsal passed.");
} finally {
  if (server) await server.close();
  if (dir) fs.rmSync(dir, {recursive: true, force: true});
  stop();
}
