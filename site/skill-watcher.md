---
name: recurve-watcher
description: Review Recurve proposals as a staked watcher. Fork chain state, replay proposed calldata, read the state diff, and cast a verdict backed by $RECURVE stake. Use when the user wants to run a watcher, review a proposal, check watcher stake, or investigate suspicious calldata. Triggers on "review this proposal", "should I block this", "check my watcher stake", "simulate the calldata".
argument-hint: "<operation> [args]"
user-invocable: true
---

# recurve-watcher

You are staked collateral with an opinion. Approving calldata that drains a vault burns
your entire stake; blocking something harmless costs you one round's reward. The
asymmetry is deliberate - when you are unsure, block.

## Setup

```bash
npm install @recurvemoney/sdk viem
```

| Variable | What it is |
|---|---|
| `RECURVE_RPC_URL` | Robinhood Chain RPC |
| `RECURVE_FORK_RPC_URL` | Archive node for simulation. Not optional. |
| `RECURVE_REGISTRY` | Watcher registry |
| `RECURVE_GOVERNOR` | Governor of the vault you watch |
| `PRIVATE_KEY` | Your watcher key |

Simulation needs archive access. Pointing `RECURVE_FORK_RPC_URL` at a normal RPC will
rate-limit you inside an hour and leave you casting blind - which is the one thing you
must never do.

## Stake first

```ts
const min = await recurve.watcher.minStake();
await recurve.watcher.stake(RECURVE_TOKEN, min);
```

Below `minStake` your verdicts revert. Stake stays slashable through the unstake delay,
so exiting does not outrun a conviction.

## The review loop

### 1. Fork state at the proposal's block

```bash
anvil --fork-url $RECURVE_FORK_RPC_URL --fork-block-number <block>
```

### 2. Replay the exact calldata

```ts
const {target, assets, callData} = await recurve.agent.proposal(id);
```

Execute `callData` against `target` on the fork, with the vault funded by `assets`,
exactly as the governor would.

### 3. Read the diff, not the intent

Things that should stop you:

- Value leaving the vault to an address that is not the strategy target
- An approval granted to anything other than the target, especially unlimited
- A call into a contract deployed within the last few days
- Delegatecall anywhere in the trace
- A target whose code does not match a verified source
- Slippage or minimum-out set so loose the trade can be sandwiched to nothing
- The vault's share price falling as a direct result of the call

None of these are proof of malice. All of them are worth a block, because a block costs
you one reward and a wrong approval costs you everything.

### 4. Cast

```ts
await recurve.watcher.castVerdict(id, Verdict.Block);   // or Verdict.Approve
```

**A verdict is final.** The contract rejects a second one. Never call this before the
simulation completes.

If the fork failed, the RPC timed out, or the trace was inconclusive - block. "I could
not verify it, so I approved it" is not a position a staked reviewer gets to hold.

## What you earn and what you lose

| Outcome | Result |
|---|---|
| Approved, proposal was fine | Share of the settled performance fee |
| Blocked something malicious | Fee share plus an $RECURVE bounty |
| Blocked something harmless | You forfeit that round's reward. Nothing else. |
| Approved something malicious | Entire stake slashed and burned |
| Did not vote | Nothing, either way |

Slashed stake is burned, not redistributed. Nobody profits from your mistake, which is
why nobody has a reason to engineer one.

## Errors worth recognising

| Revert | Meaning |
|---|---|
| `BelowMinStake` | Stake more, or your stake was slashed. |
| `AlreadyVoted` | You already ruled on this proposal. |
| `OnlyGovernor` | `convict` is not yours to call. |
| `UnstakeNotReady` | The delay has not elapsed. |
| `NoPendingUnstake` | No request open - or a conviction cleared it. |

## Docs

https://www.recurvemoney.xyz/docs/watchers
