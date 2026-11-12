/*
 * Wallet connect for static pages: /admin's launch uses it.
 *
 * Plain JS, no React: these pages are static HTML and the real dApp (wagmi +
 * RainbowKit) lives in app/. This gets the same picker UX —
 * a modal listing every wallet the browser actually has, plus WalletConnect
 * for everything else — without shipping a framework to render one button.
 *
 * Wallet discovery uses EIP-6963 (every modern wallet announces itself with
 * its own name/icon/provider, so multiple installed wallets don't fight over
 * a single window.ethereum). A legacy window.ethereum fallback covers the
 * handful of wallets that still don't announce.
 */
(function () {
  "use strict";

  // The only place this file names a network. 4663 — Robinhood Chain mainnet.
  // For testing against Robinhood Chain TESTNET (46630), swap in this block:
  //   chainId: "0xB626", chainDecimal: 46630,
  //   chainName: "Robinhood Chain Testnet",
  //   rpcUrls: ["https://rpc.testnet.chain.robinhood.com"],
  //   blockExplorerUrls: ["https://explorer.testnet.chain.robinhood.com"],
  var CHAIN = {
    chainId: "0x1237",
    chainDecimal: 4663,
    chainName: "Robinhood Chain",
    nativeCurrency: {name: "Ether", symbol: "ETH", decimals: 18},
    rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
    blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
  };

  // Get a free project id at cloud.reown.com (formerly WalletConnect Cloud),
  // takes about two minutes. Until this is set, the WalletConnect row is
  // just hidden — everything else works without it.
  var WALLETCONNECT_PROJECT_ID = "";

  var LAST_WALLET_KEY = "recurve.lastWallet";

  var buttons = Array.prototype.slice.call(
    document.querySelectorAll("[data-wallet-connect]"),
  );
  if (!buttons.length) return;

  var account = null;
  var activeProvider = null;
  /** uuid -> {info: {uuid,name,icon,rdns}, provider}, from EIP-6963. */
  var discovered = new Map();

  // ---------------------------------------------------------------- discovery

  window.addEventListener("eip6963:announceProvider", function (event) {
    var d = event.detail;
    if (!d || !d.info || discovered.has(d.info.uuid)) return;
    discovered.set(d.info.uuid, {info: d.info, provider: d.provider});
    if (modalOpen) renderRows();
  });

  function requestProviders() {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }
  requestProviders();

  /**
   * window.ethereum fallback for wallets that predate EIP-6963. Only used
   * when nothing has announced itself, so a wallet that supports both never
   * shows up twice.
   */
  function legacyEntries() {
    var out = [];
    var eth = window.ethereum;
    var ph = window.phantom && window.phantom.ethereum;

    if (eth && !discovered.size) {
      var list = Array.isArray(eth.providers) && eth.providers.length ? eth.providers : [eth];
      list.forEach(function (p, i) {
        var name = p.isMetaMask ? "MetaMask" : p.isRabby ? "Rabby" : p.isCoinbaseWallet
          ? "Coinbase Wallet" : "Browser wallet";
        out.push({key: "legacy-" + i, name: name, icon: null, provider: p});
      });
    }
    if (ph && ph !== eth) {
      out.push({key: "legacy-phantom", name: "Phantom", icon: null, provider: ph});
    }
    return out;
  }

  // ---------------------------------------------------------------- styles

  function injectStyles() {
    if (document.getElementById("wc-styles")) return;
    var css =
      ".wc-overlay{position:fixed;inset:0;background:rgba(10,10,10,.45);display:flex;" +
      "align-items:center;justify-content:center;z-index:9999;padding:20px}" +
      ".wc-overlay[hidden]{display:none}" +
      ".wc-modal{background:var(--canvas,#fff);border-radius:22px;width:360px;max-width:100%;" +
      "max-height:82vh;overflow:auto;font-family:'Outfit',-apple-system,sans-serif;" +
      "box-shadow:0 20px 60px rgba(10,10,10,.25)}" +
      ".wc-head{display:flex;align-items:center;justify-content:space-between;" +
      "padding:20px 22px;border-bottom:1px solid var(--rule,#E6E4DE)}" +
      ".wc-head span{font-size:16px;font-weight:500;color:var(--ink,#0A0A0A)}" +
      ".wc-close{background:none;border:none;font-size:20px;line-height:1;cursor:pointer;" +
      "color:var(--muted,#5F5F5A);padding:4px 6px;border-radius:8px}" +
      ".wc-close:hover{background:var(--shade,#F1F0EB)}" +
      ".wc-list{padding:10px}" +
      ".wc-row{display:flex;align-items:center;gap:12px;width:100%;padding:12px 12px;" +
      "border:none;background:none;border-radius:14px;cursor:pointer;text-align:left;" +
      "font-family:inherit;font-size:15px;color:var(--ink,#0A0A0A)}" +
      ".wc-row:hover{background:var(--shade,#F1F0EB)}" +
      ".wc-row:disabled{opacity:.45;cursor:default}" +
      ".wc-row:disabled:hover{background:none}" +
      ".wc-icon{width:28px;height:28px;border-radius:8px;flex:none;object-fit:contain;" +
      "background:var(--shade,#F1F0EB)}" +
      ".wc-icon-fallback{width:28px;height:28px;border-radius:8px;flex:none;" +
      "background:var(--shade,#F1F0EB);display:flex;align-items:center;justify-content:center;" +
      "color:var(--muted,#5F5F5A)}" +
      ".wc-empty{padding:8px 22px 24px;color:var(--muted,#5F5F5A);font-size:14px;line-height:1.5}" +
      ".wc-empty a{color:var(--ink,#0A0A0A);text-decoration:underline}" +
      ".wc-note{padding:0 22px 20px;color:#8C2F1C;font-size:13px}";
    var style = document.createElement("style");
    style.id = "wc-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------- modal

  var overlay = null;
  var listEl = null;
  var emptyEl = null;
  var noteEl = null;
  var modalOpen = false;

  function buildModal() {
    if (overlay) return;
    injectStyles();

    overlay = document.createElement("div");
    overlay.className = "wc-overlay";
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="wc-modal" role="dialog" aria-modal="true" aria-label="Connect a wallet">' +
      '<div class="wc-head"><span>Connect a wallet</span>' +
      '<button class="wc-close" type="button" aria-label="Close">\u00D7</button></div>' +
      '<div class="wc-list"></div>' +
      '<p class="wc-empty" hidden></p>' +
      '<p class="wc-note" hidden></p>' +
      "</div>";
    document.body.appendChild(overlay);

    listEl = overlay.querySelector(".wc-list");
    emptyEl = overlay.querySelector(".wc-empty");
    noteEl = overlay.querySelector(".wc-note");

    overlay.querySelector(".wc-close").addEventListener("click", closeModal);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modalOpen) closeModal();
    });
  }

  function walletIcon(icon, name) {
    if (icon) {
      var img = document.createElement("img");
      img.src = icon;
      img.alt = "";
      img.className = "wc-icon";
      return img;
    }
    var span = document.createElement("span");
    span.className = "wc-icon-fallback";
    span.textContent = (name || "?").slice(0, 1).toUpperCase();
    return span;
  }

  function row(name, icon, onClick, disabled) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "wc-row";
    if (disabled) b.disabled = true;
    b.appendChild(walletIcon(icon, name));
    var label = document.createElement("span");
    label.textContent = name;
    b.appendChild(label);
    if (!disabled) b.addEventListener("click", onClick);
    return b;
  }

  function renderRows() {
    listEl.innerHTML = "";
    var entries = [];

    discovered.forEach(function (d) {
      entries.push({
        key: d.info.uuid,
        name: d.info.name,
        icon: d.info.icon,
        connect: function () { connectInjected(d.provider, d.info.rdns || d.info.uuid); },
      });
    });

    if (!entries.length) {
      legacyEntries().forEach(function (e) {
        entries.push({
          key: e.key,
          name: e.name,
          icon: e.icon,
          connect: function () { connectInjected(e.provider, e.key); },
        });
      });
    }

    entries.forEach(function (e) {
      listEl.appendChild(row(e.name, e.icon, e.connect));
    });

    if (WALLETCONNECT_PROJECT_ID) {
      listEl.appendChild(row("WalletConnect", null, connectWalletConnect));
    }

    emptyEl.hidden = entries.length > 0;
    if (!entries.length) {
      emptyEl.innerHTML =
        'No wallet detected in this browser. Install <a href="https://metamask.io" ' +
        'target="_blank" rel="noopener">MetaMask</a> and reload, or open this page on ' +
        "a device that has one.";
    }
  }

  function openModal() {
    buildModal();
    requestProviders();
    // Announcements come back synchronously in practice, but give slow
    // extensions a beat before the first render.
    setTimeout(renderRows, 60);
    renderRows();
    noteEl.hidden = true;
    overlay.hidden = false;
    modalOpen = true;
  }

  function closeModal() {
    if (overlay) overlay.hidden = true;
    modalOpen = false;
  }

  function showNote(msg) {
    buildModal();
    noteEl.textContent = msg;
    noteEl.hidden = !msg;
  }

  // ---------------------------------------------------------------- connect

  /** A page that acts with the wallet listens for this. */
  function announce() {
    window.dispatchEvent(new CustomEvent("recurve:wallet", {detail: {account: account, provider: activeProvider}}));
  }

  function render() {
    announce();
    buttons.forEach(function (b) {
      if (account) {
        b.textContent = short(account);
        b.classList.add("connected");
        b.title = account + " (click to disconnect)";
      } else {
        b.textContent = "Connect wallet";
        b.classList.remove("connected");
        b.title = "";
      }
    });
  }

  function short(addr) {
    return addr.slice(0, 6) + "\u2026" + addr.slice(-4);
  }

  function pageNote(msg) {
    var el = document.getElementById("walletNote");
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
  }

  async function ensureChain(p) {
    try {
      var current = await p.request({method: "eth_chainId"});
      // Compare numerically: wallets return unpadded lowercase hex, so a
      // string compare would miss any chainId that has a letter in it.
      if (parseInt(current, 16) === CHAIN.chainDecimal) return true;
      try {
        await p.request({method: "wallet_switchEthereumChain", params: [{chainId: CHAIN.chainId}]});
        return true;
      } catch (err) {
        if (err && (err.code === 4902 || err.code === -32603)) {
          await p.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: CHAIN.chainId,
              chainName: CHAIN.chainName,
              nativeCurrency: CHAIN.nativeCurrency,
              rpcUrls: CHAIN.rpcUrls,
              blockExplorerUrls: CHAIN.blockExplorerUrls,
            }],
          });
          return true;
        }
        throw err;
      }
    } catch (err) {
      pageNote(readable(err));
      return false;
    }
  }

  function bindProviderEvents(p) {
    if (p.__recurveBound) return;
    p.__recurveBound = true;
    p.on && p.on("accountsChanged", function (accs) {
      account = accs && accs.length ? accs[0] : null;
      render();
    });
    p.on && p.on("chainChanged", announce);
  }

  async function connectInjected(p, storeKey) {
    try {
      var accounts = await p.request({method: "eth_requestAccounts"});
      if (!accounts || !accounts.length) return;

      account = accounts[0];
      activeProvider = p;
      render();
      pageNote("");
      closeModal();

      try {
        localStorage.setItem(LAST_WALLET_KEY, storeKey);
      } catch {}

      await ensureChain(p);
      bindProviderEvents(p);
      announce();
    } catch (err) {
      showNote(readable(err));
    }
  }

  async function connectWalletConnect() {
    if (!WALLETCONNECT_PROJECT_ID) return;
    showNote("Opening WalletConnect\u2026");
    try {
      var mod = await import("https://esm.sh/@walletconnect/ethereum-provider@2?bundle");
      var wc = await mod.EthereumProvider.init({
        projectId: WALLETCONNECT_PROJECT_ID,
        chains: [CHAIN.chainDecimal],
        optionalChains: [CHAIN.chainDecimal],
        showQrModal: true,
        rpcMap: {[CHAIN.chainDecimal]: CHAIN.rpcUrls[0]},
        metadata: {
          name: "Recurve",
          description: "Capital infrastructure for autonomous funds.",
          url: "https://recurvemoney.xyz",
          icons: ["https://recurvemoney.xyz/icon.png"],
        },
      });
      await wc.connect();
      var accounts = wc.accounts || [];
      if (!accounts.length) return;

      account = accounts[0];
      activeProvider = wc;
      render();
      pageNote("");
      closeModal();
      try {
        localStorage.setItem(LAST_WALLET_KEY, "walletconnect");
      } catch {}
      bindProviderEvents(wc);
    } catch (err) {
      showNote(readable(err));
    }
  }

  function disconnect() {
    if (activeProvider && typeof activeProvider.disconnect === "function") {
      try { activeProvider.disconnect(); } catch {}
    }
    account = null;
    activeProvider = null;
    render();
    pageNote("Disconnected here. Revoke access in your wallet to remove it fully.");
    try { localStorage.removeItem(LAST_WALLET_KEY); } catch {}
  }

  function readable(err) {
    var code = err && err.code;
    if (code === 4001) return "Request rejected.";
    if (code === -32002) return "A wallet request is already open. Check your wallet.";
    var msg = (err && err.message) || String(err);
    return msg.split("\n")[0];
  }

  buttons.forEach(function (b) {
    b.addEventListener("click", function () {
      if (account) disconnect();
      else openModal();
    });
  });

  window.RecurveWallet = {
    /** True once the connected wallet is on the site's chain, asking it to switch if not. */
    ensureChain: function () {
      return activeProvider ? ensureChain(activeProvider) : Promise.resolve(false);
    },
  };

  // Restore an existing session without prompting, against whichever wallet
  // was used last time. eth_accounts returns an empty list rather than
  // opening the wallet, so a reload does not nag.
  (function () {
    var last = null;
    try { last = localStorage.getItem(LAST_WALLET_KEY); } catch {}
    if (!last || last === "walletconnect") return; // WC restores via its own session

    setTimeout(async function () {
      var match = null;
      discovered.forEach(function (d) {
        if ((d.info.rdns || d.info.uuid) === last) match = d.provider;
      });
      if (!match) {
        legacyEntries().forEach(function (e) {
          if (e.key === last) match = e.provider;
        });
      }
      if (!match) return;

      try {
        var accounts = await match.request({method: "eth_accounts"});
        if (accounts && accounts.length) {
          account = accounts[0];
          activeProvider = match;
          render();
          bindProviderEvents(match);
        }
      } catch {
        /* wallet locked or unavailable; leave the button as-is */
      }
    }, 80);
  })();
})();
