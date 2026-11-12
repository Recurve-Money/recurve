import {ConnectButton} from "@rainbow-me/rainbowkit";
import {useMemo, useState} from "react";
import {useBlockNumber} from "wagmi";
import {isConfigured, robinhood, vaults, type VaultConfig} from "./lib/chain";
import {useVault} from "./hooks/useVault";
import {useGovernorParams, useProposals} from "./hooks/useGovernor";
import {fmt, short} from "./lib/format";
import {VaultPanel} from "./components/VaultPanel";
import {Proposals} from "./components/Proposals";
import {WatcherPanel} from "./components/WatcherPanel";
import {AgentsPanel} from "./components/AgentsPanel";
import {GovernorPanel} from "./components/GovernorPanel";
import {RiskPanel} from "./components/RiskPanel";
import {BasketPanel} from "./components/BasketPanel";
import {EquityChart} from "./components/EquityChart";
import {Scene} from "./components/Scene";
import {useFundHistory, type HistoryRange} from "./hooks/useHistory";

const MARK = (
  <svg viewBox="0 0 612 759" fill="currentColor" aria-hidden="true" className="mark">
    <path d="M553 5.6a869 869 0 0 0-73 7.4 1118 1118 0 0 0-69.5 12.6c-111.8 25.6-185.8 56.6-250 104.5a409 409 0 0 0-64.2 59.4l-11.4 14c-40.7 50-78.3 143-80.2 198-.3 9.2.7 8.5 11-7.1 28.1-42.5 53.5-72 86.3-100.5 78.9-68.4 212.1-120.4 323.9-126.5 12.3-.7 12.3-.7 17.6-5.3 7.5-6.6 47.1-43.9 66-62.1 21.4-20.7 68.7-64.8 85.8-80 8.8-7.8 13.7-12.9 13.5-13.9-.4-2.1-26.9-2.4-55.8-.5m-77 245.1c-56.8 2.6-115.6 11.2-152.5 22.2L310 277C164.8 320.5 74.7 407 33.6 542.5A422 422 0 0 0 18 605c-5.4 28.7-6.1 37.7-2.7 33.7a43 43 0 0 0 4.7-8.5c3.6-9.2 18.3-36.9 24.6-46.8 7.6-11.8 16.6-25 20.1-29.4 15.4-19.4 21.1-26 37.2-42.1a335 335 0 0 1 44-38.4l12.2-8.5c27.4-19 102.9-51.2 119.7-51 .8 0 4.6-.9 8.5-1.9 9.8-2.6 22.9-4.8 37.1-6.3 11.9-1.2 11.9-1.2 18.3-6.7a1502 1502 0 0 1 64.7-62.1l31.9-29.5c16.4-15.1 24.7-22.7 45-40.6 19.3-17.2 19.2-17.5-7.3-16.2M275.5 495.6c-39.3 12.1-62.9 24.1-88.7 45.2-19.2 15.6-19.5 16.8-9 32.3 48.9 72.4 138.5 143.3 215.2 170.4 5.8 2.1 15.1 5.7 20.7 8.1 19.5 8.3 19.8 5.4 1.4-10.1a416 416 0 0 1-57.1-57.9 300 300 0 0 1-30.7-41.6l-7.8-13c-18.7-31.3-32.7-82.1-31.1-113.4 1.3-24.7 1.5-22.1-1.9-22.3-1.6-.1-6.6.9-11 2.3" />
  </svg>
);

const GITHUB = (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8" /></svg>
);

const DISCORD = (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.55 2.9A13 13 0 0 0 10.3 1.9a9 9 0 0 0-.42.85 12 12 0 0 0-3.6 0A9 9 0 0 0 5.85 1.9a13 13 0 0 0-3.25 1A13.4 13.4 0 0 0 .3 11.99a13.1 13.1 0 0 0 3.98 2.01c.32-.44.6-.9.85-1.4a8.5 8.5 0 0 1-1.34-.64l.33-.26a9.4 9.4 0 0 0 8.03 0l.33.26c-.43.25-.88.47-1.35.64.25.5.54.96.85 1.4a13 13 0 0 0 3.99-2.02 13.3 13.3 0 0 0-2.32-9.07M5.53 10.4c-.78 0-1.43-.72-1.43-1.6s.63-1.6 1.43-1.6c.8 0 1.44.72 1.43 1.6 0 .88-.63 1.6-1.43 1.6m5.28 0c-.79 0-1.43-.72-1.43-1.6s.63-1.6 1.43-1.6c.8 0 1.44.72 1.43 1.6 0 .88-.63 1.6-1.43 1.6" /></svg>
);

