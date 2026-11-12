import {defineChain} from "viem";
import mainnetDeployment from "./addresses/4663.json";
import testnetDeployment from "./addresses/46630.json";
import {fromDeployment, type Deployment} from "./deployment";

/**
 * Known vaults. Each is a vault plus the governor that owns it; the two are
 * deployed as a pair and are never mixed between funds.
 */
export interface VaultConfig {
  slug: string;
  name: string;
  ens?: string;
  vault: `0x${string}`;
  governor: `0x${string}`;
  agent?: string;
  description?: string;
}

interface Network {
  id: number;
  name: string;
  testnet: boolean;
  rpcUrl: string;
  explorerUrl: string;
  registry: `0x${string}` | "";
  recurveToken: `0x${string}` | "";
  deployBlock: string;
  vaults: VaultConfig[];
}

/** A fund launched at /admin, which main.tsx reads before this module loads. */
const published = (globalThis as {__RECURVE_DEPLOYMENT__?: Deployment}).__RECURVE_DEPLOYMENT__;

/**
 * Every network the app can point at. The chain itself is described here; the
 * addresses come from `addresses/<chainId>.json`, recurve-protocol's deploy
 * output, or for mainnet from what /admin published, which counts straight away.
 * Until one of them has a vault `isConfigured` is false, and the app renders the
 * not-deployed state instead of a dashboard of zeros.
 */
const NETWORKS: Record<"mainnet" | "testnet", Network> = {
  mainnet: {
    id: 4663,
    name: "Robinhood Chain",
    testnet: false,
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    // Blockscout root. explorer.mainnet.chain.robinhood.com 301s here and drops the path.
    explorerUrl: "https://robinhoodchain.blockscout.com",
    ...fromDeployment(published ?? mainnetDeployment, 4663),
  },
  testnet: {
    id: 46630,
    name: "Robinhood Chain Testnet",
    testnet: true,
    rpcUrl: "https://rpc.testnet.chain.robinhood.com",
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    // TESTNET addresses. The same addresses on mainnet hold unrelated contracts.
    ...fromDeployment(testnetDeployment, 46630),
  },
};

/** Mainnet is the default; `VITE_NETWORK=testnet` points the app at the live testnet fund. */
const NETWORK = (import.meta.env.VITE_NETWORK ?? "mainnet") as "mainnet" | "testnet";
const net = NETWORKS[NETWORK] ?? NETWORKS.mainnet;

/**
 * Robinhood Chain. Not in viem's chain list, so it is defined here.
 */
export const robinhood = defineChain({
  id: net.id,
  name: net.name,
  testnet: net.testnet,
  nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18},
  rpcUrls: {
    default: {http: [import.meta.env.VITE_RPC_URL || net.rpcUrl]},
  },
  blockExplorers: {
    default: {name: "Explorer", url: net.explorerUrl},
  },
  // Deployed on 46630 and 4663, so viem batches useReadContracts into one call.
  contracts: {multicall3: {address: "0xcA11bde05977b3631167028862bE2a173976CA11"}},
});

/**
 * Deployed addresses for the selected network.
 *
 * Override through the VITE_ env vars to point a preview at another deploy.
 */
export const addresses = {
  registry: (import.meta.env.VITE_REGISTRY || net.registry) as `0x${string}` | "",
  /** $RECURVE, the token watchers stake. */
  recurveToken: (import.meta.env.VITE_RECURVE_TOKEN || net.recurveToken) as `0x${string}` | "",
} as const;

export const vaults: VaultConfig[] = net.vaults;

/**
 * Block the contracts went up. Log scans start here.
 *
 * Scanning from genesis on a public RPC times out long before it finds a
 * proposal, and an endpoint that prunes history will quietly return a short
 * list rather than an error. Set this to the deploy block and the scan stays
 * cheap and complete.
 */
export const deployBlock: bigint = BigInt(import.meta.env.VITE_DEPLOY_BLOCK || net.deployBlock);

/**
 * The indexer in api/. Used for history the chain itself cannot answer cheaply
 * (a chart needs many past blocks; the RPC does not).
 *
 * No default: the old Railway instance is gone, and a URL that 404s is worse
 * than none — the app would spend every page view waiting on it. Unset means
 * the chart and the risk panel say so and everything else reads from chain.
 * Set VITE_API_URL to a running `api/` (http://localhost:3000 in dev).
 */
export const apiUrl: string = import.meta.env.VITE_API_URL || "";

export const isConfigured = vaults.length > 0 && addresses.registry !== "";
