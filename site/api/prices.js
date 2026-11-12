// Vercel serverless function. Proxies Robinhood's Stock Token API server-side.
//
// Robinhood's REST API (docs.robinhood.com/chain/stock-token-apis) is public
// and keyless, but doesn't send Access-Control-Allow-Origin, so a direct
// browser fetch to api.robinhood.com is blocked by CORS. This relays the
// same live data from our own origin, where that restriction doesn't apply.

const SYMBOLS = ["TSLA", "AMZN", "PLTR", "AMD", "NFLX"];

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=30");

  const entries = await Promise.all(
    SYMBOLS.map(async (symbol) => {
      try {
        const r = await fetch(`https://api.robinhood.com/rhj/prices/${symbol}`);
        if (!r.ok) return [symbol, null];
        const data = await r.json();
        const quote = data && data.quotes && data.quotes[0];
        if (!quote) return [symbol, null];
        const bid = parseFloat(quote.bid);
        const ask = parseFloat(quote.ask);
        if (Number.isNaN(bid) || Number.isNaN(ask)) return [symbol, null];
        return [symbol, {price: (bid + ask) / 2}];
      } catch {
        return [symbol, null];
      }
    }),
  );

  const out = {};
  for (const [symbol, data] of entries) {
    if (data) out[symbol] = data;
  }
  res.status(200).json(out);
};
