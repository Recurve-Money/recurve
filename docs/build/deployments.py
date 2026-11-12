#!/usr/bin/env python3
"""Addresses for the docs, read from the same file the dApp reads.

`app/src/lib/addresses/4663.json` is recurve-protocol's deploy output, written
there by its deploy script. The docs render every address from it, so a rebuild
after the deploy is all they need, with no prose to edit by hand.
"""
import html
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ADDRESSES = os.path.normpath(os.path.join(HERE, "..", "..", "app", "src", "lib", "addresses"))

PLACEHOLDER = {"vault": "0x...", "governor": "0x...", "registry": "0x..."}

ENV_KEYS = {
    "RECURVE_VAULT": "vault",
    "RECURVE_GOVERNOR": "governor",
    "RECURVE_REGISTRY": "registry",
}


def load(chain_id):
    with open(os.path.join(ADDRESSES, f"{chain_id}.json")) as f:
        return json.load(f)


def deployed(net):
    return len(net.get("vaults", [])) > 0


def _first(net):
    """The addresses the SDK and the skills take: the first vault's, or placeholders."""
    if not deployed(net):
        return dict(PLACEHOLDER)
    v = net["vaults"][0]
    return {"vault": v["RecurveVault"], "governor": v["RecurveGovernor"], "registry": v["WatcherRegistry"]}


def sdk_addresses(net, indent=2):
    a = _first(net)
    pad = " " * indent
    return (
        f'{pad}vault:    "{a["vault"]}",\n'
        f'{pad}governor: "{a["governor"]}",\n'
        f'{pad}registry: "{a["registry"]}",'
    )


def env_lines(net, keys):
    a = _first(net)
    return "\n".join(f"{k}={a[ENV_KEYS[k]]}" for k in keys)


def token(net):
    """The $RECURVE token address, or a placeholder until the deploy has written it."""
    return net.get("RecurveToken") or "0x..."


def _row(label, addr, explorer):
    e = html.escape(addr)
    return f'<tr><td>{label}</td><td><a href="{explorer}/address/{e}"><code>{e}</code></a></td></tr>'


def address_table(net, explorer):
    """Every address in the file, each linked to the explorer. Rows the file lacks are left out."""
    rows = []
    for v in net["vaults"]:
        rows.append(_row("<code>WatcherRegistry</code>", v["WatcherRegistry"], explorer))
        name = html.escape(v.get("name", v["slug"]))
        symbol = f", {html.escape(v['symbol'])}" if v.get("symbol") else ""
        rows.append(_row(f"<code>RecurveVault</code> ({name}{symbol})", v["RecurveVault"], explorer))
        rows.append(_row("<code>RecurveGovernor</code>", v["RecurveGovernor"], explorer))
        if v.get("PortfolioStrategy"):
            rows.append(_row("<code>PortfolioStrategyV2</code>", v["PortfolioStrategy"], explorer))
    if net.get("RecurveToken"):
        rows.append(_row("$RECURVE", net["RecurveToken"], explorer))
    if net.get("deployer"):
        rows.append(_row("Deployer", net["deployer"], explorer))
    blocks = [v["deployBlock"] for v in net["vaults"] if "deployBlock" in v]
    if blocks:
        rows.append(f"<tr><td>Deploy block</td><td><code>{min(blocks)}</code></td></tr>")
    return (
        "<table>\n<thead><tr><th>Contract</th><th>Address</th></tr></thead>\n<tbody>\n"
        + "\n".join(rows)
        + "\n</tbody>\n</table>"
    )
