export interface RangeSpec {
  key: string;
  interval: string;
  bucket: string;
}

/**
 * Buckets so a year of minute snapshots does not ship 500k rows to a chart
 * that can draw a few hundred points.
 */
const RANGES: Record<string, Omit<RangeSpec, "key">> = {
  "24h": {interval: "24 hours", bucket: "10 minutes"},
  "7d": {interval: "7 days", bucket: "1 hour"},
  "30d": {interval: "30 days", bucket: "6 hours"},
  all: {interval: "100 years", bucket: "1 day"},
};

export const RANGE_KEYS = Object.keys(RANGES);

/** Maps a ?range value to its SQL intervals; null for anything unknown. */
export function resolveRange(raw: unknown): RangeSpec | null {
  const key = raw === undefined || raw === "" ? "7d" : String(raw);
  const spec = RANGES[key];
  return spec ? {key, ...spec} : null;
}
