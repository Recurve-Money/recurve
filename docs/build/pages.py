#!/usr/bin/env python3
"""Page content. Run `python3 build/pages.py` from the repo root to regenerate."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import clean, render
import deployments as D

# Addresses come from app/src/lib/addresses/4663.json, recurve-protocol's deploy
# output, which the deploy script writes itself. Bodies below reference them
# through @@TOKENS@@, so a rebuild after the deploy is all the docs need.
MAINNET = D.load(4663)
EXPLORER = "https://robinhoodchain.blockscout.com"

ADDRESSES = (
    '<p>Robinhood Chain, chain id 4663. RPC <code>https://rpc.mainnet.chain.robinhood.com</code>,\n'
    f'explorer <a href="{EXPLORER}">robinhoodchain.blockscout.com</a>. These are\n'
    '<code>addresses/4663.json</code> from the protocol repo, the same file the app reads.</p>'
)
if D.deployed(MAINNET):
    ADDRESSES += "\n\n" + D.address_table(MAINNET, EXPLORER)

TOKEN_LINE = (
    f'$RECURVE is <code>{MAINNET["RecurveToken"]}</code>.' if MAINNET.get("RecurveToken")
    else '$RECURVE launches on Pons; the <a href="/buy">token page</a> is where its address is published.'
)
STATUS_NOTE = (
    '<p>The contracts have not been independently audited. Recurve runs on Robinhood Chain\n'
    '  mainnet (chain id 4663): every address is under <a href="/contracts#addresses">Contracts</a>.\n'
    f'  {TOKEN_LINE} Any other token called RECURVE is not ours. Known gaps in the\n'
    '  contracts are listed plainly under <a href="/contracts#limitations">Known limitations</a>.</p>'
)

TOKENS = {
    "@@MAINNET_SDK2@@": D.sdk_addresses(MAINNET, indent=2),
    "@@MAINNET_AGENT_ENV@@": D.env_lines(MAINNET, ["RECURVE_VAULT", "RECURVE_GOVERNOR", "RECURVE_REGISTRY"]),
    "@@MAINNET_WATCHER_ENV@@": D.env_lines(MAINNET, ["RECURVE_VAULT", "RECURVE_GOVERNOR", "RECURVE_REGISTRY"]),
    "@@MAINNET_TOKEN@@": D.token(MAINNET),
    "@@ADDRESSES@@": ADDRESSES,
    "@@STATUS_NOTE@@": STATUS_NOTE,
}

PAGES = []


def page(slug, title, subtitle, crumb, body):
    for token, value in TOKENS.items():
        body = body.replace(token, value)
    PAGES.append((slug, title, subtitle, crumb, body))


# ================================================================ Getting started

page("index", "Introduction",
     "Recurve is capital infrastructure for autonomous funds. An agent gets a vault to hold capital, a proposal system to deploy it, and a public record of every call it has made.",
     "Getting started", """
<p>An AI agent can already read a market, size a position, and execute it. What it cannot do is
raise. There is no standard way to pool outside capital, no primitive that holds it safely
onchain, and no track record it can point to when asking for more.</p>

<p>Recurve supplies the missing half. Depositors pool capital into an ERC-4626 vault. A
registered agent posts strategies onchain before they run. Shareholders can veto inside a
window, and a network of staked watchers replays the calldata before it executes.</p>

<h2 id="shape">The shape of it</h2>

<pre><code>propose  ->  veto window  ->  watcher review  ->  execute  ->  settle</code></pre>

<p>Nothing skips a step. Execution reverts while the window is open, and reverts again if enough
watchers blocked the proposal. Every step is a transaction on Robinhood Chain, so the whole
history of a fund is public and replayable.</p>

<h2 id="three-seats">Three seats at the table</h2>

<table>
<thead><tr><th>Role</th><th>What they do</th><th>What they risk</th></tr></thead>
<tbody>
<tr><td><strong>Depositor</strong></td><td>Funds the vault, vetoes proposals, exits whenever</td><td>The capital, as in any fund</td></tr>
<tr><td><strong>Agent</strong></td><td>Proposes, executes and settles strategies</td><td>The performance fee comes out of its own wallet at settle, and its record is public</td></tr>
<tr><td><strong>Watcher</strong></td><td>Replays calldata and rules on it</td><td>The entire stake, if it approves a drain and is convicted</td></tr>
</tbody>
</table>

<h2 id="pieces">The pieces</h2>

<table>
<thead><tr><th>Piece</th><th>What it is</th><th>Where</th></tr></thead>
<tbody>
<tr><td>Contracts</td><td><code>RecurveVault</code>, <code>RecurveGovernor</code>, <code>WatcherRegistry</code>, <code>PortfolioStrategy</code>, <code>RecurveToken</code></td><td><a href="/contracts">Contracts</a></td></tr>
<tr><td>App</td><td>Deposit, redeem, veto, stake and cast verdicts from a wallet</td><td><a href="/app">Using the app</a></td></tr>
<tr><td>SDK</td><td><code>@recurvemoney/sdk</code>, a TypeScript client for all three roles</td><td><a href="/sdk">SDK reference</a></td></tr>
<tr><td>Runner</td><td>The reference agent: proposes, waits, executes, unwinds, settles</td><td><a href="/runner">Running the agent</a></td></tr>
<tr><td>Indexer</td><td>Read API for equity curves, flows and proposal history</td><td><a href="/api">Indexer API</a></td></tr>
</tbody>
</table>

<h2 id="start">Where to start</h2>

<div class="doc-cards">
  <a class="doc-card" href="/app"><h3>Use the app</h3><p>Deposit into a fund, watch its proposals, veto one, get out.</p></a>
  <a class="doc-card" href="/quickstart"><h3>Quickstart</h3><p>Install the SDK and read a live vault in about five minutes.</p></a>
  <a class="doc-card" href="/concepts"><h3>Core concepts</h3><p>Optimistic governance, the float, and why slashed stake burns.</p></a>
  <a class="doc-card" href="/runner"><h3>Run a fund</h3><p>Give an agent a vault and let it propose strategies.</p></a>
  <a class="doc-card" href="/watcher-skill"><h3>Become a watcher</h3><p>Stake, replay proposals, rule on them.</p></a>
  <a class="doc-card" href="/api"><h3>Build on the data</h3><p>Equity curves, flows and proposals over plain JSON.</p></a>
</div>

<div class="note warn">
  <span class="tag">Where things stand</span>
  @@STATUS_NOTE@@
</div>
""")

page("quickstart", "Quickstart",
     "Install the SDK, point it at a vault, and read its state. Then deposit.",
     "Getting started", """
<h2 id="install">Install</h2>

<pre><code>npm install @recurvemoney/sdk viem</code></pre>

<p><code>viem</code> is a peer dependency. The SDK reuses the clients you already have rather than
opening its own transport. It ships as ESM only and needs Node 20 or newer.</p>

<h2 id="connect">Connect</h2>

<p>viem 2.55 and newer ship Robinhood Chain, so import it. Pass the chain to both
clients: the SDK forwards <code>walletClient.chain</code> to every transaction as-is and never
checks that your clients and your addresses agree on a chain id, so the chain and the address
set always travel together.</p>

<pre><code>import {createPublicClient, createWalletClient, http} from "viem";
import {robinhood} from "viem/chains";              // Robinhood Chain (chain id 4663)
import {privateKeyToAccount} from "viem/accounts";
import {Recurve, type RecurveAddresses} from "@recurvemoney/sdk";

const chain = robinhood;
const addresses: RecurveAddresses = {
@@MAINNET_SDK2@@
};

const publicClient = createPublicClient({chain, transport: http()});
const recurve = new Recurve({publicClient, addresses});</code></pre>

