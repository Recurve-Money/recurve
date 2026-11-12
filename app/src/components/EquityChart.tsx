import type {HistoryPoint, HistoryRange} from "../hooks/useHistory";

const RANGE_LABEL: Record<HistoryRange, string> = {
  "24h": "the last 24 hours",
  "7d": "the last 7 days",
  "30d": "the last 30 days",
  all: "all time",
};

/**
 * Plain SVG, no chart library. The bundle already carries wagmi + RainbowKit;
 * a line and a dashed baseline do not need another dependency for it.
 */
export function EquityChart({
  points,
  decimals,
  slug,
  range,
  isError,
  isUnconfigured,
}: {
  points: HistoryPoint[] | null;
  decimals: number;
  slug: string;
  range: HistoryRange;
  isError: boolean;
  isUnconfigured?: boolean;
}) {
  if (isUnconfigured) return <div className="chart-empty">No indexer configured, so there is no history to draw.</div>;
  if (isError) return <div className="chart-empty">History unavailable — the indexer did not answer.</div>;
  if (!points) return <div className="chart-empty">Loading…</div>;

  const values = points
    .map((p) => (p.total_assets ? Number(p.total_assets) / 10 ** decimals : null))
    .filter((v): v is number => v !== null);

  if (values.length < 2) {
    return <div className="chart-empty">Not enough history yet. Check back after a deposit or two.</div>;
  }

  const W = 760;
  const H = 220;
  const PAD = 8;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, min + 1e-9);
  const span = max - min || 1;

  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (W - PAD * 2) + PAD;
    const y = H - PAD - ((v - min) / span) * (H - PAD * 2);
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1]![0].toFixed(1)} ${H} L${coords[0]![0].toFixed(1)} ${H} Z`;
  const last = values[values.length - 1]!;
  const first = values[0]!;
  const up = last >= first;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label={`TVL over ${RANGE_LABEL[range]}`}>
      <defs>
        <linearGradient id={`fade-${slug}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={up ? "var(--mint)" : "var(--err)"} stopOpacity=".16" />
          <stop offset="100%" stopColor={up ? "var(--mint)" : "var(--err)"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#fade-${slug})`} stroke="none" />
      <path d={line} fill="none" stroke={up ? "var(--mint)" : "var(--err)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
