export function BasketPanel() {
  return (
    <div className="chart-card">
      <div className="chart-card-top">
        <span>Basket</span>
        <span className="pill">Not configured</span>
      </div>
      <p className="hint">
        No strategy is attached to this fund yet. Once the agent's first proposal executes, the
        target weights it trades toward will show here.
      </p>
    </div>
  );
}