<p>Every address is under <a href="/contracts#addresses">Contracts</a>. On viem older than 2.55,
build the chain with <code>defineChain</code> (id 4663, RPC
<code>https://rpc.mainnet.chain.robinhood.com</code>).</p>

<p>Leaving out <code>walletClient</code> gives you a read-only instance. Every write rejects
immediately with <code>This call needs a walletClient; the SDK was built read-only.</code>
instead of failing partway through, which is what you want in an indexer.</p>

<h2 id="read">Read a vault</h2>

<pre><code>const snap = await recurve.vault.snapshot();

snap.totalAssets     // everything the vault owes depositors: idle balance + deployedAssets
snap.float           // the idle balance, what an exit can take right now
snap.deployedAssets  // committed to a live strategy
snap.totalSupply     // shares outstanding
snap.sharePrice      // asset base units per 1e18 shares; exactly 1e18 while the vault is empty
snap.asset           // the ERC-20 the fund is denominated in</code></pre>

<p>Every number is a <code>bigint</code> in on-chain base units; the SDK never reads
<code>decimals()</code> or formats. <code>float</code> and <code>deployedAssets</code> sum to
<code>totalAssets</code>: a position mid-strategy still belongs to depositors, so it stays
counted.</p>

<h2 id="deposit">Deposit</h2>

<pre><code>const walletClient = createWalletClient({
  account: privateKeyToAccount(PRIVATE_KEY),
  chain,                        // the same chain the addresses belong to
  transport: http(),
});

const recurveWithWallet = new Recurve({publicClient, walletClient, addresses});

const hash = await recurveWithWallet.depositor.deposit(1_000_000n);   // 1 USDG, which has 6 decimals</code></pre>

<p>That is up to three transactions, each awaited to its receipt: an unlimited
<code>approve</code> of the asset to the vault if the allowance is short, the
<code>deposit</code> itself (the receiver is always the signer), and a
<code>delegate</code> to the signer. Only the deposit hash is returned.</p>

<div class="note">
  <span class="tag">Why it self-delegates</span>
  <p>ERC20Votes weight is zero until delegated. A depositor who skips that step holds shares
  that cannot veto anything, and only finds out during a live proposal. The SDK delegates for
  you on every deposit; pass <code>{skipDelegate: true}</code> if you delegate elsewhere.</p>
</div>

<h2 id="exit">Exit</h2>

<pre><code>const {instant, requestId} = await recurveWithWallet.depositor.redeem(500_000n);   // 0.5 rvFUND

if (!instant && requestId !== undefined) {
  // The float did not cover it. Claim once the vault's balance does.
  await recurveWithWallet.depositor.claim(requestId);
}</code></pre>

<p>Branch on <code>instant</code> rather than assuming, and check <code>requestId</code>
explicitly — its type is <code>bigint | undefined</code>, and TypeScript will not narrow it
from <code>instant</code>. <code>claim</code> reverts with <code>RequestNotReady</code> until
the vault's idle balance covers the request. The SDK has no read for a queued request; with the
full vault ABI, <code>withdrawalQueue(requestId)</code> returns its shares and
<code>claimed</code> flag, and it is claimable once <code>previewRedeem(shares) &lt;= float()</code>.</p>

<h2 id="next">Next</h2>

<p>The full method list is on the <a href="/sdk">SDK reference</a>. Proposing, executing and
settling as an agent is on <a href="/runner">Running the agent</a>; staking and verdicts on the
<a href="/watcher-skill">watcher skill</a>.</p>
""")

page("app", "Using the app",
     "The app at recurvemoney.xyz/app reads every fund straight from chain. Deposit, exit, veto, stake and cast verdicts from a wallet.",
     "Getting started", """
<h2 id="connect">Connecting</h2>

<p>Injected wallets (MetaMask and the like) always work. WalletConnect's QR flow works when the
deployment carries a project id; without one it is simply absent. The app is pinned to Robinhood
Chain and asks the wallet to switch if it is elsewhere.</p>

<p>Every number on screen is read from the contracts, most of them in one multicall per fund so
they all describe the same block. Only the equity chart and the risk panel come from the
<a href="/api">indexer</a>; if it is down those two say so and the rest of the app carries on.
A dead RPC shows as an <em>RPC unreachable</em> chip in the header.</p>

<h2 id="funds">Funds</h2>

<p>The landing tab lists every fund the build knows about with its TVL, float, deployed
capital and share price. A dash means the read failed, not that the vault is empty. Open a fund
for its detail view: the TVL chart with 24h / 7d / 30d / all ranges, derived risk figures
(total return, max drawdown, days since the high-water mark, all from the share-price series),
the proposal list, and the governor's parameters — voting window, depositor veto threshold,
blocks to stop, performance fee — read live.</p>

<h2 id="deposit">Deposit</h2>

<p>Type an amount in the vault's asset, or <em>Max</em> for your whole balance. The first
deposit is three transactions and two clicks:</p>

<ol>
<li><strong>Approve.</strong> If the vault's allowance is short the button reads
<em>Approve &lt;asset&gt;</em> and sends an unlimited approval, then asks you to submit again.</li>
<li><strong>Deposit</strong>, then <strong>delegate</strong> to yourself, back to back. Voting
weight is zero until delegated, so the app never leaves you holding shares that cannot veto.</li>
</ol>

<p>The vault carries a <a href="/vaults#deposit-cap">deposit cap</a> of 10,000 USDG; the app does
not display it. Shares carry the asset's decimals, so the number you see under <em>Shares</em> is in the same
scale as the asset.</p>

<h2 id="redeem">Exit</h2>

<p>Switch to <em>Redeem</em> and enter shares. Before you submit, the panel warns when the
float does not cover the exit: <em>The exit will queue and settle at the realized price.</em>
That is what happens on chain — <code>requestRedeem</code> pays instantly when the idle balance
covers it, otherwise it escrows your shares and gives you a queue position. Queued requests
appear below the form as <em>Request #n</em> with a <em>Claim</em> button; a claim goes through
once the vault's idle balance covers the request, priced at that moment, and reverts with
<em>Not claimable yet</em> until then.</p>

<div class="note">
  <span class="tag">Note</span>
  <p>Escrowed shares carry no voting weight while they wait, and the claim has to come from the
  address that made the request. There is no cancel: a queued request either clears or waits.</p>
</div>

<h2 id="veto">Veto</h2>

<p>A proposal row shows its target, the assets it moves, the size of its calldata, how many
watchers have blocked it, and the veto weight gathered so far as a share of supply at the
snapshot. While the window is open and you have weight at that snapshot, the row offers
<em>Veto with N votes</em>. Weight is what you had delegated one block before the proposal was
posted; if the row says <em>No weight at this snapshot</em>, delegate now and it counts from
the next proposal. Vetoes are one per address and cannot be taken back.</p>

<p>A proposal stays <em>Pending</em> with <em>Window closed. Waiting on the agent to execute</em>
in two very different situations: the agent has not executed yet, or it never can — enough
watchers blocked it, or its price floor is stale. The chain does not distinguish them; see
<a href="/governance#states">proposal states</a>.</p>

<h2 id="watcher">Watcher</h2>

<p>The <em>Watcher</em> tab is the registry from a staker's side. It shows your stake, the
minimum, whether you are active, and your RECURVE balance.</p>

<ul>
<li><strong>Stake</strong> — approve RECURVE to the registry (unlimited, once), then stake.
You are active from the moment your stake reaches the minimum.</li>
<li><strong>Cast a verdict</strong> — pick a proposal from the list (every fund's proposals,
newest first) or paste a 32-byte id, then <em>Block</em> or <em>Approve</em>. A verdict is
final. Simulate the calldata first; approving a call that drains a vault is what a conviction
slashes.</li>
<li><strong>Request unstake</strong> — starts the delay on your whole stake. You stay active and
slashable until <em>Withdraw</em> completes after the delay.</li>
</ul>

<h2 id="errors">When something reverts</h2>

<p>Every transaction is simulated before the wallet opens, so a revert arrives as a sentence
rather than a wallet's gas-estimation failure: <em>The vault cannot release that much right
now</em>, <em>Still inside the veto window</em>, <em>Stake is under the minimum</em>. The full
map from contract error to sentence is under <a href="/errors">Errors</a>.</p>
""")

page("concepts", "Core concepts",
     "Four ideas explain most of the protocol: optimistic governance, the float, staked review, and burned slashes.",
     "Getting started", """
<h2 id="optimistic">Optimistic governance</h2>

<p>Proposals pass by default. An agent that has to wait for a quorum to say yes cannot trade,
because by the time the committee answers the edge is gone.</p>

<p>The protection is not an approval gate. It is two things that cost nothing when the agent
behaves: depositors can veto inside a window, and watchers can block. Both are checked by the
contract at execution, not by anyone's goodwill.</p>

<h2 id="snapshot">Vote weight is snapshotted</h2>

<p>Weight is read one block before the proposal landed. Nobody buys votes after reading the
calldata, and nobody who deposits mid-window gets a say on a strategy that was proposed before
they arrived.</p>

<p>Weight is ERC20Votes weight, which is zero until a holder delegates. The app and the SDK
delegate to the depositor on every deposit for exactly that reason. The threshold is measured
against all shares at the snapshot, delegated or not, so undelegated shares make a veto harder,
not easier.</p>

<h2 id="float">The float and the queue</h2>

<p>A vault holding a live position cannot honestly price an exit. Marking it to an oracle lets an
informed depositor redeem at a stale number and leaves the loss with everyone who stayed.</p>

<p>So: if the idle balance covers you, you leave immediately. If it does not, you join a queue
and claim once the balance covers your shares, at the price then. A queued exit shares in the
gain and eats its part of the loss, exactly as staying would. The queue reserves nothing — a
strategy can still be funded from the float ahead of a queued request — so a queued exit is a
promise about price, not about order.</p>

<h2 id="stake">Review backed by stake</h2>

<p>A watcher's opinion is worth what it has behind it. Watchers stake $RECURVE to become
eligible, cast one final verdict per proposal, and lose the whole stake if a proposal they
approved is convicted.</p>

<p>The asymmetry is the mechanism. Blocking costs nothing — there is no reward to forfeit.
Approving a drain costs everything. When a watcher is unsure, blocking is correct. Conviction
is a call on the registry that only its <code>governor</code> address may make; the current
<code>RecurveGovernor</code> has no path to it, so as deployed a conviction is an action of
whoever the registry owner points that address at. See
<a href="/contracts#limitations">Known limitations</a>.</p>

<h2 id="burn">Why slashed stake burns</h2>

<p>Slashed stake goes to the <code>0xdead</code> burn address rather than to the watchers who
blocked correctly.</p>

<p>Paying it out sounds fairer and is much worse. If convictions paid, a coordinated majority
could approve-then-convict a minority and farm them, and every watcher would weigh the payout
from a conviction against the honesty of its own verdict. Burning removes the payoff, so nobody
has a reason to engineer a slash.</p>

<h2 id="no-cancel">Nothing is cancelled, only left behind</h2>

<p>There is no cancel on a proposal. A vetoed one is dead; one that enough watchers blocked
stays <em>Pending</em> on chain forever, because the contract's block is a revert that undoes
its own state write. The agent simply moves on and proposes again. Readers of the chain — the
app, the indexer, a watcher — have to treat "pending, window closed, never executed" as the
abandoned state it is.</p>
""")

# ================================================================ Protocol

page("vaults", "Vaults",
     "Every fund is an ERC-4626 vault with voting shares. It holds the idle balance, counts what is deployed, and lets capital out to a strategy only through its governor.",
     "Protocol", """
<h2 id="standard">Standard where it counts</h2>

<p><code>RecurveVault</code> is ERC-4626, so <code>deposit</code>, <code>mint</code>,
<code>convertToAssets</code>, <code>previewRedeem</code> and the rest behave the way any
integrator expects. It also extends <code>ERC20Votes</code>, which is what lets the governor
snapshot voting weight, and <code>ERC20Permit</code>, so shares can be approved by signature.
Shares carry the asset's decimals (no decimals offset) and an empty vault mints 1:1.</p>

<h3 id="deposit-cap">Deposit cap</h3>

<p><code>depositCap</code> is a ceiling on <code>totalAssets()</code>, set in the constructor
and enforced through the standard hooks: <code>maxDeposit</code> returns the room left under the
cap in asset terms (zero once <code>totalAssets()</code> reaches it, whoever the receiver is)
and <code>maxMint</code> the same room in shares. <code>deposit</code> and <code>mint</code>
revert above those with OpenZeppelin's <code>ERC4626ExceededMaxDeposit</code> and its mint
counterpart. Because the cap is on total assets, profit a strategy brings back consumes cap
room.</p>

<pre><code>raiseDepositCap(uint256 newCap)   // deployer only, emits DepositCapRaised(previousCap, newCap)</code></pre>

<p>One-directional: whoever deployed the vault can raise it, anyone else reverts with
<code>OnlyDeployer</code>, and a value at or below the current cap reverts with
<code>CapCannotDecrease</code>. The Recurve Fund starts at 10,000 USDG (<code>DEPOSIT_CAP</code>
in the deploy settings).</p>

<h2 id="accounting">Accounting</h2>

<pre><code>totalAssets() = idle balance + deployedAssets
float()       = idle balance</code></pre>

<p><code>deployedAssets</code> is carried explicitly rather than inferred, because a position
mid-strategy is neither in the balance nor visible to <code>balanceOf</code>. It is one number
for the whole vault, not one per proposal: every <code>fundStrategy</code> adds to it and one
<code>settleStrategy</code> zeroes it.</p>

<table>
<thead><tr><th>Function</th><th>Returns</th></tr></thead>
<tbody>
<tr><td><code>totalAssets()</code></td><td>Everything owed to depositors</td></tr>
<tr><td><code>float()</code></td><td>The idle balance. Queued exits reserve nothing from it (the <code>pendingWithdrawalAssets</code> field it subtracts is never written)</td></tr>
<tr><td><code>deployedAssets()</code></td><td>Committed to a live strategy</td></tr>
<tr><td><code>depositCap()</code></td><td>Ceiling on <code>totalAssets()</code></td></tr>
<tr><td><code>queueLength()</code></td><td>Redemption requests ever created, claimed ones included</td></tr>
<tr><td><code>withdrawalQueue(i)</code></td><td><code>(shares, requestedAt, receiver, claimed)</code></td></tr>
<tr><td><code>requestIdsOf(owner)</code></td><td>Queue positions belonging to an owner</td></tr>
</tbody>
</table>

<div class="note warn">
  <span class="tag">Between return and settle</span>
  <p>When a strategy sends assets back to the vault, the balance rises while
  <code>deployedAssets</code> is still counted, so <code>totalAssets()</code> and the share
  price are inflated until <code>settle</code> runs. Claims and instant redemptions in that
  window are priced on the inflated number. The <a href="/runner">runner</a> settles in the
  round after the return executes to keep the window short.</p>
</div>

<h2 id="movement">How capital moves</h2>

<p><code>fundStrategy(target, assets)</code> is the governor's way out: it transfers assets to
the target, adds them to <code>deployedAssets</code>, and reverts with <code>FloatTooLow</code>
if the request exceeds the idle balance. Only the governor can call it, and the governor only
calls it from an executed proposal. <code>settleStrategy(returned)</code> is the way back on
paper: it zeroes <code>deployedAssets</code> and emits <code>StrategySettled(returned, pnl)</code>.
It does not move tokens and does not check that <code>returned</code> arrived — the strategy
transfers assets back on its own, and the governor reports the number.</p>

<p>Depositors have a second exit the queue does not cover. The standard ERC-4626
<code>withdraw</code> and <code>redeem</code> are not overridden: they pay from the idle balance
and, when it is short, revert inside the asset's transfer instead of queueing.
<code>maxWithdraw</code> and <code>maxRedeem</code> report the holder's full position, not what
the balance can pay. Use <code>requestRedeem</code>, as the app and SDK do, to get the queue.</p>

<h2 id="redeem">Redemption</h2>

<pre><code>requestRedeem(uint256 shares, address receiver, address owner) -> uint256 requestId
claimRedeem(uint256 requestId) -> uint256 assets</code></pre>

<p><code>requestRedeem</code> pays instantly when <code>previewRedeem(shares)</code> fits in the
idle balance and returns <code>type(uint256).max</code> as a sentinel. Otherwise it moves the
shares into the vault's own custody, appends to the queue, emits
<code>WithdrawalQueued(owner, requestId, shares)</code>, and returns the queue index. The
receiver is fixed at request time.</p>

<p><code>claimRedeem</code> prices at claim time, not request time — that is the whole reason
the queue exists. It reverts with <code>RequestNotReady</code> while the idle balance cannot
cover the shares' current value, <code>RequestAlreadyClaimed</code> on a repeat, and
<code>NotRequestOwner</code> unless the caller is the address that owned the shares when the
request was made (not the receiver, not an operator). Ready requests can be claimed in any
order; there is no expiry and no cancel.</p>

<div class="note">
  <span class="tag">Note</span>
  <p>Escrowed shares keep counting toward supply until the claim burns them, which is why
  <code>totalAssets</code> does not net them out — and they carry no voting weight while they
  wait, because the vault delegates to nobody.</p>
</div>

<h2 id="votes">Votes</h2>

<p>Voting weight is checkpointed by block. <code>getPastVotes(holder, block)</code> is what the
governor reads at a proposal's snapshot; it is zero for a holder who never called
<code>delegate</code>. <code>getPastTotalSupply(block)</code> is the denominator for the veto
threshold and counts every share, delegated or not. A delegation in the same block as a proposal
is not visible to that proposal's snapshot.</p>
""")

page("governance", "Governance",
     "One governor per vault runs the proposal lifecycle: propose, veto window, watcher review, execute, settle.",
     "Protocol", """
<h2 id="one-per-vault">One governor per vault</h2>

<p>Governors are never shared. A shared governor would let a large holder in one fund influence
the schedule of another. The governor's parameters are set in its constructor and have no
setters: <code>vetoWindow</code>, <code>vetoThresholdBps</code>,
<code>watcherBlockThreshold</code>, <code>performanceFeeBps</code>, <code>feeRecipient</code>.
The only mutable thing on a governor is its agent set.</p>

<table>
<thead><tr><th>Parameter</th><th>Deployed</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><code>vetoWindow</code></td><td>24 hours</td><td>How long depositors have to object, in seconds</td></tr>
<tr><td><code>vetoThresholdBps</code></td><td>2000 (20%)</td><td>Share of supply at the snapshot that kills a proposal, reached at <em>or above</em></td></tr>
<tr><td><code>watcherBlockThreshold</code></td><td>2</td><td>Block verdicts at which <code>execute</code> refuses</td></tr>
<tr><td><code>performanceFeeBps</code></td><td>500 (5%)</td><td>Fee on profit at settle, see <a href="/fees">Fees</a></td></tr>
<tr><td><code>feeRecipient</code></td><td>the treasury</td><td>Where the fee goes; the zero address means "compute, never transfer"</td></tr>
</tbody>
</table>

<p>Values are what <code>script/DeployMainnet.s.sol</code> passes to the constructor.</p>

<h2 id="states">Proposal states</h2>

<pre><code>enum State { None, Pending, Vetoed, Blocked, Executed, Settled }   // 0..5</code></pre>

<table>
<thead><tr><th>Transition</th><th>How</th></tr></thead>
<tbody>
<tr><td>None → Pending</td><td><code>propose</code></td></tr>
<tr><td>Pending → Vetoed</td><td><code>veto</code> reaches the threshold. Terminal.</td></tr>
<tr><td>Pending → Executed</td><td><code>execute</code> after the window, with fewer blocks than the threshold</td></tr>
<tr><td>Executed → Settled</td><td><code>settle</code>. Terminal.</td></tr>
<tr><td>Pending → Pending</td><td><code>execute</code> with enough blocks writes <code>Blocked</code>, emits, then reverts with <code>WatchersBlocked</code> — which undoes the write. The proposal stays Pending forever.</td></tr>
</tbody>
</table>

<p><code>Blocked</code> is in the enum but never persists. There is no cancel and no expiry. A
Pending proposal whose window has closed and that will never execute — blocked, or with a
price floor the market moved past — is simply left there; anyone reading the chain has to
derive "abandoned" from <em>Pending + window closed + not executed</em>. <code>stateOf(id)</code>
returns the state; <code>executableAt(id)</code> returns <code>postedAt + vetoWindow</code>.</p>

<h2 id="propose">Propose</h2>

<pre><code>propose(address target, uint256 assets, bytes callData) -> bytes32   // agents only</code></pre>

<p>Calldata is committed in full before anyone decides. What watchers simulate is what will run.
The id is <code>keccak256(target, assets, callData, block.timestamp, governor)</code>, so read it
from the <code>ProposalPosted(id, target, assets, executableAt)</code> event rather than a
simulation. Two identical proposals in the same second get the same id and the second
overwrites the first; the SDK and the runner never post twice in a second, but a custom agent
should not either.</p>

<p>Nothing is validated at propose time: not that the target has code, not that
<code>assets</code> fits the float, not the calldata. An oversized <code>assets</code> surfaces
at <code>execute</code> as <code>FloatTooLow</code> and a failing call as
<code>ExecutionFailed</code>; a target with no code never surfaces at all — the call succeeds
and the proposal executes silently. A proposal with <code>assets == 0</code> is a pure call, which is how
<code>sell</code> and <code>returnToVault</code> on a <a href="/strategies">strategy</a> are
posted; one with empty calldata just funds the target.</p>

<h3 id="agents">Agents and agentAdmin</h3>

<p>Agents are a set, not a single address. A fund often wants a signal agent, an execution
agent, and a fallback, and forcing them to share one key means a compromise of any is a
compromise of all. <code>isAgent(address)</code> gates <code>propose</code>,
<code>execute</code> and <code>settle</code> — any agent can execute or settle any agent's
proposal. <code>allAgents()</code> and <code>agentCount()</code> enumerate the set.</p>

<pre><code>addAgent(address agent)       // onlyAgentAdmin, reverts AlreadyAgent
removeAgent(address agent)    // onlyAgentAdmin, reverts NotAnAgent
setAgentAdmin(address admin)  // onlyAgentAdmin</code></pre>

<p>The constructor's <code>agent_</code> becomes both the first agent and the
<code>agentAdmin</code>. Each change emits <code>AgentAdded</code>, <code>AgentRemoved</code> or
<code>AgentAdminUpdated</code>. Removing an agent does not cancel its pending proposals: they
stay live, still go through the window and review, and any remaining agent can execute them.
Anything else would hand the admin a silent veto that bypasses the depositor vote.</p>

<div class="note warn">
  <span class="tag">Handle with care</span>
  <p>None of the admin calls check for the zero address. <code>setAgentAdmin(0)</code> freezes
  the agent set forever, and <code>removeAgent</code> will happily remove the last agent, after
  which nothing can be proposed, executed or settled on that vault until the admin adds one
  back.</p>
</div>

<h2 id="veto">Veto</h2>

<pre><code>veto(bytes32 proposalId)   // anyone with weight at the snapshot</code></pre>

<p>A holder votes against inside the window, weighted by <code>getPastVotes</code> one block
before the proposal was posted — zero unless they had delegated by then. One veto per address.
When the gathered weight reaches <code>vetoThresholdBps</code> of
<code>getPastTotalSupply(snapshot)</code> — all shares, delegated or not — the proposal moves to
<code>Vetoed</code> and can never execute. Reverts: <code>UnknownProposal</code>,
<code>WrongState</code> (not Pending), <code>VetoWindowClosed</code>, <code>AlreadyVetoed</code>,
<code>NoVotingWeight</code>. There is no vote in favour and no un-veto.</p>

<h2 id="execute">Execute</h2>

<pre><code>execute(bytes32 proposalId)   // agents only</code></pre>

<p>After the window closes an agent calls <code>execute</code>. In order, it reverts with
<code>UnknownProposal</code>, <code>WrongState</code> if the proposal is not Pending,
<code>VetoWindowOpen</code> if early, and <code>WatchersBlocked</code> if
<code>blockCount</code> on the registry has reached the threshold. Then it marks the proposal
Executed, moves <code>assets</code> out through <code>vault.fundStrategy</code> (which can revert
<code>FloatTooLow</code>), and if there is calldata makes a plain <code>call</code> to the target
with the governor as <code>msg.sender</code>, reverting <code>ExecutionFailed</code> if the call
does. A call to an address with no code succeeds, so a wrong target executes silently.</p>

<h2 id="settle">Settle</h2>

<pre><code>settle(bytes32 proposalId, uint256 returned)   // agents only, proposal must be Executed</code></pre>

<p><code>settle</code> books the result of a funded proposal: it marks it Settled, computes the
fee on <code>returned − assets</code> if positive, calls <code>vault.settleStrategy(returned)</code>
which zeroes <code>deployedAssets</code>, pulls the fee from the calling agent's own wallet to
<code>feeRecipient</code>, and emits <code>ProposalSettled(id, returned, fee)</code>.
<code>returned</code> is the agent's report — the contract checks it against nothing — and the
assets themselves come back through the strategy's <code>returnToVault</code>, before this
call. Details on the fee are under <a href="/fees">Fees</a>.</p>

<p>Because <code>deployedAssets</code> is one number, one settle per deployment is the rule:
fund once, unwind, return, settle the funding proposal. Settling a zero-asset follow-up
proposal instead is allowed while something is deployed and zeroes the whole balance for it.
Settling with nothing deployed reverts <code>NothingToSettle</code>.</p>

<div class="note warn">
  <span class="tag">For agents</span>
  <p>Settle in the round after the return lands. Between the two, the share price is inflated
  (see <a href="/vaults#accounting">Accounting</a>) and every exit in that window is priced
  wrong.</p>
</div>
""")

page("watchers", "Watchers",
     "A staked network that replays proposed calldata before capital moves. Approving a drain is what the stake is for.",
     "Protocol", """
<h2 id="eligibility">Eligibility</h2>

<pre><code>stake(uint256 amount)   // approve the registry for $RECURVE first</code></pre>

<p>Stake $RECURVE. From the moment the stake reaches <code>minStake</code> — at it, not above
it — the watcher is active and can cast verdicts. There is no reputation score and no
allowlist; the stake is the entire credential. The minimum is about $20 of $RECURVE, fixed in
tokens at the market price when staking opens; <code>minStake()</code> returns the figure in
force. The registry owner can change it with <code>setParameters</code>, and a watcher left
under a raised minimum fails <code>castVerdict</code> until they top up.</p>

<h2 id="verdicts">Verdicts are final</h2>

<pre><code>castVerdict(bytes32 proposalId, Verdict verdict)   // Verdict: None = 0, Approve = 1, Block = 2</code></pre>

<p>One verdict per proposal per watcher. The contract rejects a second with
<code>AlreadyVoted</code>, so simulate before you call it. There is no verdict window: the
registry knows nothing about governors, so verdicts are accepted on any 32-byte id at any time,
before a proposal exists or after it executed. <code>blockCount(id)</code> is what the governor
reads at <code>execute</code>; <code>approversOf</code> and <code>blockersOf</code> list who
ruled which way.</p>

<div class="note warn">
  <span class="tag">Pass Approve or Block</span>
  <p><code>Verdict.None</code> is not rejected. It is recorded as a block and, because it leaves
  the "already voted" mark unset, can be repeated — one active watcher can push
  <code>blockCount</code> past the threshold on their own. The app only ever sends 1 or 2; the
  SDK's <code>castVerdict</code> passes through whatever you give it, so pass
  <code>Verdict.Approve</code> or <code>Verdict.Block</code>, never <code>None</code>.</p>
</div>

<h2 id="review">What to look for</h2>

<p>Fork state at the proposal's block, execute the calldata against the target with the vault
funded, and read the diff rather than the intent. Worth a block:</p>

<ul>
<li>Value leaving to an address that is not the strategy target</li>
<li>An approval granted to anything but the target, especially unlimited</li>
<li>A call into a contract deployed within the last few days</li>
<li>Delegatecall anywhere in the trace</li>
<li>A target whose bytecode does not match verified source</li>
<li>A price floor set loose enough to be sandwiched to nothing</li>
<li>Share price falling as a direct result of the call</li>
</ul>

<p>None of these prove malice. All of them justify a block, because a block costs nothing and
a wrong approval costs everything. For a fund running <a href="/strategies">PortfolioStrategy</a>
the surface is small: the target is the strategy, the call is <code>buy</code>,
<code>sell</code>, <code>returnToVault</code> or <code>setWeights</code>, and the number to
check is the floor written into the calldata. The step-by-step is on the
<a href="/watcher-skill">watcher skill</a>.</p>

<h2 id="economics">Economics</h2>

<p>The contracts implement one economic mechanism: <strong>slashing</strong>. A conviction
takes 100% of every approver's stake and burns it. Nothing pays watchers for being right —
there is no fee share, no bounty and no per-round reward in the registry or the governor. If
that changes it will be a new contract, and this page will say so.</p>

<pre><code>convict(bytes32 proposalId)   // registry.governor only</code></pre>

<p>Conviction is a call on the registry that only its <code>governor</code> address may make.
It marks the proposal convicted, zeroes every approver's stake (and any pending unstake),
sends the total to <code>0x000000000000000000000000000000000000dEaD</code>, and emits
<code>Convicted(id, approvers, burned)</code>. Blockers and abstainers are untouched. The
scripted deployment points <code>registry.governor</code> at the fund's
<code>RecurveGovernor</code>, which has no function that calls <code>convict</code> — so today a
conviction requires the registry owner to <code>setGovernor</code> to a key that can. What
counts as convictable is not defined on chain.</p>

<h2 id="exit">Exiting</h2>

<pre><code>requestUnstake(uint256 amount)   // starts the delay; 7 days on the scripted deployment
unstake()                        // after the delay</code></pre>

<p><code>requestUnstake</code> records an amount and a timestamp; a second request overwrites
both and restarts the clock. The stake itself does not move: the watcher stays active,
keeps voting with the full stake, and stays slashable throughout, so approving a malicious
call and heading for the door does not outrun a conviction. <code>unstake</code> pays out after
<code>unstakeDelay</code> — the value current at that moment, since the owner can change it —
and reverts <code>UnstakeNotReady</code> before, <code>NoPendingUnstake</code> if nothing is
requested or a conviction cleared it. The app requests the whole stake; the SDK has no
unstake method (use <code>registryAbi</code> with viem directly).</p>
""")

page("strategies", "Strategies",
     "PortfolioStrategy is the only target a proposal needs: a fixed token set, one swap per call, and no way to send value anywhere but the vault.",
     "Protocol", """
<h2 id="why">Why a strategy contract</h2>

<p><code>RecurveGovernor.execute</code> forwards arbitrary calldata to an arbitrary target. The
veto and watcher review are real, but they are social defences on a hot path. A strategy
contract narrows the surface to something a reviewer can check in seconds: the token set is
fixed at construction, the only outbound call is a swap between two tokens already in that set
on a router fixed at construction, and the only place value can go afterwards is the vault.
An agent proposing against it cannot invent a transfer, cannot reach a token nobody approved,
and cannot redirect the exit.</p>

<h2 id="shape">Shape</h2>

<pre><code>constructor(
    address vault_, address governor_, IERC20 baseAsset_, ISwapRouter router_,
    address[] tokens_, uint24[] feeTiers_, uint256 maxSlippageBps_
)</code></pre>

<table>
<thead><tr><th>Fixed at construction</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><code>vault</code></td><td>The only address <code>returnToVault</code> pays</td></tr>
<tr><td><code>governor</code></td><td>The only caller of anything that moves tokens</td></tr>
<tr><td><code>baseAsset</code></td><td>The vault's asset; every leg is bought from and sold back into it</td></tr>
<tr><td><code>router</code></td><td>Uniswap V3 <code>SwapRouter02</code></td></tr>
<tr><td><code>tokens</code>, <code>feeTier[token]</code></td><td>The basket and the pool tier per leg. Storage rather than <code>immutable</code>, but with no setters, so fixed for life</td></tr>
<tr><td><code>maxSlippageBps</code></td><td>Cap on how far below the stated quote a floor may sit; at most 1000 (10%)</td></tr>
</tbody>
</table>

<p>The constructor rejects an empty basket (<code>NoTokens</code>), a duplicate
(<code>DuplicateToken</code>), a mismatched tier list (<code>WeightCountMismatch</code>) and a
slippage cap over 10% (<code>SlippageTooHigh</code>). The Recurve Fund's strategy is a one-token basket,
NVDA, on the 0.05% tier (500) with a 3% cap.</p>

<h2 id="calls">The four calls</h2>

<p>All four are <code>onlyGovernor</code>, which means each one is a proposal that clears its
own veto window before it runs.</p>

<pre><code>buy (address token, uint256 amountIn, uint256 minAmountOut, uint256 quotedOut) -> amountOut
sell(address token, uint256 amountIn, uint256 minAmountOut, uint256 quotedOut) -> amountOut
returnToVault() -> amount
setWeights(uint256[] bps)</code></pre>

<ul>
<li><strong><code>buy</code></strong> spends <code>amountIn</code> of the base asset the vault
just funded it with on <code>token</code> through <code>exactInputSingle</code> on the leg's
tier, with <code>minAmountOut</code> as the hard floor. Approves the router for exactly
<code>amountIn</code> and clears the approval after. Emits
<code>Rebalanced(token, amountIn, amountOut)</code>.</li>
<li><strong><code>sell</code></strong> is the mirror image, leg back into base asset. Same event.</li>
<li><strong><code>returnToVault</code></strong> transfers the strategy's entire base-asset
balance to the vault and emits <code>Liquidated(amount)</code>, even when the amount is zero.
Legs are never moved: sell them first or they stay put, unvalued.</li>
<li><strong><code>setWeights</code></strong> records target weights that must sum to exactly
10,000 bps. They are a declaration, not a constraint — nothing in <code>buy</code> or
<code>sell</code> reads them.</li>
</ul>

<h2 id="floor">The floor</h2>

<pre><code>floor = quotedOut * (10_000 - maxSlippageBps) / 10_000
require(quotedOut != 0 && minAmountOut >= floor)      // else SlippageTooHigh</code></pre>

<p>The agent supplies both numbers because it has the price context; the contract refuses a
floor looser than <code>maxSlippageBps</code> below the stated quote so a careless or hostile
floor cannot hand value to a sandwich. <code>quotedOut</code> is not checked against any
quoter or oracle — it is the agent's statement, and the reviewer's job is to compare it with
the market. A quote of zero is refused outright.</p>

<p>Because a proposal executes a day after it is quoted, the <a href="/runner#floor">runner</a>
writes <code>quote × (1 − tolerance)</code> as the stated quote rather than the live one, and
the strategy's own cap then applies below that. A watcher reads the effective floor straight
off the calldata: <code>minAmountOut</code>.</p>

<h2 id="cycle">A cycle in proposals</h2>

<table>
<thead><tr><th>Step</th><th>Proposal</th><th>What moves</th></tr></thead>
<tbody>
<tr><td>1</td><td><code>propose(strategy, X, buy(...))</code></td><td><code>execute</code> funds the strategy with X and buys the leg in the same transaction</td></tr>
<tr><td>2</td><td><code>propose(strategy, 0, sell(...))</code></td><td>The leg becomes base asset, still inside the strategy</td></tr>
<tr><td>3</td><td><code>propose(strategy, 0, returnToVault())</code></td><td>Base asset returns to the vault; <code>Liquidated</code> says how much</td></tr>
<tr><td>4</td><td><code>settle(id of step 1, amount from Liquidated)</code></td><td>Books the result, pulls the fee</td></tr>
</tbody>
</table>

<p>Steps 1–3 each wait a full veto window, so a round trip is about three days on the scripted
24-hour window. A queued exit that needs the position unwound waits at least two more windows
(sell, then return) — about two days, three if the buy has not executed yet.
<code>holdings()</code> returns the strategy's base balance and every leg's raw balance —
balances only, never a valuation: a strategy that priced itself would be the thing deciding
what the vault is worth.</p>

<h2 id="deployed">Deployed</h2>

<p>The Recurve Fund's strategy is <code>PortfolioStrategyV2</code> on Robinhood Chain: basket
<code>[NVDA]</code>, tier 500, 3% cap, against Uniswap's official <code>SwapRouter02</code>. Its
address is under <a href="/contracts#addresses">Contracts</a>, the router and the pool under
<a href="/deployment#infrastructure">Deployment</a>.</p>
""")

page("fees", "Fees and settlement",
     "One fee: a share of profit, capped at 15%, computed at settle and paid by the agent out of its own wallet.",
     "Protocol", """
<h2 id="profit-only">Profit only</h2>

<p>The fee applies to the difference between what the agent reports as returned and what the
proposal moved out. A strategy that lost money pays nothing. There is no management fee, so
there is nothing to collect for losing.</p>

<pre><code>profit = returned - assets            // of the proposal being settled
fee    = profit * performanceFeeBps / 10_000   // 0 when returned <= assets</code></pre>

<h2 id="cap">Hard cap</h2>

<p><code>RecurveGovernor</code>'s constructor reverts with <code>FeeTooHigh</code> above 1500
bps. A governor cannot be deployed with a fee over 15%, whatever the deployer intended. The
scripted deployment uses 500 bps (5%).</p>

<h2 id="who-pays">Who pays, who receives</h2>

<p>The fee moves from <strong>the agent that calls <code>settle</code></strong> to
<code>feeRecipient</code> — the treasury, in the scripted deployment — in the vault's asset.
Nothing leaves the vault: depositors keep 100% of whatever the strategy actually returned,
and the performance fee is the agent's cost of running the fund, settled out of its own
wallet. That wallet needs the fee in the vault's asset and an allowance of at least the fee
<em>to the governor</em>, or <code>settle</code> reverts on the transfer. With
<code>feeRecipient</code> set to the zero address the transfer is skipped and the event still
reports the computed fee.</p>

<div class="note">
  <span class="tag">In practice</span>
  <p>The <a href="/runner#fee">runner</a> computes the fee before settling, checks the wallet's
  balance, approves exactly that amount, and if the balance is short logs the number and waits.
  The position is already back in the vault by then, so nothing is at risk while it waits.</p>
</div>

<h2 id="reported">The number is the agent's</h2>

<p><code>returned</code> is whatever the agent passes. The contract does not compare it with the
strategy's <code>Liquidated</code> event or the vault's balance; it only feeds it to the fee
formula, to the vault's <code>StrategySettled(returned, pnl)</code> and to the governor's
<code>ProposalSettled(id, returned, fee)</code>, which is what indexers read. Under-reporting lowers the fee,
over-reporting raises it, and neither changes what depositors hold — the vault's assets are
whatever came back through <code>returnToVault</code>. The runner reads
<code>Liquidated</code> and reports exactly that.</p>

<h2 id="not-in-code">What is not in the contracts</h2>

<p>No watcher fee share, no bounty for a correct block, no treasury split and no buyback exist
in any deployed or written contract. The registry's only economic mechanism is slashing. Anything
of that kind would be a new contract, documented here when it exists.</p>
""")

# ================================================================ Operating a fund

page("runner", "Running the agent",
     "recurve-runner is the reference agent: one process per fund that proposes a position, executes it once the window closes, unwinds it when the policy says so, and settles.",
     "Operating a fund", """
<h2 id="what">What it does</h2>

<p>The runner polls the chain every minute, rebuilds the fund's state from it, decides exactly
one action, and carries it out. It keeps no state of its own — the governor's
<code>ProposalPosted</code> / <code>ProposalExecuted</code> logs, each proposal's live state,
the strategy's balances and its <code>Liquidated</code> event are the whole picture — so a
restart mid-cycle picks up wherever the chain is.</p>

<pre><code>1  propose buy             float -> the leg, held by the strategy
   hold                    until HOLD_SECONDS, an exit the float
                           cannot pay, or FORCE_UNWIND
2  propose sell            the leg -> base asset, in the strategy
3  propose returnToVault   base asset -> the vault (Liquidated)
4  settle(id of step 1, amount from Liquidated)</code></pre>

<p>One funding per cycle. Float that arrives mid-cycle stays idle until the cycle settles: the
governor books one <code>settle</code> per deployment, and a second funding would make its fee
and PnL accounting wrong. Every step is its own proposal and waits its own veto window, so a
round trip is at least three days of windows on the scripted parameters, plus however long the
position is held.</p>

<h2 id="policy">The policy</h2>

<p>Each round the runner reads a <em>view</em> — float, deployed, total assets, what queued
exits are owed at the current share price, the newest live Pending proposal, the executed
funding proposal, the strategy's holdings, the returned amount if the return has run — and
decides:</p>

<ol>
<li><strong>Paused?</strong> Do nothing.</li>
<li><strong>A proposal is pending.</strong> Wait while its window is open. Once closed, execute
it if <code>execute</code> simulates cleanly; otherwise abandon it (below) and move on.</li>
<li><strong>Nothing deployed.</strong> Deployable = float − queued exits − the reserve
(<code>RESERVE_BPS</code> of total assets). If that clears <code>MIN_TRADE</code>, propose a buy
for it; otherwise idle.</li>
<li><strong>Capital is out</strong> and the strategy holds the leg: sell it if an unwind is
due — <code>FORCE_UNWIND</code>, queued exits exceed the float, or <code>HOLD_SECONDS</code> have
passed since the funding executed — otherwise hold.</li>
<li>The leg is sold and base sits in the strategy: propose <code>returnToVault</code>.</li>
<li>Everything is back: <code>settle</code> the funding proposal with the amount from
<code>Liquidated</code>.</li>
</ol>

<p>The decision layer is a pure function with its own tests; nothing that touches an RPC
decides anything.</p>

<h2 id="floor">The price floor</h2>

<p>A proposal is quoted when it is posted and executed a day later. The live quote cannot be
the floor — any move against the fund inside the window would revert the fill — so the calldata
states <code>quote × (1 − PRICE_TOLERANCE_BPS)</code> as its quote, and the strategy then
enforces its own <code>maxSlippageBps</code> below that. With the defaults (300 bps tolerance,
300 bps strategy cap) a buy executes at anything within roughly 6% of the price at proposal
time. That is the number a watcher sees in the calldata, and the number an operator should set
deliberately: wider survives a volatile day, narrower gives a sandwich less room. The quote
comes from Uniswap's <code>QuoterV2</code> on the pool tier the strategy is wired to, read
from the strategy itself so the two cannot disagree.</p>

<h2 id="abandon">Stuck proposals</h2>

<p>If the market moved past the floor by the time the window closes, or enough watchers
blocked it, <code>execute</code> reverts. The runner simulates before sending, logs
<code>ABANDONED</code> once, remembers the id, and proposes again at a fresh quote. The old
proposal stays <em>Pending</em> on the governor forever — there is no cancel — but nothing can
execute it except an agent key, and this one never will. Only the newest Pending proposal is
ever considered; older ones are never revived, because their calldata was priced for a market
nobody has looked at since.</p>

<h2 id="fee">The performance fee comes out of the agent's wallet</h2>

<p><code>settle</code> pulls the fee from <code>msg.sender</code>. Before settling a profitable
cycle the runner computes the fee, checks the wallet holds it in the vault's asset, approves
exactly that amount to the governor, and only then settles. If the balance is short it logs
the exact amount needed and retries next round; the position is already back in the vault by
then, so nothing is at risk while it waits. Keep the agent wallet funded with ETH for gas and
with the vault's asset for fees.</p>

<h2 id="config">Configuration</h2>

<table>
<thead><tr><th>Variable</th><th>Required</th><th>What it is</th></tr></thead>
<tbody>
<tr><td><code>PRIVATE_KEY</code></td><td>yes</td><td>The agent key. Must be an agent on the governor, hold ETH for gas and the vault's asset for fees</td></tr>
<tr><td><code>RECURVE_VAULT</code>, <code>RECURVE_GOVERNOR</code>, <code>RECURVE_REGISTRY</code></td><td>yes</td><td>The fund</td></tr>
<tr><td><code>RECURVE_STRATEGY</code></td><td>yes</td><td>Its <code>PortfolioStrategyV2</code></td></tr>
<tr><td><code>RECURVE_TOKEN</code></td><td>yes</td><td>The one basket leg the strategy buys, despite the name: NVDA, <code>0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC</code></td></tr>
<tr><td><code>DEX_QUOTER</code></td><td>yes</td><td>Uniswap V3 <code>QuoterV2</code>, <code>0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7</code></td></tr>
<tr><td><code>RECURVE_CHAIN_ID</code></td><td></td><td><code>4663</code>, the default</td></tr>
<tr><td><code>RECURVE_RPC_URL</code></td><td></td><td>Overrides the network's public endpoint. Must be the same chain</td></tr>
<tr><td><code>RECURVE_DEPLOY_BLOCK</code></td><td></td><td>Block the governor went up; bounds the log scan</td></tr>
<tr><td><code>LOG_CHUNK</code></td><td></td><td>Blocks per <code>eth_getLogs</code>. Default 100,000, the most the Robinhood Chain RPC accepts</td></tr>
<tr><td><code>MIN_TRADE</code></td><td></td><td>Smallest funding worth a proposal, in whole units of the asset. Default <code>0.001</code></td></tr>
<tr><td><code>RESERVE_BPS</code></td><td></td><td>Share of total assets kept idle so small exits clear instantly. Default 1000 (10%)</td></tr>
<tr><td><code>HOLD_SECONDS</code></td><td></td><td>Unwind this long after funding. Unset holds until exits or <code>FORCE_UNWIND</code> demand it</td></tr>
<tr><td><code>PRICE_TOLERANCE_BPS</code></td><td></td><td>See the floor. Default 300</td></tr>
<tr><td><code>FORCE_UNWIND</code></td><td></td><td><code>true</code>: sell, return, settle, then stay idle</td></tr>
<tr><td><code>PAUSED</code></td><td></td><td><code>true</code>: read and report, never act</td></tr>
<tr><td><code>DRY_RUN</code></td><td></td><td><code>true</code>: simulate every action and log it; send nothing</td></tr>
<tr><td><code>RUNNER_INTERVAL_MS</code></td><td></td><td>Poll interval. Default 60000</td></tr>
<tr><td><code>PORT</code></td><td></td><td><code>/health</code> port. Default 8080</td></tr>
</tbody>
</table>

<p>The pool fee tier, the strategy's slippage cap and the governor's performance fee are read
from the contracts, not configured, so they cannot disagree.</p>

<h2 id="boot">Boot checks</h2>

<p>The process refuses to start, with the reason on the first line of the log, if: the RPC is
not Robinhood Chain; the governor, vault and strategy do not reference each other; the
token is not in the strategy's basket; the key is not an agent; the quoter cannot price the
strategy's pool; or the wallet holds no ETH. A read that returns no data names the address, so
an address from another chain fails at boot rather than at the first transaction.</p>

<h2 id="operating">Operating it</h2>

<p><code>GET /health</code> answers with the last round: what it decided, when, and the last
error if any. It returns 503 after three failed rounds in a row, so point a
healthcheck at it. Failed rounds back off exponentially to ten minutes. Every write is
simulated before it is sent; start any new deployment with <code>DRY_RUN=true</code> and read a
few rounds of log before removing it.</p>

<pre><code>git clone https://github.com/Recurve-Money/recurve-runner
cd recurve-runner && npm install
cp .env.example .env      # fill it in, keep DRY_RUN=true; the runner loads .env from its folder
npm start</code></pre>

<p>It is one long-running Node process with no state of its own: any host that restarts it on
failure will do. Set every required variable there first.</p>
""")

page("agent-skill", "Agent skill",
     "Drop-in instructions that teach an LLM agent to operate a fund through the SDK. Works with any harness.",
     "Operating a fund", """
<p>The skill is a markdown file the harness reads as context; the agent then calls
<code>@recurvemoney/sdk</code> underneath. Nothing in it is mechanically enforced — it is the
rules, the loop and the reverts, written for a model. For an agent that runs unattended, use
the <a href="/runner">runner</a>, which is the same loop as a tested process.</p>

<h2 id="install">Install</h2>

<p><strong>Claude Code</strong></p>
<pre><code>git clone https://github.com/Recurve-Money/recurve-skill
cp -r recurve-skill/skills/recurve ~/.claude/skills/</code></pre>

<p><strong>Hermes</strong></p>
<pre><code>hermes plugins install Recurve-Money/recurve-skill</code></pre>

<p><strong>Anything else</strong> reads the raw file at
<code>recurvemoney.xyz/skill.md</code>. The project the agent works in needs the SDK:</p>

<pre><code>npm install @recurvemoney/sdk viem</code></pre>

<h2 id="env">Environment</h2>

<p>These are read by the harness, not the SDK — the SDK takes addresses through its config
and reads no environment.</p>

<pre><code># Robinhood Chain (chain id 4663)
RECURVE_RPC_URL=https://rpc.mainnet.chain.robinhood.com
@@MAINNET_AGENT_ENV@@
PRIVATE_KEY=0x...</code></pre>

<p>Every address is under <a href="/contracts#addresses">Contracts</a>.</p>

<h2 id="loop">The loop</h2>

<pre><code>const snap = await recurve.vault.snapshot();
if (snap.float > 0n) {
  const id = await recurve.agent.propose(strategy, snap.float, callData);   // id from the event
  // ... wait ...
  const wait = await recurve.agent.secondsUntilExecutable(id);
  const p = await recurve.agent.proposal(id);
  if (wait === 0 && p.state === ProposalState.Pending) {
    if ((await recurve.watcher.blockCount(id)) < threshold) await recurve.agent.execute(id);
  }
  // ... unwind through the strategy, then ...
  await recurve.agent.settle(id, returned);
}</code></pre>

<p>Read the id off <code>propose</code>'s return value: it comes from the
<code>ProposalPosted</code> event, not a simulation, because the id hashes the block timestamp.
The full method list is on the <a href="/sdk">SDK reference</a>.</p>

<h2 id="rules">The rules it gives the model</h2>

<ul>
<li>Never propose a call the agent has not simulated</li>
<li>Never propose against a target it cannot name in a sentence</li>
<li>Do not repost a vetoed strategy under a new id</li>
<li>Settle promptly, because the share price is wrong until you do</li>
<li>Report losses at the real number — <code>returned</code> is unverified, and the record is public</li>
</ul>

<p>A vetoed proposal is the system working, not an obstacle. Reposting the same calldata gets a
fresh id (the timestamp differs), and watchers read that as a governance attack.</p>

<h2 id="reverts">Reverts it will meet</h2>

<table>
<thead><tr><th>Revert</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><code>OnlyAgent</code></td><td>This key is not an agent on the governor. Ask the agentAdmin to add it.</td></tr>
<tr><td><code>VetoWindowOpen</code></td><td>Too early. <code>secondsUntilExecutable</code> says how long.</td></tr>
<tr><td><code>WatchersBlocked</code></td><td>Enough watchers blocked it. The proposal stays Pending forever; move on.</td></tr>
<tr><td><code>WrongState</code></td><td>Not Pending (for execute) or not Executed (for settle).</td></tr>
<tr><td><code>FloatTooLow</code></td><td>The proposal moves more than the vault holds idle.</td></tr>
<tr><td><code>ExecutionFailed</code></td><td>The strategy call reverted — usually a floor the market moved past.</td></tr>
<tr><td><code>ERC20InsufficientAllowance</code> at settle</td><td>Approve the governor for the fee in the vault's asset from the agent's wallet.</td></tr>
</tbody>
</table>
""")

page("watcher-skill", "Watcher skill",
     "Instructions for running a watcher: stake, fork, replay, read the diff, rule on it.",
     "Operating a fund", """
<h2 id="install">Install</h2>

<p><strong>Claude Code</strong></p>
<pre><code>git clone https://github.com/Recurve-Money/recurve-skill
cp -r recurve-skill/skills/recurve-watcher ~/.claude/skills/</code></pre>

<p><strong>Hermes</strong></p>
<pre><code>hermes plugins install Recurve-Money/recurve-skill</code></pre>

<p><strong>Anything else</strong> reads the raw file at
<code>recurvemoney.xyz/skill-watcher.md</code>. Replaying needs Foundry's <code>anvil</code> and
<code>cast</code>, and the project needs the SDK:</p>

<pre><code>npm install @recurvemoney/sdk viem</code></pre>

<h2 id="env">Environment</h2>

<pre><code># Robinhood Chain (chain id 4663)
RECURVE_RPC_URL=https://rpc.mainnet.chain.robinhood.com
RECURVE_FORK_RPC_URL=...   # archive node, not optional
@@MAINNET_WATCHER_ENV@@
RECURVE_TOKEN=@@MAINNET_TOKEN@@
PRIVATE_KEY=0x...</code></pre>

<p>Every address is under <a href="/contracts#addresses">Contracts</a>. The SDK's config needs all
three of vault, governor and registry even for a watcher, and <code>stake</code> takes the token
address as an argument.</p>

<h2 id="stake">Stake first</h2>

<pre><code>const min = await recurve.watcher.minStake();
await recurve.watcher.stake(RECURVE_TOKEN, min);   // approves the registry (unlimited) if needed, then stakes</code></pre>

<p>Active from the moment the stake reaches the minimum. Verdicts from an inactive watcher
revert with <code>BelowMinStake</code>.</p>

<h2 id="loop">The loop</h2>

<ol>
<li><strong>Get the proposal.</strong> <code>const {target, assets, callData, snapshot} = await
recurve.agent.proposal(id);</code> The proposal was posted in block <code>snapshot + 1</code>.</li>
<li><strong>Fork at that block.</strong>
<pre><code>anvil --fork-url $RECURVE_FORK_RPC_URL --fork-block-number &lt;snapshot + 1&gt;</code></pre></li>
<li><strong>Replay exactly what the governor would do</strong>, as the governor: impersonate it,
fund the target with <code>assets</code> from the vault, then call <code>target</code> with
<code>callData</code>.
<pre><code>cast rpc anvil_impersonateAccount $RECURVE_GOVERNOR
cast rpc anvil_setBalance $RECURVE_GOVERNOR 0xde0b6b3a7640000   # 1 ETH for gas: the governor holds none
cast send $RECURVE_VAULT "fundStrategy(address,uint256)" $TARGET $ASSETS --from $RECURVE_GOVERNOR --unlocked
cast send $TARGET $CALLDATA --from $RECURVE_GOVERNOR --unlocked</code></pre></li>
<li><strong>Read the state diff, not the intent.</strong> The list is under
<a href="/watchers#review">What to look for</a>. For a <a href="/strategies">PortfolioStrategy</a>
call, decode the calldata and compare <code>minAmountOut</code> with a live quote: that floor
is the whole trade.</li>
<li><strong>Cast.</strong>
<pre><code>await recurve.watcher.castVerdict(id, Verdict.Block);     // or Verdict.Approve</code></pre>
A verdict is final. Never call this before the simulation completes, and never pass
<code>Verdict.None</code>.</li>
</ol>

<h2 id="unverified">When verification fails</h2>

<p>If the fork failed, the RPC timed out, or the trace was inconclusive, the skill's instruction
is to block. It tells the agent never to approve a proposal it could not simulate — an
instruction, not a guard; nothing in a markdown file can stop a model that ignores it. "I could
not verify it, so I approved it" is not a position a staked reviewer gets to hold, and a block
costs nothing.</p>

<h2 id="exit">Leaving</h2>

<p>The SDK has no unstake methods. Call the registry with viem and the exported ABI:</p>

<pre><code>import {registryAbi} from "@recurvemoney/sdk";
await walletClient.writeContract({address: registry, abi: registryAbi, functionName: "requestUnstake", args: [amount]});
// after the delay (7 days on the scripted deployment)
await walletClient.writeContract({address: registry, abi: registryAbi, functionName: "unstake"});</code></pre>

<p>Stake stays active and slashable until <code>unstake</code> completes.</p>

<h2 id="reverts">Reverts it will meet</h2>

<table>
<thead><tr><th>Revert</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><code>BelowMinStake</code></td><td>Stake more, or the minimum was raised, or the stake was slashed.</td></tr>
<tr><td><code>AlreadyVoted</code></td><td>Already ruled on this proposal. Verdicts are final.</td></tr>
<tr><td><code>OnlyGovernor</code></td><td><code>convict</code> is not yours to call.</td></tr>
<tr><td><code>UnstakeNotReady</code></td><td>The delay has not elapsed.</td></tr>
<tr><td><code>NoPendingUnstake</code></td><td>No request open — or a conviction cleared it.</td></tr>
</tbody>
</table>
""")

# ================================================================ Reference

page("sdk", "SDK reference",
     "@recurvemoney/sdk wraps the contracts for all three roles: depositor, agent, and watcher. Every method, what it sends, and what it returns.",
     "Reference", """
<h2 id="package">Package</h2>

<pre><code>npm install @recurvemoney/sdk viem</code></pre>

<table>
<thead><tr><th></th><th></th></tr></thead>
<tbody>
<tr><td>Version</td><td><code>0.1.0</code>, MIT</td></tr>
<tr><td>Format</td><td>ESM only — no CommonJS build, no <code>require</code></td></tr>
<tr><td>Runtime</td><td>Node 20+. Peer dependency <code>viem ^2.21.0</code>; no runtime dependencies of its own</td></tr>
<tr><td>Exports</td><td><code>Recurve</code>, <code>VaultReader</code>, <code>DepositorClient</code>, <code>AgentClient</code>, <code>WatcherClient</code>; enums <code>ProposalState</code>, <code>Verdict</code>; types <code>RecurveConfig</code>, <code>RecurveAddresses</code>, <code>VaultSnapshot</code>, <code>Proposal</code>, <code>RedeemResult</code>, <code>WatcherStake</code>; ABIs <code>vaultAbi</code>, <code>governorAbi</code>, <code>registryAbi</code>, <code>erc20Abi</code></td></tr>
</tbody>
</table>

<p>The SDK ships no chain definitions, no addresses and reads no environment. It never
formats: every amount is a <code>bigint</code> in on-chain base units.</p>

<h2 id="entry">Entry point</h2>

<pre><code>import {Recurve, ProposalState, Verdict} from "@recurvemoney/sdk";

const recurve = new Recurve({
  publicClient,          // viem PublicClient
  walletClient,          // viem WalletClient with an account; omit for read-only
  addresses: {vault, governor, registry},
});

recurve.vault       // VaultReader:     snapshot, sharesOf, canRedeemInstantly, pendingRequests
recurve.depositor   // DepositorClient: deposit, redeem, claim, veto
recurve.agent       // AgentClient:     propose, execute, settle, proposal, secondsUntilExecutable
recurve.watcher     // WatcherClient:   stake, castVerdict, stakeOf, blockCount, minStake</code></pre>

<p>Each sub-client can also be constructed on its own with the same config. The config covers
one vault, its governor and its registry; the $RECURVE token address is not part of it and is
passed to <code>stake</code> directly. Nothing validates that the clients and the addresses are
on the same chain — pass a viem <code>chain</code> to both clients yourself.</p>

<h3 id="writes">How writes behave</h3>

<p>Every write signs with the wallet's account, passes <code>walletClient.chain</code> through,
waits for the receipt, and returns the transaction hash (<code>propose</code> returns the
proposal id instead). No gas, nonce or value overrides are accepted. Only <code>redeem</code>
and <code>propose</code> simulate before sending; the rest rely on viem's gas estimate to
surface a revert. Every write rejects before any RPC call when it cannot sign — without a
<code>walletClient</code>, and with one that has no hoisted account:</p>

<pre><code>This call needs a walletClient; the SDK was built read-only.
walletClient has no account attached.</code></pre>

<h2 id="vault">VaultReader</h2>

<table>
<thead><tr><th>Method</th><th>Returns</th></tr></thead>
<tbody>
<tr><td><code>snapshot()</code></td><td><code>VaultSnapshot</code>: <code>address</code>, <code>asset</code>, <code>totalAssets</code>, <code>float</code>, <code>deployedAssets</code>, <code>totalSupply</code>, <code>sharePrice</code> (asset base units per 1e18 shares; exactly <code>1e18</code> while supply is zero). Six reads, not one multicall — they can straddle a block</td></tr>
<tr><td><code>sharesOf(owner)</code></td><td>Share balance</td></tr>
<tr><td><code>canRedeemInstantly(shares)</code></td><td><code>previewRedeem(shares) &lt;= float()</code>. Advisory: the float can move before the transaction lands</td></tr>
<tr><td><code>pendingRequests(owner)</code></td><td>Queue ids for an owner. There is no read for a request's status; <code>claim</code> reverts until it is ready</td></tr>
</tbody>
</table>

<h2 id="depositor">DepositorClient</h2>

<pre><code>deposit(assets: bigint, opts?: {skipDelegate?: boolean}): Promise&lt;Hex&gt;
redeem(shares: bigint, receiver?: Address): Promise&lt;RedeemResult&gt;
claim(requestId: bigint): Promise&lt;Hex&gt;
veto(proposalId: Hex): Promise&lt;Hex&gt;</code></pre>

<p><strong><code>deposit</code></strong> — up to three transactions: an unlimited
<code>approve</code> of the asset to the vault if the allowance is short, <code>deposit</code>
with the signer as receiver, then <code>delegate</code> to the signer unless
<code>skipDelegate</code>. Delegates on every deposit. Returns the deposit hash only. The deposit
cap is enforced by the contract, not checked here.</p>

<p><strong><code>redeem</code></strong> — simulates <code>requestRedeem(shares, receiver ??
signer, signer)</code>, sends it, and returns:</p>

<pre><code>interface RedeemResult {
  instant: boolean;     // the float covered it and the exit cleared in this transaction
  requestId?: bigint;   // queue position; absent when instant
  txHash: Hex;
}</code></pre>

<p><code>instant</code> comes from the simulation; <code>requestId</code> is corrected from the
<code>WithdrawalQueued</code> event in the receipt. Its type is <code>bigint | undefined</code>
and TypeScript will not narrow it from <code>instant</code> — check it explicitly.</p>

<p><strong><code>claim</code></strong> — <code>claimRedeem(requestId)</code>; reverts
<code>RequestNotReady</code> until the idle balance covers the request. Assets go to the
receiver fixed at redeem time. <strong><code>veto</code></strong> —
<code>governor.veto(id)</code>; the SDK exposes no read for the threshold or for a holder's
weight at the snapshot.</p>

<h2 id="agent">AgentClient</h2>

<pre><code>propose(target: Address, assets: bigint, callData: Hex = "0x"): Promise&lt;Hex&gt;   // the proposal id
execute(proposalId: Hex): Promise&lt;Hex&gt;
settle(proposalId: Hex, returned: bigint): Promise&lt;Hex&gt;
proposal(proposalId: Hex): Promise&lt;Proposal&gt;                                   // read
secondsUntilExecutable(proposalId: Hex): Promise&lt;number&gt;                       // read</code></pre>

<p><strong><code>propose</code></strong> simulates, sends, and returns the id from the
<code>ProposalPosted</code> event — not the simulated value, which goes stale the moment the
transaction lands in a different second. The transaction hash is not returned. Empty calldata
posts a funds-only proposal.</p>

<pre><code>interface Proposal {
  id: Hex; target: Address; assets: bigint; callData: Hex;
  postedAt: bigint;      // unix seconds
  snapshot: bigint;      // block whose vote weights count: one before the proposal landed
  vetoWeight: bigint;
  state: ProposalState;  // None 0, Pending 1, Vetoed 2, Blocked 3, Executed 4, Settled 5
}</code></pre>

<p>An unknown id returns all-zero fields with <code>state === ProposalState.None</code> rather
than throwing. <strong><code>secondsUntilExecutable</code></strong> compares
<code>executableAt</code> with the machine's clock and clamps at zero, as a JS
<code>number</code>; zero means the window has closed, or the id is unknown. Not exposed:
<code>vetoWindow</code>, <code>isAgent</code>, any proposal listing (ids come from
<code>ProposalPosted</code> logs, which you scan with viem).</p>

<h2 id="watcher">WatcherClient</h2>

<pre><code>stake(token: Address, amount: bigint): Promise&lt;Hex&gt;
castVerdict(proposalId: Hex, verdict: Verdict): Promise&lt;Hex&gt;
stakeOf(watcher: Address): Promise&lt;WatcherStake&gt;    // read
blockCount(proposalId: Hex): Promise&lt;bigint&gt;         // read
minStake(): Promise&lt;bigint&gt;                          // read</code></pre>

<p><strong><code>stake</code></strong> takes the $RECURVE token address (the parameter is
still named <code>arcToken</code> in the published typings), approves the registry without
limit if the allowance is short, and stakes. It does not compare <code>amount</code> with
<code>minStake</code>. <strong><code>castVerdict</code></strong> sends <code>Verdict.Approve</code>
(1) or <code>Verdict.Block</code> (2); it does not stop you sending <code>None</code>, which the
contract counts as a block — don't.</p>

<pre><code>interface WatcherStake { stake: bigint; pendingUnstake: bigint; unstakeRequestedAt: bigint; active: boolean; }</code></pre>

<p>Not exposed as methods: <code>requestUnstake</code>, <code>unstake</code>,
<code>isActive</code>. They are in <code>registryAbi</code>; call them with viem directly, as on
the <a href="/watcher-skill#exit">watcher skill</a>.</p>

<h2 id="abis">ABIs and errors</h2>

<p>The four exported ABIs are trimmed to what the clients call and carry no <code>error</code>
entries, so a revert through the SDK arrives as an undecoded selector. To see names like
<code>VetoWindowOpen</code> in viem's errors, decode with the full ABI from the protocol repo
(the app carries every custom error in <code>app/src/lib/abi.ts</code>).</p>
""")

page("api", "Indexer API",
     "A read-only JSON API over the funds the indexer watches: equity curves, flows, proposals and per-address cost basis. Everything the chain cannot answer cheaply.",
     "Reference", """
<h2 id="base">Base</h2>

<p>The Recurve Fund's indexer answers at the address below. Another fund runs its own (see
<a href="#run">Running it</a>).</p>

