import {
  DEPLOY_BLOCK,
  LOG_CHUNK,
  POLL_MS,
  client,
  erc20Abi,
  governorAbi,
  parseVaults,
  vaultAbi,
  type FundConfig,
} from "./chain.js";
import {getCursor, pool, setCursor} from "./db.js";

const ONE = 10n ** 18n;

// Health for /health: the loop bumps these after every successful poll.
let lastOkMs = 0;
let lastCursor: bigint | null = null;

export function indexerStatus(): {lastOkMs: number; cursor: bigint | null} {
  return {lastOkMs, cursor: lastCursor};
}

/** Block timestamps, fetched once per block and shared across a scan. */
type BlockTimes = Map<bigint, Date>;

async function blockTime(times: BlockTimes, n: bigint): Promise<Date> {
  const hit = times.get(n);
  if (hit) return hit;
  const b = await client.getBlock({blockNumber: n});
  const at = new Date(Number(b.timestamp) * 1000);
  times.set(n, at);
  return at;
}

/** Registers configured vaults and fills in asset metadata once. */
export async function syncFunds(funds: FundConfig[]): Promise<void> {
  for (const f of funds) {
    await pool.query(
      `INSERT INTO funds (slug, name, vault, governor)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (vault) DO UPDATE SET name = EXCLUDED.name, governor = EXCLUDED.governor`,
      [f.slug, f.name, f.vault.toLowerCase(), f.governor.toLowerCase()],
    );

    const {rows} = await pool.query<{asset: string | null}>(
      "SELECT asset FROM funds WHERE vault = $1",
      [f.vault.toLowerCase()],
    );
    if (rows[0]?.asset) continue;

    try {
      const asset = await client.readContract({
        address: f.vault,
        abi: vaultAbi,
        functionName: "asset",
      });
      const [symbol, decimals] = await Promise.all([
        client.readContract({address: asset, abi: erc20Abi, functionName: "symbol"}),
        client.readContract({address: asset, abi: erc20Abi, functionName: "decimals"}),
      ]);
      await pool.query(
        "UPDATE funds SET asset = $2, asset_symbol = $3, asset_decimals = $4 WHERE vault = $1",
        [f.vault.toLowerCase(), asset.toLowerCase(), symbol, decimals],
      );
    } catch (e) {
      // A vault that is not deployed yet is expected during setup, not an error
      // worth crashing the process over.
      console.warn(`[funds] could not read asset for ${f.slug}:`, describe(e));
    }
  }
}

/**
 * Writes a point on the equity curve.
 *
 * Called on a timer and after every strategy funding or settlement. The timer
 * alone would miss the jump a settlement causes, and settlements alone would
 * leave a flat line between them.
 *
 * Every read is pinned to one block so the row describes a single state, not
 * whatever "latest" was at each call.
 */
export async function snapshot(funds: FundConfig[], blockNumber?: bigint): Promise<void> {
  const block = blockNumber ?? (await client.getBlockNumber());

  for (const f of funds) {
    try {
      const at = {address: f.vault, abi: vaultAbi, blockNumber: block} as const;
      const [totalAssets, floatAssets, deployed, supply] = await Promise.all([
        client.readContract({...at, functionName: "totalAssets"}),
        client.readContract({...at, functionName: "float"}),
        client.readContract({...at, functionName: "deployedAssets"}),
        client.readContract({...at, functionName: "totalSupply"}),
      ]);

      // An empty vault has no meaningful price. Record parity so the chart does
      // not open with a divide-by-zero artefact.
      const sharePrice =
        supply === 0n
          ? ONE
          : await client.readContract({...at, functionName: "convertToAssets", args: [ONE]});

      await pool.query(
        `INSERT INTO snapshots (vault, block_number, total_assets, float_assets, deployed, total_supply, share_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (vault, block_number) DO NOTHING`,
        [
          f.vault.toLowerCase(),
          block.toString(),
          totalAssets.toString(),
          floatAssets.toString(),
          deployed.toString(),
          supply.toString(),
          sharePrice.toString(),
        ],
      );
    } catch (e) {
      // Fails on a backfill when the RPC has pruned that block's state.
      console.warn(`[snapshot] ${f.slug} @${block}:`, describe(e));
    }
  }
}

