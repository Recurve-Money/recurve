#!/usr/bin/env python3
"""python3 build/test_deployments.py — the address rendering in deployments.py."""
import unittest

import deployments as D

TESTNET = {
    "chainId": 46630,
    "name": "Robinhood Chain Testnet",
    "deployedAt": "2026-08-20",
    "deployer": "0x66166Bda0F185e748B73701923a5A9AA35e4130b",
    "RecurveToken": "0xf103C471DBCDE5C856559380432eFDC7e59Af9ec",
    "vaults": [{
        "slug": "main", "name": "Recurve Fund", "symbol": "rvFUND",
        "WatcherRegistry": "0x26ebF51c3D6967895F83b5C33664d99F1E42c97D",
        "RecurveVault": "0x235d0cE2Ca846495E9B9f18959A41f0625c0443D",
        "RecurveGovernor": "0xe0e209799d57E6A95F72BdAe4b148cEf6f03da1a",
        "deployBlock": 103992284,
        "PortfolioStrategy": "0x1D489C89F98d0e87b53941FA4fF9737360BF1b99",
    }],
}
MAINNET_EMPTY = {"chainId": 4663, "name": "Robinhood Chain", "vaults": []}


class Deployed(unittest.TestCase):
    def test_a_network_with_vaults_is_deployed(self):
        self.assertTrue(D.deployed(TESTNET))

    def test_a_network_without_vaults_is_not(self):
        self.assertFalse(D.deployed(MAINNET_EMPTY))


class SdkSnippet(unittest.TestCase):
    def test_real_addresses_when_deployed(self):
        s = D.sdk_addresses(TESTNET)
        self.assertIn('vault:    "0x235d0cE2Ca846495E9B9f18959A41f0625c0443D"', s)
        self.assertIn('governor: "0xe0e209799d57E6A95F72BdAe4b148cEf6f03da1a"', s)
        self.assertIn('registry: "0x26ebF51c3D6967895F83b5C33664d99F1E42c97D"', s)

    def test_placeholders_when_not(self):
        s = D.sdk_addresses(MAINNET_EMPTY)
        self.assertIn('vault:    "0x..."', s)
        self.assertNotIn("0x235d", s)


class EnvSnippet(unittest.TestCase):
    def test_lists_the_asked_for_keys_in_order(self):
        s = D.env_lines(TESTNET, ["RECURVE_REGISTRY", "RECURVE_GOVERNOR"])
        self.assertEqual(s, "RECURVE_REGISTRY=0x26ebF51c3D6967895F83b5C33664d99F1E42c97D\n"
                            "RECURVE_GOVERNOR=0xe0e209799d57E6A95F72BdAe4b148cEf6f03da1a")

    def test_placeholders_when_not_deployed(self):
        s = D.env_lines(MAINNET_EMPTY, ["RECURVE_VAULT"])
        self.assertEqual(s, "RECURVE_VAULT=0x...")


class AddressTable(unittest.TestCase):
    def test_links_every_contract_to_the_explorer(self):
        t = D.address_table(TESTNET, "https://explorer.testnet.chain.robinhood.com")
        self.assertIn('href="https://explorer.testnet.chain.robinhood.com/address/0x26ebF51c3D6967895F83b5C33664d99F1E42c97D"', t)
        self.assertIn("<code>WatcherRegistry</code>", t)
        self.assertIn("<code>RecurveVault</code> (Recurve Fund, rvFUND)", t)
        self.assertIn("<code>PortfolioStrategyV2</code>", t)
        self.assertIn("$RECURVE", t)
        self.assertIn("<td>Deployer</td>", t)
        self.assertIn("<code>103992284</code>", t)

    def test_skips_rows_the_file_does_not_have(self):
        without = dict(TESTNET, vaults=[{k: v for k, v in TESTNET["vaults"][0].items() if k != "PortfolioStrategy"}])
        without.pop("deployer")
        t = D.address_table(without, "https://x")
        self.assertNotIn("PortfolioStrategy", t)
        self.assertNotIn("Deployer", t)


if __name__ == "__main__":
    unittest.main()