<pre><code>https://www.recurvemoney.xyz/indexer</code></pre>

<p>GET only, CORS <code>*</code>, weak ETags (send <code>If-None-Match</code> to get a 304).
Unknown paths and methods answer <code>404 {"error":"not found"}</code>; a crashed route
<code>500 {"error":"internal"}</code>. The app uses it for the TVL chart and the risk panel and
nothing else; every other number in the app is read from chain.</p>

<h2 id="conventions">Conventions</h2>

<ul>
<li>Every amount is a <strong>decimal string</strong> holding a full uint256 — never parse one
into a JS number. Asset amounts are in the asset's base units (<code>asset_decimals</code>),
share amounts in share units, <code>share_price</code> is asset base units per 1e18 shares and
is exactly <code>"1000000000000000000"</code> for an empty vault.</li>
<li>Block numbers and <code>executable_at</code> (unix seconds) are strings too;
<code>state</code>, <code>watcher_blocks</code>, <code>log_index</code>,
<code>asset_decimals</code>, <code>return_24h_pct</code> and the health routes'
<code>lastOk</code> (unix milliseconds) are numbers.</li>
<li>Timestamps are ISO-8601 UTC. Addresses and hashes are lowercase.</li>
<li>Lists for an unknown fund are empty with a 200; only <code>/funds/:slug</code> 404s.</li>
</ul>

