import {useQuery} from "@tanstack/react-query";
import type {PublicClient} from "viem";
import {useAccount, usePublicClient, useReadContract, useReadContracts} from "wagmi";
import {governorAbi, registryAbi, vaultAbi} from "../lib/abi";
import {addresses, apiUrl, deployBlock} from "../lib/chain";

export enum ProposalState {
  None = 0,
  Pending = 1,
  Vetoed = 2,
  Blocked = 3,
  Executed = 4,
  Settled = 5,
}

export const stateLabel: Record<ProposalState, string> = {
  [ProposalState.None]: "Unknown",
  [ProposalState.Pending]: "Pending",
  [ProposalState.Vetoed]: "Vetoed",
  [ProposalState.Blocked]: "Blocked",
  [ProposalState.Executed]: "Executed",
  [ProposalState.Settled]: "Settled",
};

export interface Proposal {
  id: `0x${string}`;
  target: `0x${string}`;
  assets: bigint;
  callData: `0x${string}`;
  postedAt: bigint;
  snapshot: bigint;
  vetoWeight: bigint;
  state: ProposalState;
  executableAt: bigint;
  blocks: bigint;
  /** Supply at the snapshot, so veto progress is a real fraction. */
  snapshotSupply: bigint;
}

/**
 * Widest block range one eth_getLogs may cover. Both Robinhood RPCs refuse
 * anything wider ("Invalid parameters", since October 2026), so a scan from
 * the deploy block is split into ranges of this size.
 */
const LOG_RANGE = 100_000n;
/** Ranges asked for at once on a cold scan: fast, without tripping rate limits. */
const SCAN_CONCURRENCY = 6;

/** Per governor: proposal ids seen so far (oldest first) and the last block scanned. */
const scanned = new Map<string, {ids: `0x${string}`[]; to: bigint}>();

async function postedBetween(client: PublicClient, governor: `0x${string}`, from: bigint, to: bigint) {
  const ranges: [bigint, bigint][] = [];
  for (let start = from; start <= to; start += LOG_RANGE) {
    ranges.push([start, start + LOG_RANGE - 1n > to ? to : start + LOG_RANGE - 1n]);
  }
  const found: {id: `0x${string}`; block: bigint; index: number}[] = [];
  for (let i = 0; i < ranges.length; i += SCAN_CONCURRENCY) {
    const batch = await Promise.all(
      ranges.slice(i, i + SCAN_CONCURRENCY).map(([fromBlock, toBlock]) =>
        client.getContractEvents({address: governor, abi: governorAbi, eventName: "ProposalPosted", fromBlock, toBlock}),
      ),
    );
    for (const logs of batch) {
      for (const l of logs) {
        const id = l.args.proposalId as `0x${string}` | undefined;
        if (id) found.push({id, block: l.blockNumber ?? 0n, index: l.logIndex ?? 0});
      }
    }
  }
  found.sort((a, b) => (a.block === b.block ? a.index - b.index : a.block < b.block ? -1 : 1));
  return found.map((f) => f.id);
}

/** The indexer's list for this governor, oldest first; null when there is no indexer or it fails. */
async function indexedIds(governor: `0x${string}`): Promise<`0x${string}`[] | null> {
  if (!apiUrl) return null;
  try {
    const r = await fetch(`${apiUrl}/proposals`);
    if (!r.ok) return null;
    const body = (await r.json()) as {proposals?: {id: string; governor: string; posted_block: string}[]};
    return (body.proposals ?? [])
      .filter((p) => p.governor.toLowerCase() === governor.toLowerCase())
      .sort((a, b) => Number(BigInt(a.posted_block) - BigInt(b.posted_block)))
      .map((p) => p.id as `0x${string}`);
  } catch {
    return null;
  }
}

/**
 * Proposals live in a mapping, so there is no list to read. Ids come from
 * ProposalPosted logs, and current state comes from a multicall over those ids.
 *
 * With the indexer (VITE_API_URL) its list covers history and only the last
 * LOG_RANGE blocks are read from chain, to catch a proposal posted since its
 * last poll. Without it the logs are scanned from deployBlock in LOG_RANGE
 * slices — slow on a cold start for an old fund, which is why production
 * should run the indexer. Either way later refreshes scan only new blocks.
 *
 * Logs are the only discovery path, which means an RPC that prunes history will
 * silently return a short list. That is why deployBlock is configurable rather
 * than hardcoded to "earliest": scanning from genesis on a public endpoint times
 * out long before it finds anything.
 */
