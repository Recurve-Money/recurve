import {describe, expect, it} from "vitest";
import {fromDeployment} from "./deployment";

/** The shape recurve-protocol writes to addresses/<chainId>.json. */
const testnet = {
  chainId: 46630,
  name: "Robinhood Chain Testnet",
  deployedAt: "2026-08-20",
  deployer: "0x66166Bda0F185e748B73701923a5A9AA35e4130b",
  RecurveToken: "0xf103C471DBCDE5C856559380432eFDC7e59Af9ec",
  vaults: [
    {
      slug: "main",
      name: "Recurve Fund",
      symbol: "rvFUND",
      WatcherRegistry: "0x26ebF51c3D6967895F83b5C33664d99F1E42c97D",
      RecurveVault: "0x235d0cE2Ca846495E9B9f18959A41f0625c0443D",
      RecurveGovernor: "0xe0e209799d57E6A95F72BdAe4b148cEf6f03da1a",
      deployBlock: 103992284,
      PortfolioStrategy: "0x1D489C89F98d0e87b53941FA4fF9737360BF1b99",
    },
  ],
  _note: "ignored",
};

describe("fromDeployment", () => {
  it("maps a protocol deployment file onto what the app reads", () => {
    expect(fromDeployment(testnet)).toEqual({
      registry: "0x26ebF51c3D6967895F83b5C33664d99F1E42c97D",
      recurveToken: "0xf103C471DBCDE5C856559380432eFDC7e59Af9ec",
      deployBlock: "103992284",
      vaults: [
        {
          slug: "main",
          name: "Recurve Fund",
          vault: "0x235d0cE2Ca846495E9B9f18959A41f0625c0443D",
          governor: "0xe0e209799d57E6A95F72BdAe4b148cEf6f03da1a",
        },
      ],
    });
  });

  it("reads an undeployed network as empty, which is what makes the app render its not-deployed state", () => {
    expect(fromDeployment({chainId: 4663, name: "Robinhood Chain", vaults: []})).toEqual({
      registry: "",
      recurveToken: "",
      deployBlock: "0",
      vaults: [],
    });
  });

  it("starts log scans at the earliest vault's deploy block", () => {
    const two = {
      ...testnet,
      vaults: [testnet.vaults[0]!, {...testnet.vaults[0]!, slug: "second", deployBlock: 100}],
    };
    expect(fromDeployment(two).deployBlock).toBe("100");
  });

  it("refuses a file whose chain id is not the one asked for", () => {
    expect(() => fromDeployment(testnet, 4663)).toThrow(/46630.*4663/);
  });
});
