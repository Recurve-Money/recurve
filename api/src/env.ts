import {existsSync} from "node:fs";

/**
 * Loads a local `.env` before anything else reads `process.env`.
 *
 * This module exists as its own import because `db.ts` and `chain.ts` read the
 * environment at module evaluation time (the pool's connection string, the
 * chain selection). ES modules evaluate imports before the importing module's
 * body, so loading the file inside `index.ts` would happen too late: the pool
 * would already have been built with no DATABASE_URL. Importing this first
 * puts the read in the right order.
 *
 * Railway injects variables directly and ships no `.env`, so this is a no-op
 * there. Values already in the environment win over the file.
 */
if (existsSync(".env")) process.loadEnvFile(".env");