/**
 * Scans logs in chunks and records flows and proposal state.
 *
 * The cursor is only advanced after a chunk is fully written, so a crash
 * mid-chunk replays it rather than skipping it. Flows are keyed on tx hash and
 * log index, which makes that replay a no-op instead of a duplicate.
 */
export async function indexRange(funds: FundConfig[], from: bigint, to: bigint): Promise<void> {
  const times: BlockTimes = new Map();

  for (let start = from; start <= to; start += LOG_CHUNK) {
    const end = start + LOG_CHUNK - 1n > to ? to : start + LOG_CHUNK - 1n;

    for (const f of funds) {
      await indexVaultLogs(f, start, end, times);
      await indexGovernorLogs(f, start, end, times);
    }

    await setCursor("main", end);
  }
}

async function indexVaultLogs(f: FundConfig, from: bigint, to: bigint, times: BlockTimes): Promise<void> {
  const logs = await client.getContractEvents({
    address: f.vault,
    abi: vaultAbi,
    fromBlock: from,
    toBlock: to,
  });

  for (const log of logs) {
    const base = {
      vault: f.vault.toLowerCase(),
      block: log.blockNumber?.toString() ?? "0",
      at: log.blockNumber ? await blockTime(times, log.blockNumber) : null,
      tx: log.transactionHash ?? "",
      idx: log.logIndex ?? 0,
    };

    switch (log.eventName) {
      case "Deposit": {
        const a = log.args as {owner?: string; assets?: bigint; shares?: bigint};
        await insertFlow({
          ...base,
          kind: "deposit",
          account: (a.owner ?? "").toLowerCase(),
          assets: a.assets ?? 0n,
          shares: a.shares ?? 0n,
        });
        break;
      }
      case "Withdraw": {
        const a = log.args as {owner?: string; assets?: bigint; shares?: bigint};
        await insertFlow({
          ...base,
          kind: "withdraw",
          account: (a.owner ?? "").toLowerCase(),
          assets: a.assets ?? 0n,
          shares: a.shares ?? 0n,
        });
        break;
      }
      case "WithdrawalQueued": {
        const a = log.args as {owner?: string; shares?: bigint};
        await insertFlow({
          ...base,
          kind: "queued",
          account: (a.owner ?? "").toLowerCase(),
          assets: 0n,
          shares: a.shares ?? 0n,
        });
        break;
      }
      case "WithdrawalClaimed": {
        const a = log.args as {owner?: string; assets?: bigint};
        await insertFlow({
          ...base,
          kind: "claimed",
          account: (a.owner ?? "").toLowerCase(),
          assets: a.assets ?? 0n,
          shares: 0n,
        });
        break;
      }
      // Capital moving in and out of a strategy is where the equity curve
      // jumps, so a snapshot is pinned to that block as well.
      case "StrategyFunded": {
        const a = log.args as {target?: string; assets?: bigint};
        await insertFlow({
          ...base,
          kind: "fund",
          account: (a.target ?? "").toLowerCase(),
          assets: a.assets ?? 0n,
          shares: 0n,
        });
        await snapshot([f], log.blockNumber ?? undefined);
        break;
      }
      case "StrategySettled": {
        const a = log.args as {assetsReturned?: bigint};
        await insertFlow({
          ...base,
          kind: "settle",
          account: base.vault,
          assets: a.assetsReturned ?? 0n,
          shares: 0n,
        });
        await snapshot([f], log.blockNumber ?? undefined);
        break;
      }
      default:
        break;
    }
  }
}

async function indexGovernorLogs(f: FundConfig, from: bigint, to: bigint, times: BlockTimes): Promise<void> {
  const logs = await client.getContractEvents({
    address: f.governor,
    abi: governorAbi,
    fromBlock: from,
    toBlock: to,
  });

  for (const log of logs) {
    const args = log.args as Record<string, unknown>;
    const id = args.proposalId as string | undefined;
    if (!id) continue;

    switch (log.eventName) {
      case "ProposalPosted":
        await pool.query(
          `INSERT INTO proposals (id, governor, vault, target, assets, posted_block, posted_at, executable_at, state)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)
           ON CONFLICT (id) DO NOTHING`,
          [
            id,
            f.governor.toLowerCase(),
            f.vault.toLowerCase(),
            String(args.target ?? "").toLowerCase(),
            String(args.assets ?? 0n),
            log.blockNumber?.toString() ?? "0",
            log.blockNumber ? await blockTime(times, log.blockNumber) : null,
            String(args.executableAt ?? 0n),
          ],
        );
        break;

      case "ProposalVetoed":
        await updateProposal(id, {state: 2, veto_weight: String(args.vetoWeight ?? 0n)});
        break;

      case "ProposalBlocked":
        await updateProposal(id, {state: 3, watcher_blocks: Number(args.blocks_ ?? 0)});
        break;

      case "ProposalExecuted":
        await updateProposal(id, {state: 4});
        break;

      case "ProposalSettled":
        await updateProposal(id, {
          state: 5,
          returned: String(args.returned ?? 0n),
          fee: String(args.fee ?? 0n),
        });
        break;

      default:
        break;
    }
  }
}

