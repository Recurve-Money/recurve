import express from "express";
import {POLL_MS, parseVaults} from "./chain.js";
import {pool} from "./db.js";
import {RANGE_KEYS, resolveRange} from "./history.js";
import {indexerStatus} from "./indexer.js";

export function createApi(): express.Express {
  const app = express();

  app.disable("x-powered-by");

  // The dApp is on a different origin. Reads only, so a permissive GET policy
  // is fine; there is nothing here to mutate.
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // Stays 200 while the indexer is stale: Railway's deploy healthcheck hits
  // this and a long first backfill must not fail the deploy.
  app.get("/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ok: true, indexer: indexerHealth()});
    } catch {
      res.status(503).json({ok: false, db: "unreachable"});
    }
  });

  /** For external monitors; 503 once the poll loop has stopped succeeding. */
  app.get("/health/indexer", (_req, res) => {
    const indexer = indexerHealth();
    res.status(indexer.stale ? 503 : 200).json({ok: !indexer.stale, ...indexer});
  });

  /** All funds with their latest snapshot and a 24h delta. */
  app.get("/funds", async (_req, res, next) => {
    try {
      const {rows} = await pool.query(`
        SELECT
          f.slug, f.name, f.vault, f.governor,
          f.asset, f.asset_symbol, f.asset_decimals,
          s.total_assets, s.float_assets, s.deployed, s.total_supply, s.share_price,
          s.taken_at AS updated_at,
          d.share_price AS share_price_24h
        FROM funds f
        LEFT JOIN LATERAL (
          SELECT * FROM snapshots WHERE vault = f.vault
          ORDER BY taken_at DESC LIMIT 1
        ) s ON true
        LEFT JOIN LATERAL (
          SELECT share_price FROM snapshots
          WHERE vault = f.vault AND taken_at <= now() - interval '24 hours'
          ORDER BY taken_at DESC LIMIT 1
        ) d ON true
        ORDER BY s.total_assets DESC NULLS LAST
      `);
      res.json({funds: rows.map(withReturn)});
    } catch (e) {
      next(e);
    }
  });

  app.get("/funds/:slug", async (req, res, next) => {
    try {
      const {rows} = await pool.query(
        `SELECT f.*, s.total_assets, s.float_assets, s.deployed, s.total_supply,
                s.share_price, s.taken_at AS updated_at
         FROM funds f
         LEFT JOIN LATERAL (
           SELECT * FROM snapshots WHERE vault = f.vault
           ORDER BY taken_at DESC LIMIT 1
         ) s ON true
         WHERE f.slug = $1`,
        [req.params.slug],
      );
      const fund = rows[0];
      if (!fund) return res.status(404).json({error: "no such fund"});
      res.json({fund});
    } catch (e) {
      next(e);
    }
  });

  /** Equity curve, bucketed per range (see history.ts). */
  app.get("/funds/:slug/history", async (req, res, next) => {
    try {
      const s = resolveRange(req.query.range);
      if (!s) return res.status(400).json({error: "bad range", allowed: RANGE_KEYS});

      const {rows} = await pool.query(
        `SELECT
           to_timestamp(floor(extract(epoch FROM sn.taken_at) / extract(epoch FROM $3::interval))
             * extract(epoch FROM $3::interval)) AS t,
           max(sn.total_assets) AS total_assets,
           max(sn.share_price)  AS share_price
         FROM snapshots sn
         JOIN funds f ON f.vault = sn.vault
         WHERE f.slug = $1 AND sn.taken_at > now() - $2::interval
         GROUP BY 1 ORDER BY 1`,
        [req.params.slug, s.interval, s.bucket],
      );
      res.json({range: s.key, points: rows});
    } catch (e) {
      next(e);
    }
  });

  app.get("/funds/:slug/proposals", async (req, res, next) => {
    try {
      const {rows} = await pool.query(
        `SELECT p.* FROM proposals p
         JOIN funds f ON f.vault = p.vault
         WHERE f.slug = $1
         ORDER BY p.posted_block DESC LIMIT 100`,
        [req.params.slug],
      );
      res.json({proposals: rows});
    } catch (e) {
      next(e);
    }
  });

  app.get("/proposals", async (_req, res, next) => {
    try {
      const {rows} = await pool.query(
        `SELECT p.*, f.slug, f.name FROM proposals p
         JOIN funds f ON f.vault = p.vault
         ORDER BY p.posted_block DESC LIMIT 200`,
      );
      res.json({proposals: rows});
    } catch (e) {
      next(e);
    }
  });

  /**
   * An address's flows per fund, plus net deposited.
   *
   * Net is deposits minus withdrawals in asset terms, which is cost basis, not
   * current value. Current value needs live share balance and price, and those
   * belong to the client that already holds a chain connection.
   */
  app.get("/portfolio/:address", async (req, res, next) => {
    try {
      const address = String(req.params.address).toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(address)) {
        return res.status(400).json({error: "not an address"});
      }

      const {rows} = await pool.query(
        `SELECT
           f.slug, f.name, f.vault, f.asset_symbol, f.asset_decimals,
           SUM(CASE WHEN fl.kind = 'deposit'  THEN fl.assets ELSE 0 END) AS deposited,
           SUM(CASE WHEN fl.kind IN ('withdraw','claimed') THEN fl.assets ELSE 0 END) AS withdrawn,
           COUNT(*) AS events,
           MAX(fl.block_number) AS last_block
         FROM flows fl
         JOIN funds f ON f.vault = fl.vault
         WHERE fl.account = $1
         GROUP BY f.slug, f.name, f.vault, f.asset_symbol, f.asset_decimals`,
        [address],
      );

      res.json({
        address,
        positions: rows.map((r) => ({
          ...r,
          net_deposited: (BigInt(r.deposited ?? 0) - BigInt(r.withdrawn ?? 0)).toString(),
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  app.get("/funds/:slug/flows", async (req, res, next) => {
    try {
      const {rows} = await pool.query(
        `SELECT fl.* FROM flows fl
         JOIN funds f ON f.vault = fl.vault
         WHERE f.slug = $1
         ORDER BY fl.block_number DESC LIMIT 100`,
        [req.params.slug],
      );
      res.json({flows: rows});
    } catch (e) {
      next(e);
    }
  });

  app.use((_req, res) => res.status(404).json({error: "not found"}));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[api]", err);
    res.status(500).json({error: "internal"});
  });

  return app;
}

// Read once: a malformed VAULTS must not turn /health into a DB error.
const vaults: "none" | "set" | "malformed" = (() => {
  try {
    return parseVaults().length > 0 ? "set" : "none";
  } catch {
    return "malformed";
  }
})();
const bootMs = Date.now();

/** How long a first backfill may take before never having finished a poll counts as stale. */
export const FIRST_POLL_GRACE_MS = 30 * 60 * 1000;

/**
 * Whether the indexer should be believed. With no fund to follow it idles and
 * is never stale. With one, it is stale once the loop has missed several
 * polls, and also when it has never finished one for longer than a first
 * backfill takes: a loop that fails from the start must not read as healthy.
 * A VAULTS it cannot parse is stale from the first moment.
 */
export function staleness(s: {vaults: "none" | "set" | "malformed"; lastOkMs: number; bootMs: number; now: number; pollMs: number}): boolean {
  if (s.vaults === "malformed") return true;
  if (s.vaults === "none") return false;
  if (s.lastOkMs === 0) return s.now - s.bootMs > FIRST_POLL_GRACE_MS;
  return s.now - s.lastOkMs > 5 * s.pollMs;
}

function indexerHealth(): {lastOk: number; cursor: string | null; stale: boolean; error?: string} {
  const {lastOkMs, cursor} = indexerStatus();
  const stale = staleness({vaults, lastOkMs, bootMs, now: Date.now(), pollMs: POLL_MS});
  return {
    lastOk: lastOkMs,
    cursor: cursor?.toString() ?? null,
    stale,
    ...(vaults === "malformed" ? {error: "VAULTS is malformed: nothing is being indexed"} : {}),
  };
}

/** 24h return from the share price, which is where a depositor's gain shows up. */
export function withReturn(row: Record<string, unknown>): Record<string, unknown> {
  const now = row.share_price ? BigInt(String(row.share_price)) : null;
  const then = row.share_price_24h ? BigInt(String(row.share_price_24h)) : null;

  let pct: number | null = null;
  if (now !== null && then !== null && then > 0n) {
    pct = (Number(now) / Number(then) - 1) * 100;
  }

  return {...row, return_24h_pct: pct};
}