<h2 id="routes">Routes</h2>

<h3 id="funds"><code>GET /funds</code></h3>

<p>Every fund with its latest snapshot, largest TVL first.</p>

<pre><code>{"funds": [{
  "slug": "main", "name": "Recurve Fund",
  "vault": "0x…", "governor": "0x…",
  "asset": "0x…", "asset_symbol": "USDG", "asset_decimals": 6,
  "total_assets": "2500000000", "float_assets": "250000000", "deployed": "2250000000",
  "total_supply": "2500000000", "share_price": "1000000000000000000",
  "updated_at": "2026-09-19T09:30:58.988Z",
  "share_price_24h": "1000000000000000000",   // newest snapshot at least 24h old, or null
  "return_24h_pct": 0                          // share_price / share_price_24h − 1, in percent; null without a 24h reference
}]}</code></pre>

<h3 id="fund"><code>GET /funds/:slug</code></h3>

<p>One fund with the same snapshot columns plus <code>created_at</code> (when the indexer first
saw it), without the 24h fields. <code>404 {"error":"no such fund"}</code> for an unknown
slug.</p>

<h3 id="history"><code>GET /funds/:slug/history?range=</code></h3>

<table>
<thead><tr><th><code>range</code></th><th>Lookback</th><th>Bucket</th></tr></thead>
<tbody>
<tr><td><code>24h</code></td><td>24 hours</td><td>10 minutes</td></tr>
<tr><td><code>7d</code> (default)</td><td>7 days</td><td>1 hour</td></tr>
<tr><td><code>30d</code></td><td>30 days</td><td>6 hours</td></tr>
<tr><td><code>all</code></td><td>everything</td><td>1 day</td></tr>
</tbody>
</table>

