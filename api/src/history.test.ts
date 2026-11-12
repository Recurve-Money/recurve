import {describe, expect, it} from "vitest";
import {RANGE_KEYS, resolveRange} from "./history.js";

describe("resolveRange", () => {
  it("resolves every allowed key", () => {
    expect(resolveRange("24h")).toEqual({key: "24h", interval: "24 hours", bucket: "10 minutes"});
    expect(resolveRange("7d")).toEqual({key: "7d", interval: "7 days", bucket: "1 hour"});
    expect(resolveRange("30d")).toEqual({key: "30d", interval: "30 days", bucket: "6 hours"});
    expect(resolveRange("all")).toEqual({key: "all", interval: "100 years", bucket: "1 day"});
    expect(RANGE_KEYS).toEqual(["24h", "7d", "30d", "all"]);
  });

  it("defaults to 7d when no range is given", () => {
    expect(resolveRange(undefined)?.key).toBe("7d");
    expect(resolveRange("")?.key).toBe("7d");
  });

  it("returns null for anything unknown", () => {
    expect(resolveRange("bogus")).toBeNull();
    expect(resolveRange(["24h", "7d"])).toBeNull();
  });
});
