import "./env.js"; // must come first: db.ts and chain.ts read process.env at import time
import {createApi} from "./api.js";
import {chain, client} from "./chain.js";
import {migrate, pool} from "./db.js";
import {run} from "./indexer.js";

const PORT = Number(process.env.PORT ?? 3000);

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Attach a Postgres plugin on Railway.");
  }

  await migrate();
  console.log("[boot] schema ready");

  // A mismatch is loud but not fatal: exiting would crash-loop a deploy whose
  // RPC_URL is right and CHAIN_ID merely stale. Same for a transient RPC
  // failure (rate limit, DNS): the API must come up regardless and the
  // indexer loop has its own retry.
  let rpcChainId: number | null = null;
  try {
    rpcChainId = await client.getChainId();
  } catch (e) {
    console.error("[boot] could not read chain id from RPC:", e instanceof Error ? e.message.split("\n")[0] : e);
  }
  if (rpcChainId !== null && rpcChainId !== chain.id) {
    // An unset CHAIN_ID now means the mainnet default rather than "whatever the
    // RPC is", so a mismatch is worth shouting about either way.
    const configured =
      process.env.CHAIN_ID === undefined || process.env.CHAIN_ID === ""
        ? `chain ${chain.id} (CHAIN_ID unset, mainnet default)`
        : `CHAIN_ID=${process.env.CHAIN_ID}`;
    // Name the endpoint, not the variable: RPC_URL may be unset and the URL
    // then came from the selected network.
    console.error(
      `[boot] CHAIN ID MISMATCH: ${configured} but rpc ${chain.rpcUrls.default.http[0]} reports chain ${rpcChainId}. Fix CHAIN_ID or RPC_URL.`,
    );
  } else if (rpcChainId !== null) {
    console.log(`[boot] chain ${chain.id} (${chain.name})`);
  }

  const app = createApi();
  const server = app.listen(PORT, () => console.log(`[boot] api on :${PORT}`));

  // The indexer runs in the same process. One service is cheaper on Railway and
  // the loop is IO bound, so it does not starve the API. Split them if the log
  // scan ever gets heavy enough to add latency to requests.
  run().catch((e) => console.error("[indexer] fatal", e));

  const shutdown = async (signal: string) => {
    console.log(`[shutdown] ${signal}`);
    server.close();
    await pool.end().catch(() => {});
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((e) => {
  console.error("[boot] failed:", e);
  process.exit(1);
});