<pre><code>{"range": "7d", "points": [
  {"t": "2026-09-19T09:00:00.000Z", "total_assets": "5000000000000000", "share_price": "1000000000000000000"},
  …
]}</code></pre>

<p>Buckets are aligned to the epoch and carry the <em>maximum</em> of each value inside them.
Buckets with no snapshot are absent, not zero — a gap means the indexer was down. Any other
range answers <code>400 {"error":"bad range","allowed":["24h","7d","30d","all"]}</code>.</p>

<h3 id="proposals"><code>GET /funds/:slug/proposals</code>, <code>GET /proposals</code></h3>

<p>Newest first, capped at 100 per fund or 200 across all funds; the cross-fund route adds
<code>slug</code> and <code>name</code> to each row.</p>

<pre><code>{"proposals": [{
  "id": "0x…",                       // bytes32 proposal id
  "governor": "0x…", "vault": "0x…", "target": "0x…",
  "assets": "5000000000000000",
  "posted_block": "108364501", "posted_at": "2026-08-27T…Z",
  "executable_at": "1787943865",     // unix seconds
  "state": 4,                        // 1 Pending, 2 Vetoed, 3 Blocked, 4 Executed, 5 Settled
  "veto_weight": "0", "watcher_blocks": 0,
  "returned": null, "fee": null,     // set by ProposalSettled
  "updated_at": "…"
}]}</code></pre>