const X = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" /></svg>
);

const SEARCH = (
  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
    <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
    <path d="M13.8 13.8 L18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

type Tab = "funds" | "watcher";

const RANGES: HistoryRange[] = ["24h", "7d", "30d", "all"];

/**
 * The first fund, under the name /admin launches it with (site/launch.js). It is
 * listed before its contracts exist, by name alone: there is nothing to read or
 * to deposit into yet, so its card says so and carries no numbers. The card of
 * the real fund takes its place the moment the fund is on chain.
 */
const FIRST_FUND = "Recurve Fund";

export default function App() {
  const [tab, setTab] = useState<Tab>("funds");
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const open = vaults.find((v) => v.slug === openSlug) ?? null;
  // Cheapest liveness probe there is; the reads below all fail the same way.
  const rpc = useBlockNumber({watch: true});

  const filtered = useMemo(
    () =>
      query.trim()
        ? vaults.filter((v) => v.name.toLowerCase().includes(query.trim().toLowerCase()))
        : vaults,
    [query],
  );

  return (
    <div className="app">
      <Scene />
      <header className="hdr">
        <div className="hdr-left">
          <a className="brand" href="/">
            {MARK}
            <span>Recurve</span>
          </a>
          <label className="searchbox">
            {SEARCH}
            <input
              placeholder="Search funds"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setTab("funds");
                setOpenSlug(null);
              }}
            />
          </label>
          <a className="hdr-icon" href="https://github.com/Recurve-Money" aria-label="GitHub" title="GitHub">
            {GITHUB}
          </a>
          <a className="hdr-icon" href="https://discord.com/invite/SXMwpGcGC3" aria-label="Discord" title="Discord">
            {DISCORD}
          </a>
          <a className="hdr-icon" href="https://x.com/recurvemoney" aria-label="X" title="X">
            {X}
          </a>
        </div>
        <div className="hdr-right">
          {/* Nothing when the chain answers; the network is not news. A dead RPC is. */}
          {rpc.isError && (
            <span className="chip">
              <span className="dot" />
              RPC unreachable
            </span>
          )}
          <nav>
            <button
              className={tab === "funds" ? "on" : ""}
              onClick={() => {
                setTab("funds");
                setOpenSlug(null);
              }}
            >
              Funds
            </button>
            <button className={tab === "watcher" ? "on" : ""} onClick={() => setTab("watcher")}>
              Watcher
            </button>
            <a href="/docs">Documentation</a>
          </nav>
          <ConnectButton showBalance={false} chainStatus="icon" />
        </div>
      </header>

      <main>
        {tab === "watcher" ? (
          isConfigured ? (
            <section>
              <h1>Watcher</h1>
              <p className="sub">
                Stake $RECURVE, replay proposed calldata, and rule on it. Blocking costs nothing.
                Approving a drain costs the whole stake.
              </p>
              <WatcherPanel />
            </section>
          ) : (
            <NotDeployed />
          )
        ) : isConfigured && open ? (
          <VaultDetail config={open} onBack={() => setOpenSlug(null)} />
        ) : (
          <Explore funds={isConfigured ? filtered : []} query={query} onOpen={setOpenSlug} />
        )}
      </main>

      <footer>
        <span>Recurve</span>
        {robinhood.testnet && (
          <span className="muted">Testnet build; every address here is on {robinhood.name}.</span>
        )}
      </footer>
    </div>
  );
}

function NotDeployed() {
  return (
    <section className="empty">
      <h1>No funds are live yet.</h1>
      <p>
        The contracts are written and tested, but nothing is deployed to {robinhood.name}{" "}
        yet. Once a registry and the first vault go up, their addresses land in{" "}
        <code>src/lib/addresses/{robinhood.id}.json</code> and this page reads them straight
        off chain.
      </p>
      <div className="empty-actions">
        <a className="primary" href="/docs">Read the docs</a>
        <a className="ghost" href="https://github.com/Recurve-Money/recurve-protocol">Contracts</a>
      </div>
    </section>
  );
}

