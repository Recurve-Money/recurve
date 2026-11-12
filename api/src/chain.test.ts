import {describe, expect, it} from "vitest";
import {parseVaults, selectNetwork} from "./chain.js";

describe("selectNetwork", () => {
  it("defaults to mainnet when CHAIN_ID is unset", () => {
    expect(selectNetwork({})).toEqual({
      id: 4663,
      name: "Robinhood Chain",
      rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    });
  });

  it("selects testnet from CHAIN_ID", () => {
    expect(selectNetwork({CHAIN_ID: "46630"})).toEqual({
      id: 46630,
      name: "Robinhood Chain Testnet",
      rpcUrl: "https://rpc.testnet.chain.robinhood.com",
    });
  });

  it("lets RPC_URL override the selected network's endpoint", () => {
    expect(selectNetwork({CHAIN_ID: "46630", RPC_URL: "http://localhost:8545"}).rpcUrl).toBe("http://localhost:8545");
    expect(selectNetwork({RPC_URL: "http://localhost:8545"}).id).toBe(4663);
  });

  it("keeps an unknown chain id rather than silently rewriting it", () => {
    expect(selectNetwork({CHAIN_ID: "31337", RPC_URL: "http://localhost:8545"})).toEqual({
      id: 31337,
      name: "Chain 31337",
      rpcUrl: "http://localhost:8545",
    });
  });
});

describe("parseVaults", () => {
  it("parses a valid entry list", () => {
    expect(parseVaults("main:0xabc:0xdef:Recurve Fund, second:0x111:0x222:Second")).toEqual([
      {slug: "main", vault: "0xabc", governor: "0xdef", name: "Recurve Fund"},
      {slug: "second", vault: "0x111", governor: "0x222", name: "Second"},
    ]);
  });

  it("returns nothing for an empty string", () => {
    expect(parseVaults("")).toEqual([]);
  });

  it("falls back to the slug when the name is missing", () => {
    expect(parseVaults("main:0xabc:0xdef")).toEqual([
      {slug: "main", vault: "0xabc", governor: "0xdef", name: "main"},
    ]);
  });

  it("keeps colons inside the name", () => {
    expect(parseVaults("main:0xabc:0xdef:Fund: Alpha")[0]?.name).toBe("Fund: Alpha");
  });

  it("throws on a malformed entry", () => {
    expect(() => parseVaults("main:0xabc")).toThrow(/malformed/);
  });
});
