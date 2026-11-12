/*
 * Live market data for $RECURVE.
 *
 * One file, loaded on every page. Fills the header pill everywhere, the full
 * stats block on /buy, and the address chip on /token.
 *
 * The contract address comes from /api/token, which the owner sets at /admin;
 * nothing here needs editing to go live. CONTRACT below is only the fallback
 * for a host without that function.
 *
 * What the pages claim follows the server too. Everything marked data-when
 * starts hidden and shows once /api/token has answered:
 *
 *   token / no-token       whether an address is published. A test address
 *                          counts, so a test shows launch day as it will look,
 *                          with a warning that it is not $RECURVE.
 *   staking / no-staking   whether the fund has its token attached.
 *
 * If the server does not answer, the pages claim neither.
 */
(function () {
  "use strict";

  var CONTRACT = ""; // fallback only: /api/token is the source of truth
  var CHAIN = "robinhood"; // dexscreener chain slug
  var PONS = "https://www.ponsfamily.com/launchpad";

  var REFRESH_MS = 30_000;
  var ZH = /^zh/.test(document.documentElement.lang);

  var token = null; // {address, test}
  var stakingOpen = false;
  var answered = false;

  // ---------------------------------------------------------------- format

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return "--";
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    if (n >= 1) return "$" + n.toFixed(2);
    if (n >= 0.01) return "$" + n.toFixed(4);
    // Sub-cent prices are the normal case at launch, so keep enough digits to
    // be meaningful rather than rounding to $0.00.
    return "$" + n.toPrecision(3);
  }

  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return "";
    var s = n >= 0 ? "+" : "";
    return s + n.toFixed(2) + "%";
  }

  function set(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function each(selector, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), fn);
  }

  // ---------------------------------------------------------------- fetch

  /** Which token to show: the published address, or none. */
  async function resolveToken() {
    try {
      var res = await fetch("/api/token", {cache: "no-store"});
      if (res.ok) {
        var data = await res.json();
        answered = true;
        stakingOpen = !!(data && data.deployment && data.deployment.RecurveToken);

        var address = data && data.address;
        if (typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address)) {
          return {address: address, test: data.test === true};
        }
        return null; // answered: nothing is published
      }
    } catch {
      /* no function on this host: use the fallback */
    }
    answered = !!CONTRACT;
    return CONTRACT ? {address: CONTRACT, test: false} : null;
  }

  /**
   * Dexscreener resolves pools from the token address, so no pool address is
   * needed here. It returns every pair; the deepest one is the honest quote,
   * since a thin pool can show any price at all.
   */
  async function load() {
    if (!token) return null;

    try {
      var res = await fetch(
        "https://api.dexscreener.com/latest/dex/tokens/" + token.address,
        {cache: "no-store"},
      );
      if (!res.ok) return null;

      var data = await res.json();
      var pairs = ((data && data.pairs) || []).filter(function (p) {
        return p.chainId === CHAIN;
      });
      if (!pairs.length) return {empty: true};

      pairs.sort(function (a, b) {
        return (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0);
      });

      var p = pairs[0];
      return {
        price: parseFloat(p.priceUsd),
        change24h: p.priceChange?.h24,
        mcap: p.marketCap ?? p.fdv,
        liquidity: p.liquidity?.usd,
        volume24h: p.volume?.h24,
        pairAddress: p.pairAddress,
      };
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------- render

  function renderPill(d) {
    var price = document.getElementById("pillPrice");
    if (!price) return;

    // No address, no price: the pill is then just the way to /buy.
    price.hidden = !token;
    if (token) price.textContent = d && !d.empty ? usd(d.price) : "--";
  }

  /** Everything that follows the server's answer: copy, chips, flags, buy links. */
  function renderAddress() {
    each("[data-ca]", function (el) {
      el.textContent = token ? token.address : "--";
    });
    var stage = {
      token: !!token,
      "no-token": !token,
      staking: stakingOpen,
      "no-staking": !stakingOpen,
    };
    each("[data-when]", function (el) {
      el.hidden = !(answered && stage[el.getAttribute("data-when")]);
    });
    each("[data-test-flag]", function (el) {
      el.hidden = !(token && token.test);
    });
    each("[data-buy]", function (el) {
      el.href = token ? PONS + "/" + token.address.toLowerCase() : PONS;
    });
  }

  function renderBuy(d) {
    if (!document.getElementById("liveState") || !token) return;

    var caRow = document.getElementById("caRow");
    if (caRow) caRow.hidden = false;

    link("vDex", "https://dexscreener.com/" + CHAIN + "/" + token.address);
    link("vGecko", "https://www.geckoterminal.com/" + CHAIN + "/tokens/" + token.address);
    link("vScan", "https://robinhoodchain.blockscout.com/token/" + token.address);

    var noPool = document.getElementById("noPool");
    if (noPool) noPool.hidden = !(d && d.empty);

    if (!d || d.empty) return;

    set("sPrice", usd(d.price));
    set("sMcap", usd(d.mcap));
    set("sLiq", usd(d.liquidity));
    set("sVol", usd(d.volume24h));

    var ch = document.getElementById("sChange");
    if (ch && d.change24h !== undefined) {
      ch.textContent = pct(d.change24h) + " 24h";
      ch.className = "d " + (d.change24h >= 0 ? "up" : "down");
    }

    var wrap = document.getElementById("chartWrap");
    if (wrap && !wrap.dataset.loaded && d.pairAddress) {
      var f = document.createElement("iframe");
      f.src =
        "https://dexscreener.com/" + CHAIN + "/" + d.pairAddress +
        "?embed=1&theme=light&info=0&trades=0";
      f.title = "$RECURVE price chart";
      f.loading = "lazy";
      wrap.appendChild(f);
      wrap.dataset.loaded = "1";
    }
  }

  function link(id, href) {
    var el = document.getElementById(id);
    if (el) el.href = href;
  }

  // ---------------------------------------------------------------- copy

  each("[data-ca-copy]", function (btn) {
    var label = btn.textContent;
    btn.addEventListener("click", function () {
      if (!token) return;
      navigator.clipboard.writeText(token.address).then(function () {
        btn.textContent = ZH ? "已复制" : "copied";
        setTimeout(function () {
          btn.textContent = label;
        }, 1600);
      });
    });
  });

  // ---------------------------------------------------------------- run

  async function tick() {
    var d = await load();
    renderPill(d);
    renderBuy(d);
  }

  async function start() {
    token = await resolveToken();
    renderAddress();
    await tick();

    // Only poll while the tab is visible. A background tab hitting a public
    // API every thirty seconds for hours is rude and gets rate limited.
    if (!token) return;

    var timer = setInterval(function () {
      if (!document.hidden) tick();
    }, REFRESH_MS);

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) tick();
    });

    window.addEventListener("pagehide", function () {
      clearInterval(timer);
    });
  }

  start();
})();
