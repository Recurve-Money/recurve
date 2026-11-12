import {useEffect, useState} from "react";
import {apiUrl} from "../lib/chain";

export interface HistoryPoint {
  t: string;
  total_assets: string | null;
  share_price: string | null;
}

interface HistoryState {
  points: HistoryPoint[] | null;
  isError: boolean;
  /** True when no indexer is configured at all, which is not the same as one that failed. */
  isUnconfigured: boolean;
}

export type HistoryRange = "24h" | "7d" | "30d" | "all";

/** One fetch, shared by the chart and the risk stats below it — same range,
 *  same data, no reason to hit the indexer twice for one page. */
export function useFundHistory(slug: string, range: HistoryRange = "7d"): HistoryState {
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let live = true;
    setPoints(null);
    setIsError(false);
    // Without an indexer there is nothing to ask; a fetch against "" would hit
    // the app's own origin and 404 on its index.html.
    if (!apiUrl) return;
    fetch(`${apiUrl}/funds/${slug}/history?range=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => {
        if (live) setPoints(d.points ?? []);
      })
      .catch(() => {
        if (live) setIsError(true);
      });
    return () => {
      live = false;
    };
  }, [slug, range]);

  return {points, isError, isUnconfigured: !apiUrl};
}

/** Share-price series -> total return, max drawdown, days since the last high.
 *  All three read off the same curve, so they can never disagree with the chart
 *  above them the way a separately-computed stat could. */
export function computeRisk(points: HistoryPoint[]): {
  totalReturnPct: number | null;
  maxDrawdownPct: number | null;
  daysSinceHwm: number | null;
} {
  const series = points
    .filter((p) => p.share_price !== null)
    .map((p) => ({t: new Date(p.t).getTime(), price: Number(p.share_price)}));

  if (series.length < 2) return {totalReturnPct: null, maxDrawdownPct: null, daysSinceHwm: null};

  const first = series[0]!.price;
  const last = series[series.length - 1]!.price;
  const totalReturnPct = first > 0 ? (last / first - 1) * 100 : null;

  let peak = series[0]!.price;
  let peakT = series[0]!.t;
  let maxDD = 0;
  let hwmT = series[0]!.t;

  for (const pt of series) {
    if (pt.price > peak) {
      peak = pt.price;
      peakT = pt.t;
    }
    const dd = peak > 0 ? (peak - pt.price) / peak : 0;
    if (dd > maxDD) maxDD = dd;
    if (pt.price >= peak) hwmT = peakT;
  }

  const daysSinceHwm = Math.floor((Date.now() - hwmT) / 86_400_000);

  return {totalReturnPct, maxDrawdownPct: maxDD * 100, daysSinceHwm};
}
