import pg from "pg";
import {databaseSsl} from "./dbssl.js";

const {Pool} = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: databaseSsl(process.env.DATABASE_URL, process.env.DATABASE_SSL_NO_VERIFY === "true"),
  max: 8,
  idleTimeoutMillis: 30_000,
});

/**
 * Numeric amounts are stored as NUMERIC(78,0), which holds a full uint256
 * without loss. BIGINT tops out at 2^63 and would silently truncate a token
 * balance; float would round it. They come back as strings and the API hands
 * them to clients that way, so nothing passes through a JS number.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS cursor (
  id          TEXT PRIMARY KEY,
  last_block  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS funds (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  vault       TEXT NOT NULL UNIQUE,
  governor    TEXT NOT NULL,
  asset       TEXT,
  asset_symbol TEXT,
  asset_decimals INT DEFAULT 18,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS snapshots (
  id            BIGSERIAL PRIMARY KEY,
  vault         TEXT NOT NULL,
  block_number  BIGINT NOT NULL,
  taken_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_assets  NUMERIC(78,0) NOT NULL,
  float_assets  NUMERIC(78,0) NOT NULL,
  deployed      NUMERIC(78,0) NOT NULL,
  total_supply  NUMERIC(78,0) NOT NULL,
  share_price   NUMERIC(78,0) NOT NULL
);
CREATE INDEX IF NOT EXISTS snapshots_vault_time ON snapshots (vault, taken_at DESC);
-- One row per vault per block keeps a restart from double-writing history.
CREATE UNIQUE INDEX IF NOT EXISTS snapshots_vault_block ON snapshots (vault, block_number);

CREATE TABLE IF NOT EXISTS proposals (
  id            TEXT PRIMARY KEY,
  governor      TEXT NOT NULL,
  vault         TEXT NOT NULL,
  target        TEXT NOT NULL,
  assets        NUMERIC(78,0) NOT NULL,
  posted_block  BIGINT NOT NULL,
  posted_at     TIMESTAMPTZ,
  executable_at BIGINT,
  state         INT NOT NULL DEFAULT 1,
  veto_weight   NUMERIC(78,0) DEFAULT 0,
  watcher_blocks INT DEFAULT 0,
  returned      NUMERIC(78,0),
  fee           NUMERIC(78,0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposals_vault ON proposals (vault, posted_block DESC);

CREATE TABLE IF NOT EXISTS flows (
  id            BIGSERIAL PRIMARY KEY,
  vault         TEXT NOT NULL,
  kind          TEXT NOT NULL,
  account       TEXT NOT NULL,
  assets        NUMERIC(78,0) NOT NULL DEFAULT 0,
  shares        NUMERIC(78,0) NOT NULL DEFAULT 0,
  block_number  BIGINT NOT NULL,
  tx_hash       TEXT NOT NULL,
  log_index     INT NOT NULL,
  occurred_at   TIMESTAMPTZ
);
-- Reorgs and restarts both replay logs; the tx/log pair makes inserts idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS flows_unique ON flows (tx_hash, log_index);
CREATE INDEX IF NOT EXISTS flows_account ON flows (account, block_number DESC);
CREATE INDEX IF NOT EXISTS flows_vault ON flows (vault, block_number DESC);
`;

export async function migrate(): Promise<void> {
  await pool.query(SCHEMA);
  await renameGuardianBlocks();
}

/**
 * The build that first created the production tables (before the guardian ->
 * watcher rename) named this column guardian_blocks. CREATE TABLE IF NOT EXISTS
 * leaves an existing table alone, so without this the first ProposalBlocked
 * event fails on a missing column and the cursor never advances past it.
 * Runs every boot and is a no-op once the column is gone.
 */
async function renameGuardianBlocks(): Promise<void> {
  const {rows} = await pool.query<{column_name: string}>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'proposals'
       AND column_name IN ('guardian_blocks', 'watcher_blocks')`,
  );
  const has = new Set(rows.map((r) => r.column_name));
  if (!has.has("guardian_blocks")) return;

  if (!has.has("watcher_blocks")) {
    await pool.query("ALTER TABLE proposals RENAME COLUMN guardian_blocks TO watcher_blocks");
    console.log("[migrate] renamed proposals.guardian_blocks to watcher_blocks");
    return;
  }

  // Both exist only if the new schema was applied on a table that had been
  // altered by hand; keep whichever value was actually written.
  await pool.query(
    "UPDATE proposals SET watcher_blocks = guardian_blocks WHERE COALESCE(watcher_blocks, 0) = 0",
  );
  await pool.query("ALTER TABLE proposals DROP COLUMN guardian_blocks");
  console.log("[migrate] merged proposals.guardian_blocks into watcher_blocks and dropped it");
}

export async function getCursor(id: string, fallback: bigint): Promise<bigint> {
  const {rows} = await pool.query<{last_block: string}>(
    "SELECT last_block FROM cursor WHERE id = $1",
    [id],
  );
  return rows[0] ? BigInt(rows[0].last_block) : fallback;
}

export async function setCursor(id: string, block: bigint): Promise<void> {
  await pool.query(
    `INSERT INTO cursor (id, last_block) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET last_block = EXCLUDED.last_block`,
    [id, block.toString()],
  );
}
