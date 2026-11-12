import {formatUnits} from "viem";
import {robinhood} from "./chain";

/** Compact token amount. Keeps enough precision to be useful, not enough to be noise. */
export function fmt(value: bigint, decimals = 18, maxFrac = 4): string {
  const raw = formatUnits(value, decimals);
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (n === 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return n.toLocaleString("en-US", {maximumFractionDigits: 2});
  if (n < 0.0001) return "<0.0001";
  return n.toLocaleString("en-US", {maximumFractionDigits: maxFrac});
}

export function pct(value: bigint, total: bigint, digits = 1): string {
  if (total === 0n) return "0%";
  return ((Number(value) / Number(total)) * 100).toFixed(digits) + "%";
}

export function short(addr?: string): string {
  if (!addr) return "";
  return addr.slice(0, 6) + "\u2026" + addr.slice(-4);
}

/** Explorer of whichever network chain.ts selected, so links follow the switch. */
export function explorerAddr(addr: string): string {
  return `${robinhood.blockExplorers.default.url}/address/${addr}`;
}

/** Parses user input without throwing on the half-typed states a text field produces. */
export function parseAmount(input: string, decimals: number): bigint | null {
  const t = input.trim();
  if (!t || t === "." || !/^\d*\.?\d*$/.test(t)) return null;
  const [whole = "0", frac = ""] = t.split(".");
  if (frac.length > decimals) return null;
  try {
    return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt((frac || "0").padEnd(decimals, "0"));
  } catch {
    return null;
  }
}

/**
 * Contract reverts arrive wrapped in several layers of viem context. Pull the
 * custom error name out when it is there, since "RequestNotReady" tells a user
 * far more than a stack of ABI decode noise.
 */
export function readableError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);

  const known: Record<string, string> = {
    FloatTooLow: "The vault cannot release that much right now.",
    RequestNotReady: "Not claimable yet. The agent has to settle first.",
    RequestAlreadyClaimed: "Already claimed.",
    NotRequestOwner: "That request belongs to another address.",
    VetoWindowOpen: "Still inside the veto window.",
    VetoWindowClosed: "The veto window has closed.",
    WrongState: "This proposal is no longer pending.",
    NoVotingWeight: "No voting weight at the snapshot. Delegate before the next proposal.",
    AlreadyVetoed: "You already voted on this one.",
    WatchersBlocked: "Watchers blocked this proposal.",
    BelowMinStake: "Stake is under the minimum.",
    NothingStaked: "Nothing staked to withdraw.",
    UnstakeNotReady: "The unstake delay has not elapsed yet.",
    NoPendingUnstake: "No unstake has been requested.",
    AlreadyVoted: "Verdict already cast. They are final.",
    AlreadyConvicted: "This proposal has already been convicted.",
    ZeroAmount: "Amount must be above zero and within your stake.",
    ERC20InsufficientAllowance: "Allowance is too low. Approve first.",
    ERC20InsufficientBalance: "Not enough tokens in the wallet.",
  };

  for (const [name, text] of Object.entries(known)) {
    if (msg.includes(name)) return text;
  }
  if (msg.includes("User rejected") || msg.includes("rejected the request")) return "Cancelled.";
  if (msg.includes("insufficient funds")) return "Not enough gas.";
  return msg.split("\n")[0] ?? "Transaction failed.";
}