<p>State follows governor events only; the indexer never reads the contract's state. Because a
watcher block is a revert on chain, <code>3</code> never actually appears, and a blocked or
abandoned proposal shows as <code>1</code> with an <code>executable_at</code> in the past
forever. Calldata is not stored (it is not in any event); read it from the governor.</p>

<h3 id="flows"><code>GET /funds/:slug/flows</code></h3>

<p>The newest 100 vault events, one row each.</p>

<table>
<thead><tr><th><code>kind</code></th><th>Event</th><th><code>account</code></th><th><code>assets</code> / <code>shares</code></th></tr></thead>
<tbody>
<tr><td><code>deposit</code></td><td><code>Deposit</code></td><td>owner</td><td>both</td></tr>
<tr><td><code>withdraw</code></td><td><code>Withdraw</code> (instant exit)</td><td>owner</td><td>both</td></tr>
<tr><td><code>queued</code></td><td><code>WithdrawalQueued</code></td><td>owner</td><td>shares only</td></tr>
<tr><td><code>claimed</code></td><td><code>WithdrawalClaimed</code></td><td>owner</td><td>assets only</td></tr>
<tr><td><code>fund</code></td><td><code>StrategyFunded</code></td><td>the strategy</td><td>assets only</td></tr>
<tr><td><code>settle</code></td><td><code>StrategySettled</code></td><td>the vault</td><td>assets returned</td></tr>
</tbody>
</table>

<pre><code>{"flows": [{"id": "1", "vault": "0x…", "kind": "deposit", "account": "0x…",
  "assets": "5000000000000000", "shares": "5000000000000000",
  "block_number": "108251528", "tx_hash": "0x…", "log_index": 3, "occurred_at": "…"}]}</code></pre>

<h3 id="portfolio"><code>GET /portfolio/:address</code></h3>

<p>Cost basis per fund for one address: deposits minus withdrawals and claims, in asset terms.
Current value needs a live share balance and price, which belong to a client that already
holds a chain connection. Malformed addresses answer <code>400 {"error":"not an address"}</code>;
an address with no history answers an empty <code>positions</code> list.</p>

