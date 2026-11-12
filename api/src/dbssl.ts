/**
 * Whether the database connection is encrypted, and whether the server's
 * certificate is checked.
 *
 * None on this machine or when the URL says `sslmode=disable`, which is how the
 * server reaches its Postgres: over a Docker network nothing else is on.
 * Anywhere else the connection is encrypted and the certificate verified. Some
 * hosts, Railway among them, present a certificate Node cannot verify;
 * `DATABASE_SSL_NO_VERIFY=true` accepts it, and has to be asked for: without
 * the check anyone on the path can stand in for the database.
 */
export function databaseSsl(databaseUrl: string | undefined, noVerify: boolean): false | {rejectUnauthorized: boolean} {
  if (!databaseUrl) return false;
  try {
    const url = new URL(databaseUrl);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (local || url.searchParams.get("sslmode") === "disable") return false;
  } catch {
    // Not a URL this can read: leave the decision with the stricter side.
  }
  return {rejectUnauthorized: !noVerify};
}
