/*
 * The launch at /admin: everything the deploy needs a wallet for, in the order
 * protocol/DEPLOY-MAINNET.md does it. The connected wallet deploys the contracts,
 * wires them and hands its rights to the Safe, so no key leaves the wallet and
 * nothing here needs a terminal.
 *
 * $RECURVE can come last. Without it the registry is deployed with no stake token
 * and stays with the wallet, the fund opens on the depositors' veto alone, and
 * attach() later names the token, once, and hands the registry to the Safe. With
 * the real token already published, it goes in at deploy and there is nothing to
 * attach.
 *
 * The minimum watcher stake is a dollar figure (contracts.json, minStakeUsd) that
 * only means something once the token has a price. So it is turned into tokens at
 * the price of the moment the token reaches the registry: at attach, or at deploy
 * when the token came first. The page shows the figure and the owner can change it.
 *
 * The governor's constructor makes one address both an agent and the agentAdmin.
 * That is the wallet, for as long as the deploy takes: it then adds the real
 * agent, removes itself and hands agentAdmin to the Safe, which ends exactly
 * where deploy-mainnet.sh and handover.sh end, without the runner's hot key
 * having to sign anything in a browser.
 *
 * Every step can read whether it already happened, and each transaction hash is
 * saved on the server the moment the wallet returns it. A closed tab or a dead
 * connection resumes with Continue and never deploys anything twice.
 *
 * The first half is plain logic, which scripts/launch.test.mjs runs under Node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RecurveLaunch = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CHAIN_ID = 4663;
  var ZERO = "0x0000000000000000000000000000000000000000";
  // What a pool has to hold on its other side for its price to count: ETH (under
  // both addresses GeckoTerminal lists it by), WETH and USDG.
  var MONEY = [
    ZERO,
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
    "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
  ].map(function (a) { return "robinhood_" + a; });
  var SIG = {
    governor: "0x0c340a24",
    isAgent: "0x1ffbb064",
    agentAdmin: "0xf911366a",
    owner: "0x8da5cb5b",
    decimals: "0x313ce567",
    symbol: "0x95d89b41",
    balanceOf: "0x70a08231",
    depositCap: "0xdbd5edc7",
    setGovernor: "0xc42cf535",
    addAgent: "0x84e79842",
    removeAgent: "0x97a6278e",
    setAgentAdmin: "0x919d278d",
    transferOwnership: "0xf2fde38b",
    stakeToken: "0x51ed6a30",
    setStakeToken: "0x0397d458",
    transfer: "0xa9059cbb",
    raiseDepositCap: "0xac4f0ef9",
    minStake: "0x375b3c0a",
    unstakeDelay: "0x3222012f",
    setParameters: "0x884870c7",
  };

  // ---------------------------------------------------------------- abi

  function plain(hex) {
    return String(hex).replace(/^0x/, "");
  }

  function uintWord(value) {
    return BigInt(value).toString(16).padStart(64, "0");
  }

  function addressWord(address) {
    return plain(address).toLowerCase().padStart(64, "0");
  }

  function stringBody(text) {
    var bytes = Array.from(new TextEncoder().encode(text), function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
    return uintWord(bytes.length / 2) + bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0");
  }

  function listBody(word, items) {
    return uintWord(items.length) + items.map(word).join("");
  }

  /** ABI encoding for the few shapes the constructors take. */
  function encode(types, values) {
    var offset = types.length * 32;
    var tail = "";
    var head = types.map(function (type, i) {
      if (type === "address") return addressWord(values[i]);
      if (type === "uint") return uintWord(values[i]);
      var body = type === "string" ? stringBody(values[i])
        : type === "address[]" ? listBody(addressWord, values[i])
        : listBody(uintWord, values[i]); // uint[]
      var at = offset;
      tail += body;
      offset += body.length / 2;
      return uintWord(at);
    });
    return head.join("") + tail;
  }

  /** Whole units as a text field holds them, into base units. */
  function units(text, decimals) {
    return BigInt(text) * 10n ** BigInt(decimals);
  }

  function sameAddress(a, b) {
    return !!a && !!b && a.toLowerCase() === b.toLowerCase();
  }

  function isAddress(a) {
    return /^0x[0-9a-fA-F]{40}$/.test(a || "");
  }

  function wordAddress(word) {
    return word && word.length >= 66 ? "0x" + word.slice(-40) : "";
  }

  function isWhole(text) {
    return /^[1-9]\d*$/.test(text || "");
  }

  // ---------------------------------------------------------------- stake

  /** Whole tokens worth `usd` at `price` dollars each, to two figures. "" without a price. */
  function stakeFor(usd, price) {
    if (!(price > 0) || !isFinite(price)) return "";
    var tokens = usd / price;
    if (tokens < 1) return "1";
    var step = Math.pow(10, Math.max(0, Math.floor(Math.log10(tokens)) - 1));
    return (BigInt(Math.round(tokens / step)) * BigInt(step)).toString();
  }

  /**
   * A token's price in dollars, out of GeckoTerminal's list of its pools.
   *
   * Anyone can open a pool, at any price, against a token worth nothing, and the
   * list then shows it holding millions. So only pools against real money count,
   * and of those only the ones holding at least a hundredth of the deepest. The
   * deepest one's price is the answer. If the ones that count are more than a
   * quarter apart, the price is null: no figure is better than a wrong one.
   *
   * Returns {price, low, high}, or null when no pool counts.
   */
  function priceFrom(pools, address) {
    var own = "robinhood_" + String(address).toLowerCase();
    var seen = [];
    ((pools && pools.data) || []).forEach(function (pool) {
      var a = pool.attributes || {};
      var r = pool.relationships || {};
      var id = function (side) {
        var t = r[side + "_token"];
        return t && t.data ? String(t.data.id).toLowerCase() : "";
      };
      var side = id("base") === own ? "base" : id("quote") === own ? "quote" : "";
      if (!side || MONEY.indexOf(id(side === "base" ? "quote" : "base")) < 0) return;
      var price = parseFloat(a[side + "_token_price_usd"]);
      var depth = parseFloat(a.reserve_in_usd);
      if (price > 0 && isFinite(price) && depth > 0) seen.push({price: price, depth: depth});
    });
    if (!seen.length) return null;

    seen.sort(function (x, y) { return y.depth - x.depth; });
    var prices = seen.filter(function (p) { return p.depth >= seen[0].depth / 100; })
      .map(function (p) { return p.price; });
    var low = Math.min.apply(null, prices);
    var high = Math.max.apply(null, prices);
    return {price: high / low > 1.25 ? null : seen[0].price, low: low, high: high};
  }

  // ---------------------------------------------------------------- plan

  /** Why these settings cannot start, or null. The same rules as DeployMainnet.s.sol. */
  function problem(settings, wallet) {
    var s = settings;
    if (s.token && !isAddress(s.token)) return "The $RECURVE address is not an address.";
    if (!isAddress(s.treasury)) return "The treasury is not an address.";
    if (!isAddress(s.agent)) return "The agent is not an address.";
    if (sameAddress(s.agent, wallet)) return "The agent must not be the wallet that deploys.";
    if (sameAddress(s.treasury, wallet)) return "The treasury must be its own account, the Safe, not this wallet.";
    if (sameAddress(s.treasury, s.agent)) return "The treasury must be its own account, the Safe, not the agent.";
    if (!isWhole(s.depositCap)) return "The deposit cap is a whole number of USDG.";
    if (!isWhole(s.minStake)) return "The minimum stake is a whole number of $RECURVE.";
    return null;
  }

  function reader(ctx) {
    return function (to, data) {
      return ctx.rpc("eth_call", [{to: to, data: data}, "latest"]);
    };
  }

  /** Hands the registry to the Safe. Comes last whichever way the token arrives. */
  function registryToSafe(ctx) {
    var d = ctx.draft;
    var read = reader(ctx);
    return {
      id: "registryOwner",
      title: "Give the registry to the Safe",
      isDone: async function () {
        return sameAddress(wordAddress(await read(d.addresses.registry, SIG.owner)), d.settings.treasury);
      },
      tx: function () {
        return {from: d.deployer, to: d.addresses.registry, data: SIG.transferOwnership + addressWord(d.settings.treasury)};
      },
    };
  }

  /** What finishes a fund launched without its token: the stake's size, the token, the Safe. */
  function attachPlan(ctx) {
    var d = ctx.draft;
    var read = reader(ctx);
    var registry = d.addresses.registry;
    if (!isWhole(d.settings.minStake)) throw new Error("The minimum stake is a whole number of $RECURVE.");
    var minimum = units(d.settings.minStake, 18);
    return [
      {
        // First, so that staking never opens at the figure the registry was deployed with.
        id: "minStake",
        title: "Set the minimum stake",
        isDone: async function () {
          // Once the Safe holds the registry, the minimum is the Safe's to change.
          if (sameAddress(wordAddress(await read(registry, SIG.owner)), d.settings.treasury)) return true;
          return BigInt(await read(registry, SIG.minStake)) === minimum;
        },
        tx: async function () {
          // setParameters writes both, so the delay goes back in as the chain has it.
          var delay = BigInt(await read(registry, SIG.unstakeDelay));
          return {from: d.deployer, to: registry, data: SIG.setParameters + uintWord(minimum) + uintWord(delay)};
        },
      },
      {
        id: "stakeToken",
        title: "Name $RECURVE as the stake token",
        isDone: async function () {
          return sameAddress(wordAddress(await read(d.addresses.registry, SIG.stakeToken)), d.settings.token);
        },
        tx: function () {
          return {from: d.deployer, to: d.addresses.registry, data: SIG.setStakeToken + addressWord(d.settings.token)};
        },
      },
      registryToSafe(ctx),
    ];
  }

  function plan(ctx) {
    var d = ctx.draft;
    var s = d.settings;
    var a = d.addresses;
    var me = d.deployer;
    var fund = ctx.contracts.fund;
    var rules = ctx.contracts.governance;

    var read = reader(ctx);
    var flag = async function (to, data) {
      return BigInt(await read(to, data)) === 1n;
    };

    function deploy(key, title, contract, args) {
      return {
        id: key,
        title: title,
        isDone: async function () { return !!a[key]; },
        tx: function () { return {from: me, data: ctx.contracts.bytecode[contract] + args()}; },
        after: function (receipt) {
          a[key] = receipt.contractAddress;
          if (key === "vault") d.deployBlock = Number(BigInt(receipt.blockNumber));
        },
      };
    }

    function send(key, title, to, data, isDone) {
      return {
        id: key,
        title: title,
        isDone: isDone,
        tx: function () { return {from: me, to: to(), data: data()}; },
      };
    }

    var steps = [
      deploy("registry", "Deploy the watcher registry", "WatcherRegistry", function () {
        return encode(["address", "uint", "uint", "address"],
          [s.token || ZERO, units(s.minStake, 18), rules.unstakeDelay, me]);
      }),
      deploy("vault", "Deploy the vault", "RecurveVault", function () {
        return encode(["address", "string", "string", "uint"],
          [fund.asset, fund.name, fund.symbol, units(s.depositCap, s.assetDecimals)]);
      }),
      deploy("governor", "Deploy the governor", "RecurveGovernor", function () {
        return encode(["address", "address", "address", "uint", "uint", "uint", "uint", "address"],
          [a.vault, a.registry, me, rules.vetoWindow, rules.vetoThresholdBps,
            rules.watcherBlockThreshold, rules.performanceFeeBps, s.treasury]);
      }),
      send("vaultGovernor", "Connect the vault to the governor",
        function () { return a.vault; },
        function () { return SIG.setGovernor + addressWord(a.governor); },
        async function () { return sameAddress(wordAddress(await read(a.vault, SIG.governor)), a.governor); }),
      send("registryGovernor", "Connect the registry to the governor",
        function () { return a.registry; },
        function () { return SIG.setGovernor + addressWord(a.governor); },
        async function () { return sameAddress(wordAddress(await read(a.registry, SIG.governor)), a.governor); }),
      deploy("strategy", "Deploy the " + fund.legSymbol + " strategy", "PortfolioStrategyV2", function () {
        return encode(["address", "address", "address", "address", "address[]", "uint[]", "uint"],
          [a.vault, a.governor, fund.asset, fund.router, [fund.leg], [fund.feeTier], fund.maxSlippageBps]);
      }),
      send("addAgent", "Add the agent",
        function () { return a.governor; },
        function () { return SIG.addAgent + addressWord(s.agent); },
        function () { return flag(a.governor, SIG.isAgent + addressWord(s.agent)); }),
      send("removeSelf", "Remove this wallet as an agent",
        function () { return a.governor; },
        function () { return SIG.removeAgent + addressWord(me); },
        async function () { return !(await flag(a.governor, SIG.isAgent + addressWord(me))); }),
      send("agentAdmin", "Give the agent list to the Safe",
        function () { return a.governor; },
        function () { return SIG.setAgentAdmin + addressWord(s.treasury); },
        async function () { return sameAddress(wordAddress(await read(a.governor, SIG.agentAdmin)), s.treasury); }),
    ];
    return s.token ? steps.concat(registryToSafe(ctx)) : steps;
  }

  // ---------------------------------------------------------------- run

  async function assertWallet(ctx) {
    var chain = Number(BigInt(await ctx.rpc("eth_chainId", [])));
    if (chain !== CHAIN_ID) throw new Error("The wallet is on chain " + chain + ". Switch it to Robinhood Chain.");
    if (!sameAddress(ctx.account, ctx.draft.deployer)) {
      throw new Error("This launch was started by " + ctx.draft.deployer + ". Connect that wallet: only it can finish.");
    }
  }

  async function waitForReceipt(ctx, hash) {
    var tries = ctx.tries || 300;
    for (var i = 0; i < tries; i++) {
      var receipt = await ctx.rpc("eth_getTransactionReceipt", [hash]);
      if (receipt) return receipt;
      await new Promise(function (r) { setTimeout(r, ctx.pollMs === undefined ? 1000 : ctx.pollMs); });
    }
    throw new Error("Still waiting for " + hash + ". Press Continue to keep watching it.");
  }

  async function finish(ctx, step, hash) {
    var receipt = await waitForReceipt(ctx, hash);
    ctx.draft.pending = null;
    if (BigInt(receipt.status) !== 1n) {
      await ctx.save(ctx.draft);
      throw new Error(step.title + " failed on chain. Press Continue to try it again.");
    }
    if (step.after) step.after(receipt);
    await ctx.save(ctx.draft);
  }

  /** Walks the steps from wherever the chain and the draft say they stand. */
  async function run(ctx, steps) {
    var d = ctx.draft;
    steps = steps || plan(ctx);
    await assertWallet(ctx);

    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      if (d.pending && d.pending.step === step.id) {
        ctx.onStep(step.id, "mining");
        await finish(ctx, step, d.pending.hash);
      } else if (!(await step.isDone())) {
        await assertWallet(ctx);
        ctx.onStep(step.id, "wallet");
        var hash = await ctx.rpc("eth_sendTransaction", [await step.tx()]);
        d.pending = {step: step.id, hash: hash};
        d.hashes[step.id] = hash;
        await ctx.save(d);
        ctx.onStep(step.id, "mining");
        await finish(ctx, step, hash);
      }
      ctx.onStep(step.id, "done");
    }
  }

  /** The published record, in the shape of protocol/addresses/4663.json. */
  function deployment(draft, today) {
    var d = draft;
    return {
      chainId: CHAIN_ID,
      name: "Robinhood Chain",
      deployedAt: today,
      deployer: d.deployer,
      RecurveToken: d.settings.token || "",
      treasury: d.settings.treasury,
      agent: d.settings.agent,
      vaults: [{
        slug: "main",
        name: "Recurve Fund",
        symbol: "rvFUND",
        WatcherRegistry: d.addresses.registry,
        RecurveVault: d.addresses.vault,
        RecurveGovernor: d.addresses.governor,
        deployBlock: d.deployBlock,
        PortfolioStrategy: d.addresses.strategy,
      }],
    };
  }

  var api = {
    SIG: SIG, encode: encode, units: units, problem: problem, plan: plan, attachPlan: attachPlan,
    stakeFor: stakeFor, priceFrom: priceFrom,
    run: run, deployment: deployment, addressWord: addressWord, uintWord: uintWord,
  };

  // ---------------------------------------------------------------- page

  if (typeof document === "undefined" || !document.getElementById("launch")) return api;

  var EXPLORER = "https://robinhoodchain.blockscout.com";
  var GECKO = "https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/";
  var STAKE_FIELDS = ["minStake", "attachStake"];
  var $ = function (id) { return document.getElementById(id); };

  var contracts = null;
  var token = null;      // the published $RECURVE
  var draft = null;      // the launch under way
  var live = null;       // the published deployment
  var wallet = {account: null, provider: null};
  var running = false;
  var stepState = {};
  var quote = {address: "", price: null, split: null, at: 0, loading: false}; // $RECURVE's price, to size the stake by
  var typed = {};        // stake fields the owner typed in: their figure stands

  function rpc(method, params) {
    return wallet.provider.request({method: method, params: params});
  }

  function say(text, kind) {
    var m = $("launchMsg");
    m.className = "msg" + (kind ? " " + kind : "");
    m.textContent = text || "";
  }

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function short(a) {
    return a.slice(0, 6) + "…" + a.slice(-4);
  }

  function ether(wei) {
    var whole = BigInt(wei);
    var scaled = Number(whole / 10n ** 12n) / 1e6;
    return scaled.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") + " ETH";
  }

  function fact(list, name, value, href) {
    list.appendChild(el("dt", {}, name));
    var dd = el("dd");
    if (href) dd.appendChild(el("a", {href: href, target: "_blank", rel: "noopener", class: "addr"}, value));
    else dd.textContent = value;
    list.appendChild(dd);
  }

  /** The published token, unless it is only a test. */
  function realToken() {
    return token && !token.test ? token.address : "";
  }

  function dollars(n) {
    return "$" + (n >= 1 ? n.toFixed(2) : n.toFixed(Math.min(20, 2 - Math.floor(Math.log10(n)))));
  }

  function grouped(whole) {
    return BigInt(whole).toLocaleString("en-US");
  }

  function fail(err) {
    if (err && err.code === 4001) return "Rejected in the wallet. Press Continue when you are ready.";
    if (err && err.code === -32002) return "A wallet request is already open. Check your wallet.";
    return ((err && err.message) || String(err)).split("\n")[0];
  }

  // ---------------------------------------------------------------- stake

  /**
   * Asks GeckoTerminal what $RECURVE costs. It lists a Pons token from its first
   * trade on the curve; Dexscreener, which the public pages use, waits until the
   * token graduates.
   */
  function refreshPrice(again) {
    var address = realToken();
    if (address !== quote.address) {
      // Another token, or none: a figure sized for the last one means nothing now.
      quote = {address: address, price: null, split: null, at: 0, loading: false};
      typed = {};
      STAKE_FIELDS.forEach(function (id) {
        if (!$(id).disabled) $(id).value = "";
      });
    }
    if (!address || quote.loading || (!again && Date.now() - quote.at < 60000)) return;
    quote.loading = true;
    quote.at = Date.now();
    var settle = function (found) {
      if (quote.address !== address) return;
      quote.price = found ? found.price : null;
      quote.split = found && found.price === null ? [found.low, found.high] : null;
      quote.loading = false;
      if (live) renderAttach();
      else renderStake();
    };
    fetch(GECKO + address + "/pools", {cache: "no-store"})
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (pools) { settle(priceFrom(pools, address)); })
      .catch(function () { settle(null); });
  }

  /** The minimum stake fields: the dollar aim in tokens at the price now, and what a typed figure comes to. */
  function renderStake() {
    if (!contracts) return;
    var usd = contracts.governance.minStakeUsd;
    STAKE_FIELDS.forEach(function (id) {
      var input = $(id);
      var hint = $(id + "Hint");
      if (quote.price && !typed[id] && !input.disabled) input.value = stakeFor(usd, quote.price);

      var value = input.value.trim();
      hint.textContent = quote.price && isWhole(value)
        ? "About " + dollars(Number(value) * quote.price) + " at the price now, " + dollars(quote.price) +
          " a token on GeckoTerminal. The aim is about $" + usd + ": two watchers at this stake can stop any proposal. The Safe can change it later."
        : quote.price
          ? "A whole number of $RECURVE. $" + usd + " is about " + grouped(stakeFor(usd, quote.price)) + " at the price now."
          : quote.loading
            ? "Reading the price of $RECURVE…"
            : (quote.split
              ? "Its pools disagree on the price, from " + dollars(quote.split[0]) + " to " + dollars(quote.split[1]) + ", so no figure is suggested. "
              : "No market price for it yet. ") +
              "The aim is about $" + usd + " of $RECURVE: enter " + usd + " divided by the price Pons shows. ";
      if (!quote.price && !quote.loading && quote.address) {
        var again = el("button", {class: "plain", type: "button", style: "margin-top:0;font-size:13px"}, "Check the price again");
        again.addEventListener("click", function () {
          refreshPrice(true);
          renderStake();
        });
        hint.appendChild(again);
      }
    });
  }

  // ---------------------------------------------------------------- render

  function renderWallet() {
    var info = $("walletInfo");
    info.textContent = "";
    if (!wallet.account) return;
    rpc("eth_getBalance", [wallet.account, "latest"]).then(function (wei) {
      info.textContent = ether(wei) + " on this wallet";
    }).catch(function () {});
  }

  function renderFacts() {
    if (!contracts) return;
    var list = $("launchFacts");
    list.textContent = "";
    var f = contracts.fund;
    var g = contracts.governance;
    if (realToken()) fact(list, "$RECURVE", token.symbol + " " + short(token.address), EXPLORER + "/token/" + token.address);
    else fact(list, "$RECURVE", "Comes later. You attach it here after the launch.");
    fact(list, "Watcher stake", "About $" + g.minStakeUsd + " of $RECURVE, counted at its price " +
      (realToken() ? "now" : "when you attach it"));
    fact(list, "Fund", f.name + " (" + f.symbol + "), in USDG");
    fact(list, "Strategy", f.legSymbol + " through the 0.05% Uniswap pool, " + f.maxSlippageBps / 100 + "% slippage cap");
    fact(list, "Governance", g.vetoWindow / 3600 + "h veto window, " + g.vetoThresholdBps / 100 + "% of shares veto, " +
      g.watcherBlockThreshold + " watchers block, " + g.performanceFeeBps / 100 + "% fee on profit");
  }

  function renderSteps() {
    var list = $("launchSteps");
    list.textContent = "";
    if (!contracts || !draft) return;
    var ctx = {draft: draft, contracts: contracts, rpc: rpc};
    plan(ctx).forEach(function (step) {
      var state = stepState[step.id] || "";
      var li = el("li", {class: state});
      li.appendChild(el("span", {class: "st", "aria-hidden": "true"}, state === "done" ? "✓" : state ? "•" : "○"));
      li.appendChild(el("span", {}, step.title));
      var note = state === "wallet" ? "Confirm in your wallet" : state === "mining" ? "Waiting for the chain" : "";
      var hash = draft.hashes[step.id];
      if (note) li.appendChild(el("span", {class: "note"}, note));
      else if (hash) li.appendChild(el("a", {class: "note", href: EXPLORER + "/tx/" + hash, target: "_blank", rel: "noopener"}, "Explorer"));
      list.appendChild(li);
    });
  }

  function renderForm() {
    var started = !!draft;
    ["treasury", "agent", "depositCap", "minStake"].forEach(function (id) {
      $(id).disabled = started || running;
    });
    // With no token there is no price to size the stake by: attach asks for it.
    $("minStakeField").hidden = !(started ? draft.settings.token : realToken());
    if (started) {
      $("treasury").value = draft.settings.treasury;
      $("agent").value = draft.settings.agent;
      $("depositCap").value = draft.settings.depositCap;
      $("minStake").value = draft.settings.minStake;
    } else if (contracts) {
      if (!$("agent").value) $("agent").value = contracts.agent;
      if (!$("depositCap").value) $("depositCap").value = contracts.fund.depositCap;
    }
    renderStake();
    $("launchBtn").textContent = started ? "Continue" : "Deploy the contracts";
    $("launchBtn").disabled = running || !wallet.account;
    $("startOver").hidden = !started || running;
    $("launchHint").hidden = !!wallet.account;
  }

  function renderAttach() {
    var box = $("attach");
    box.hidden = !!live.RecurveToken;
    if (live.RecurveToken) return;
    var ready = !!realToken();
    $("attachStakeField").hidden = !ready;
    $("attachStake").disabled = running;
    renderStake();
    $("attachBtn").disabled = !ready || !wallet.account || running || !isWhole($("attachStake").value.trim());
    $("attachNote").textContent = ready
      ? "Ready to attach " + token.symbol + ", " + token.address + ". This is final, and it hands the registry to the Safe."
      : "Launch it on Pons, publish its address at the top of this page as the real $RECURVE, then attach it here.";
  }

  async function renderLive() {
    var d = live.vaults[0];
    var list = $("liveFacts");
    list.textContent = "";
    fact(list, "Vault", d.RecurveVault, EXPLORER + "/address/" + d.RecurveVault);
    fact(list, "Governor", d.RecurveGovernor, EXPLORER + "/address/" + d.RecurveGovernor);
    fact(list, "Registry", d.WatcherRegistry, EXPLORER + "/address/" + d.WatcherRegistry);
    fact(list, "Strategy", d.PortfolioStrategy, EXPLORER + "/address/" + d.PortfolioStrategy);
    fact(list, "Treasury", live.treasury, EXPLORER + "/address/" + live.treasury);
    fact(list, "Agent", live.agent, EXPLORER + "/address/" + live.agent);
    fact(list, "Deployer", live.deployer, EXPLORER + "/address/" + live.deployer);
    if (live.RecurveToken) fact(list, "$RECURVE", live.RecurveToken, EXPLORER + "/token/" + live.RecurveToken);
    renderAttach();

    var balances = $("agentBalances");
    var cap = $("capNow");
    if (!wallet.account) {
      balances.textContent = "Connect a wallet to see the agent's balances.";
      cap.textContent = "";
      return;
    }
    try {
      var fund = contracts.fund;
      var eth = await rpc("eth_getBalance", [live.agent, "latest"]);
      var usdg = await rpc("eth_call", [{to: fund.asset, data: SIG.balanceOf + addressWord(live.agent)}, "latest"]);
      var decimals = Number(BigInt(await rpc("eth_call", [{to: fund.asset, data: SIG.decimals}, "latest"])));
      var current = await rpc("eth_call", [{to: d.RecurveVault, data: SIG.depositCap}, "latest"]);
      balances.textContent = "The agent holds " + ether(eth) + " and " +
        (Number(BigInt(usdg)) / 10 ** decimals).toLocaleString("en-US") + " USDG.";
      cap.textContent = "The vault takes up to " +
        (Number(BigInt(current)) / 10 ** decimals).toLocaleString("en-US") + " USDG.";
    } catch (err) {
      balances.textContent = fail(err);
    }
  }

  function render() {
    refreshPrice();
    renderFacts();
    $("launchForm").hidden = !!live;
    $("launchDone").hidden = !live;
    if (live) renderLive();
    else {
      renderForm();
      renderSteps();
    }
    renderWallet();
  }

  // ---------------------------------------------------------------- actions

  async function assetDecimals() {
    return Number(BigInt(await rpc("eth_call", [{to: contracts.fund.asset, data: SIG.decimals}, "latest"])));
  }

  async function begin() {
    var real = realToken();
    var settings = {
      token: real, // a test token never reaches a contract
      treasury: $("treasury").value.trim(),
      agent: $("agent").value.trim(),
      depositCap: $("depositCap").value.trim(),
      // Without the token the registry gets a stand-in figure; attach sets the real one.
      minStake: real ? $("minStake").value.trim() : contracts.governance.minStake,
    };
    var wrong = problem(settings, wallet.account);
    if (wrong) throw new Error(wrong);

    settings.assetDecimals = await assetDecimals();
    var safeCode = await rpc("eth_getCode", [settings.treasury, "latest"]);
    if (safeCode === "0x" && !confirm("The treasury has no contract at this address, so it is not a Safe on Robinhood Chain. One lost key would then control the fees and the agent list. Use it anyway?")) return null;
    if (!confirm(
      "Deploy to Robinhood Chain mainnet?\n\n" +
      "Treasury: " + settings.treasury + "\n" +
      "Agent: " + settings.agent + "\n" +
      "Deposit cap: " + settings.depositCap + " USDG\n" +
      "Minimum stake: " + (real
        ? grouped(settings.minStake) + " $RECURVE"
        : "set when $RECURVE is attached, to about $" + contracts.governance.minStakeUsd + " of it") + "\n" +
      "$RECURVE: " + (settings.token || "attached later. Until then there are no watchers, only the depositors' veto.") + "\n\n" +
      "None of this can be taken back once it is on chain, and only this wallet will ever be able to raise the deposit cap."
    )) return null;

    return {
      settings: settings,
      deployer: wallet.account,
      addresses: {},
      hashes: {},
      pending: null,
      deployBlock: 0,
    };
  }

  async function save(next) {
    await window.RecurveAdmin.call("launch-save", {draft: next});
  }

  async function publish() {
    say("Checking everything on chain and publishing…");
    var today = new Date().toISOString().slice(0, 10);
    var data = await window.RecurveAdmin.call("launch-publish", {deployment: deployment(draft, today)});
    say("");
    window.RecurveAdmin.render(data);
  }

  $("launchForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (running || !wallet.account) return;
    running = true;
    say("");
    try {
      if (!(await window.RecurveWallet.ensureChain())) throw new Error("Switch the wallet to Robinhood Chain.");
      if (!draft) {
        var fresh = await begin();
        if (!fresh) return;
        await save(fresh);
        draft = fresh;
      }
      renderForm();
      await run({
        draft: draft,
        contracts: contracts,
        account: wallet.account,
        rpc: rpc,
        save: save,
        onStep: function (id, state) {
          stepState[id] = state;
          renderSteps();
        },
      });
      await publish();
    } catch (err) {
      say(fail(err), err && err.code === 4001 ? "" : "err");
    } finally {
      running = false;
      // Nothing is waiting on the wallet any more, whatever stopped the run.
      Object.keys(stepState).forEach(function (id) {
        if (stepState[id] === "wallet") stepState[id] = "";
      });
      render();
    }
  });

  $("startOver").addEventListener("click", async function () {
    if (!confirm("Start over? Contracts already deployed stay on chain, unused, and the next run deploys new ones.")) return;
    try {
      await window.RecurveAdmin.call("launch-reset");
      draft = null;
      stepState = {};
      render();
    } catch (err) {
      say(fail(err), "err");
    }
  });

  $("attachBtn").addEventListener("click", async function () {
    if (running || !wallet.account) return;
    var chosen = token.address;
    var stake = $("attachStake").value.trim();
    if (!isWhole(stake)) return say("The minimum stake is a whole number of $RECURVE.", "err");
    if (!confirm(
      "Attach " + chosen + " as $RECURVE?\n\n" +
      "Minimum watcher stake: " + grouped(stake) + " $RECURVE" +
      (quote.price ? ", about " + dollars(Number(stake) * quote.price) + " now" : "") + "\n\n" +
      "The token is final: the registry takes one stake token, ever. The minimum stake is not: the Safe can change it."
    )) return;
    running = true;
    renderAttach();
    say("Confirm each step in your wallet…");
    try {
      if (!(await window.RecurveWallet.ensureChain())) throw new Error("Switch the wallet to Robinhood Chain.");
      var ctx = {
        draft: {
          deployer: live.deployer,
          settings: {token: chosen, treasury: live.treasury, minStake: stake},
          addresses: {registry: live.vaults[0].WatcherRegistry},
          hashes: {},
          pending: null,
        },
        account: wallet.account,
        rpc: rpc,
        save: async function () {},
        onStep: function () {},
      };
      await run(ctx, attachPlan(ctx));
      say("Checking it on chain…");
      var data = await window.RecurveAdmin.call("launch-attach");
      say("$RECURVE is attached. Staking is open.", "ok");
      window.RecurveAdmin.render(data);
    } catch (err) {
      say(fail(err), err && err.code === 4001 ? "" : "err");
    } finally {
      running = false;
      render();
    }
  });

  async function sendFromWallet(tx, button, done) {
    if (!wallet.account) return say("Connect a wallet first.", "err");
    button.disabled = true;
    say("Confirm in your wallet…");
    try {
      if (!(await window.RecurveWallet.ensureChain())) throw new Error("Switch the wallet to Robinhood Chain.");
      var hash = await rpc("eth_sendTransaction", [Object.assign({from: wallet.account}, tx)]);
      say("Waiting for the chain…");
      var receipt = await waitForReceipt({rpc: rpc}, hash);
      if (BigInt(receipt.status) !== 1n) throw new Error("The transaction failed on chain.");
      say(done, "ok");
      renderLive();
      renderWallet();
    } catch (err) {
      say(fail(err), err && err.code === 4001 ? "" : "err");
    } finally {
      button.disabled = false;
    }
  }

  $("sendEth").addEventListener("click", function () {
    sendFromWallet({to: live.agent, value: "0x" + (10n ** 14n).toString(16)}, this, "Sent 0.0001 ETH to the agent.");
  });

  $("sendUsdg").addEventListener("click", async function () {
    var button = this;
    var decimals = await assetDecimals();
    sendFromWallet({
      to: contracts.fund.asset,
      data: SIG.transfer + addressWord(live.agent) + uintWord(units("20", decimals)),
    }, button, "Sent 20 USDG to the agent.");
  });

  $("capForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var next = $("newCap").value.trim();
    if (!/^[1-9]\d*$/.test(next)) return say("The new cap is a whole number of USDG.", "err");
    if (!confirm("Raise the deposit cap to " + next + " USDG? It can never go back down.")) return;
    var decimals = await assetDecimals();
    sendFromWallet({
      to: live.vaults[0].RecurveVault,
      data: SIG.raiseDepositCap + uintWord(units(next, decimals)),
    }, $("capBtn"), "Deposit cap raised to " + next + " USDG.");
  });

  STAKE_FIELDS.forEach(function (id) {
    $(id).addEventListener("input", function () {
      typed[id] = true;
      if (live) renderAttach();
      else renderStake();
    });
  });

  // ---------------------------------------------------------------- wiring

  window.addEventListener("recurve:wallet", function (e) {
    wallet = e.detail;
    if (!running && !$("panel").hidden) render();
  });

  /** Every server answer at /admin passes here; the page itself owns the rest. */
  document.addEventListener("recurve:admin", async function (e) {
    var data = e.detail;
    if ("token" in data) token = data.token;
    if ("launch" in data) draft = data.launch;
    if ("deployment" in data) live = data.deployment;
    if (!contracts) {
      try {
        contracts = await (await fetch("/contracts.json")).json();
      } catch (err) {
        return say("Could not load the contracts: " + fail(err), "err");
      }
    }
    if (!running) render();
  });

  return api;
});
