/**
 * A fund launched at /admin goes live here without a rebuild: the public read
 * carries its deployment, and it has to arrive before anything that depends on
 * the addresses loads, which is why the app itself is a dynamic import. A slow
 * or missing answer only means the built-in file counts.
 */
async function publishedDeployment(): Promise<unknown> {
  if (import.meta.env.VITE_NETWORK === "testnet") return undefined;
  try {
    const res = await fetch("/api/token", {signal: AbortSignal.timeout(3000)});
    return res.ok ? (await res.json()).deployment : undefined;
  } catch {
    return undefined;
  }
}

publishedDeployment().then((deployment) => {
  (globalThis as {__RECURVE_DEPLOYMENT__?: unknown}).__RECURVE_DEPLOYMENT__ = deployment;
  return import("./mount");
});
