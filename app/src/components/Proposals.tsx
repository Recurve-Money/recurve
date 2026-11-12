import {useState} from "react";
import {useAccount} from "wagmi";
import {governorAbi} from "../lib/abi";
import {useTx} from "../hooks/useVault";
import {
  ProposalState,
  stateLabel,
  useHasVetoed,
  useProposals,
  useWeightAt,
  type Proposal,
} from "../hooks/useGovernor";
import {fmt, readableError, short} from "../lib/format";
import type {VaultConfig} from "../lib/chain";

export function Proposals({config, decimals}: {config: VaultConfig; decimals: number}) {
  const {proposals, isLoading, isError, refetch} = useProposals(config.governor, config.vault);

  if (isLoading) return <p className="sub">Reading proposals…</p>;

  if (isError)
    return (
      <p className="warn">
        Could not read proposal logs. The RPC may prune history; point VITE_RPC_URL at an
        archive endpoint.
      </p>
    );

  if (proposals.length === 0)
    return <p className="sub">No proposals yet. The agent has not posted a strategy.</p>;

  return (
    <div className="proposals">
      {proposals.map((p) => (
        <ProposalRow key={p.id} p={p} config={config} decimals={decimals} onDone={refetch} />
      ))}
    </div>
  );
}

function ProposalRow({
  p,
  config,
  decimals,
  onDone,
}: {
  p: Proposal;
  config: VaultConfig;
  decimals: number;
  onDone: () => void;
}) {
  const {isConnected} = useAccount();
  const tx = useTx();
  const [err, setErr] = useState<string | null>(null);

  const hasVetoed = useHasVetoed(config.governor, p.id);
  const weight = useWeightAt(config.vault, p.snapshot);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const windowOpen = p.state === ProposalState.Pending && now < p.executableAt;
  const secondsLeft = windowOpen ? Number(p.executableAt - now) : 0;

  const vetoPct =
    p.snapshotSupply > 0n ? (Number(p.vetoWeight) / Number(p.snapshotSupply)) * 100 : 0;

  const canVeto =
    isConnected && windowOpen && !hasVetoed.data && (weight.data ?? 0n) > 0n;

  return (
    <div className="prop">
      <div className="prop-top">
        <code className="prop-id">{short(p.id)}</code>
        <span className={`pill state-${ProposalState[p.state].toLowerCase()}`}>
          {stateLabel[p.state]}
        </span>
      </div>

      <dl>
        <div><dt>Target</dt><dd><code>{short(p.target)}</code></dd></div>
        <div><dt>Assets</dt><dd>{fmt(p.assets, decimals)}</dd></div>
        <div><dt>Calldata</dt><dd><code>{p.callData === "0x" ? "none (funding only)" : `${p.callData.length / 2 - 1} bytes`}</code></dd></div>
        <div><dt>Watcher blocks</dt><dd>{p.blocks.toString()}</dd></div>
      </dl>

      {p.snapshotSupply > 0n && (
        <div className="veto-bar">
          <div className="veto-bar-top">
            <span>Veto weight</span>
            <span>{vetoPct.toFixed(1)}%</span>
          </div>
          <div className="bar"><i style={{width: `${Math.min(vetoPct, 100)}%`}} /></div>
        </div>
      )}

      {windowOpen && <p className="hint">Executable in {formatDuration(secondsLeft)}.</p>}

      {p.state === ProposalState.Pending && !windowOpen && (
        <p className="hint">Window closed. Waiting on the agent to execute.</p>
      )}

      {isConnected && windowOpen && (weight.data ?? 0n) === 0n && (
        <p className="hint">
          No weight at this snapshot. Delegate before the next proposal is posted.
        </p>
      )}

      {hasVetoed.data && <p className="hint">You voted against this one.</p>}

      {canVeto && (
        <button
          className="primary"
          disabled={tx.isPending}
          onClick={async () => {
            setErr(null);
            try {
              await tx.send({
                address: config.governor,
                abi: governorAbi,
                functionName: "veto",
                args: [p.id],
              });
              hasVetoed.refetch();
              onDone();
            } catch (e) {
              setErr(readableError(e));
            }
          }}
        >
          {tx.isPending ? "Confirming\u2026" : `Veto with ${fmt(weight.data ?? 0n, decimals)} votes`}
        </button>
      )}

      {err && <p className="warn">{err}</p>}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}