function Explore({funds, query, onOpen}: {funds: VaultConfig[]; query: string; onOpen: (slug: string) => void}) {
  // With no fund on chain the first one is still listed, and still found by its name.
  const upcoming = !isConfigured && FIRST_FUND.toLowerCase().includes(query.trim().toLowerCase());
  return (
    <section id="explore">
      <h1>Funds</h1>
      <p className="sub">
        Every fund is a non-custodial vault with an agent in the operator seat.
        {isConfigured && " Numbers below are read from chain."}
      </p>
      {funds.length === 0 && !upcoming ? (
        <p className="sub" style={{marginTop: 28}}>No fund matches &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="grid">
          {funds.map((v) => (
            <VaultCard key={v.slug} config={v} onOpen={() => onOpen(v.slug)} />
          ))}
          {upcoming && (
            <div className="card soon">
              <div className="card-top">
                <span className="card-avatar">{FIRST_FUND.slice(0, 2).toUpperCase()}</span>
                <span className="pill">Not live yet</span>
              </div>
              <span className="card-name">{FIRST_FUND}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function VaultCard({config, onOpen}: {config: VaultConfig; onOpen: () => void}) {
  const v = useVault(config.vault);
  // A dash for a read that failed; zeros would look like an empty vault.
  const num = (x: bigint, d?: number) => (v.isError ? "\u2014" : v.isLoading ? "\u2026" : fmt(x, d));

  return (
    <button className="card" onClick={onOpen}>
      <div className="card-top">
        <span className="card-avatar">{config.name.slice(0, 2).toUpperCase()}</span>
        {v.isError && <span className="pill err">unreachable</span>}
      </div>
      <span className="card-name">{config.name}</span>
      <code className="card-addr">{short(config.vault)}</code>
      <div className="card-tvl">
        <span className="v">{v.isError ? "\u2014" : v.isLoading ? "\u2026" : `${fmt(v.totalAssets, v.decimals)} ${v.symbol}`}</span>
        <span className="k">TVL</span>
      </div>
      <dl>
        <div><dt>Float</dt><dd>{num(v.float, v.decimals)}</dd></div>
        <div><dt>Deployed</dt><dd>{num(v.deployed, v.decimals)}</dd></div>
        <div><dt>Share price</dt><dd>{num(v.sharePrice)}</dd></div>
      </dl>
    </button>
  );
}

function VaultDetail({config, onBack}: {config: VaultConfig; onBack: () => void}) {
  const v = useVault(config.vault);
  const gov = useGovernorParams(config.governor);
  const {proposals, isLoading: propsLoading} = useProposals(config.governor, config.vault);
  const [range, setRange] = useState<HistoryRange>("7d");
  const {points, isError: histError, isUnconfigured: noIndexer} = useFundHistory(config.slug, range);
  const tvl = v.isError ? "\u2014" : `${fmt(v.totalAssets, v.decimals)} ${v.symbol}`;

  return (
    <section className="detail">
      <button className="back" onClick={onBack}>&larr; All funds</button>
      <h1>{config.name}</h1>
      {config.ens && <p className="ens">{config.ens}</p>}
      {config.description && <p className="sub">{config.description}</p>}

      <div className="stats stats-5">
        <Stat k="TVL" v={tvl} />
        <Stat k="Share price" v={v.isError ? "\u2014" : fmt(v.sharePrice)} />
        <Stat k="Agent fee" v={gov.isLoading ? "\u2026" : `${(Number(gov.performanceFeeBps) / 100).toFixed(0)}%`} />
        <Stat k="Agents" v={gov.isLoading ? "\u2026" : String(gov.agents.length)} />
        <Stat k="Proposals" v={propsLoading ? "\u2026" : String(proposals.length)} />
      </div>

      <div className="chart-card">
        <span className="chart-mark" aria-hidden="true">{MARK}</span>
        <div className="chart-card-top">
          <span>TVL &middot; {tvl}</span>
          <span className="pills">
            {RANGES.map((r) => (
              <button key={r} className={r === range ? "pill on" : "pill"} onClick={() => setRange(r)}>
                {r}
              </button>
            ))}
          </span>
        </div>
        <EquityChart
            slug={config.slug}
            decimals={v.decimals}
            points={points}
            range={range}
            isError={histError}
            isUnconfigured={noIndexer}
          />
      </div>

      <div className="detail-cols">
        <div className="detail-main">
          <RiskPanel points={points} isError={histError} isUnconfigured={noIndexer} />
          <BasketPanel />
          <h2>Proposals</h2>
          <Proposals config={config} decimals={v.decimals} />
        </div>
        <div className="detail-side">
          <VaultPanel config={config} />
          <AgentsPanel config={config} />
          <GovernorPanel config={config} />
        </div>
      </div>
    </section>
  );
}

function Stat({k, v}: {k: string; v: string}) {
  return (
    <div className="stat">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}
