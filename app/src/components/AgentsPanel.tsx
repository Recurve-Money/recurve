import {useGovernorParams} from "../hooks/useGovernor";
import {explorerAddr, short} from "../lib/format";
import type {VaultConfig} from "../lib/chain";

export function AgentsPanel({config}: {config: VaultConfig}) {
  const p = useGovernorParams(config.governor);

  return (
    <div className="side-card">
      <div className="side-card-head">
        <span>Agents</span>
        <span className="pill">{p.isLoading ? "\u2026" : p.agents.length}</span>
      </div>
      {p.isLoading ? (
        <p className="hint">Reading…</p>
      ) : p.agents.length === 0 ? (
        <p className="hint">No agent registered on this fund yet.</p>
      ) : (
        <ul className="agent-list">
          {p.agents.map((a, i) => (
            <li key={a}>
              <span className="agent-avatar">A{i + 1}</span>
              <div>
                <div className="agent-name">Agent #{i + 1}</div>
                <a href={explorerAddr(a)} target="_blank" rel="noreferrer">
                  <code>{short(a)}</code>
                </a>
              </div>
              <span className="dot on" title="Registered" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