export function useProposals(governor?: `0x${string}`, vault?: `0x${string}`) {
  const client = usePublicClient();

  const idsQuery = useQuery({
    queryKey: ["proposal-ids", governor],
    enabled: Boolean(client && governor),
    refetchInterval: 20_000,
    queryFn: async () => {
      const head = await client!.getBlockNumber();
      const key = governor!.toLowerCase();
      let seen = scanned.get(key);
      let from: bigint;
      if (seen) {
        from = seen.to + 1n;
      } else {
        const indexed = await indexedIds(governor!);
        seen = {ids: indexed ?? [], to: 0n};
        from = indexed ? (head >= LOG_RANGE ? head - LOG_RANGE + 1n : 0n) : deployBlock;
        if (from < deployBlock) from = deployBlock;
      }
      const ids = [...seen.ids];
      if (from <= head) {
        for (const id of await postedBetween(client! as PublicClient, governor!, from, head)) {
          if (!ids.includes(id)) ids.push(id);
        }
      }
      scanned.set(key, {ids, to: head});
      // Newest first: an operator checking on a fund cares about the live one.
      return [...ids].reverse();
    },
  });

  const ids = idsQuery.data ?? [];

  const {data: records} = useReadContracts({
    contracts: ids.flatMap((id) => [
      {address: governor!, abi: governorAbi, functionName: "proposals", args: [id]} as const,
      {address: governor!, abi: governorAbi, functionName: "executableAt", args: [id]} as const,
      {address: addresses.registry as `0x${string}`, abi: registryAbi, functionName: "blockCount", args: [id]} as const,
    ]),
    query: {enabled: ids.length > 0 && addresses.registry !== "", refetchInterval: 15_000},
  });

  // Vote weight only means something against the supply at that snapshot.
  const snapshots = ids.map((_, i) => {
    const rec = records?.[i * 3]?.result as readonly unknown[] | undefined;
    return rec ? (rec[4] as bigint) : 0n;
  });

  const {data: supplies} = useReadContracts({
    contracts: snapshots.map(
      (s) =>
        ({
          address: vault!,
          abi: vaultAbi,
          functionName: "getPastTotalSupply",
          args: [s],
        }) as const,
    ),
    query: {enabled: Boolean(vault) && snapshots.length > 0},
  });

  const proposals: Proposal[] = ids.map((id, i) => {
    const rec = records?.[i * 3]?.result as readonly unknown[] | undefined;
    return {
      id,
      target: (rec?.[0] as `0x${string}`) ?? "0x",
      assets: (rec?.[1] as bigint) ?? 0n,
      callData: (rec?.[2] as `0x${string}`) ?? "0x",
      postedAt: (rec?.[3] as bigint) ?? 0n,
      snapshot: (rec?.[4] as bigint) ?? 0n,
      vetoWeight: (rec?.[5] as bigint) ?? 0n,
      state: ((rec?.[6] as number) ?? 0) as ProposalState,
      executableAt: (records?.[i * 3 + 1]?.result as bigint) ?? 0n,
      blocks: (records?.[i * 3 + 2]?.result as bigint) ?? 0n,
      snapshotSupply: (supplies?.[i]?.result as bigint) ?? 0n,
    };
  });

  return {proposals, isLoading: idsQuery.isLoading, isError: idsQuery.isError, refetch: idsQuery.refetch};
}

/** Whether the connected address already voted against a given proposal. */
export function useHasVetoed(governor: `0x${string}` | undefined, id: `0x${string}` | undefined) {
  const {address} = useAccount();
  return useReadContract({
    address: governor,
    abi: governorAbi,
    functionName: "hasVetoed",
    args: address && id ? [id, address] : undefined,
    query: {enabled: Boolean(governor && id && address)},
  });
}

/**
 * The parameters fixed at deploy time, plus the current agent set. One
 * multicall: this is read-heavy chrome (a sidebar), not something that needs
 * per-field loading states.
 */
export function useGovernorParams(governor?: `0x${string}`) {
  const enabled = Boolean(governor);

  const {data, isLoading} = useReadContracts({
    contracts: enabled
      ? ([
          {address: governor!, abi: governorAbi, functionName: "vetoWindow"},
          {address: governor!, abi: governorAbi, functionName: "vetoThresholdBps"},
          {address: governor!, abi: governorAbi, functionName: "watcherBlockThreshold"},
          {address: governor!, abi: governorAbi, functionName: "performanceFeeBps"},
          {address: governor!, abi: governorAbi, functionName: "feeRecipient"},
          {address: governor!, abi: governorAbi, functionName: "allAgents"},
        ] as const)
      : [],
    query: {enabled, refetchInterval: 60_000},
  });

  return {
    vetoWindow: (data?.[0]?.result as bigint | undefined) ?? 0n,
    vetoThresholdBps: (data?.[1]?.result as bigint | undefined) ?? 0n,
    watcherBlockThreshold: (data?.[2]?.result as bigint | undefined) ?? 0n,
    performanceFeeBps: (data?.[3]?.result as bigint | undefined) ?? 0n,
    feeRecipient: data?.[4]?.result as `0x${string}` | undefined,
    agents: (data?.[5]?.result as readonly `0x${string}`[] | undefined) ?? [],
    isLoading,
  };
}

/** Vote weight the connected address had at a proposal's snapshot. */
export function useWeightAt(vault: `0x${string}` | undefined, snapshot: bigint | undefined) {
  const {address} = useAccount();
  return useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "getPastVotes",
    args: address && snapshot !== undefined ? [address, snapshot] : undefined,
    query: {enabled: Boolean(vault && address && snapshot !== undefined)},
  });
}
