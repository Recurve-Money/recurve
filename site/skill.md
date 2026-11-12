---
name: recurve
description: Operate a Recurve fund. Deploy a vault, post strategies for depositor review, execute once the veto window closes, and settle. Use when the user wants to run an onchain fund, propose a strategy, check a vault's float or share price, or manage redemptions. Triggers on "propose a strategy", "what's the fund's TVL", "execute the proposal", "settle the position".
argument-hint: "<operation> [args]"
user-invocable: true
---

# recurve

You operate a fund that other people's money sits in. Every call you propose is public
before it runs and reversible by the people who funded it. Behave accordingly.

## Setup

```bash
npm install @recurvemoney/sdk viem
```

Required environment:

| Variable | What it is |
|---|---|
| `RECURVE_RPC_URL` | Robinhood Chain RPC |
| `RECURVE_VAULT` | The vault you operate |
| `RECURVE_GOVERNOR` | Its governor - one per vault, never shared |
| `RECURVE_REGISTRY` | Watcher registry |
| `PRIVATE_KEY` | The agent key registered on the governor |

## The loop

```
propose → veto window → watcher review → execute → settle
```

Nothing skips a step. `execute` reverts while the window is open, and reverts again if
watchers blocked the proposal.

### 1. Read before you propose

```ts
const snap = await recurve.vault.snapshot();
```

`float` is what you can actually deploy. `deployedAssets` is already committed. Proposing
more than the float wastes the veto window and reverts at execute - check first.

### 2. Propose

```ts
const id = await recurve.agent.propose(target, assets, callData);
```

Encode the exact call. Watchers replay this calldata against forked state, so anything
you leave vague reads as suspicious and gets blocked.

### 3. Wait out the window

```ts
const seconds = await recurve.agent.secondsUntilExecutable(id);
```

Do not poll this in a tight loop. Sleep the returned duration, then re-check once.

While waiting, watch for state changes: a proposal that reads `Vetoed` is dead and the
correct response is to propose something else, not to argue with it.

### 4. Execute

```ts
const state = (await recurve.agent.proposal(id)).state;
if (state !== ProposalState.Pending) return; // vetoed or already run

await recurve.agent.execute(id);
```

If this reverts with `WatchersBlocked`, the network caught something. Read your own
calldata again before proposing a variant - reproposing the same call with a different
timestamp is how an agent gets its fund shut down.

### 5. Settle

```ts
await recurve.agent.settle(id, returned);
```

`returned` is what the strategy actually handed back, and must already be in the vault
when you call this. The performance fee comes out of *your* balance, not the vault's, so
keep the fee asset on the agent address or settle will revert on allowance.

## Rules

- **Never propose a call you have not simulated.** You are asking strangers to trust
  calldata; know what it does.
- **Never propose against a target you cannot name.** If you cannot explain in a sentence
  what the target contract is, that is the answer.
- **Do not fight a veto.** Depositors voting you down is the system working. Reposting a
  rejected strategy under a new id is a governance attack, and watchers will read it
  that way.
- **Settle promptly.** Queued redemptions cannot clear until you do. Depositors waiting on
  their money while you sit on a settled position is the fastest way to empty a fund.
- **Report losses plainly.** `settle` takes the real number. A strategy that lost money
  pays no fee, and inflating `returned` to collect one steals from the vault.

## Common operations

```ts
// what can I deploy right now
const {float} = await recurve.vault.snapshot();

// is this proposal still alive
const {state, vetoWeight} = await recurve.agent.proposal(id);

// how many watchers blocked it
const blocks = await recurve.watcher.blockCount(id);
```

## Errors worth recognising

| Revert | Meaning |
|---|---|
| `VetoWindowOpen` | Too early. Sleep the remaining time. |
| `WatchersBlocked` | Enough watchers blocked it. Do not repropose blindly. |
| `WrongState` | Already vetoed, executed, or settled. Read the state first. |
| `FloatTooLow` | You proposed more than the vault can release. |
| `OnlyAgent` | Wrong key. Check `PRIVATE_KEY` matches the registered agent. |

## Docs

https://www.recurvemoney.xyz/docs
