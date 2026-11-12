import {computeRisk, type HistoryPoint} from "../hooks/useHistory";

export function RiskPanel({
  points,
  isError,
  isUnconfigured,
}: {
  points: HistoryPoint[] | null;
  isError: boolean;
  isUnconfigured?: boolean;
}) {
  // Derived from the equity curve, so with no indexer there is nothing to derive.
  if (isUnconfigured) return null;
  if (!points && !isError) return null;

  const r = computeRisk(points ?? []);
  const noData = r.totalReturnPct === null;

  return (
    <div className="chart-card">
      <div className="chart-card-top">
        <span>Risk</span>
        <span className="pill">Derived</span>
      </div>
      {isError ? (
        <div className="risk-row">
          <div className="risk-stat"><span className="v">&mdash;</span><span className="k">Total return</span></div>
          <div className="risk-stat"><span className="v">&mdash;</span><span className="k">Max drawdown</span></div>
          <div className="risk-stat"><span className="v">&mdash;</span><span className="k">Days since high-water mark</span></div>
        </div>
      ) : noData ? (
        <p className="hint">Not enough history yet to compute return or drawdown.</p>
      ) : (
        <div className="risk-row">
          <div className="risk-stat">
            <span className={`v ${r.totalReturnPct! >= 0 ? "up" : "down"}`}>
              {r.totalReturnPct! >= 0 ? "+" : ""}
              {r.totalReturnPct!.toFixed(2)}%
            </span>
            <span className="k">Total return</span>
          </div>
          <div className="risk-stat">
            <span className="v">{r.maxDrawdownPct!.toFixed(2)}%</span>
            <span className="k">Max drawdown</span>
          </div>
          <div className="risk-stat">
            <span className="v">{r.daysSinceHwm}d</span>
            <span className="k">Days since high-water mark</span>
          </div>
        </div>
      )}
      <p className="hint">Computed from the equity curve. Excludes mid-strategy unrealized P&amp;L.</p>
    </div>
  );
}
