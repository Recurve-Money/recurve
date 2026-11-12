import {useState} from "react";
import {useAccount, useReadContract, useReadContracts} from "wagmi";
import {maxUint256} from "viem";
import {erc20Abi, registryAbi} from "../lib/abi";
import {useTx} from "../hooks/useVault";
import {stateLabel, useProposals} from "../hooks/useGovernor";
import {addresses, vaults, type VaultConfig} from "../lib/chain";
import {fmt, parseAmount, readableError, short} from "../lib/format";

enum Verdict {
  None = 0,
  Approve = 1,
  Block = 2,
}

export function WatcherPanel() {
  const {address, isConnected} = useAccount();
  const registry = addresses.registry as `0x${string}`;
  const recurveToken = addresses.recurveToken as `0x${string}`;
  const tx = useTx();

  const [amount, setAmount] = useState("");
  const [proposalId, setProposalId] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const {data: tokenDecimals} = useReadContract({
    address: recurveToken,
    abi: erc20Abi,
    functionName: "decimals",
    query: {enabled: Boolean(recurveToken)},
  });
  const decimals = tokenDecimals ?? 18;

  const {data, refetch} = useReadContracts({
    contracts: address
      ? [
          {address: registry, abi: registryAbi, functionName: "watchers", args: [address]},
          {address: registry, abi: registryAbi, functionName: "minStake"},
          {address: recurveToken, abi: erc20Abi, functionName: "balanceOf", args: [address]},
          {address: recurveToken, abi: erc20Abi, functionName: "allowance", args: [address, registry]},
        ]
      : [],
    query: {enabled: Boolean(address && registry && recurveToken), refetchInterval: 15_000},
  });

  const g = data?.[0]?.result as readonly [bigint, bigint, bigint, boolean] | undefined;
  const stake = g?.[0] ?? 0n;
  const pendingUnstake = g?.[2] ?? 0n;
  const active = g?.[3] ?? false;
  const minStake = (data?.[1]?.result as bigint | undefined) ?? 0n;
  const balance = (data?.[2]?.result as bigint | undefined) ?? 0n;
  const allowance = (data?.[3]?.result as bigint | undefined) ?? 0n;

  const parsed = parseAmount(amount, decimals);
  const needsApproval = parsed !== null && allowance < parsed;

  const validId = /^0x[0-9a-fA-F]{64}$/.test(proposalId.trim());

  async function run(fn: () => Promise<unknown>, ok: string) {
    setNote(null);
    try {
      await fn();
      setNote(ok);
      refetch();
    } catch (e) {
      setNote(readableError(e));
    }
  }

  if (!addresses.registry) {
    return <p className="sub">The watcher registry is not deployed yet.</p>;
  }

  // The fund can open before $RECURVE exists. Nothing to stake means nothing here yet.
  if (!recurveToken) {
    return (
      <section className="panel">
        <h3>Watcher</h3>
        <p className="muted">Staking opens when $RECURVE launches.</p>
      </section>
    );
  }

  return (
    <div className="watcher">
      <div className="stats">
        <Stat k="Your stake" v={fmt(stake, decimals)} />
        <Stat k="Minimum" v={fmt(minStake, decimals)} />
        <Stat k="Status" v={active ? "Active" : "Inactive"} />
        <Stat k="Wallet" v={fmt(balance, decimals)} />
      </div>

      {stake > 0n && stake < minStake && (
        <p className="warn">
          Stake is below the minimum, so verdicts will revert. Top up to become active again.
        </p>
      )}

      <div className="panel">
        <h3>Stake $RECURVE</h3>
        <div className="field">
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <span className="unit">RECURVE</span>
          <button className="max" onClick={() => setAmount(fmtRaw(balance, decimals))}>
            Max
          </button>
        </div>

        <button
          className="primary"
          disabled={!isConnected || parsed === null || parsed === 0n || tx.isPending}
          onClick={() =>
            run(async () => {
              if (needsApproval) {
                await tx.send({
                  address: recurveToken,
                  abi: erc20Abi,
                  functionName: "approve",
                  args: [registry, maxUint256],
                });
                return;
              }
              await tx.send({
                address: registry,
                abi: registryAbi,
                functionName: "stake",
                args: [parsed!],
              });
            }, needsApproval ? "Approved. Submit again to stake." : "Staked.")
          }
        >
          {!isConnected
            ? "Connect wallet"
            : tx.isPending
              ? "Confirming\u2026"
              : needsApproval
                ? "Approve RECURVE"
                : "Stake"}
        </button>

        {stake > 0n && (
          <div className="unstake">
            {pendingUnstake > 0n ? (
              <>
                <p className="hint">
                  {fmt(pendingUnstake, decimals)} RECURVE pending. Stake stays slashable until it is
                  withdrawn.
                </p>
                <button
                  className="ghost-btn"
                  disabled={tx.isPending}
                  onClick={() =>
                    run(
                      () =>
                        tx.send({address: registry, abi: registryAbi, functionName: "unstake"}),
                      "Withdrawn.",
                    )
                  }
                >
                  Withdraw
                </button>
              </>
            ) : (
              <button
                className="ghost-btn"
                disabled={tx.isPending}
                onClick={() =>
                  run(
                    () =>
                      tx.send({
                        address: registry,
                        abi: registryAbi,
                        functionName: "requestUnstake",
                        args: [stake],
                      }),
                    "Unstake requested. The delay has to elapse first.",
                  )
                }
              >
                Request unstake
              </button>
            )}
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Cast a verdict</h3>
        <p className="hint" style={{marginTop: 0, marginBottom: 14}}>
          Simulate the calldata before you do this. A verdict is final, and approving a call
          that drains a vault burns your whole stake.
        </p>

        <div className="field">
          <select value={proposalId} onChange={(e) => setProposalId(e.target.value)}>
            <option value="">Pick a proposal</option>
            {vaults.map((v) => (
              <ProposalOptions key={v.slug} config={v} />
            ))}
          </select>
        </div>

        <div className="field" style={{marginTop: 8}}>
          <input
            placeholder="0x… proposal id (or paste one)"
            value={proposalId}
            onChange={(e) => setProposalId(e.target.value)}
            spellCheck={false}
          />
        </div>

        {proposalId.trim() !== "" && !validId && (
          <p className="warn">That is not a 32-byte proposal id.</p>
        )}

        <div className="verdict-row">
          <button
            className="block-btn"
            disabled={!active || !validId || tx.isPending}
            onClick={() =>
              run(
                () =>
                  tx.send({
                    address: registry,
                    abi: registryAbi,
                    functionName: "castVerdict",
                    args: [proposalId.trim() as `0x${string}`, Verdict.Block],
                  }),
                "Blocked.",
              )
            }
          >
            Block
          </button>
          <button
            className="approve-btn"
            disabled={!active || !validId || tx.isPending}
            onClick={() =>
              run(
                () =>
                  tx.send({
                    address: registry,
                    abi: registryAbi,
                    functionName: "castVerdict",
                    args: [proposalId.trim() as `0x${string}`, Verdict.Approve],
                  }),
                "Approved.",
              )
            }
          >
            Approve
          </button>
        </div>

        {!active && (
          <p className="hint">Stake at least {fmt(minStake, decimals)} RECURVE before casting verdicts.</p>
        )}
      </div>

      {note && <p className="note">{note}</p>}
    </div>
  );
}

/** Option rows for one fund. A component so each fund gets its own log scan hook. */
function ProposalOptions({config}: {config: VaultConfig}) {
  const {proposals} = useProposals(config.governor, config.vault);
  return (
    <>
      {proposals.map((p) => (
        <option key={p.id} value={p.id}>
          {config.name} · {short(p.id)} · {stateLabel[p.state]}
        </option>
      ))}
    </>
  );
}

function Stat({k, v}: {k: string; v: string}) {
  return (
    <div className="stat">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function fmtRaw(v: bigint, decimals: number): string {
  const s = v.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

export {useReadContract};
