# recurve-app

The Recurve dApp. Reads vault state from chain, handles deposits, redemptions,
and the redemption queue.

## Stack

Vite, React 18, TypeScript strict, wagmi 2, viem 2, RainbowKit 2.
Robinhood Chain is not in viem's chain list, so it is defined locally.

## Which network

One switch. `src/lib/chain.ts` holds a `NETWORKS` record with a `mainnet`
and a `testnet` entry; `VITE_NETWORK` picks one and everything else (chain id,
RPC, explorer links, addresses, vaults, deploy block) follows. The chain is
described in `chain.ts`; the addresses come from
`src/lib/addresses/<chainId>.json`, which is recurve-protocol's deploy output
copied in verbatim and mapped by `src/lib/deployment.ts`.

| `VITE_NETWORK` | Chain | State |
|---|---|---|
| unset or `mainnet` (default) | Robinhood Chain, id 4663 | nothing Recurve deployed yet, so the app lists the Recurve Fund as "Not live yet", with no numbers |
| `testnet` | Robinhood Chain Testnet, id 46630 | the live testnet fund |

Mainnet is the committed default so launch is not a code change. Local dev
keeps a gitignored `.env` with `VITE_NETWORK=testnet` so there is something to
click on.

## Running it

```bash
npm install
cp .env.example .env   # then set VITE_NETWORK=testnet to see the live fund
npm run dev
```

## After the mainnet deploy

