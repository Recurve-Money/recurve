# Recurve Docs

Static documentation for Recurve Protocol, written for Robinhood Chain mainnet.
Served at recurvemoney.xyz/docs, as a part of the site: this folder is the
source, and `build/pages.py` writes the pages into `../site/docs`.

Eighteen pages in five groups: Getting started (introduction, using the app,
SDK quickstart, concepts), Protocol (vaults, governance, watchers, strategies,
fees), Operating a fund (the runner, the two agent skills), Reference (SDK,
indexer API, contracts, errors, deployment) and Roadmap. Every page is written
from the code as it is — the contracts, the SDK, `api/`, `runner/` and `app/`
— and says so where the code and the design differ (see Contracts → Known
limitations). When one of those changes, the page that describes it changes.

## Stack

Plain HTML generated from a Python shell so the sidebar, header, pager, and
on-page nav stay in sync across pages. No framework, no bundler, no build
dependency beyond Python 3.

## Regenerating

Edit content in `build/pages.py`, then, from the repository root:

```bash
npm run build:docs
```

Every `.html` in `site/docs/` is generated. Do not edit them by hand, they get
overwritten. Page bodies link to each other from the docs root
(`href="/vaults"`); `render()` in `build/gen.py` moves those under `/docs`.

To add a page: append it to `NAV` in `build/gen.py` and add a `page(...)` call
in `build/pages.py`. The sidebar, prev/next pager, and table of contents all
derive from those two places.

## Addresses

No Recurve address is typed into `pages.py`. `build/deployments.py` reads
`../app/src/lib/addresses/4663.json`, which the protocol's deploy script writes
and the dApp builds from, and the page bodies reference it through `@@TOKENS@@`
(the SDK snippet, the skills' env blocks, the table on Contracts). Until that
file has a vault the snippets show `0x...` and Contracts has no table, so publish
the docs after the contracts: a rebuild is the only step they need. The fixed
third-party addresses (Uniswap, USDG, NVDA) are typed into the Deployment page.

`python3 build/test_deployments.py` covers the rendering.

## On-page nav

The table of contents is built from `h2`/`h3` tags that carry an `id`. A heading
without an id simply does not appear in it.

## Styling

The docs use the site's `style.css`, icons and manifest. `docs.css` layers the
documentation layout on top and is copied to `site/docs/` on every build.

## Deploy

With the site: `npm run deploy` from the repository root. Redirects for renamed
slugs live in `deploy/caddy/Caddyfile`; add one there whenever a slug is renamed.

`build/__pycache__` is a Python cache, not source. It is gitignored and should
never be tracked.
