import {useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract} from "wagmi";
import {useWaitForTransactionReceipt} from "wagmi";
import {maxUint256} from "viem";
import {erc20Abi, governorAbi, registryAbi, vaultAbi} from "../lib/abi";
import {addresses} from "../lib/chain";

const ONE = 10n ** 18n;

export interface VaultState {
  asset?: `0x${string}`;
  totalAssets: bigint;
  float: bigint;
  deployed: bigint;
  totalSupply: bigint;
  sharePrice: bigint;
  decimals: number;
  symbol: string;
  isLoading: boolean;
  isError: boolean;
}

/**
 * One multicall for the whole vault, so the numbers on screen are all from the
 * same block. Reading them separately lets a settle land between calls and shows
 * a float that never existed alongside a totalAssets that did.
 */
export function useVault(vault: `0x${string}` | undefined): VaultState {
  const enabled = Boolean(vault);

  const {data, isLoading, isError} = useReadContracts({
    contracts: enabled
      ? [
          {address: vault!, abi: vaultAbi, functionName: "asset"},
          {address: vault!, abi: vaultAbi, functionName: "totalAssets"},
          {address: vault!, abi: vaultAbi, functionName: "float"},
          {address: vault!, abi: vaultAbi, functionName: "deployedAssets"},
          {address: vault!, abi: vaultAbi, functionName: "totalSupply"},
          {address: vault!, abi: vaultAbi, functionName: "convertToAssets", args: [ONE]},
        ]
      : [],
    query: {enabled, refetchInterval: 12_000},
  });

  const asset = data?.[0]?.result as `0x${string}` | undefined;

  const {data: assetMeta} = useReadContracts({
    contracts: asset
      ? [
          {address: asset, abi: erc20Abi, functionName: "decimals"},
          {address: asset, abi: erc20Abi, functionName: "symbol"},
        ]
      : [],
    query: {enabled: Boolean(asset)},
  });

  const supply = (data?.[4]?.result as bigint | undefined) ?? 0n;

  // allowFailure (the default) reports a dead RPC per entry, not as isError.
  const failed = isError || Boolean(data?.some((r) => r.status === "failure"));

  return {
    asset,
    totalAssets: (data?.[1]?.result as bigint | undefined) ?? 0n,
    float: (data?.[2]?.result as bigint | undefined) ?? 0n,
    deployed: (data?.[3]?.result as bigint | undefined) ?? 0n,
    totalSupply: supply,
    // An empty vault has no meaningful price. Report parity instead of whatever
    // convertToAssets returns for a zero supply.
    sharePrice: supply === 0n ? ONE : ((data?.[5]?.result as bigint | undefined) ?? ONE),
    decimals: (assetMeta?.[0]?.result as number | undefined) ?? 18,
    symbol: (assetMeta?.[1]?.result as string | undefined) ?? "",
    isLoading,
    isError: failed,
  };
}

/** Shares held, plus any queued redemption ids. */
export function usePosition(vault: `0x${string}` | undefined) {
  const {address} = useAccount();
  const enabled = Boolean(vault && address);

  const {data, refetch} = useReadContracts({
    contracts: enabled
      ? [
          {address: vault!, abi: vaultAbi, functionName: "balanceOf", args: [address!]},
          {address: vault!, abi: vaultAbi, functionName: "requestIdsOf", args: [address!]},
        ]
      : [],
    query: {enabled, refetchInterval: 12_000},
  });

  return {
    shares: (data?.[0]?.result as bigint | undefined) ?? 0n,
    requestIds: (data?.[1]?.result as readonly bigint[] | undefined) ?? [],
    refetch,
  };
}

/** Allowance of the vault's asset for the vault itself. */
export function useAllowance(asset: `0x${string}` | undefined, spender: `0x${string}` | undefined) {
  const {address} = useAccount();
  const enabled = Boolean(asset && spender && address);

  return useReadContract({
    address: asset,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && spender ? [address, spender] : undefined,
    query: {enabled, refetchInterval: 12_000},
  });
}

export function useBalance(asset: `0x${string}` | undefined) {
  const {address} = useAccount();
  return useReadContract({
    address: asset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {enabled: Boolean(asset && address), refetchInterval: 12_000},
  });
}

/** Wraps writeContract with receipt waiting, so callers get one pending flag. */
export function useTx() {
  const client = usePublicClient();
  const {address} = useAccount();
  const {writeContractAsync, isPending: isSigning, error} = useWriteContract();
  const [hash, setHash] = useHashState();
  const {isLoading: isMining, isSuccess} = useWaitForTransactionReceipt({
    hash,
    query: {enabled: Boolean(hash)},
  });

  return {
    send: async (args: Parameters<typeof writeContractAsync>[0]) => {
      // Simulate first: a revert then surfaces as a decoded custom error instead
      // of the wallet's opaque gas-estimation failure.
      if (client) {
        await client.simulateContract({...args, account: args.account ?? address, chain: args.chain ?? undefined});
      }
      const h = await writeContractAsync(args);
      setHash(h);
      return h;
    },
    hash,
    isPending: isSigning || isMining,
    isSuccess,
    error,
    reset: () => setHash(undefined),
  };
}

import {useState} from "react";
function useHashState() {
  return useState<`0x${string}` | undefined>(undefined);
}

export {maxUint256, vaultAbi, governorAbi, registryAbi, erc20Abi, addresses};
