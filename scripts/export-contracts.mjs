/**
 * What /admin needs to deploy the fund from a wallet, in one public file: the
 * contracts' creation code and the settings protocol/script/DeployMainnet.s.sol
 * fixes. Run it after any change to the contracts: `npm run build:contracts`.
 *
 * Usage: node scripts/export-contracts.mjs
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACTS = ["WatcherRegistry", "RecurveVault", "RecurveGovernor", "PortfolioStrategyV2"];

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, "protocol/mainnet.env"), "utf8")
    .split("\n")
    .map((line) => /^([A-Z_]+)=(\S*)/.exec(line))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const bytecode = Object.fromEntries(
  CONTRACTS.map((name) => {
    const file = path.join(ROOT, `protocol/out/${name}.sol/${name}.json`);
    return [name, JSON.parse(fs.readFileSync(file, "utf8")).bytecode.object];
  }),
);

let agent = "";
try {
  agent = fs.readFileSync(path.join(os.homedir(), ".config/recurve/agent.address"), "utf8").trim();
} catch {
  /* typed in at /admin instead */
}

const out = {
  chainId: 4663,
  agent,
  fund: {
    name: "Recurve Fund",
    symbol: "rvFUND",
    asset: env.VAULT_ASSET,
    depositCap: env.DEPOSIT_CAP,
    router: env.DEX_ROUTER,
    leg: env.NVDA_TOKEN,
    legSymbol: "NVDA",
    feeTier: Number(env.FEE_TIER),
    maxSlippageBps: 300,
  },
  governance: {
    // The minimum watcher stake is a dollar figure, turned into tokens at the price
    // of the moment the token reaches the registry. Until then the registry holds
    // the plain 1,000 that DeployMainnet.s.sol gives it, and nobody can stake.
    minStakeUsd: 20,
    minStake: "1000",
    unstakeDelay: 7 * 24 * 60 * 60,
    vetoWindow: 24 * 60 * 60,
    vetoThresholdBps: 2000,
    watcherBlockThreshold: 2,
    performanceFeeBps: 500,
  },
  bytecode,
};

fs.writeFileSync(path.join(ROOT, "site/contracts.json"), JSON.stringify(out) + "\n");
console.log(`site/contracts.json: ${CONTRACTS.length} contracts, ${Math.round(JSON.stringify(out).length / 1024)} KB`);