Copy `addresses/4663.json` from
[recurve-protocol](https://github.com/Recurve-Money/recurve-protocol) over
`src/lib/addresses/4663.json`. Nothing else changes: the registry, the token,
the vaults and the deploy block are all read from it. Today that file has no
vaults, which is exactly what makes `isConfigured` false. The docs generator
reads the same file, so `npm run build:docs` at the root after the copy.

`npm test` covers the mapping; `deployment.test.ts` shows the file shape.

## What testnet points at

The testnet deploy from `src/lib/addresses/46630.json`, a copy of the protocol
repo's. **These are testnet addresses. The same addresses on mainnet (4663)
hold unrelated third-party contracts.**

| Contract | Address (chain 46630, testnet) |
|---|---|
| WatcherRegistry | `0x26ebF51c3D6967895F83b5C33664d99F1E42c97D` |
| RECURVE token | `0xf103C471DBCDE5C856559380432eFDC7e59Af9ec` |
| RecurveVault (`main`) | `0x235d0cE2Ca846495E9B9f18959A41f0625c0443D` |
| RecurveGovernor (`main`) | `0xe0e209799d57E6A95F72BdAe4b148cEf6f03da1a` |
| Deploy block | `103992284` |

The env vars override the selected network, so a preview can point elsewhere
without a code change:

| Var | Overrides |
|---|---|
| `VITE_NETWORK` | which `NETWORKS` entry is selected (default `mainnet`) |
| `VITE_RPC_URL` | RPC endpoint (default is the selected network's public one) |
| `VITE_REGISTRY` | registry address |
| `VITE_RECURVE_TOKEN` | RECURVE token address |
| `VITE_DEPLOY_BLOCK` | block log scans start from |
| `VITE_API_URL` | the indexer (api/) base, for the equity chart. **No default** — unset means the chart and risk panel say there is no indexer and everything else still reads from chain |
| `VITE_WALLETCONNECT_ID` | WalletConnect project id |

Vaults themselves are listed per network in `src/lib/addresses/<chainId>.json`;
a new fund is a new entry there. When a network has no registry address and no vaults the app
lists the first fund by name alone, marked "Not live yet", instead of a dashboard of zeros; the
Watcher tab says no funds are live.

Reads for a vault go through Multicall3 (`0xcA11...CA11`, deployed on both
Robinhood chains), which is why it is declared on the chain definition.

## What is wired

| Action | Contract call |
|---|---|
| Deposit | `approve` if allowance is short, then `deposit`, then `delegate` |
| Redeem | `requestRedeem`, which clears instantly or returns a queue position |
| Claim | `claimRedeem` on a queued exit |
| Reads | `totalAssets`, `float`, `deployedAssets`, `totalSupply`, `convertToAssets` |
| Veto | `veto`, gated on `hasVetoed` and weight at the proposal snapshot |
| Stake | `approve` if short, then `stake` on the registry |
| Unstake | `requestUnstake`, then `unstake` once the delay elapses |
| Verdict | `castVerdict` with Approve or Block |

Deposits self-delegate. ERC20Votes weight is zero until delegated, so a
depositor who skips it holds shares that cannot veto anything and finds out
during a live proposal.

Reads go through one multicall per vault so every number on screen comes from
the same block.

## Proposals

Proposals live in a mapping, so there is no list to read. Ids come from
`ProposalPosted` logs and current state from a multicall over those ids.

That makes log retention load-bearing. Set `VITE_DEPLOY_BLOCK` to the block the
governor went up: scanning from genesis on a public endpoint times out before it
finds anything, and an RPC that prunes history returns a short list rather than
an error, which looks like "no proposals" instead of a failure.

Both Robinhood RPCs cap `eth_getLogs` at 100,000 blocks per call (since October
2026), so `useProposals` scans in 100,000-block slices, six at a time. With the
indexer (`VITE_API_URL`) it takes the history from `/proposals` and reads only
the last 100,000 blocks from chain; without it a cold start on the testnet fund
is ~420 slices, about 20 seconds. Later refreshes only scan new blocks either
way.

## Errors

Every custom error from the three contracts is declared in `src/lib/abi.ts`, so
viem decodes a revert to its name instead of "Unable to decode signature".
`useTx` simulates each call before sending it, which is where that decode
happens. `readableError` in `src/lib/format.ts` maps the names to plain
sentences: `RequestNotReady` becomes "not claimable yet, the agent has to
settle first". Unmapped reverts fall through to the first line of the original
message.

## The background

`src/components/Scene.tsx` plays GetLayers' "Artistic Hands" loop behind the
whole app — muted, looping, `playsinline`, slightly blurred, under a dark veil
— and every surface in front of it is frosted white so the numbers stay
readable. Colour is scoped, not painted: `.app` sets light text tokens for
anything sitting straight on the scene and every surface resets them to the
ink set, so a `.warn` inside a panel stays amber and the same `.warn` on the
scene goes light.

The 4K master is not shipped. `public/bg/` holds two encodes (1.2 MB in
total), each as VP9 WebM plus H.264 MP4 with a poster taken from the clip's
own first frame, so playback starts on exactly the image the poster showed:

| Variant | Size | For |
|---|---|---|
| `artistic-hands-720p` | 720×960, a 3:4 crop of the centre | phones (≤720 css px) |
| `artistic-hands-1280` | 1280×958 | everything wider |

The blur is baked into the encode (`gblur`), not applied in CSS: the same
softness in the file compresses to a third of the size, and the GPU has one
less full-viewport pass per frame. The surfaces keep their own
`backdrop-filter` — it is what stops a hand passing behind the TVL chart from
showing through as a silhouette under the numbers. Blurred, 1280 wide is
already past what any display can tell from 1920. `src/lib/scene.ts` picks
the variant once at mount from the viewport width. With
`prefers-reduced-motion: reduce`, or a browser in data-saver mode, the poster
is all that plays. `Scene.tsx` plays the clip at a third of its speed.
`deploy/caddy/Caddyfile` caches `/app/bg/*` for a week; rename the stem in `scene.ts`
if the clip is ever re-encoded.

To re-encode from a new master:

```bash
# 1280 landscape (720p portrait: crop=ih*3/4:ih,scale=720:960 and gblur=sigma=4.5)
VF="scale=1280:-2:flags=lanczos,gblur=sigma=3.5"
ffmpeg -i master.mp4 -vf "$VF,format=yuv420p" -an -c:v libx264 -preset slow -crf 27 \
  -profile:v high -level 4.1 -g 150 -movflags +faststart public/bg/artistic-hands-1280.mp4
ffmpeg -i master.mp4 -vf "$VF,format=yuv420p" -an -c:v libvpx-vp9 -b:v 0 -crf 36 \
  -row-mt 1 -deadline good -cpu-used 2 -g 150 public/bg/artistic-hands-1280.webm
ffmpeg -i master.mp4 -vf "select=eq(n\,0),$VF" -frames:v 1 -q:v 5 -update 1 public/bg/artistic-hands-1280.jpg
```

The clip is © GetLayers, licensed for this site; keep it out of any other
project. It is not in the repository either: `public/bg/` is ignored, and
without its files the scene stays dark.

## The indexer

`VITE_API_URL` points at a running `api/`: `/indexer` on the server
(`.env.production`), `http://localhost:3002` locally (`.env.development`), where
`npm run dev` starts it. Unset, the equity chart and the risk panel say so and
every other number still comes from chain.

## WalletConnect

`VITE_WALLETCONNECT_ID` is optional. Without it the QR flow drops out and
injected wallets keep working, which degrades better than failing to boot.

## Deploy

The dApp is a part of the site: `base` in `vite.config.ts` serves it at `/app`,
and `npm run build` writes it into `../site/app`. `npm run dev` and
`npm run deploy` at the repository root cover it, and the build reads
`.env.production` here.