async function updateProposal(id: string, patch: Record<string, string | number>): Promise<void> {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await pool.query(
    `UPDATE proposals SET ${sets}, updated_at = now() WHERE id = $1`,
    [id, ...keys.map((k) => patch[k]!)],
  );
}

async function insertFlow(f: {
  vault: string;
  kind: string;
  account: string;
  assets: bigint;
  shares: bigint;
  block: string;
  at: Date | null;
  tx: string;
  idx: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO flows (vault, kind, account, assets, shares, block_number, tx_hash, log_index, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (tx_hash, log_index) DO NOTHING`,
    [f.vault, f.kind, f.account, f.assets.toString(), f.shares.toString(), f.block, f.tx, f.idx, f.at],
  );
}

/**
 * Rows written before timestamps were recorded have NULL posted_at and
 * occurred_at. Fills them from the block number, a bounded batch per boot so a
 * large backlog cannot delay the poll loop.
 */
export async function backfillTimestamps(limit = 500): Promise<void> {
  const times: BlockTimes = new Map();

  const proposals = await pool.query<{id: string; posted_block: string}>(
    "SELECT id, posted_block FROM proposals WHERE posted_at IS NULL ORDER BY posted_block LIMIT $1",
    [limit],
  );
  for (const r of proposals.rows) {
    const at = await blockTime(times, BigInt(r.posted_block));
    await pool.query("UPDATE proposals SET posted_at = $2 WHERE id = $1", [r.id, at]);
  }

  const flows = await pool.query<{id: string; block_number: string}>(
    "SELECT id, block_number FROM flows WHERE occurred_at IS NULL ORDER BY block_number LIMIT $1",
    [limit - proposals.rows.length],
  );
  for (const r of flows.rows) {
    const at = await blockTime(times, BigInt(r.block_number));
    await pool.query("UPDATE flows SET occurred_at = $2 WHERE id = $1", [r.id, at]);
  }

  if (proposals.rows.length + flows.rows.length > 0) {
    console.log(
      `[backfill] stamped ${proposals.rows.length} proposals and ${flows.rows.length} flows`,
    );
  }
}

/** Poll loop. Runs forever; individual failures are logged and retried. */
export async function run(): Promise<void> {
  const funds = parseVaults();

  if (funds.length === 0) {
    console.log("[indexer] VAULTS is empty, nothing to index. API still serves.");
    return;
  }

  await syncFunds(funds);
  await backfillTimestamps().catch((e) => console.warn("[backfill]", describe(e)));

  let snapshotAt = 0;
  let failures = 0;

  for (;;) {
    let wait = POLL_MS;
    try {
      const head = await client.getBlockNumber();
      const cursor = await getCursor("main", DEPLOY_BLOCK);

      // Trail the head by a couple of blocks so a shallow reorg does not get
      // indexed and then cursored past.
      const safeHead = head > 2n ? head - 2n : 0n;

      if (safeHead > cursor) {
        await indexRange(funds, cursor + 1n, safeHead);
      }

      if (Date.now() - snapshotAt > 60_000) {
        await snapshot(funds);
        snapshotAt = Date.now();
      }

      lastCursor = safeHead > cursor ? safeHead : cursor;
      lastOkMs = Date.now();
      failures = 0;
    } catch (e) {
      // Back off so a dead RPC or database is not hammered every poll.
      failures += 1;
      wait = Math.min(POLL_MS * 2 ** failures, 300_000);
      console.error(`[indexer] failure ${failures}, retry in ${wait}ms:`, describe(e));
    }

    await sleep(wait);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function describe(e: unknown): string {
  return e instanceof Error ? (e.message.split("\n")[0] ?? e.message) : String(e);
}
