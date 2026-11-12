import {useGovernorParams} from "../hooks/useGovernor";
import {explorerAddr, short} from "../lib/format";
import type {VaultConfig} from "../lib/chain";

function hours(seconds: bigint): string {
  const h = Number(seconds) / 3600;
  if (h < 1) return `${Math.round(Number(seconds) / 60)}m`;
  return `${Math.round(h)}h`;
}

function pct(bps: bigint): string {
  return `${(Number(bps) / 100).toFixed(0)}%`;
}

export function GovernorPanel({config}: {config: VaultConfig}) {
  const p = useGovernorParams(config.governor);

  return (
    <div className="side-card">
      <div className="side-card-head">
        <span>Governor</span>
      </div>
      <dl className="kv">
        <div>
          <dt>Contract</dt>
          <dd>
            <a href={explorerAddr(config.governor)} target="_blank" rel="noreferrer">
              <code>{short(config.governor)}</code>
            </a>
          </dd>
        </div>
        <div>
          <dt>Voting window</dt>
          <dd>{p.isLoading ? "\u2026" : hours(p.vetoWindow)}</dd>
        </div>
        <div>
          <dt>Depositor veto</dt>
          <dd>{p.isLoading ? "\u2026" : pct(p.vetoThresholdBps)}</dd>
        </div>
        <div>
          <dt>Blocks to stop</dt>
          <dd>{p.isLoading ? "\u2026" : p.watcherBlockThreshold.toString()}</dd>
        </div>
        <div>
          <dt>Performance fee</dt>
          <dd>{p.isLoading ? "\u2026" : pct(p.performanceFeeBps)}</dd>
        </div>
      </dl>
    </div>
  );
}