<pre><code>{"address": "0x…", "positions": [{
  "slug": "main", "name": "Recurve Fund", "vault": "0x…",
  "asset_symbol": "USDG", "asset_decimals": 6,
  "deposited": "2500000000", "withdrawn": "0",
  "net_deposited": "2500000000",   // can go negative after a profitable exit
  "events": "1", "last_block": "108251528"
}]}</code></pre>

<h3 id="health"><code>GET /health</code>, <code>GET /health/indexer</code></h3>

<p><code>/health</code> pings the database and stays 200 while the indexer is merely behind, so
a long first backfill does not fail a deploy. <code>/health/indexer</code> answers 503 once a
loop that has succeeded before goes five poll intervals (60 seconds by default) without another
success. A first backfill shows <code>lastOk: 0</code>, <code>cursor: null</code>,
<code>stale: false</code>, and has thirty minutes to finish its first poll before that turns
stale too, so a loop that fails from the start does not read as healthy. An empty
<code>VAULTS</code> is never stale: there is nothing to index. A malformed one is stale at once,
with an <code>error</code> field saying so:</p>

<pre><code>{"ok": true, "lastOk": 1758274258988, "cursor": "108451200", "stale": false}</code></pre>

<h2 id="freshness">Freshness</h2>

<p>The indexer polls every 12 seconds and trails the head by two blocks. Timer snapshots of
every fund land roughly once a minute while the loop is healthy (never more often than every
60 seconds, and not at all while it is backing off from a failure), and the fund whose vault
emitted a <code>StrategyFunded</code> or <code>StrategySettled</code> gets an extra snapshot
pinned to that event's block, so the step when capital leaves and the jump when it comes back
sit on the curve at the right block rather than up to a minute late. History starts when the indexer started watching a fund; there is no reconstruction of
the past, because public RPCs do not serve historical state.</p>

<h2 id="run">Running it</h2>

<pre><code>git clone https://github.com/Recurve-Money/recurve && cd recurve/api && npm install
cp .env.example .env    # DATABASE_URL, CHAIN_ID, VAULTS, DEPLOY_BLOCK
npm run dev</code></pre>

<table>
<thead><tr><th>Variable</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><code>DATABASE_URL</code></td><td>Postgres. Tables are created on boot</td></tr>
<tr><td><code>CHAIN_ID</code></td><td><code>4663</code>, the default; <code>RPC_URL</code> overrides the endpoint</td></tr>
<tr><td><code>VAULTS</code></td><td><code>slug:vault:governor:name</code>, comma separated. A malformed entry stops the indexer while the API stays up</td></tr>
<tr><td><code>DEPLOY_BLOCK</code></td><td>The last block treated as already indexed when no cursor row exists yet; the first scan starts at <code>DEPLOY_BLOCK + 1</code>, so set it to the block <em>before</em> the deploy</td></tr>
<tr><td><code>LOG_CHUNK</code>, <code>POLL_MS</code></td><td>Blocks per <code>eth_getLogs</code> (at most 100,000 on the Robinhood Chain RPC) and the poll interval</td></tr>
<tr><td><code>CORS_ORIGIN</code>, <code>PORT</code></td><td>Optional</td></tr>
</tbody>
</table>

<p>The cursor is global: a fund added later is indexed from the current head, not backfilled.
Every insert is idempotent — flows on <code>(tx_hash, log_index)</code>, snapshots on
<code>(vault, block_number)</code>, proposals on their id, with state updates replayed in log
order — so rewinding the cursor row by hand and restarting is safe.</p>
""")

page("contracts", "Contracts",
     "Five contracts: a vault, a governor and a strategy per fund, a registry and a token. Every address, every deploy parameter.",
     "Reference", """
<h2 id="list">The set</h2>

<table>
<thead><tr><th>Contract</th><th>Scope</th><th>Purpose</th></tr></thead>
<tbody>
<tr><td><code>RecurveVault</code></td><td>Per fund</td><td>ERC-4626 vault with voting shares and a deposit cap. Holds the idle balance, counts deployed capital, runs the redemption queue. <a href="/vaults">Vaults</a></td></tr>
<tr><td><code>RecurveGovernor</code></td><td>Per fund</td><td>Proposal lifecycle, the agent set, the performance fee. <a href="/governance">Governance</a></td></tr>
<tr><td><code>PortfolioStrategyV2</code></td><td>Per fund</td><td>Fixed-basket swap strategy against Uniswap V3 <code>SwapRouter02</code>. <a href="/strategies">Strategies</a></td></tr>
<tr><td><code>WatcherRegistry</code></td><td>Shared by whatever governors point at it</td><td>Stake, verdicts, slashing. <a href="/watchers">Watchers</a></td></tr>
<tr><td>$RECURVE</td><td>One</td><td>The token launched on Pons v2: 1B minted at launch, 18 decimals, no owner, no mint; holders can burn. Watchers stake it</td></tr>
</tbody>
</table>

<p>The deploy script creates a new registry on every run. A fund's governor takes its registry as
an immutable constructor argument.</p>

<h2 id="deploy-order">Deployment order</h2>

<p>The vault and governor reference each other, so one of the two is wired after both exist:
the governor takes the vault as a constructor argument, and the vault's governor is set
afterwards with <code>setGovernor</code>. No address prediction is involved, which is what
lets the sequence be reproduced by hand, one contract at a time. This is
<code>script/DeployMainnet.s.sol</code>:</p>

<pre><code>WatcherRegistry registry = new WatcherRegistry(reve, 1_000e18, 7 days, deployer); // reve: the $RECURVE token
RecurveVault vault = new RecurveVault(asset, "Recurve Fund", "rvFUND", depositCap);
RecurveGovernor governor = new RecurveGovernor(
    vault,
    registry,
    agent,      // first agent, and the agentAdmin
    24 hours,   // vetoWindow
    2000,       // vetoThresholdBps
    2,          // watcherBlockThreshold
    500,        // performanceFeeBps
    treasury    // feeRecipient
);

vault.setGovernor(address(governor));
registry.setGovernor(address(governor));</code></pre>

<p><code>RecurveVault.setGovernor</code> is callable once, only by whoever deployed the vault.
Any other caller reverts with <code>OnlyDeployer</code>; a second call, or a zero address,
reverts with <code>GovernorAlreadySet</code>. <code>WatcherRegistry.setGovernor</code> is
<code>onlyOwner</code>, re-settable any number of times, and emits
<code>GovernorUpdated</code>. $RECURVE comes from Pons, first or later through
<code>setStakeToken</code>, and the strategy last, in the same script; the full sequence with every variable is under
<a href="/deployment">Deployment</a>.</p>

<div class="note warn">
  <span class="tag">Set it before anyone deposits</span>
  <p>Until <code>setGovernor</code> runs the vault has no governor and
  <code>fundStrategy</code> reverts with <code>OnlyGovernor</code> for everyone. Once it runs
  the address is permanent. A vault pointing at the wrong governor can never move capital
  again, and there is no recovery path.</p>
</div>

<h2 id="addresses">Addresses</h2>

@@ADDRESSES@@

<h2 id="limitations">Known limitations</h2>

<p>Things the code does today that a reader of the design pages would not guess. None is
hidden; all are visible in the source.</p>

<ul>
<li><strong>No cancel.</strong> A proposal leaves Pending only by veto or execution. A
watcher-blocked one stays Pending forever, because <code>execute</code>'s block is a revert
that undoes its own state write.</li>
<li><strong>The queue reserves nothing.</strong> <code>float()</code> is the raw idle balance;
a strategy can be funded ahead of a queued exit.</li>
<li><strong>Standard <code>withdraw</code> and <code>redeem</code> bypass the queue</strong>
and revert when the balance is short.</li>
<li><strong><code>returned</code> is self-reported.</strong> <code>settle</code> checks it
against nothing; it drives the fee and the <code>StrategySettled</code> event, not the
vault's balance.</li>
<li><strong>Share price is inflated between a strategy's return and <code>settle</code>.</strong></li>
<li><strong>Slashing is unreachable as deployed.</strong> <code>convict</code> is
<code>registry.governor</code>-only and <code>RecurveGovernor</code> never calls it; the
registry owner would have to repoint <code>governor</code> to a key that does.</li>
<li><strong><code>castVerdict(id, None)</code> counts as a block and can be repeated</strong>,
so one active watcher can reach <code>watcherBlockThreshold</code> alone.</li>
<li><strong>Verdicts are accepted on any id at any time</strong>; the registry does not know
what a proposal is.</li>
<li><strong>Two identical proposals in one second share an id</strong>; the second overwrites
the first.</li>
<li><strong>Admin foot-guns.</strong> <code>setAgentAdmin(0)</code> freezes the agent set;
<code>removeAgent</code> can remove the last agent; the registry owner can change
<code>minStake</code> and <code>unstakeDelay</code> at any time, and <code>unstake</code> uses
the delay current at claim time.</li>
<li><strong>Strategy weights are declarative</strong>; <code>buy</code> and <code>sell</code>
do not read them. <code>quotedOut</code> is the agent's word.</li>
<li><strong>No pause, no timelock, no upgrade path</strong> on any contract, and no setters for
the governor's parameters. The only post-deploy knobs are the vault's deposit cap (up only),
the governor's agent set, and the registry owner's <code>setParameters</code>,
<code>setGovernor</code> and, once, <code>setStakeToken</code>.</li>
</ul>

<h2 id="source">Source</h2>

<p>Contracts live at
<a href="https://github.com/Recurve-Money/recurve-protocol">Recurve-Money/recurve-protocol</a>,
licensed BUSL-1.1 (the strategy deploy scripts are MIT), built with Foundry against
OpenZeppelin v5.1.0 on Solidity 0.8.28, <code>via_ir</code>, EVM version <code>paris</code>.
Tests are Foundry unit and fuzz tests in
<code>test/</code>. The contracts have not been independently audited.</p>
""")

page("errors", "Errors",
     "Every custom revert across the four contracts, what it means, and what to do about it.",
     "Reference", """
<p>Every name here is a custom error. Through the app they arrive as a sentence; through the
SDK they arrive as an undecoded selector, because its trimmed ABIs carry no error entries —
decode with the full ABI from the protocol repo to see the name.</p>

<h2 id="vault">RecurveVault</h2>

<table>
<thead><tr><th>Error</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><code>OnlyGovernor</code></td><td>Capital moves only through the governor. Also what everyone sees before <code>setGovernor</code> has run.</td></tr>
<tr><td><code>OnlyDeployer</code></td><td><code>setGovernor</code> and <code>raiseDepositCap</code> are for whoever deployed the vault.</td></tr>
<tr><td><code>GovernorAlreadySet</code></td><td>The governor is set once. Also raised for a zero address.</td></tr>
<tr><td><code>CapCannotDecrease</code></td><td><code>raiseDepositCap</code> only goes up. The new cap must exceed the current one.</td></tr>
<tr><td><code>FloatTooLow</code></td><td>The proposal moves more than the vault holds idle.</td></tr>
<tr><td><code>NothingToSettle</code></td><td>No deployed capital to book. The cycle was already settled.</td></tr>
<tr><td><code>RequestNotReady</code></td><td>The idle balance cannot cover the queued exit at today's price. It rises when the strategy returns assets, independently of <code>settle</code>.</td></tr>
<tr><td><code>RequestAlreadyClaimed</code></td><td>Already withdrawn.</td></tr>
<tr><td><code>NotRequestOwner</code></td><td>That queue position belongs to another address — the one that owned the shares, not the receiver.</td></tr>
</tbody>
</table>

<p>Also from the vault, inherited from OpenZeppelin: <code>ERC4626ExceededMaxDeposit</code> /
<code>ERC4626ExceededMaxMint</code> above the deposit cap, <code>ERC4626ExceededMaxWithdraw</code> /
<code>ERC4626ExceededMaxRedeem</code>, <code>ERC20InsufficientBalance</code> and
<code>ERC20InsufficientAllowance</code>, and a plain <code>Panic(0x32)</code> for a
<code>claimRedeem</code> on a request id that does not exist.</p>

<h2 id="governor">RecurveGovernor</h2>

<table>
<thead><tr><th>Error</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><code>OnlyAgent</code></td><td>Wrong key. Caller is not in the agent set; check <code>isAgent</code>.</td></tr>
<tr><td><code>OnlyAgentAdmin</code></td><td>Only <code>agentAdmin</code> can add or remove agents or hand the role on.</td></tr>
<tr><td><code>AlreadyAgent</code></td><td><code>addAgent</code> on an address already in the set.</td></tr>
<tr><td><code>NotAnAgent</code></td><td><code>removeAgent</code> on an address that is not in the set.</td></tr>
<tr><td><code>UnknownProposal</code></td><td>No proposal with that id — from <code>veto</code> and <code>execute</code>. <code>settle</code> on an unknown id says <code>WrongState</code> instead.</td></tr>
<tr><td><code>WrongState</code></td><td>Proposal is not in the state that call needs: <code>veto</code> and <code>execute</code> need Pending, <code>settle</code> needs Executed. Read <code>stateOf</code> first.</td></tr>
<tr><td><code>VetoWindowOpen</code></td><td>Too early to execute. <code>executableAt</code> says when.</td></tr>
<tr><td><code>VetoWindowClosed</code></td><td>Too late to veto.</td></tr>
<tr><td><code>AlreadyVetoed</code></td><td>One veto per address per proposal.</td></tr>
<tr><td><code>NoVotingWeight</code></td><td>No shares at the snapshot, or never delegated.</td></tr>
<tr><td><code>WatchersBlocked</code></td><td>Enough watchers blocked. The proposal stays Pending on chain forever and can never execute; propose again rather than retrying.</td></tr>
<tr><td><code>ExecutionFailed</code></td><td>The target call reverted — on a strategy, usually a floor the market moved past.</td></tr>
<tr><td><code>FeeTooHigh</code></td><td>Constructor rejects anything above 1500 bps.</td></tr>
</tbody>
</table>

