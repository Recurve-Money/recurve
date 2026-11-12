# Recurve

Capital infrastructure for autonomous funds. Depositors pool capital into an
ERC-4626 vault, an agent operates it under optimistic governance, and staked
watchers replay the calldata before it executes.

One repository, one server, one deploy. The site, the dApp and the docs are one
address; the indexer and the agent run beside them.

```
site/      marketing site      -> www.recurvemoney.xyz            (static)
app/       the dApp            -> www.recurvemoney.xyz/app        (Vite + React, built into site/app)
docs/      documentation       -> www.recurvemoney.xyz/docs       (generated into site/docs)
api/       indexer + read API  -> www.recurvemoney.xyz/indexer    (Node + Postgres)
runner/    the fund's agent    -> no address, it only calls out   (its own repository)
protocol/  the contracts       -> Robinhood Chain                 (its own repository)
deploy/    the server          -> Docker Compose, Caddy           (not in this repository)
```

The contracts and the runner are repositories of their own, checked out into
this folder:

```bash
git clone https://github.com/Recurve-Money/recurve-protocol protocol
git clone https://github.com/Recurve-Money/recurve-runner runner
```

`protocol/DEPLOY-MAINNET.md` is the rehearsed runbook for the mainnet deploy.
`deploy/` describes the one server the site runs on and stays with whoever
operates it; `npm run deploy` and the files this README names under `deploy/`
are theirs.

## Running everything

```bash
npm run dev
```

Everything on one address, with one log, and one Ctrl-C stops it:

| | |
|---|---|
| site | http://localhost:8091 |
| app  | http://localhost:8091/app |
| docs | http://localhost:8091/docs |

`scripts/serve-site.mjs` is the one server: the site's static files, the
functions in `site/api/` (so `/admin` works against a stand-in store in `.dev/`,
see `site/README.md`), and Vite in the same process for `/app`, hot reload
included. With `VITE_NETWORK=testnet` in `app/.env.development` (a file that is
not in the repository) the local dApp reads the testnet fund, so it has
something to show; a build reads mainnet.

The indexer starts beside it on :3002 with its Postgres, the `recurve-pg` Docker
container, created on the first run. It needs `api/.env`
(`cp api/.env.example api/.env`, with `DATABASE_URL` pointing at the container,
`postgresql://postgres:pw@localhost:55432/recurve`). Without Docker or that file
everything else still runs: every number comes from chain, and only the equity
chart and the risk panel stay empty.

`runner/` is not in it: it signs transactions with the fund's agent
key, so it only ever runs on purpose. `cp runner/.env.example runner/.env`,
fill it in, keep `DRY_RUN=true`, then `npm run dev:runner`. Its README covers
the policy knobs.

## Other scripts

| Command | What it does |
|---|---|
| `npm run install:all` | `npm install` in `app/`, `api/` and `runner/` |
| `npm run build` | Builds the website and the API |
| `npm run build:site` | Everything that ships in `site/`: `zh/`, `docs/` and `app/` |
| `npm run build:docs` | Regenerates `site/docs/` from `docs/build/pages.py` |
| `npm run build:contracts` | `forge build`, then writes `site/contracts.json` for `/admin` |
| `npm run build:app` | Builds the dApp into `site/app/` |
| `npm run deploy` | Builds the website and ships everything to the server |
| `npm run typecheck` | `tsc --noEmit` in `app/`, `api/` and `runner/` |
| `npm test` | The app, API and runner vitest suites, and the docs generator's tests |

`site/zh/`, `site/docs/` and `site/app/` are generated. Edit `site/build/zh.py`,
`docs/build/pages.py` and `app/src/` instead; a hand edit is overwritten on the
next build.

## Deploying

```bash
npm run deploy
```

That builds the website here, ships it with the indexer and the runner to the one
server, and restarts what changed.
`deploy/README.md` covers the server, the first launch, the DNS and Cloudflare.
The dApp's build settings live in `app/.env.production`.

## Chain

Everything live runs on Robinhood Chain. Mainnet (4663) is the default
everywhere; testnet (46630) is where the only deployment is today.

Addresses have one home: `app/src/lib/addresses/<chainId>.json`, which is
recurve-protocol's `addresses/<chainId>.json` copied in verbatim. The dApp
reads it at build time and the docs generator renders every address table
and snippet from it, and `deploy/write-env.mjs` hands the same addresses to the
indexer and the runner on every deploy.

## Going to mainnet

Nothing Recurve is deployed on 4663 yet, so `addresses/4663.json` has no
vaults and the dApp lists the Recurve Fund as not live yet. The contract deploy itself
— decisions, cost (≈0.00015 ETH of gas on 2026-10-31), exact commands — is
`protocol/DEPLOY-MAINNET.md`, rehearsed end to end on a fork of mainnet. When
the protocol deploy lands, in this order:

1. Launch from a wallet at `/admin` (`site/launch.js`): it deploys, wires, hands
   the agent list to the Safe and publishes the addresses, and the app reads them
   straight away. $RECURVE can come last: the fund opens without it and Attach
   $RECURVE finishes the job. `npm run rehearse:launch` runs the same code on a
   fork of mainnet. `protocol/deploy-mainnet.sh --broadcast` is the terminal way,
   and needs the token first.
2. Put `VITE_WALLETCONNECT_ID` in `app/.env.production` and add
   `www.recurvemoney.xyz` to the allowlist at dashboard.reown.com.
3. `npm run deploy`. Check `/indexer/health/indexer`. Delete
   `app/.env.development` (it pins local dev to testnet) when local dev should
   follow mainnet too.
4. `bash deploy/agent-key.sh`, run by hand, then `npm run deploy` again. The
   runner starts with `DRY_RUN=true`. Read the log, then turn the dry run off
   (`deploy/README.md`). The agent key must be an agent on the governor and hold
   ETH for gas plus USDG for performance fees.
5. $RECURVE's address goes in at `/admin` on the live site, no rebuild
   (`site/README.md`, "Token address").
