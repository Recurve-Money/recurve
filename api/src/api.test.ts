import {describe, expect, it} from "vitest";
import {FIRST_POLL_GRACE_MS, staleness, withReturn} from "./api.js";

// pg hands NUMERIC columns back as strings, so the fixtures use strings too.
describe("withReturn", () => {
  it("computes the 24h return from share prices", () => {
    const row = withReturn({share_price: "1050000000000000000", share_price_24h: "1000000000000000000"});
    expect(row.return_24h_pct).toBeCloseTo(5, 6);
  });

  it("is null when there is no snapshot or no 24h reference", () => {
    expect(withReturn({}).return_24h_pct).toBeNull();
    expect(withReturn({share_price: "1000000000000000000", share_price_24h: null}).return_24h_pct).toBeNull();
    expect(withReturn({share_price: "1000000000000000000", share_price_24h: "0"}).return_24h_pct).toBeNull();
  });

  it("keeps the rest of the row", () => {
    const row = withReturn({slug: "main", share_price: "1", share_price_24h: "1"});
    expect(row.slug).toBe("main");
    expect(row.return_24h_pct).toBe(0);
  });
});

describe("staleness", () => {
  const at = {bootMs: 1_000_000, now: 1_000_000, pollMs: 12_000, lastOkMs: 0};

  it("is never stale with no fund to follow", () => {
    expect(staleness({...at, vaults: "none", now: at.bootMs + 10 * FIRST_POLL_GRACE_MS})).toBe(false);
  });

  it("is stale from the start when VAULTS cannot be read", () => {
    expect(staleness({...at, vaults: "malformed"})).toBe(true);
  });

  it("gives a first backfill time, then calls a loop that never finished a poll stale", () => {
    expect(staleness({...at, vaults: "set", now: at.bootMs + FIRST_POLL_GRACE_MS})).toBe(false);
    expect(staleness({...at, vaults: "set", now: at.bootMs + FIRST_POLL_GRACE_MS + 1})).toBe(true);
  });

  it("is stale once several polls have been missed", () => {
    const lastOkMs = at.bootMs + 60_000;
    expect(staleness({...at, vaults: "set", lastOkMs, now: lastOkMs + 5 * 12_000})).toBe(false);
    expect(staleness({...at, vaults: "set", lastOkMs, now: lastOkMs + 5 * 12_000 + 1})).toBe(true);
  });
});
