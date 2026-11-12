/*
 * Price ticker for the static app page.
 *
 * Stock prices: Robinhood's own public Stock Token API
 * (docs.robinhood.com/chain/stock-token-apis), relayed through /api/prices —
 * that endpoint doesn't send Access-Control-Allow-Origin, so a direct
 * browser fetch is silently blocked by CORS; the serverless function in
 * api/prices.js calls it server-side instead, where CORS doesn't apply.
 * WETH: CoinGecko's public simple-price endpoint, fetched directly — that
 * one does allow browser fetches.
 *
 * Change % is computed against the first price seen this page load, not a
 * daily open — Robinhood's /prices endpoint returns live bid/ask only, no
 * previous-close field, so a "today" percentage isn't real data we have.
 * Showing one would mean inventing a number, which we don't do.
 */
(function () {
  "use strict";

  var STOCK_SYMBOLS = ["TSLA", "AMZN", "PLTR", "AMD", "NFLX"];
  var REFRESH_MS = 30000;

  var baseline = {}; // symbol -> first price seen, for the change indicator
  var current = {}; // symbol -> {price, changePct}

  function injectStyles() {
    if (document.getElementById("ticker-styles")) return;
    var css =
      ".ticker-bar{background:var(--ink,#0A0A0A);overflow:hidden;" +
      "-webkit-mask-image:linear-gradient(to right,transparent,#000 3%,#000 97%,transparent);" +
      "mask-image:linear-gradient(to right,transparent,#000 3%,#000 97%,transparent)}" +
      ".ticker-bar[hidden]{display:none}" +
      ".ticker-track{display:inline-flex;align-items:stretch;white-space:nowrap;" +
      "animation:ticker-scroll 42s linear infinite;will-change:transform}" +
      ".ticker-bar:hover .ticker-track{animation-play-state:paused}" +
      "@keyframes ticker-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}" +
      ".ticker-item{display:inline-flex;align-items:center;gap:9px;padding:11px 22px;" +
      "font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:12.5px;" +
      "letter-spacing:.01em;color:rgba(255,255,255,.92);" +
      "border-right:1px solid rgba(255,255,255,.1)}" +
      ".ticker-item .sym{color:rgba(255,255,255,.55);font-weight:500}" +
      ".ticker-item .px{font-variant-numeric:tabular-nums;font-weight:500;color:#fff}" +
      ".ticker-item .up{color:var(--mint,#2EE6A8);font-variant-numeric:tabular-nums}" +
      ".ticker-item .down{color:#E8836B;font-variant-numeric:tabular-nums}" +
      "@media (prefers-reduced-motion:reduce){.ticker-track{animation:none}}" +
      "@media (max-width:640px){.ticker-item{padding:9px 16px;font-size:11.5px}}";
    var style = document.createElement("style");
    style.id = "ticker-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  var bar, track;

  function buildBar() {
    if (bar) return;
    injectStyles();
    bar = document.createElement("div");
    bar.className = "ticker-bar";
    bar.hidden = true;
    track = document.createElement("div");
    track.className = "ticker-track";
    bar.appendChild(track);

    var header = document.querySelector("header");
    if (header && header.parentNode) {
      header.parentNode.insertBefore(bar, header.nextSibling);
    } else {
      document.body.insertBefore(bar, document.body.firstChild);
    }
  }

  function fmtPrice(n) {
    return n.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
  }

  function itemHTML(symbol, price, changePct) {
    var arrow = changePct == null ? "" : changePct >= 0
      ? '<span class="up">\u25B2' + Math.abs(changePct).toFixed(2) + "%</span>"
      : '<span class="down">\u25BC' + Math.abs(changePct).toFixed(2) + "%</span>";
    return '<span class="ticker-item"><span class="sym">' + symbol + '</span>' +
      '<span class="px">$' + fmtPrice(price) + "</span>" + arrow + "</span>";
  }

  function render() {
    var symbols = ["WETH"].concat(STOCK_SYMBOLS);
    var items = symbols
      .filter(function (s) { return current[s]; })
      .map(function (s) { return itemHTML(s, current[s].price, current[s].changePct); });

    if (!items.length) {
      bar.hidden = true;
      return;
    }
    // Render the row twice back to back so the -50% scroll loops seamlessly.
    track.innerHTML = items.join("") + items.join("");
    bar.hidden = false;
  }

  function record(symbol, price) {
    if (!(symbol in baseline)) baseline[symbol] = price;
    var changePct = baseline[symbol] ? ((price - baseline[symbol]) / baseline[symbol]) * 100 : null;
    current[symbol] = {price: price, changePct: changePct};
  }

  async function fetchWeth() {
    try {
      var res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      );
      if (!res.ok) return;
      var data = await res.json();
      var price = data && data.ethereum && data.ethereum.usd;
      if (typeof price === "number") record("WETH", price);
    } catch {
      /* CoinGecko unreachable or rate-limited this cycle; skip silently */
    }
  }

  async function fetchStocks() {
    try {
      var res = await fetch("/api/prices");
      if (!res.ok) return;
      var data = await res.json();
      STOCK_SYMBOLS.forEach(function (symbol) {
        var entry = data[symbol];
        if (entry && typeof entry.price === "number") record(symbol, entry.price);
      });
    } catch {
      /* our own /api/prices unreachable this cycle; skip silently */
    }
  }

  async function refresh() {
    buildBar();
    await Promise.all([fetchWeth(), fetchStocks()]);
    render();
  }

  refresh();
  setInterval(refresh, REFRESH_MS);
})();
