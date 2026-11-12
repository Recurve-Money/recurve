# recurve-api

Indexer and read API for Recurve. Watches vault and governor events, writes
snapshots, and serves the history the dApp cannot get from chain reads alone.

## Why this exists

Everything the frontend shows live comes straight off chain. Everything with a
time axis cannot: there is no way to ask a node what a vault's TVL was last
Tuesday. Equity curves, 24h returns, drawdown, and a depositor's cost basis all
need something recording state as it happens.

## Stack

Node 20, TypeScript strict, Express, Postgres, viem. One process runs both the
API and the indexer.

## Endpoints

| Route | Returns |
|---|---|
| `GET /health` | Liveness plus a database ping and indexer status (always 200 while the database answers) |
| `GET /health/indexer` | 503 once the indexer has missed five polls, has not finished its first within thirty minutes, or cannot read `VAULTS`; for external monitors |
| `GET /funds` | Every fund with its latest snapshot and 24h return |
| `GET /funds/:slug` | One fund |
| `GET /funds/:slug/history?range=24h\|7d\|30d\|all` | Bucketed equity curve |
| `GET /funds/:slug/proposals` | Proposal history for a fund |
| `GET /funds/:slug/flows` | Recent deposits, withdrawals, queue events |
| `GET /proposals` | Proposals across all funds |
| `GET /portfolio/:address` | Per-fund deposited, withdrawn, and net |

Amounts are strings holding full uint256 values. Do not parse them into JS
numbers; a token balance overflows a double well before it overflows the column.

## Configuration

```
DATABASE_URL       injected by Railway's Postgres plugin
CHAIN_ID           picks the network, default 4663 (mainnet); 46630 is testnet
RPC_URL            overrides the selected network's endpoint
DEPLOY_BLOCK       block the contracts went up, default 0
VAULTS             slug:vault:governor:name, comma separated
POLL_MS            block poll interval, default 12000
LOG_CHUNK          blocks per getLogs call, default 2000
CORS_ORIGIN        Access-Control-Allow-Origin, default *
PORT               default 3000
```

Both networks live in the `NETWORKS` record in `src/chain.ts`, so switching is a
`CHAIN_ID` change and nothing else: the chain name and the RPC endpoint follow
the id. `RPC_URL` is only needed to point at a different endpoint for that
network. Mainnet is the default; the Recurve contracts that exist today are on
testnet (46630), so a mainnet run indexes nothing until there is a mainnet
deploy — set `CHAIN_ID=46630` with the testnet `DEPLOY_BLOCK` and `VAULTS` (see
`.env.example`) to index the live fund.

### Before you push this change

**The deployed Railway service indexes the testnet fund, and its variables live
in the Railway dashboard, not in this repo.** Changing the code default does not
touch a variable Railway sets explicitly — but if `CHAIN_ID`, `RPC_URL`,
`VAULTS`, and `DEPLOY_BLOCK` are *not* all set there, the next deploy picks up
the new mainnet default and starts indexing a chain with no Recurve contracts.
The failure is silent: the rows already in Postgres stay, so `/funds` keeps
serving the fund frozen at its last testnet snapshot while no new ones are
written, and `/health` still reads green. Worse if `VAULTS` is set there but
`CHAIN_ID` is not — the testnet vault and governor addresses point at unrelated
third-party contracts on mainnet 4663, so the indexer would be reading a
stranger's contract. Open the service's Variables tab and confirm all four are
set before pushing.

Vaults come from an env string rather than a config file, so adding a fund is a
variable change instead of a redeploy.

Both Robinhood RPCs cap `eth_getLogs` at 100,000 blocks per call (since
October 2026; a wider range answers "Invalid parameters were provided to the
RPC method" and the indexer retries forever), so `LOG_CHUNK=100000` is the
largest that works and turns the initial backfill from hours into minutes. The
code default stays at 2000 for endpoints that allow less.

On boot the process asks the RPC for its chain id. If it disagrees with the
configured chain — whether `CHAIN_ID` is set or left on the mainnet default — it
logs an error and keeps going rather than crash-looping a deploy whose `RPC_URL`
is right.

Watcher-registry events are not indexed yet; only vault and governor logs are.

## Deploying to Railway

1. New project, deploy from this repo
2. Add the Postgres plugin. `DATABASE_URL` is injected automatically. Its
   certificate is one Node cannot verify, so also set `DATABASE_SSL_NO_VERIFY=true`;
   without it the indexer refuses the connection
3. Set the variables above
4. `git push` to main (Railway rebuilds) — or `npm i -g @railway/cli && railway up`

There is no local git checkout in this folder; push from wherever the clone
lives.

The schema is created on boot, so there is no migration step. The one
exception is a guarded rename of `proposals.guardian_blocks` to
`watcher_blocks`, left over from the build that first created the production
tables; it runs every boot and is a no-op once done.

## How the indexer behaves

**Idempotent.** Flows are keyed on transaction hash and log index. A restart
that replays a chunk writes nothing new instead of doubling every deposit.

**Cursor after write.** The cursor advances only once a chunk is fully
persisted, so a crash mid-chunk replays rather than skips.

**Trails the head by two blocks.** A shallow reorg would otherwise get indexed
and then cursored past, leaving orphaned rows nothing will correct.

**Snapshots on a timer and on `StrategyFunded` / `StrategySettled`.** The timer
alone misses the jump a settlement causes; settlements alone leave a flat line
between them. Every snapshot's reads are pinned to one block, so the row
describes a single state. The public RPCs are not archive nodes, so an event
snapshot replayed from a long backfill can hit pruned state; it is logged and
skipped rather than written from the wrong block.

**Backs off on failure.** A failed poll doubles the wait, capped at five
minutes, and resets once a poll succeeds. `/health/indexer` goes 503 in the
meantime.

## Local development

```bash
docker run -d --name recurve-pg -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=recurve \
  -p 55432:5432 postgres:16-alpine

npm install
cp .env.example .env    # DATABASE_URL=postgresql://postgres:pw@localhost:55432/recurve
npm run dev
```

`.env` is read by `src/env.ts`, which `index.ts` imports before anything else:
`db.ts` and `chain.ts` read `process.env` at import time (the pool's connection
string, the chain selection), and ES modules evaluate imports before the
importing module's body — so loading the file any later would build the pool
with no `DATABASE_URL`. Railway injects variables directly and ships no `.env`,
where this is a no-op.

To index the live testnet fund rather than an empty mainnet, use the testnet
block in `.env.example` (`CHAIN_ID=46630` and the three addresses). Set
`DEPLOY_BLOCK` to the block *before* the deploy: the first scan starts at
`DEPLOY_BLOCK + 1`.

With `VAULTS` empty the indexer idles and the API still serves, which is the
right state before anything is deployed.

**History starts when you do.** Snapshots are written from the moment the
indexer runs; pinned snapshots for old `StrategyFunded` / `StrategySettled`
events fail on a public RPC (`Missing or invalid parameters` — it is not an
archive node) and are logged and skipped. The equity curve therefore has no
past, only what it has watched.