<p><code>settle</code> also surfaces the fee token's <code>ERC20InsufficientAllowance</code> or
<code>ERC20InsufficientBalance</code> when the calling agent has not approved the governor, or
does not hold, the fee.</p>

<h2 id="registry">WatcherRegistry</h2>

<table>
<thead><tr><th>Error</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><code>OnlyGovernor</code></td><td><code>convict</code> is called by the registry's governor address, not by watchers.</td></tr>
<tr><td><code>BelowMinStake</code></td><td>Stake under the minimum, the minimum was raised, or the stake was slashed. Stake again to re-activate.</td></tr>
<tr><td><code>AlreadyVoted</code></td><td>Verdicts are final.</td></tr>
<tr><td><code>AlreadyConvicted</code></td><td>A conviction cannot be replayed.</td></tr>
<tr><td><code>NothingStaked</code></td><td>No stake to withdraw.</td></tr>
<tr><td><code>UnstakeNotReady</code></td><td>Delay has not elapsed.</td></tr>
<tr><td><code>NoPendingUnstake</code></td><td>No open request, or a conviction cleared it.</td></tr>
<tr><td><code>ZeroAmount</code></td><td><code>stake(0)</code>, or <code>requestUnstake</code> for zero or for more than the stake.</td></tr>
<tr><td><code>StakeTokenAlreadySet</code></td><td>The stake token is named once. <code>setStakeToken</code> cannot change it.</td></tr>
<tr><td><code>ZeroToken</code></td><td><code>setStakeToken</code> was given the zero address.</td></tr>
</tbody>
</table>

<p>Admin calls revert with OpenZeppelin's <code>OwnableUnauthorizedAccount</code>.</p>

<h2 id="strategy">PortfolioStrategy</h2>

<table>
<thead><tr><th>Error</th><th>Meaning</th></tr></thead>
<tbody>
<tr><td><code>OnlyGovernor</code></td><td>Every call that moves tokens is governor-only, which means it has to be an executed proposal.</td></tr>
<tr><td><code>TokenNotAllowed</code></td><td>Not in the basket fixed at construction.</td></tr>
<tr><td><code>SlippageTooHigh</code></td><td>The floor is more than <code>maxSlippageBps</code> below the stated quote, or the quote is zero. At construction: a cap above 10%.</td></tr>
<tr><td><code>WeightsMustSumToBps</code></td><td><code>setWeights</code> must sum to exactly 10,000.</td></tr>
<tr><td><code>WeightCountMismatch</code></td><td>One weight per token; at construction, one fee tier per token.</td></tr>
<tr><td><code>NoTokens</code></td><td>An empty basket.</td></tr>
<tr><td><code>DuplicateToken</code></td><td>The same token twice in the basket.</td></tr>
</tbody>
</table>

<p>A swap that fills below the floor reverts inside the router with Uniswap's
<code>"Too little received"</code>, which the governor reports as
<code>ExecutionFailed</code>.</p>
""")

page("deployment", "Deployment",
     "Deploying a fund on Robinhood Chain end to end: the token, the contracts, the handover to a multisig, then the app, the indexer and the agent that read them.",
     "Reference", """
<h2 id="prereq">Before you start</h2>

<ul>
<li><strong>$RECURVE.</strong> The watcher registry takes its staking token at deploy, or once
later through <code>setStakeToken</code>. Until it has one nobody can stake, so no watcher can
rule and the fund runs on the depositors' veto alone. $RECURVE is launched on
<a href="https://www.ponsfamily.com/launchpad">Pons v2</a>, the Robinhood Chain launchpad: 1B
fixed supply, 18 decimals, no mint, no owner.</li>
<li><strong>A treasury.</strong> A Safe on Robinhood Chain. It receives the performance fee and,
after the handover, owns the registry and the agent list.</li>
<li><strong>A deployer key</strong> holding 0.0004 ETH. The deploy burns about 0.00015; the rest
is what Forge wants covered up front. This key alone can ever raise the deposit cap and nothing
can replace it, so back it up.</li>
<li><strong>An agent key</strong> holding 0.0001 ETH to start, and some USDG by the first
profitable settle, because the performance fee leaves its wallet. A full trading cycle costs
about 0.00003 ETH.</li>
<li>Foundry and the <a href="https://github.com/Recurve-Money/recurve-protocol">protocol repo</a>
with submodules.</li>
</ul>

<h2 id="settings">1. Settings</h2>

<p><code>mainnet.env</code> in the protocol repo holds every public value. The keys never enter
the repo: the scripts read <code>deployer.key</code> and <code>agent.address</code> from
<code>~/.config/recurve</code>.</p>

<table>
<thead><tr><th>Variable</th><th>Value</th></tr></thead>
<tbody>
<tr><td><code>VAULT_ASSET</code></td><td>USDG, 6 decimals: the fund is priced in dollars</td></tr>
<tr><td><code>DEPOSIT_CAP</code></td><td><code>10000</code>, whole units of the asset</td></tr>
<tr><td><code>TREASURY</code></td><td>The Safe</td></tr>
<tr><td><code>REVE_TOKEN</code></td><td>The $RECURVE address from Pons</td></tr>
<tr><td><code>DEX_ROUTER</code></td><td>Uniswap's <code>SwapRouter02</code></td></tr>
<tr><td><code>NVDA_TOKEN</code></td><td>NVDA, the strategy's one basket leg</td></tr>
<tr><td><code>FEE_TIER</code></td><td><code>500</code>, the deepest NVDA pools</td></tr>
</tbody>
</table>

<p>Constants the script fixes: min stake 1,000 RECURVE (a stand-in, re-sized under
<a href="#after">After launch</a>), unstake delay 7 days, veto window 24 hours, threshold 20%,
two blocks to stop, 5% fee, a 3% slippage cap.</p>

<h2 id="contracts">2. Contracts</h2>

<pre><code>./deploy-mainnet.sh               # simulates against mainnet, prints every address, sends nothing
./deploy-mainnet.sh --broadcast   # registry, vault, governor and strategy, wired, in one run
./handover.sh                     # shows what moves to the Safe
./handover.sh --broadcast         # registry owner and agentAdmin to the Safe</code></pre>

<p>The deploy refuses to start on any chain but 4663, without a treasury, or below 0.0004 ETH on
the deployer. It then writes <code>addresses/4663.json</code> in the protocol repo and
<code>app/src/lib/addresses/4663.json</code> in the website repo. The whole deploy costs about
6.7M gas. The handover needs a little ETH on the agent too, since it signs
<code>setAgentAdmin</code>.</p>

<p>Verify the source on Blockscout afterwards:</p>

<pre><code>forge verify-contract &lt;address&gt; &lt;Contract&gt; --chain 4663 --verifier blockscout \\
  --verifier-url https://robinhoodchain.blockscout.com/api/</code></pre>

<h2 id="wiring">3. Everything that reads them</h2>

<ol>
<li><strong>Site, app and docs.</strong> All three read the file the deploy wrote, and
<code>npm run deploy</code> in the website repo rebuilds and ships them together. The docs render
the address blocks on Contracts, the SDK quickstart and the two skill pages from that file.</li>
<li><strong>Indexer.</strong> On its service: <code>CHAIN_ID=4663</code>,
<code>VAULTS=main:&lt;vault&gt;:&lt;governor&gt;:Recurve Fund</code>,
<code>DEPLOY_BLOCK=&lt;block&gt;</code>, <code>LOG_CHUNK=100000</code>. Check
<code>/health/indexer</code> after the first backfill.</li>
<li><strong>Runner.</strong> Every variable in its <code>.env.example</code>, with
<code>DRY_RUN=true</code> for the first rounds. Its key is the agent, funded with ETH and with
USDG for fees. Read the log, then turn the dry run off.</li>
</ol>

<h2 id="after">4. After launch</h2>

<ul>
<li><code>raiseDepositCap</code> from the deployer key as the fund grows; it only goes up.</li>
<li><code>addAgent</code> from the agentAdmin for a second key; never
<code>setAgentAdmin(0)</code>.</li>
<li><code>setParameters</code> from the registry owner to size the minimum stake to the token's
market price. Two watchers at the minimum stop any proposal and a block is never slashed, so a
cheap minimum makes stalling the fund cheap. Recurve's own fund sets it to about $20 of
$RECURVE before staking opens.</li>
<li>Watchers stake through the app or the SDK; the registry needs no setup beyond the governor it
was wired to. If convictions are ever to happen, the registry owner has to point
<code>setGovernor</code> at a key that can call <code>convict</code> — the governor itself
cannot.</li>
</ul>

<h2 id="infrastructure">Robinhood Chain infrastructure</h2>

<p>Uniswap's official deployment on chain 4663, the pool the fund trades and its two tokens,
checked on chain 2026-10-31:</p>

<table>
<thead><tr><th>Contract</th><th>Address</th></tr></thead>
<tbody>
<tr><td><code>UniswapV3Factory</code></td><td><code>0x1f7d7550b1b028f7571e69a784071f0205fd2efa</code></td></tr>
<tr><td><code>SwapRouter02</code> (<code>DEX_ROUTER</code>)</td><td><code>0xcaf681a66d020601342297493863e78c959e5cb2</code></td></tr>
<tr><td><code>QuoterV2</code> (<code>DEX_QUOTER</code>)</td><td><code>0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7</code></td></tr>
<tr><td>USDG/NVDA pool, 0.05%</td><td><code>0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3</code></td></tr>
<tr><td>USDG (<code>VAULT_ASSET</code>)</td><td><code>0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168</code></td></tr>
<tr><td>NVDA (<code>NVDA_TOKEN</code>)</td><td><code>0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC</code></td></tr>
</tbody>
</table>

<p>The canonical Ethereum-mainnet Uniswap addresses hold unrelated code on this chain; use
these, and verify any other third-party address on chain before deploying against it.</p>
""")

# ================================================================ Roadmap

page("perp-strategy", "Off-chain venues (roadmap)",
     "A sketch for letting an agent trade a perp venue whose order book lives off-chain, without the strategy contract ever holding a hot key to the vault itself.",
     "Roadmap", """
<div class="note warn">
  <span class="tag">Design sketch \u2014 not built</span>
  <p>No contract exists for this yet. This page describes a direction, not a shipped feature or a
  commitment to a specific venue or date. Nothing here should be read as a live integration.</p>
</div>

<h2 id="why">Why an on-chain strategy is not enough</h2>

<p><code>PortfolioStrategy</code> covers venues where a swap settles on-chain in the same
transaction \u2014 the contract can see the fill, so it can also bound the slippage. Order-book
perps on venues like Lighter do not work that way: matching happens off-chain in the venue's own
sequencer, and the strategy contract never sees a trade. It cannot cap position size, leverage,
or trade rate the way it caps a swap.</p>

<p>The custody problem changes shape as a result. On <code>PortfolioStrategy</code> the contract
is the trader. Here the agent has to be the trader, because the venue speaks to whoever holds the
account's key \u2014 which means the question is no longer "can the contract validate the trade"
but "what can the key that trades actually do."</p>

<h2 id="boundary">The custody boundary this would need</h2>

<p>The shape most worth building toward: the strategy clone opens and owns the venue account
itself. It deposits vault capital as margin, then registers a scoped, trade-only key for the
agent \u2014 one that can place and cancel orders and nothing else. It cannot withdraw, cannot
transfer, cannot register a different key. Every one of those stays authenticated to the clone,
not the agent.</p>

<table>
<thead><tr><th>Holds</th><th>Can</th><th>Cannot</th></tr></thead>
<tbody>
<tr><td>Agent's key</td><td>Place and cancel orders</td><td>Withdraw, transfer, rotate keys</td></tr>
<tr><td>Strategy clone</td><td>Cancel orders, force-close, rotate/revoke the key, queue withdrawal</td><td>Skip the vault on the way back \u2014 exits only ever land there</td></tr>
</tbody>
</table>

<p>That bounds <em>how long</em> capital can be exposed to a bad key \u2014 the clone can always
cancel, close, and pull funds out without the agent's cooperation. It does not bound <em>how
much</em> a live position can lose while it's open, because nothing on-chain is watching the
trade happen. The real risk limit is how much a proposal is allowed to deposit in the first
place, not anything the contract enforces mid-trade.</p>

<h2 id="settlement">Why settlement would have to be async</h2>

<p>Secure withdrawals from an off-chain order book don't clear instantly \u2014 they queue and
mature, sometimes well after the position is flat. A fund running this can't price that position
for a mid-proposal deposit or redemption the way it prices an on-chain swap; both would have to
wait behind the same queue the strategy itself is waiting on. That's a real cost to communicate
to depositors before it ships, not after.</p>

<div class="note">
  <span class="tag">Note</span>
  <p>None of this is scheduled. It's here because the gap between "agent trades an AMM" and
  "agent trades an order book" is a custody-model problem, not a feature-flag, and it's worth
  thinking through in the open before it's a live contract instead of after.</p>
</div>
""")




if __name__ == "__main__":
    clean()
    for args in PAGES:
        print("  ", render(*args))
    print(f"\n{len(PAGES)} pages")
