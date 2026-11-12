/**
 * Reads a recurve-protocol `addresses/<chainId>.json` — the file the deploy
 * produces — into what the app needs. Launch is then a file copy, not a
 * transcription: drop the protocol's file into `addresses/` verbatim and every
 * address, and the deploy block, follow.
 */

/** The shape recurve-protocol writes. Only the fields the app reads are typed. */
export interface Deployment {
  chainId: number;
  name: string;
  RecurveToken?: string;
  vaults: DeployedVault[];
}

export interface DeployedVault {
  slug: string;
  name: string;
  WatcherRegistry: string;
  RecurveVault: string;
  RecurveGovernor: string;
  deployBlock: number;
}

export interface Deployed {
  /** One registry per network; the file records it per vault. Empty when nothing is deployed. */
  registry: `0x${string}` | "";
  recurveToken: `0x${string}` | "";
  /** Earliest vault deploy block, as a string for BigInt. "0" when nothing is deployed. */
  deployBlock: string;
  vaults: {slug: string; name: string; vault: `0x${string}`; governor: `0x${string}`}[];
}

export function fromDeployment(file: Deployment, expectChainId?: number): Deployed {
  if (expectChainId !== undefined && file.chainId !== expectChainId) {
    throw new Error(`Deployment file is for chain ${file.chainId}, expected ${expectChainId}.`);
  }
  const first = file.vaults[0];
  const earliest = file.vaults.reduce((min, v) => (v.deployBlock < min ? v.deployBlock : min), first?.deployBlock ?? 0);
  return {
    registry: (first?.WatcherRegistry ?? "") as `0x${string}` | "",
    recurveToken: (file.RecurveToken ?? "") as `0x${string}` | "",
    deployBlock: String(earliest),
    vaults: file.vaults.map((v) => ({
      slug: v.slug,
      name: v.name,
      vault: v.RecurveVault as `0x${string}`,
      governor: v.RecurveGovernor as `0x${string}`,
    })),
  };
}
